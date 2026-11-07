// Headless-browser smoke test of the BUILT app in local-only mode (no backend).
// Run it with tools/e2e/run-smoke.sh (Playwright image); it needs `playwright`
// resolvable from /tmp/pw (the runner installs it there, not into package.json).
//
// It builds with an empty backend URL, serves dist with `vite preview`, drives
// chromium through the main flows and exits 1 if any step failed, or if a
// console error, page error or failed request was seen. Screenshots go to
// $SHOTS (default /tmp/qbase-e2e).
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { chromium } = createRequire('/tmp/pw/')('playwright');
const SHOTS = process.env.SHOTS || '/tmp/qbase-e2e';
const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
mkdirSync(SHOTS, { recursive: true });

// Appendix sample of rewrite/spec/import-export.md (10.5, PostgreSQL A1).
const PG_SAMPLE = `SET statement_timeout = 0;
CREATE TYPE public.mood AS ENUM ('calm', 'busy');
CREATE TABLE public.pets (
    id integer NOT NULL,
    name character varying(40) NOT NULL,
    mood public.mood DEFAULT 'calm'::public.mood
);
ALTER TABLE ONLY public.pets ADD CONSTRAINT pets_pkey PRIMARY KEY (id);
CREATE TABLE public.vets (id serial PRIMARY KEY, pet_id integer REFERENCES public.pets(id));
CREATE INDEX idx_pets_name ON public.pets USING btree (name);
`;

const results = [];
const problems = []; // console errors, page errors, failed requests
let page;
let shotNo = 0;

const shot = async (name) => {
    shotNo += 1;
    await page.screenshot({
        path: `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name}.png`,
    });
};
const pause = (ms) => page.waitForTimeout(ms);
const check = (cond, message) => {
    if (!cond) throw new Error(message);
};

async function step(name, fn) {
    try {
        await fn();
        results.push({ name, ok: true });
        console.log(`PASS ${name}`);
    } catch (error) {
        results.push({
            name,
            ok: false,
            error: String(error.message || error),
        });
        console.log(
            `FAIL ${name}: ${String(error.message || error).split('\n')[0]}`
        );
        try {
            await shot(`FAIL-${name.replace(/\W+/g, '-')}`);
        } catch {
            /* the page may be gone */
        }
        // close anything left open so the next step starts clean
        await page.keyboard.press('Escape').catch(() => undefined);
    }
}

const menu = async (...path) => {
    await page.getByRole('menubar').getByText(path[0], { exact: true }).click();
    for (const label of path.slice(1)) {
        await page
            .getByRole('menuitem', { name: label, exact: true })
            .or(page.getByRole('menuitemradio', { name: label, exact: true }))
            .click();
    }
};
const nthField = (n) =>
    page.getByRole('textbox', { name: 'Field name' }).nth(n);
const designText = () => page.locator('.react-flow__node').allInnerTexts();
const waitIdle = () => pause(600);

// 1 build and serve
console.log('building...');
execSync('npx vite build', {
    stdio: 'ignore',
    env: { ...process.env, VITE_QUBDI_BACKEND_URL: '' },
});
const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    {
        stdio: 'ignore',
    }
);
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 40; i += 1) {
    const up = await fetch(BASE)
        .then((r) => r.ok)
        .catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch();
const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
});
page = await context.newPage();
page.setDefaultTimeout(8000);
const workers = [];
// A strict policy on every page: no inline script, no eval; workers and blobs
// only from this origin. Violations are reported as console errors.
let violations = 0;
let policySeen;
await context.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    if (route.request().resourceType() === 'document') {
        headers['content-security-policy'] =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; " +
            "connect-src 'self' blob: data:; object-src 'none'; base-uri 'self'";
    }
    await route.fulfill({ response, headers });
});
page.on('worker', (w) => workers.push(w.url()));
page.on('console', (m) => {
    if (/Content Security Policy|Content-Security-Policy/i.test(m.text()))
        violations += 1;
    if (m.type() === 'error')
        problems.push(`console error: ${m.text()} @ ${m.location().url}`);
});
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('requestfailed', (r) =>
    problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`)
);
page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
});

// inline scripts would break a strict CSP: list them after the first load
await step('01 open / and see the new-diagram dialog', async () => {
    const first = await page.goto(`${BASE}/`);
    policySeen = first.headers()['content-security-policy'];
    await page.getByRole('radio', { name: /PostgreSQL/ }).waitFor();
    await shot('start');
    const inline = await page.evaluate(
        () =>
            [...document.scripts].filter((s) => !s.src && s.textContent.trim())
                .length
    );
    check(inline === 0, `${inline} inline script(s) in the page`);
});

await step('02 create a PostgreSQL diagram, empty canvas', async () => {
    await page.getByRole('radio', { name: /PostgreSQL/ }).click();
    await page.getByRole('button', { name: 'Blank diagram instead' }).click();
    await page.waitForURL(/\/diagrams\/.+/);
    await page.locator('.react-flow').waitFor();
    check(
        (await page.locator('.react-flow__node').count()) === 0,
        'canvas not empty'
    );
    await shot('empty-canvas');
});

await step(
    '03a add a table, rename it, add fields, set a primary key',
    async () => {
        await page.getByRole('button', { name: 'Add table' }).first().click();
        await page.getByRole('button', { name: 'Rename table' }).click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('customers');
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'customers' }).first().click();
        await nthField(0).waitFor();
        // the new table starts with one field (id, primary key)
        await page.getByRole('button', { name: 'Add field' }).first().click();
        await page.getByRole('button', { name: 'Add field' }).first().click();
        await nthField(1).fill('email');
        await nthField(2).fill('created_at');
        await nthField(0).fill('customer_id');
        await waitIdle();
        check(
            (await nthField(2).inputValue()) === 'created_at',
            'field names not kept'
        );
        const pk = page.getByRole('button', { name: 'Primary key' }).nth(1);
        await pk.click();
        await waitIdle();
        const node = (await designText()).join(' ');
        check(
            /customers/.test(node) &&
                /email/.test(node) &&
                /created_at/.test(node),
            `card text: ${node}`
        );
        await shot('table-with-fields');
    }
);

await step('03b second table and a relationship', async () => {
    await page.getByRole('button', { name: 'Add table' }).first().click();
    await waitIdle();
    check(
        (await page.locator('.react-flow__node').count()) === 2,
        'expected two tables'
    );
    await page.getByRole('button', { name: 'Links' }).click();
    await page
        .getByRole('button', { name: 'Add relationship' })
        .first()
        .click();
    const d = page.getByRole('dialog');
    const pick = async (name, option) => {
        await d.getByRole('combobox', { name }).click();
        await page.getByRole('option', { name: option }).first().click();
    };
    await pick('Primary table', /customers/);
    await pick('Primary field', /customer_id/);
    await pick('Referenced table', /table_/);
    await pick('Referenced field', /./);
    await d.getByRole('button', { name: 'Create' }).click();
    await waitIdle();
    check(
        (await page.getByTestId('ref-row').count()) === 1,
        'no relationship row'
    );
    check(
        (await page.locator('.react-flow__edge').count()) >= 1,
        'no line on the canvas'
    );
    await shot('relationship');
});

await step('04 undo and redo with the keyboard', async () => {
    await page
        .locator('.react-flow__pane')
        .click({ position: { x: 600, y: 120 } });
    await page.keyboard.press('ControlOrMeta+z');
    await waitIdle();
    check(
        (await page.locator('.react-flow__edge').count()) === 0,
        'undo kept the line'
    );
    await shot('after-undo');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await waitIdle();
    check(
        (await page.locator('.react-flow__edge').count()) >= 1,
        'redo did not bring the line back'
    );
});

await step('05 build a diagram from the pasted PostgreSQL sample', async () => {
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('radio', { name: /PostgreSQL/ }).click();
    await page
        .getByRole('dialog')
        .getByRole('tab', { name: 'SQL script' })
        .click();
    await page.getByRole('textbox', { name: 'SQL script' }).fill(PG_SAMPLE);
    await page
        .getByText(/Found 2 tables and 1 links/)
        .waitFor({ timeout: 10000 });
    await shot('import-dialog');
    await page.getByRole('button', { name: 'Build from text' }).click();
    await page.waitForURL(/\/diagrams\/.+/);
    await page.locator('.react-flow__node').first().waitFor();
    await waitIdle();
    const text = (await designText()).join(' ');
    check(/pets/.test(text) && /vets/.test(text), `tables: ${text}`);
    check(
        (await page.locator('.react-flow__edge').count()) >= 1,
        'no line for the imported link'
    );
    await shot('imported');
});

let importedUrl = '';
await step('06a export SQL for PostgreSQL', async () => {
    importedUrl = page.url();
    await menu('Diagram', 'Export SQL for', 'PostgreSQL');
    const box = page.getByRole('textbox', { name: 'Generated script' });
    await box.waitFor();
    await page.waitForFunction(
        () =>
            document.querySelector('textarea[aria-label="Generated script"]')
                ?.value
    );
    const sql = await box.inputValue();
    await shot('export-sql');
    check(/CREATE TABLE/i.test(sql), 'no CREATE TABLE');
    check(/pets/.test(sql) && /vets/.test(sql), 'table names missing');
    check(/mood/.test(sql), 'enum missing');
    await page.keyboard.press('Escape');
});

await step('06b DBML section shows the diagram', async () => {
    await page.getByRole('button', { name: 'DBML', exact: true }).click();
    await page.getByText(/Table "public"\."pets"/).waitFor();
    await shot('dbml');
    const text = await page.locator('body').innerText();
    check(
        /Table "public"\."vets"/.test(text),
        'vets missing from the DBML text'
    );
    check(/Ref /.test(text), 'no Ref line in the DBML text');
    await page.getByRole('button', { name: 'Tables', exact: true }).click();
});

let jsonFile = '/tmp/qbase-e2e-diagram.json';
await step('06c export the diagram file and import it again', async () => {
    await menu('Diagram', 'Save as', 'Diagram file (.json)');
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    await download.saveAs(jsonFile);
    const json = readFileSync(jsonFile, 'utf8');
    check(/pets/.test(json) && /vets/.test(json), 'json lacks the tables');
    await page.keyboard.press('Escape');
    await menu('Diagram', 'Import from', 'Diagram file (.json)');
    await page.locator('input[type=file]').setInputFiles(jsonFile);
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.waitForURL((u) => u.toString() !== importedUrl, {
        timeout: 10000,
    });
    await page.locator('.react-flow__node').first().waitFor();
    const text = (await designText()).join(' ');
    check(/pets/.test(text) && /vets/.test(text), `reimported: ${text}`);
    await shot('json-reimported');
});

await step('07 reload keeps the diagram (IndexedDB)', async () => {
    const url = page.url();
    await page.reload();
    await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
    check(page.url() === url, 'url changed');
    const text = (await designText()).join(' ');
    check(/pets/.test(text) && /vets/.test(text), `after reload: ${text}`);
    // and the list in the Open dialog has the diagrams made so far
    await page.goto(`${BASE}/`);
    await page.locator('.react-flow__node').first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('dialog').getByRole('row').nth(3).waitFor();
    await shot('open-dialog');
    const rows = await page.getByRole('dialog').getByRole('row').count();
    check(rows >= 4, `only ${rows} rows (header included) in the Open dialog`);
    await page.keyboard.press('Escape');
});

await step('08 dark theme', async () => {
    await menu('View', 'Colour theme', 'Dark');
    await waitIdle();
    const dark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark')
    );
    check(dark, 'html has no dark class');
    await shot('dark');
    await menu('View', 'Colour theme', 'Light');
});

await step('09 phone width: drawer opens', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await waitIdle();
    await shot('phone');
    const open = page.getByRole('button', { name: 'Open the editing panel' });
    check((await open.count()) > 0, 'no button to open the panel on a phone');
    await open.click();
    await page.getByText('Diagram contents').waitFor();
    await waitIdle();
    await shot('phone-drawer');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 800 });
});

await step('10 CSP-style constraints', async () => {
    // the whole run used a strict Content-Security-Policy (see the route above),
    // so a violation is already in `problems`; the page needs no inline script
    // and no worker (the SQL, DBML and import boxes are plain text areas)
    console.log(
        `  workers started: ${[...new Set(workers)].join(', ') || 'none'}`
    );
    const html = await page.evaluate(() => fetch('/').then((r) => r.text()));
    check(Boolean(policySeen), 'the test policy header was not served');
    check(
        !/<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(html),
        'inline script in index.html'
    );
    check(!/\son\w+=/.test(html), 'inline event handler in index.html');
    check(violations === 0, `${violations} CSP violation(s)`);
});

await step('11 no console errors, page errors or failed requests', async () => {
    check(problems.length === 0, `\n  ${[...new Set(problems)].join('\n  ')}`);
});

await browser.close();
stop();

const failed = results.filter((r) => !r.ok);
writeFileSync(
    `${SHOTS}/results.json`,
    JSON.stringify({ results, problems }, null, 2)
);
console.log(
    `\n${results.length - failed.length}/${results.length} steps passed`
);
for (const f of failed) console.log(`  FAILED ${f.name}: ${f.error}`);
process.exit(failed.length ? 1 : 0);
