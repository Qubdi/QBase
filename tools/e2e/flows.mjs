// Real-browser flows of the BUILT app (local-only mode): the interactions the
// smoke test does not cover (drag from the panel, drag/resize, copy/paste,
// edit card, relationships, filter, DBML edit, import into an open diagram,
// settings, language, export, phone width; from F10 on: the Open dialog, the
// diagram file, custom types, areas and notes, a large list, error states,
// undo/redo, lint, every language, dark mode, keyboard-only dialogs). Same
// approach as smoke.mjs.
//   tools/e2e/run-flows.sh [shots-dir]      (ONLY=F3,F5 runs some flows; SKIP_BUILD=1 reuses dist)
// Known product bugs are logged as KNOWN BUG and do not fail the run;
// STRICT=1 makes them fail.
// Every flow starts in a fresh browser context (clean storage) and ends with a
// step that fails on any console error, page error or failed request.
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';

const { chromium } = createRequire('/tmp/pw/')('playwright');
const SHOTS = process.env.SHOTS || '/tmp/qbase-flows';
const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
mkdirSync(SHOTS, { recursive: true });

const SEED_SQL = `CREATE TABLE public.customers (
    id integer NOT NULL,
    email character varying(80) NOT NULL,
    PRIMARY KEY (id)
);
CREATE TABLE public.orders (
    id integer NOT NULL,
    customer_id integer REFERENCES public.customers(id),
    total numeric(10,2),
    PRIMARY KEY (id)
);
CREATE TABLE public.items (
    id integer NOT NULL,
    order_id integer,
    sku character varying(20),
    PRIMARY KEY (id)
);
`;
const SECOND_SQL = `CREATE TABLE public.pets (id integer PRIMARY KEY, name text);
CREATE TABLE public.customers (id integer PRIMARY KEY, nick text);
`;

const results = [];
const allProblems = [];
let problems = [];
let page;
let context;
let browser;
let shotNo = 0;
let flowName = '';

const shot = async (name) => {
    shotNo += 1;
    await page.screenshot({
        path: `${SHOTS}/${String(shotNo).padStart(3, '0')}-${name}.png`,
    });
};
const pause = (ms) => page.waitForTimeout(ms);
const idle = () => pause(500);
const check = (cond, message) => {
    if (!cond) throw new Error(message);
};

async function step(name, fn) {
    const full = `${flowName} ${name}`;
    try {
        await fn();
        results.push({ name: full, ok: true });
        console.log(`PASS ${full}`);
    } catch (error) {
        const msg = String(error.message || error);
        results.push({ name: full, ok: false, error: msg });
        console.log(`FAIL ${full}: ${msg.split('\n')[0]}`);
        try {
            await shot(`FAIL-${full.replace(/\W+/g, '-')}`);
        } catch {
            /* page gone */
        }
        await page.keyboard.press('Escape').catch(() => undefined);
    }
}

// build and serve
if (!process.env.SKIP_BUILD) {
    console.log('building...');
    execSync('npx vite build', {
        stdio: 'ignore',
        env: { ...process.env, VITE_QUBDI_BACKEND_URL: '' },
    });
}
const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore' }
);
process.on('exit', () => server.kill());
for (let i = 0; i < 40; i += 1) {
    const up = await fetch(BASE)
        .then((r) => r.ok)
        .catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 500));
}
browser = await chromium.launch();

async function flow(id, title, opts, fn) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) return;
    flowName = `${id}`;
    console.log(`\n== ${id} ${title}`);
    context = await browser.newContext({
        viewport: opts.viewport ?? { width: 1280, height: 800 },
        acceptDownloads: true,
        permissions: ['clipboard-read', 'clipboard-write'],
        hasTouch: Boolean(opts.touch),
        isMobile: Boolean(opts.touch),
        locale: 'en-US',
    });
    page = await context.newPage();
    page.setDefaultTimeout(5000);
    problems = [];
    page.on('console', (m) => {
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
    try {
        await fn();
    } catch (error) {
        results.push({
            name: `${id} setup`,
            ok: false,
            error: String(error.message || error),
        });
        console.log(`FAIL ${id} setup: ${String(error.message || error)}`);
        await shot(`FAIL-${id}-setup`).catch(() => undefined);
    }
    await step(
        'no console errors, page errors or failed requests',
        async () => {
            check(
                problems.length === 0,
                `\n  ${[...new Set(problems)].join('\n  ')}`
            );
        }
    );
    allProblems.push(...problems);
    await context.close();
}

// ---------------------------------------------------------------- helpers
// items such as 'Theme Ctrl+M' carry their shortcut in the accessible name
const itemName = (label) =>
    new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( Ctrl.*)?$`);
const menu = async (...path) => {
    await page.getByRole('menubar').getByText(path[0], { exact: true }).click();
    for (const label of path.slice(1)) {
        await page
            .getByRole('menuitem', { name: itemName(label) })
            .or(page.getByRole('menuitemradio', { name: itemName(label) }))
            .or(page.getByRole('menuitemcheckbox', { name: itemName(label) }))
            .click();
    }
};
const tables = () => page.locator('[data-testid^="entity-"]');
const regions = () => page.locator('[data-testid^="region-"]');
const memos = () => page.locator('[data-testid^="memo-"]');
const pane = () => page.locator('.react-flow__pane');
const rail = (name) =>
    page.getByRole('button', { name, exact: true }).first().click();
const nodeText = async () =>
    (await page.locator('.react-flow__node').allInnerTexts()).join(' | ');
const box = async (loc) => {
    const b = await loc.boundingBox();
    check(b, 'element has no box');
    return b;
};
const centre = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const tableByName = (name) =>
    page.locator('[data-testid^="entity-"]').filter({ hasText: name }).first();

/** Lines really drawn (path with geometry and a size on the page). */
const drawnEdges = () =>
    page.evaluate(
        () =>
            [...document.querySelectorAll('.react-flow__edge-path')].filter(
                (p) => {
                    const b = p.getBoundingClientRect();
                    return (
                        (p.getAttribute('d') ?? '').length > 4 &&
                        b.width + b.height > 8
                    );
                }
            ).length
    );
/** A point on the first drawn edge path, in page pixels. */
const edgePoint = (index = 0) =>
    page.evaluate((i) => {
        const p = [...document.querySelectorAll('.react-flow__edge-path')][i];
        const len = p.getTotalLength();
        const pt = p.getPointAtLength(len / 2);
        const m = p.getScreenCTM();
        return { x: pt.x * m.a + m.e, y: pt.y * m.d + m.f };
    }, index);
const horizontalOverflow = () =>
    page.evaluate(
        () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth
    );

async function chooseDatabase(db) {
    await page.goto(`${BASE}/`);
    await page.getByRole('radio', { name: new RegExp(db) }).click();
}
async function blankDiagram(db = 'PostgreSQL') {
    await chooseDatabase(db);
    await page.getByRole('button', { name: 'Empty database' }).click();
    await page.waitForURL(/\/diagrams\/.+/);
    await page.locator('.react-flow').waitFor();
}
async function seededDiagram(sql = SEED_SQL, db = 'PostgreSQL') {
    await chooseDatabase(db);
    // choosing a database card opens the import step of the dialog
    await page.getByRole('radio', { name: 'SQL Script' }).click();
    await page.getByRole('textbox', { name: 'SQL script' }).fill(sql);
    await page
        .getByText(/Found \d+ tables?/)
        .first()
        .waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.waitForURL(/\/diagrams\/.+/);
    await page.locator('[data-testid^="entity-"]').first().waitFor();
    await idle();
}
const mouseDrag = async (from, to, steps = 12) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps });
    await page.mouse.up();
};
const undo = () => page.keyboard.press('ControlOrMeta+z');

// ============================================================== flow 1
await flow(
    'F1',
    'drag items from the side panel; drag, resize, area moves',
    {},
    async () => {
        await step('01 blank diagram opens', blankDiagram);

        await step('02 drag Add table onto the canvas twice', async () => {
            const add = page.getByRole('button', { name: 'Add Table' }).first();
            await add.dragTo(pane(), { targetPosition: { x: 120, y: 420 } });
            await idle();
            check(
                (await tables().count()) === 1,
                'no table after the first drop'
            );
            const first = await box(tables().first());
            await add.dragTo(pane(), { targetPosition: { x: 520, y: 420 } });
            await idle();
            check((await tables().count()) === 2, 'no second table');
            const p0 = await box(pane());
            const second = await box(tables().nth(1));
            check(
                Math.abs(second.x - (p0.x + 520)) < 140 &&
                    Math.abs(second.y - (p0.y + 420)) < 140,
                `second table not near its drop point: ${JSON.stringify(second)}`
            );
            check(
                Math.abs(second.x - first.x) > 60 ||
                    Math.abs(second.y - first.y) > 60,
                'the two tables sit on top of each other'
            );
            await shot('two-tables-dropped');
        });

        await step('03 drag Add Area and Add Note from Visuals', async () => {
            await rail('Visuals');
            await page
                .getByRole('button', { name: 'Add Area' })
                .first()
                .dragTo(pane(), { targetPosition: { x: 120, y: 80 } });
            await idle();
            check((await regions().count()) === 1, 'no area after the drop');
            await page.getByRole('tab', { name: 'Notes' }).click();
            await page
                .getByRole('button', { name: 'Add Note' })
                .first()
                .dragTo(pane(), { targetPosition: { x: 760, y: 120 } });
            await idle();
            check((await memos().count()) === 1, 'no note after the drop');
            await shot('area-and-note');
        });

        await step('04 table drag moves it and a reload keeps it', async () => {
            const before = await box(tables().first());
            const h = { x: before.x + before.width / 2, y: before.y + 15 };
            await mouseDrag(h, { x: h.x + 100, y: h.y - 40 });
            await idle();
            const after = await box(tables().first());
            const otherBefore = await box(tables().nth(1));
            check(
                Math.abs(after.x - before.x - 100) < 15 &&
                    Math.abs(after.y - before.y + 40) < 15,
                `moved by (${after.x - before.x}, ${after.y - before.y})`
            );
            await pause(800);
            await page.reload();
            await tables().first().waitFor();
            await idle();
            // the view refits on load, so compare the distance between two tables
            const again = await box(tables().first());
            const otherAgain = await box(tables().nth(1));
            const scale = again.width / after.width;
            const dx = (otherBefore.x - after.x) * scale;
            const dy = (otherBefore.y - after.y) * scale;
            check(
                Math.abs(otherAgain.x - again.x - dx) < 12 &&
                    Math.abs(otherAgain.y - again.y - dy) < 12,
                `position lost after reload: offset (${otherAgain.x - again.x}, ${otherAgain.y - again.y}) expected (${dx}, ${dy})`
            );
        });

        await step('05 table resize by its edge, then undo', async () => {
            await tables()
                .first()
                .click({ position: { x: 100, y: 15 } });
            const b = await box(tables().first());
            const edge = { x: b.x + b.width, y: b.y + b.height / 2 };
            await mouseDrag(edge, { x: edge.x + 60, y: edge.y });
            await idle();
            const wide = await box(tables().first());
            check(
                wide.width > b.width + 30,
                `width ${b.width} -> ${wide.width}`
            );
            check(wide.width <= 460, `wider than the maximum: ${wide.width}`);
            await pane().click({ position: { x: 300, y: 600 } });
            await undo();
            await idle();
            const back = await box(tables().first());
            check(
                Math.abs(back.width - b.width) < 4,
                `undo gave ${back.width}, expected ${b.width}`
            );
        });

        await step(
            '06 area drag moves the tables inside it, one undo',
            async () => {
                // put a table fully inside the area by dragging it there
                const area = regions().first();
                const ab = await box(area);
                const t = tables().first();
                const tb = await box(t);
                await mouseDrag(
                    { x: tb.x + tb.width / 2, y: tb.y + 15 },
                    { x: ab.x + 20 + tb.width / 2, y: ab.y + 40 }
                );
                await idle();
                const inside = await box(tables().first());
                const area2 = await box(regions().first());
                check(
                    inside.x >= area2.x &&
                        inside.x + inside.width <= area2.x + area2.width,
                    `table not inside the area: table ${JSON.stringify(inside)} area ${JSON.stringify(area2)}`
                );
                await shot('table-in-area');
                const grab = {
                    x: area2.x + area2.width - 30,
                    y: area2.y + area2.height - 20,
                };
                await mouseDrag(grab, { x: grab.x + 150, y: grab.y + 120 });
                await idle();
                const moved = await box(tables().first());
                check(
                    Math.abs(moved.x - inside.x - 150) < 20 &&
                        Math.abs(moved.y - inside.y - 120) < 20,
                    `table moved by (${moved.x - inside.x}, ${moved.y - inside.y}), area drag expected (150,120)`
                );
                await shot('area-dragged');
                await pane().click({ position: { x: 640, y: 740 } });
                await undo();
                await idle();
                const back = await box(tables().first());
                check(
                    Math.abs(back.x - inside.x) < 6 &&
                        Math.abs(back.y - inside.y) < 6,
                    `one undo should restore the table: ${JSON.stringify(back)} vs ${JSON.stringify(inside)}`
                );
                const areaBack = await box(regions().first());
                check(
                    Math.abs(areaBack.x - area2.x) < 6,
                    'one undo should restore the area'
                );
            }
        );
    }
);

// ============================================================== flow 2
await flow('F2', 'copy, paste, delete, undo, edit card', {}, async () => {
    await step('01 seeded diagram', () => seededDiagram());

    await step('02 Ctrl+C copies a table, Ctrl+V pastes a copy', async () => {
        await tableByName('customers').click({ position: { x: 100, y: 15 } });
        await page.keyboard.press('ControlOrMeta+c');
        await page.getByText('Table copied').waitFor();
        await shot('copied-toast');
        await page.keyboard.press('ControlOrMeta+v');
        await page.getByText('Table pasted').first().waitFor();
        await idle();
        check(
            (await tables().count()) === 4,
            `${await tables().count()} tables`
        );
        check(
            /customers_copy/.test(await nodeText()),
            'copy is not named customers_copy'
        );
        await page.keyboard.press('ControlOrMeta+v');
        await idle();
        check((await tables().count()) === 5, 'second paste added nothing');
        check(/customers_copy2/.test(await nodeText()), 'no customers_copy2');
        await shot('pasted');
    });

    await step(
        '03 select two tables and a line, Delete, then undo',
        async () => {
            await pane().click({ position: { x: 5, y: 5 } });
            const before = await tables().count();
            await tableByName('items').click({ position: { x: 100, y: 15 } });
            await tableByName('orders').click({
                position: { x: 100, y: 15 },
                modifiers: ['Shift'],
            });
            await page.keyboard.press('Delete');
            await idle();
            check(
                (await tables().count()) === before - 2,
                `${await tables().count()} left, expected ${before - 2}`
            );
            await shot('after-delete');
            await undo();
            await idle();
            check(
                (await tables().count()) === before,
                `one undo should bring both back: ${await tables().count()}`
            );
            check((await drawnEdges()) >= 1, 'the line did not come back');
        }
    );

    await step(
        '04 double-click opens the edit card, rename + duplicate warning',
        async () => {
            await tableByName('items').dblclick({
                position: { x: 100, y: 15 },
            });
            const name = page.getByRole('textbox', { name: 'Table name' });
            await name.waitFor();
            await idle();
            await shot('edit-card');
            // the card lies inside the window and above the toolbar (browser finding 1)
            const card = await box(page.locator('[data-edit-card]'));
            const bar = await box(page.locator('.qb-toolbar'));
            check(
                card.y >= 0 && card.y + card.height <= bar.y + 1,
                `edit card ${Math.round(card.y)}..${Math.round(card.y + card.height)} reaches the toolbar at ${Math.round(bar.y)}`
            );
            check(
                card.x >= 0 && card.x + card.width <= 1280,
                'edit card leaves the window sideways'
            );
            await name.fill('orders');
            await name.blur();
            await page
                .getByText(/already named "orders"/)
                .first()
                .waitFor();
            await shot('duplicate-warning');
            await name.fill('line_items');
            await name.blur();
            await idle();
            await page.keyboard.press('Escape');
            await idle();
            await rail('Tables');
            check(
                (await page
                    .getByTestId('table-row')
                    .filter({ hasText: 'line_items' })
                    .count()) === 1,
                'rename not applied in the Tables list'
            );
            await tableByName('line_items').dblclick({
                position: { x: 100, y: 15 },
            });
            await page.getByRole('textbox', { name: 'Table name' }).waitFor();
        }
    );

    await step('05 edit card: create a schema', async () => {
        await page.getByRole('combobox', { name: 'Schema' }).click();
        await page.getByRole('option', { name: 'Create new schema' }).click();
        await page
            .getByRole('textbox', { name: 'New schema name' })
            .fill('sales');
        await page.keyboard.press('Enter');
        await idle();
        await shot('schema-created');
        await page
            .getByRole('button', { name: 'Done' })
            .or(page.getByRole('button', { name: 'Close' }))
            .first()
            .click()
            .catch(() => undefined);
        await idle();
        check(/sales/.test(await nodeText()), 'schema not shown on the card');
        await tableByName('line_items').dblclick({
            position: { x: 100, y: 15 },
        });
        await page.getByRole('textbox', { name: 'Table name' }).waitFor();
    });

    await step('06 edit card: change the colour', async () => {
        const swatch = page
            .getByRole('button', { name: 'Change color' })
            .first();
        const before = await swatch.evaluate(
            (n) => getComputedStyle(n).backgroundColor + n.innerHTML
        );
        await swatch.click();
        await page
            .getByRole('button', { name: /^Use #/ })
            .nth(3)
            .click();
        await idle();
        await shot('colour-changed');
        const after = await page
            .getByRole('button', { name: 'Change color' })
            .first()
            .evaluate((n) => getComputedStyle(n).backgroundColor + n.innerHTML);
        check(before !== after, 'the colour swatch did not change');
        await page.keyboard.press('Escape');
        // Escape closes only the colour popover; the card stays (review ui 3)
        await page
            .locator('[data-radix-popper-content-wrapper]')
            .waitFor({ state: 'detached' });
        check(
            (await page
                .getByRole('textbox', { name: 'Table name' })
                .count()) === 1,
            'the edit card closed together with the colour popover'
        );
    });

    await step('07 Escape closes the edit card', async () => {
        await page.keyboard.press('Escape');
        await idle();
        check(
            (await page
                .getByRole('textbox', { name: 'Table name' })
                .count()) === 0,
            'edit card still open'
        );
    });

    await step(
        '08 arrow keys move a table, one undo puts it back',
        async () => {
            const table = page.locator('.react-flow__node').filter({
                hasText: 'customers',
            });
            await table.first().click({ position: { x: 100, y: 15 } });
            const before = await box(table.first());
            for (let i = 0; i < 5; i += 1)
                await page.keyboard.press('ArrowRight');
            await pause(700);
            const moved = await box(table.first());
            check(
                moved.x > before.x + 10,
                `the table did not move (${before.x} -> ${moved.x})`
            );
            await undo();
            await idle();
            const back = await box(table.first());
            check(
                Math.abs(back.x - before.x) < 1.5,
                `one undo did not restore the position (${before.x} vs ${back.x})`
            );
        }
    );

    const focusedTable = () =>
        page.evaluate(() => {
            const a = document.activeElement;
            return a?.classList.contains('react-flow__node-entity')
                ? (a.querySelector('[data-testid^="entity-"]')?.textContent ??
                      '')
                : null;
        });
    const tabToTable = async (name) => {
        for (let i = 0; i < 250; i += 1) {
            await page.keyboard.press('Tab');
            const text = await focusedTable();
            // the pasted copy is called "<name>_copy": it is not the table asked for
            if (text?.includes(name) && !text.includes(`${name}_copy`)) return;
        }
        check(false, `Tab never reached ${name}`);
    };

    await step(
        '09 keyboard only: Tab to a table, arrows move it, Enter opens the card, Escape closes it and focus returns',
        async () => {
            await page.locator('[data-testid="diagram-canvas"]').focus();
            await page.keyboard.press('Shift');
            await tabToTable('customers');
            const table = page.locator('.react-flow__node:focus');
            check((await table.count()) === 1, 'table has no focus');
            await shot('f2-keyboard-focus-ring');
            const before = await box(table);
            await page.keyboard.press('ArrowRight');
            await page.keyboard.press('Shift+ArrowRight');
            await pause(900);
            const moved = await box(table);
            check(
                moved.x > before.x + 15,
                `arrows did not move it (${before.x} -> ${moved.x})`
            );
            check(
                /customers moved/.test(
                    (await page
                        .locator('[data-testid="canvas-announcer"]')
                        .textContent()) ?? ''
                ),
                'the move was not announced'
            );
            await page.keyboard.press('Enter');
            await page
                .getByRole('textbox', { name: 'Table name' })
                .waitFor({ timeout: 3000 });
            await page.keyboard.press('Escape');
            await idle();
            check(
                (await page
                    .getByRole('textbox', { name: 'Table name' })
                    .count()) === 0,
                'edit card still open after Escape'
            );
            check(
                (await focusedTable())?.includes('customers'),
                'focus did not return to the table'
            );
            await page.keyboard.press('Escape');
            check(
                await page.evaluate(
                    () =>
                        document.activeElement?.getAttribute('data-testid') ===
                        'diagram-canvas'
                ),
                'second Escape did not move the focus to the canvas'
            );
        }
    );

    await step(
        '10 keyboard only: Shift+F10 menu, draw a relationship with Enter on the target',
        async () => {
            await page.locator('[data-testid="diagram-canvas"]').focus();
            await page.keyboard.press('Shift');
            await tabToTable('orders');
            await page.keyboard.press('Shift+F10');
            await page
                .getByRole('menuitem', { name: /relationship/i })
                .first()
                .click();
            await page.getByTestId('link-draft').waitFor();
            await page.keyboard.press('Escape');
            check(
                (await page.getByTestId('link-draft').count()) === 0,
                'Escape did not cancel the relationship draft'
            );
        }
    );
});

// ============================================================== flow 3
await flow(
    'F3',
    'relationships: drag handles, dialog, popover, cardinality',
    {},
    async () => {
        await step('01 seeded diagram has one drawn line', async () => {
            await seededDiagram();
            check((await drawnEdges()) === 1, `${await drawnEdges()} lines`);
            await shot('seeded-links');
        });

        await step(
            '02 drag from a field dot to another field dot',
            async () => {
                const orders = tableByName('orders');
                const items = tableByName('items');
                const src = orders.locator('[data-testid^="field-"]').first(); // id
                const dst = items.locator('[data-testid^="field-"]').nth(1); // order_id
                await src.hover();
                const sb = await box(src);
                const sdot = src.locator('.react-flow__handle').nth(1);
                const sd = centre(await box(sdot));
                await dst.hover();
                const db = await box(dst);
                const target = { x: db.x - 1, y: db.y + db.height / 2 };
                await dst.hover();
                const ddot = centre(
                    await box(dst.locator('.react-flow__handle').first())
                );
                await src.hover();
                await mouseDrag(sd, ddot, 20);
                await idle();
                await shot('dragged-link');
                check(
                    (await drawnEdges()) === 2,
                    `${await drawnEdges()} lines after the drag`
                );
                void sb;
                void target;
            }
        );

        await step(
            '03 incompatible types give a toast and nothing is made',
            async () => {
                const customers = tableByName('customers');
                const items = tableByName('items');
                const src = customers.locator('[data-testid^="field-"]').nth(1); // email varchar
                const dst = items.locator('[data-testid^="field-"]').first(); // id int
                await src.hover();
                const sd = centre(
                    await box(src.locator('.react-flow__handle').nth(1))
                );
                await dst.hover();
                const dd = centre(
                    await box(dst.locator('.react-flow__handle').first())
                );
                await src.hover();
                await mouseDrag(sd, dd, 20);
                await page
                    .getByText('Field types are not compatible')
                    .first()
                    .waitFor();
                await shot('incompatible');
                check((await drawnEdges()) === 2, 'a line was made');
            }
        );

        await step(
            '04 an existing pair gives "Already connected"',
            async () => {
                const orders = tableByName('orders');
                const items = tableByName('items');
                const src = orders.locator('[data-testid^="field-"]').first();
                const dst = items.locator('[data-testid^="field-"]').nth(1);
                await src.hover();
                const sd = centre(
                    await box(src.locator('.react-flow__handle').nth(1))
                );
                await dst.hover();
                const dd = centre(
                    await box(dst.locator('.react-flow__handle').first())
                );
                await src.hover();
                await mouseDrag(sd, dd, 20);
                await page.getByText('Already connected').first().waitFor();
                check((await drawnEdges()) === 2, 'a duplicate line was made');
            }
        );

        await step('05 create a relationship through the dialog', async () => {
            await rail('Refs');
            const before = await page.getByTestId('ref-row').count();
            await page
                .getByRole('button', { name: 'Add Relationship' })
                .first()
                .click();
            const d = page.getByRole('dialog');
            const pick = async (name, option) => {
                await d.getByRole('combobox', { name }).click();
                await page
                    .getByRole('option', { name: option })
                    .first()
                    .click();
            };
            await pick('Primary table', /customers/);
            await pick('Primary field', /email/);
            await pick('Referenced table', /items/);
            await pick('Referenced field', /sku/);
            await d.getByRole('button', { name: 'Create' }).click();
            await idle();
            check(
                (await page.getByTestId('ref-row').count()) === before + 1,
                'no new row in the Links list'
            );
            check((await drawnEdges()) === 3, `${await drawnEdges()} lines`);
            await shot('three-lines');
        });

        await step(
            '06 double-click a line: popover, 1:N, switch, delete',
            async () => {
                await rail('Tables');
                const p = await edgePoint(0);
                await page.mouse.dblclick(p.x, p.y);
                const pop = page.getByRole('button', { name: '1:N' });
                await pop.waitFor();
                await shot('link-popover');
                await pop.click();
                await idle();
                await page.mouse.dblclick(p.x, p.y);
                await page
                    .getByRole('button', { name: 'Switch tables' })
                    .click();
                await idle();
                await shot('link-switched');
                check((await drawnEdges()) === 3, 'lines lost after switch');
                const q = await edgePoint(0);
                await page.mouse.dblclick(q.x, q.y);
                await page
                    .getByRole('button', { name: 'Delete relationship' })
                    .click();
                await idle();
                check(
                    (await drawnEdges()) === 2,
                    `${await drawnEdges()} lines after delete`
                );
                await undo();
                await idle();
            }
        );

        await step('07 cardinality toggle in the Links list', async () => {
            await rail('Refs');
            const row = page.getByTestId('ref-row').first();
            await row.locator('button').first().click();
            const combo = row.getByRole('combobox', { name: 'Cardinality' });
            await combo.waitFor();
            await combo.click();
            await page.getByRole('option', { name: 'One to many' }).click();
            await idle();
            await shot('cardinality');
            await rail('Tables');
        });
    }
);

// ============================================================== flow 4
await flow('F4', 'filter panel and zoom to group', {}, async () => {
    await step('01 seeded diagram', () => seededDiagram());

    await step(
        '02 Ctrl+F opens the filter panel, search narrows it',
        async () => {
            await pane().click({ position: { x: 5, y: 5 } });
            await page.keyboard.press('ControlOrMeta+f');
            const search = page.getByRole('textbox', {
                name: 'Search tables or fields...',
            });
            await search.waitFor();
            await shot('filter-panel');
            await search.fill('CUST');
            await idle();
            const txt = await page
                .locator('[data-testid="filter-group"]')
                .innerText();
            check(/customers/.test(txt) && !/items/.test(txt), `tree: ${txt}`);
            await search.fill('');
        }
    );

    await step(
        '03 hide a table: it and its line disappear, the button is teal',
        async () => {
            const group = page.locator('[data-testid="filter-group"]').first();
            const row = page
                .locator('[data-testid="filter-table"]')
                .filter({ hasText: 'customers' });
            await row.getByRole('button', { name: 'Hide' }).click();
            await idle();
            check(
                (await tables().count()) === 2,
                `${await tables().count()} tables visible`
            );
            check(
                (await drawnEdges()) === 0,
                'the line of a hidden table is drawn'
            );
            await shot('table-hidden');
            await row.getByRole('button', { name: 'Show' }).click();
            await idle();
            check((await tables().count()) === 3, 'table not shown again');
            check((await drawnEdges()) === 1, 'line not back');
            void group;
        }
    );

    await step('04 hide a whole group and show it, zoom to it', async () => {
        const group = page.locator('[data-testid="filter-group"]').first();
        await group.getByRole('button', { name: 'Hide' }).first().click();
        await idle();
        check((await tables().count()) === 0, 'group hide left tables');
        await shot('all-hidden');
        await page.getByRole('button', { name: 'Show All' }).first().click();
        await idle();
        check(
            (await tables().count()) === 3,
            'show all did not bring them back'
        );
        await group
            .getByRole('button', { name: /^Zoom to/ })
            .first()
            .click();
        await idle();
        await shot('zoom-to-group');
    });

    await step('05 group by area toggle', async () => {
        await page.getByText('Group by area').click();
        await idle();
        await shot('group-by-area');
        await page.getByText('Group by schema').click();
        await page.keyboard.press('ControlOrMeta+f');
    });
});

// ============================================================== flow 5
await flow('F5', 'DBML section: edit, diff, accept, undo', {}, async () => {
    await step('01 seeded diagram and DBML section', async () => {
        await seededDiagram();
        await rail('DBML');
        await page.getByText(/Table "public"\."customers"/).waitFor();
    });

    await step('02 Edit, add a table, diff marks appear', async () => {
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        const ta = page.getByRole('textbox', { name: 'DBML text' });
        await ta.waitFor();
        const text = await ta.inputValue();
        await ta.fill(
            text +
                '\nTable "public"."warehouses" {\n  "id" integer [pk]\n  "city" varchar\n}\n'
        );
        await pause(1500);
        // the view moves to show the new table (browser finding 3)
        await pause(1000);
        await shot('dbml-diff');
        check(
            (await page.locator('[data-testid^="diff-badge-"]').count()) >= 1,
            'no diff badge on the canvas'
        );
        const fresh = await box(tableByName('warehouses'));
        const paneBox = await box(pane());
        check(
            fresh.x >= paneBox.x &&
                fresh.x + fresh.width <= paneBox.x + paneBox.width &&
                fresh.y >= paneBox.y &&
                fresh.y + fresh.height <= paneBox.y + paneBox.height,
            `the preview table is not fully in view: ${JSON.stringify(fresh)}`
        );
        check(
            (await page.locator('.react-flow__minimap-node').count()) >= 4,
            'the minimap leaves the preview table out'
        );
        check(
            (await tables().count()) === 3 || (await tables().count()) === 4,
            'tables count odd'
        );
        await page.getByRole('button', { name: 'Accept changes' }).waitFor();
    });

    await step('03 Undo changes drops the preview', async () => {
        await page.getByRole('button', { name: 'Undo changes' }).click();
        await idle();
        check(
            (await page.locator('[data-testid^="diff-badge-"]').count()) === 0,
            'badges stay after Undo changes'
        );
        check(!/warehouses/.test(await nodeText()), 'preview table stays');
        await shot('dbml-undone');
    });

    await step(
        '04 edit again, Accept changes, one undo reverts all',
        async () => {
            await page
                .getByRole('button', { name: 'Edit', exact: true })
                .click();
            const ta = page.getByRole('textbox', { name: 'DBML text' });
            const text = await ta.inputValue();
            await ta.fill(
                text +
                    '\nTable "public"."warehouses" {\n  "id" integer [pk]\n}\nTable "public"."depots" {\n  "id" integer [pk]\n}\n'
            );
            await pause(1500);
            await page.getByRole('button', { name: 'Accept changes' }).click();
            await idle();
            await shot('dbml-accepted');
            const txt = await nodeText();
            check(
                /warehouses/.test(txt) && /depots/.test(txt),
                `after accept: ${txt}`
            );
            const n = await tables().count();
            check(n === 5, `${n} tables`);
            check((await drawnEdges()) === 1, 'line lost by the accept');
            await pane().click({ position: { x: 300, y: 100 } });
            await undo();
            await idle();
            check(
                (await tables().count()) === 3,
                `one undo should remove both new tables: ${await tables().count()}`
            );
        }
    );

    await step('05 a DBML syntax error is reported', async () => {
        await page.getByRole('button', { name: 'Edit', exact: true }).click();
        const ta = page.getByRole('textbox', { name: 'DBML text' });
        await ta.fill('Table broken {{{');
        await pause(1500);
        await page.getByText(/Failed to parse DBML/).waitFor();
        await shot('dbml-error');
        check(
            (await page
                .getByRole('button', { name: 'Accept changes' })
                .count()) === 0,
            'Accept changes is offered for text that does not parse'
        );
        await page.getByRole('button', { name: 'View', exact: true }).click();
        await idle();
        check(
            (await page.getByRole('textbox', { name: 'DBML text' }).count()) ===
                0,
            'still in edit mode'
        );
    });
});

// ============================================================== flow 6
await flow(
    'F6',
    'import SQL into an open diagram, duplicates',
    {},
    async () => {
        await step('01 seeded diagram', () => seededDiagram());
        await step('02 Import SQL: counts and duplicates warning', async () => {
            await menu('Actions', 'Import', 'SQL');
            const d = page.getByRole('dialog');
            // the instructions panel has read-only textboxes before the script box
            await d
                .getByRole('textbox', { name: 'SQL script' })
                .fill(SECOND_SQL);
            await pause(1000);
            await shot('import-open-dialog');
            const txt = await d.innerText();
            check(
                /customers/i.test(txt) ||
                    /already/i.test(txt) ||
                    /duplicate|overwrit/i.test(txt),
                `no duplicate notice: ${txt}`
            );
        });
        await step(
            '03 confirm: the tables are added to the right',
            async () => {
                const d = page.getByRole('dialog');
                await d
                    .getByRole('button', { name: /Import|Build|Add/ })
                    .last()
                    .click();
                await idle();
                await shot('imported-into-open');
                await rail('Tables');
                const rows = await page
                    .getByTestId('table-row')
                    .allInnerTexts();
                check(
                    rows.some((r) => /pets/.test(r)),
                    `pets not in the list: ${rows}`
                );
                check(
                    rows.filter((r) => /customers/.test(r)).length === 2,
                    'expected the duplicate customers table'
                );
                await page
                    .getByRole('button', { name: 'Show All' })
                    .first()
                    .click();
                await idle();
                await shot('imported-fit');
            }
        );
    }
);

// ============================================================== flow 7
await flow('F7', 'settings persist across reload; language', {}, async () => {
    await step('01 seeded diagram', () => seededDiagram());

    // the language button opens a small list: a select, a search box and the languages
    const chooseLanguage = async (name) => {
        // the button's name is translated too: find it by its globe icon
        const globe = page.locator('button:has(svg.lucide-globe)').first();
        // the list stays open after a choice: open it only when it is closed
        if ((await globe.getAttribute('aria-expanded')) !== 'true')
            await globe.click();
        if (!(await page.getByRole('searchbox').isVisible()))
            await page.getByRole('dialog').getByRole('combobox').click();
        await page.getByText(name, { exact: true }).first().click();
    };
    const toggle = async (label) => {
        await page
            .getByRole('menubar')
            .getByText('View', { exact: true })
            .click();
        await page
            .getByRole('menuitemcheckbox', { name: label })
            .or(page.getByRole('menuitem', { name: label }))
            .first()
            .click();
    };
    const minimapUp = () => page.locator('.react-flow__minimap').count();

    await step(
        '02 hide the minimap, compact tables, cardinality; persist',
        async () => {
            check((await minimapUp()) === 1, 'minimap not shown by default');
            // the canvas shows short type names (integer is "int"), so look at varchar
            const chips0 = (await nodeText()).includes('varchar');
            check(chips0, 'no type chips before compact');
            await toggle(/^(Hide|Show) Mini Map/);
            await toggle(/^(Compact|Standard) Tables/);
            await toggle(/^(Hide|Show) Cardinality/);
            await idle();
            await shot('settings-changed');
            check((await minimapUp()) === 0, 'minimap still there');
            check(
                !(await nodeText()).includes('varchar'),
                'compact still shows type chips'
            );
            await page.reload();
            await tables().first().waitFor();
            await idle();
            check((await minimapUp()) === 0, 'minimap choice lost');
            check(
                !(await nodeText()).includes('varchar'),
                'compact lost after reload'
            );
            await shot('settings-after-reload');
            await toggle(/^(Hide|Show) Mini Map/);
            await toggle(/^(Compact|Standard) Tables/);
            await toggle(/^(Hide|Show) Cardinality/);
            await idle();
            check((await minimapUp()) === 1, 'minimap not back');
        }
    );

    await step('03 theme via View menu persists after reload', async () => {
        await menu('View', 'Theme', 'Dark');
        await page.reload();
        await tables().first().waitFor();
        check(
            await page.evaluate(() =>
                document.documentElement.classList.contains('dark')
            ),
            'dark lost after reload'
        );
        await shot('dark-after-reload');
        await page.keyboard.press('ControlOrMeta+m');
        await idle();
        check(
            !(await page.evaluate(() =>
                document.documentElement.classList.contains('dark')
            )),
            'Ctrl+M did not switch to light'
        );
    });

    await step(
        '04 switch to German: menu text is translated, app still works',
        async () => {
            await chooseLanguage('Deutsch (German)');
            await idle();
            await shot('german');
            const bar = await page.getByRole('menubar').innerText();
            check(
                !/Actions\s+Edit\s+View/.test(bar),
                `menubar still English: ${bar}`
            );
            check(
                (
                    await page.evaluate(() => document.documentElement.lang)
                ).startsWith('de'),
                'html lang is not de'
            );
            // the app still works: add a table through the (translated) side panel
            const before = await tables().count();
            await page
                .getByRole('button', { name: 'Tabelle hinzufügen' })
                .first()
                .click();
            await idle();
            check(
                (await tables().count()) === before + 1,
                'adding a table failed in German'
            );
            await shot('german-after-add');
        }
    );

    await step(
        '04b switching through every language in one session translates the menus each time',
        async () => {
            // [name in the list, a word the menu bar must contain, html lang]
            const languages = [
                ['Italiano (Italian)', 'Diagramma', 'it'],
                ['Русский (Russian)', 'Диаграмма', 'ru'],
                ['Français (French)', 'Diagramme', 'fr'],
                ['Deutsch (German)', 'Diagramm', 'de'],
            ];
            for (const [name, word, lang] of languages) {
                await chooseLanguage(name);
                await idle();
                await page
                    .getByRole('menubar')
                    .getByText(word, { exact: false })
                    .first()
                    .waitFor({ timeout: 8000 })
                    .catch(() => undefined);
                const bar = await page.getByRole('menubar').innerText();
                check(
                    bar.includes(word),
                    `${name}: the menu bar says "${bar.replace(/\s+/g, ' ')}", expected "${word}"`
                );
                check(
                    (
                        await page.evaluate(() => document.documentElement.lang)
                    ).startsWith(lang),
                    `${name}: html lang is not ${lang}`
                );
            }
            await shot('every-language');
        }
    );

    await step('05 switch back to English', async () => {
        await chooseLanguage('English');
        await idle();
        const bar = await page.getByRole('menubar').innerText();
        check(/Actions/.test(bar) && /View/.test(bar), `menubar: ${bar}`);
    });
});

// ============================================================== flow 8
await flow('F8', 'export image/SQL, shortcuts, full screen', {}, async () => {
    await step('01 seeded diagram', () => seededDiagram());

    await step('02 export a PNG image (download is a real PNG)', async () => {
        await menu('Actions', 'Export as', 'PNG');
        await page
            .getByRole('button', { name: 'Export', exact: true })
            .waitFor();
        await shot('png-dialog');
        const [dl] = await Promise.all([
            page.waitForEvent('download', { timeout: 20000 }),
            page.getByRole('button', { name: 'Export', exact: true }).click(),
        ]);
        const file = '/tmp/qbase-flows-export.png';
        await dl.saveAs(file);
        const head = readFileSync(file).subarray(0, 8).toString('hex');
        check(head === '89504e470d0a1a0a', `not a PNG: ${head}`);
        check(
            statSync(file).size > 3000,
            `PNG too small: ${statSync(file).size}`
        );
        await page.keyboard.press('Escape');
    });

    await step('02b SVG export holds tables that are off screen', async () => {
        for (let i = 0; i < 9; i += 1) {
            await page.getByRole('button', { name: 'Zoom In' }).click();
            await pause(250);
        }
        await mouseDrag({ x: 800, y: 500 }, { x: 800, y: 200 });
        await idle();
        // the canvas only draws what is on screen: the others are gone from the page
        const drawn = await tables().count();
        check(drawn < 3, `all ${drawn} tables are still in the page`);
        const [dl] = await Promise.all([
            page.waitForEvent('download', { timeout: 20000 }),
            menu('Actions', 'Export as', 'SVG'),
        ]);
        const file = '/tmp/qbase-flows-export.svg';
        await dl.saveAs(file);
        const svg = readFileSync(file, 'utf8');
        for (const name of ['customers', 'orders', 'items'])
            check(svg.includes(name), `the SVG has no table "${name}"`);
        await idle();
        await page.keyboard.press('ControlOrMeta+0');
        await idle();
    });

    await step('03 export SQL for MySQL', async () => {
        await menu('Actions', 'Export SQL', 'MySQL');
        const ta = page.getByRole('textbox', { name: 'Generated script' });
        await page.waitForFunction(
            () =>
                document.querySelector(
                    'textarea[aria-label="Generated script"]'
                )?.value
        );
        const sql = await ta.inputValue();
        check(/CREATE TABLE/i.test(sql) && /customers/.test(sql), 'bad SQL');
        await shot('mysql-export');
        await page.keyboard.press('Escape');
    });

    await step(
        '04 keyboard shortcuts: Ctrl+B panel, Ctrl+0 fit, Ctrl+M theme',
        async () => {
            const w0 = (await box(pane())).width;
            await page.keyboard.press('ControlOrMeta+b');
            await idle();
            const w1 = (await box(pane())).width;
            check(w1 > w0 + 100, `panel did not hide (${w0} -> ${w1})`);
            await page.keyboard.press('ControlOrMeta+b');
            await idle();
            check((await box(pane())).width < w1, 'panel did not return');
            await page.keyboard.press('ControlOrMeta+m');
            await idle();
            check(
                await page.evaluate(() =>
                    document.documentElement.classList.contains('dark')
                ),
                'Ctrl+M did not switch to dark'
            );
            await page.keyboard.press('ControlOrMeta+m');
            await page.keyboard.press('ControlOrMeta+0');
            await idle();
            await shot('after-fit');
        }
    );

    await step('05 Ctrl+O opens the list; Ctrl+S confirms saving', async () => {
        await page.keyboard.press('ControlOrMeta+s');
        await page.getByText('Everything is saved').waitFor();
        await page.keyboard.press('ControlOrMeta+o');
        await page.getByRole('dialog').waitFor();
        await shot('ctrl-o');
        await page.keyboard.press('Escape');
    });
});

// ============================================================== flow 9
await flow(
    'F9',
    'phone viewport 390x844',
    { viewport: { width: 390, height: 844 }, touch: true },
    async () => {
        await step('01 seeded diagram, no horizontal overflow', async () => {
            await seededDiagram();
            await shot('phone-canvas');
            const over = await horizontalOverflow();
            check(over <= 0, `horizontal overflow ${over}px`);
            check((await drawnEdges()) >= 1, 'no line on the phone canvas');
        });

        await step('02 minimap is small and nothing is empty', async () => {
            const mm = page.locator('.react-flow__minimap');
            await mm.waitFor();
            const b = await box(mm);
            check(
                b.height <= 90 && b.height >= 40,
                `minimap height ${b.height}`
            );
            const rects = await page
                .locator('.react-flow__minimap-node')
                .count();
            check(rects >= 3, `${rects} tables in the minimap`);
        });

        await step(
            '03 drawer opens, section list, focus closes it',
            async () => {
                await page
                    .getByRole('button', { name: 'Open the editing panel' })
                    .click();
                await page
                    .getByRole('heading', { name: 'Manage Diagram' })
                    .waitFor();
                await idle();
                await shot('phone-drawer');
                check(
                    (await horizontalOverflow()) <= 0,
                    'overflow with the drawer open'
                );
                await page.keyboard.press('Escape');
                await idle();
            }
        );

        const longPress = async (x, y, label) => {
            const cdp = await context.newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchStart',
                touchPoints: [{ x, y }],
            });
            await pause(900);
            await shot(`${label}-finger-down`);
            const item = label.includes('table')
                ? page.getByRole('menuitem', { name: 'Duplicate Table' })
                : page.getByRole('menuitem', { name: 'New Table' });
            await item.waitFor();
            await page.evaluate(() => {
                window.__ev = [];
                for (const t of [
                    'pointerdown',
                    'pointerup',
                    'mousedown',
                    'mouseup',
                    'click',
                    'contextmenu',
                    'touchend',
                ])
                    document.addEventListener(
                        t,
                        (e) =>
                            window.__ev.push(
                                `${t} on ${e.target.tagName}.${String(e.target.className).slice(0, 40)}`
                            ),
                        true
                    );
            });
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchEnd',
                touchPoints: [],
            });
            await pause(500);
            if (process.env.DEBUG_EVENTS)
                console.log(
                    (await page.evaluate(() => window.__ev)).join('\n')
                );
            await shot(`${label}-finger-up`);
            check(
                (await item.count()) === 1,
                'the menu closed when the finger was lifted'
            );
            await page.keyboard.press('Escape');
            await idle();
        };
        await step(
            '04 long-press on a table opens the menu and keeps it',
            async () => {
                const b = await box(tableByName('orders'));
                await longPress(
                    b.x + b.width / 2,
                    b.y + 20,
                    'phone-table-menu'
                );
            }
        );

        await step(
            '05 long-press on the canvas opens the canvas menu',
            async () => {
                await longPress(200, 700, 'phone-canvas-menu');
            }
        );
    }
);

// ---------------------------------------------------------------- helpers F10+
const openDialog = () => page.getByRole('dialog', { name: 'Open Database' });
/** The names in the Open dialog, in the order shown. */
const openNames = async () =>
    (
        await openDialog().locator('tbody tr td:nth-child(2)').allInnerTexts()
    ).map((s) => s.trim());
const openRow = (name) =>
    openDialog()
        .locator('tbody tr')
        .filter({
            has: page.getByRole('cell', { name, exact: true }),
        });
async function showOpenDialog() {
    await page.keyboard.press('ControlOrMeta+o');
    await openDialog().waitFor();
    await openDialog().locator('tbody tr').first().waitFor();
}
async function rowAction(name, action) {
    await openDialog()
        .getByRole('button', { name: `Actions for ${name}`, exact: true })
        .click();
    await page.getByRole('menuitem', { name: action, exact: true }).click();
}
/** Waits until fn() returns something truthy (state, not time). */
async function until(fn, message, timeout = 5000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
        last = await fn();
        if (last) return last;
        await pause(100);
    }
    throw new Error(`${message} (last: ${JSON.stringify(last)})`);
}
/**
 * Waits until the editor says everything is written: Ctrl+S only reports the
 * state ("Saving your latest changes" or "Everything is saved", EDT-257).
 */
async function waitSaved() {
    const toasts = page.getByRole('region', { name: /Notifications/ });
    await until(
        async () => {
            await pane().click({ position: { x: 5, y: 5 } });
            await page.keyboard.press('ControlOrMeta+s');
            await pause(300);
            const text = await toasts.innerText().catch(() => '');
            return (
                text.includes('Everything is saved') &&
                !text.includes('Saving your latest changes')
            );
        },
        'the editor never said everything is saved',
        15000
    );
}
/**
 * A known product bug: logged as KNOWN BUG and kept out of the failures, so
 * the run stays green; STRICT=1 makes it fail. Once fixed, it says so.
 */
const knownBugs = [];
function knownBug(present, message) {
    if (!present) {
        console.log(
            `  note: the known bug "${message}" no longer shows; make this a plain check`
        );
        return;
    }
    if (process.env.STRICT) throw new Error(`known bug: ${message}`);
    console.log(`  KNOWN BUG ${flowName}: ${message}`);
    knownBugs.push(`${flowName}: ${message}`);
}
const diagramTitle = async () =>
    (await page.getByRole('heading', { level: 1 }).first().innerText()).trim();
const typeRows = () => page.getByTestId('user-type-row');
const typeRow = (name) =>
    typeRows().filter({
        has: page.getByRole('button', { name, exact: true }),
    });
async function addUserType(name, values = []) {
    await rail('Custom Types');
    const before = await typeRows().count();
    await page.getByRole('button', { name: 'New Type' }).first().click();
    await until(
        async () => (await typeRows().count()) === before + 1,
        'no new type row'
    );
    const row = typeRows().last();
    // the new type is called type_N: rename it through its pencil button
    await row.getByRole('button', { name: 'Rename type' }).click();
    const input = page.getByRole('textbox', { name: 'Rename type' });
    await input.fill(name);
    await input.press('Enter');
    await typeRow(name).waitFor();
    const toggle = typeRow(name).getByRole('button', {
        name: 'Show or hide the details',
    });
    if ((await toggle.getAttribute('aria-expanded')) !== 'true')
        await toggle.click();
    for (const v of values) {
        const box = typeRow(name).getByRole('textbox', {
            name: 'Add enum value...',
        });
        await box.fill(v);
        await box.press('Enter');
        await typeRow(name).getByText(v, { exact: true }).waitFor();
    }
}
/** The value chips of an enum type row. */
const enumValues = async (name) =>
    (await typeRow(name).locator('li').allInnerTexts()).map((s) => s.trim());
const dbmlText = async () => {
    await rail('DBML');
    const pre = page.getByText(/Table "public"\./).first();
    await pre.waitFor();
    return page.evaluate(() => document.body.innerText);
};

/** Adds an area from the Visuals panel and names it through its label on the canvas. */
async function addArea(name) {
    await rail('Visuals');
    await page.getByRole('tab', { name: 'Areas' }).click();
    const before = await regions().count();
    await page
        .getByRole('tabpanel')
        .getByRole('button', { name: 'Add Area' })
        .first()
        .click();
    await until(
        async () => (await regions().count()) === before + 1,
        'no area on the canvas'
    );
    const region = regions().last();
    await region.getByRole('button', { name: 'Edit Area Name' }).click();
    const input = page.getByRole('textbox', { name: 'Area name' });
    await input.fill(name);
    await input.press('Enter');
    await regions().filter({ hasText: name }).first().waitFor();
}
/** Selects a table, adds a note to it from the Notes tab and writes its text. */
async function addNoteTo(table, text) {
    await tableByName(table).click({ position: { x: 100, y: 15 } });
    await rail('Visuals');
    await page.getByRole('tab', { name: 'Notes' }).click();
    const before = await memos().count();
    await page
        .getByRole('tabpanel')
        .getByRole('button', { name: 'Add Note' })
        .first()
        .click();
    await until(
        async () => (await memos().count()) === before + 1,
        'no note on the canvas'
    );
    const memo = memos().last();
    await memo.getByText('Double-click to write').dblclick();
    const area = page.getByRole('textbox', { name: 'Note text' });
    await area.fill(text);
    await area.blur();
    await memos().filter({ hasText: text }).first().waitFor();
}

// ============================================================== flow 10
await flow(
    'F10',
    'open dialog: search, rename, make a copy, delete, keyboard open; kept after reload',
    {},
    async () => {
        await step(
            '01 two diagrams: a seeded one and an empty one',
            async () => {
                await seededDiagram();
                check(
                    (await diagramTitle()) === 'Diagram 1',
                    `first diagram is called ${await diagramTitle()}`
                );
                await rail('New');
                await page
                    .getByRole('dialog', { name: 'What is your Database?' })
                    .waitFor();
                const first = page.url();
                await page
                    .getByRole('button', { name: 'Empty database' })
                    .click();
                await page.waitForURL((u) => u.toString() !== first);
                await page.locator('.react-flow').waitFor();
                await until(
                    async () => (await diagramTitle()) === 'Diagram 2',
                    'second diagram is not called Diagram 2'
                );
                check(
                    (await tables().count()) === 0,
                    'the new diagram has tables'
                );
            }
        );

        await step('02 Ctrl+O lists both with their table counts', async () => {
            await showOpenDialog();
            await until(
                async () => (await openNames()).length === 2,
                'the list does not show two diagrams'
            );
            const names = await openNames();
            check(
                names.includes('Diagram 1') && names.includes('Diagram 2'),
                `names: ${names}`
            );
            const count = async (name) =>
                (await openRow(name).locator('td').nth(4).innerText()).trim();
            check(
                (await count('Diagram 1')) === '3',
                `Diagram 1 shows ${await count('Diagram 1')} tables`
            );
            check(
                (await count('Diagram 2')) === '0',
                `Diagram 2 shows ${await count('Diagram 2')} tables`
            );
            check(
                await openDialog()
                    .getByRole('button', { name: 'Open', exact: true })
                    .isDisabled(),
                'Open is enabled with nothing selected'
            );
            await shot('open-dialog-two');
        });

        await step(
            '03 search narrows the list and says when nothing matches',
            async () => {
                const search = openDialog().getByRole('searchbox', {
                    name: 'Search by name',
                });
                await search.fill('2');
                await until(
                    async () => (await openNames()).join() === 'Diagram 2',
                    'search for "2" does not leave only Diagram 2'
                );
                await search.fill('zzz');
                await openDialog()
                    .getByText('No diagram has that name.')
                    .waitFor();
                await search.fill('');
                await until(
                    async () => (await openNames()).length === 2,
                    'clearing the search does not bring both back'
                );
            }
        );

        await step('04 rename a diagram that is not open', async () => {
            await rowAction('Diagram 1', 'Rename');
            const d = page.getByRole('dialog', { name: 'Rename Diagram' });
            const input = d.getByRole('textbox', { name: 'Diagram name' });
            await input.waitFor();
            check(
                (await input.inputValue()) === 'Diagram 1',
                'the rename box does not start with the old name'
            );
            await input.fill('   ');
            check(
                await d.getByRole('button', { name: 'Rename' }).isDisabled(),
                'Rename is enabled for a blank name'
            );
            await input.fill('Shop schema');
            await d.getByRole('button', { name: 'Rename' }).click();
            await openDialog().waitFor();
            await until(
                async () => (await openNames()).includes('Shop schema'),
                'the list does not show the new name'
            );
            check(
                !(await openNames()).includes('Diagram 1'),
                'the old name is still listed'
            );
        });

        await step(
            '05 make a copy: a third row with the same tables',
            async () => {
                await rowAction('Shop schema', 'Make a copy');
                await page
                    .getByText('Created Shop schema (Copy)')
                    .first()
                    .waitFor();
                await until(
                    async () => (await openNames()).length === 3,
                    'no third row after the copy'
                );
                check(
                    (
                        await openRow('Shop schema (Copy)')
                            .locator('td')
                            .nth(4)
                            .innerText()
                    ).trim() === '3',
                    'the copy does not have three tables'
                );
                await shot('open-dialog-copy');
            }
        );

        await step(
            '06 delete asks first; Cancel keeps it, Delete removes it',
            async () => {
                await rowAction('Shop schema (Copy)', 'Delete');
                const confirm = page
                    .getByRole('alertdialog')
                    .or(page.getByRole('dialog', { name: 'Delete Diagram' }));
                await confirm.first().waitFor();
                await confirm
                    .first()
                    .getByRole('button', { name: 'Cancel' })
                    .click();
                await openDialog().waitFor();
                check(
                    (await openNames()).length === 3,
                    'Cancel deleted the diagram'
                );
                await rowAction('Shop schema (Copy)', 'Delete');
                await confirm
                    .first()
                    .getByRole('button', { name: 'Delete' })
                    .click();
                await openDialog().waitFor();
                await until(
                    async () => (await openNames()).length === 2,
                    'the copy is still listed after Delete'
                );
                check(
                    !(await openNames()).includes('Shop schema (Copy)'),
                    'the copy is still listed'
                );
            }
        );

        await step(
            '07 keyboard: arrows select a row, Enter opens it',
            async () => {
                const names = await openNames();
                const from = names.indexOf('Diagram 2');
                const to = names.indexOf('Shop schema');
                const before = page.url();
                await openRow('Diagram 2').focus();
                await page.keyboard.press(to > from ? 'ArrowDown' : 'ArrowUp');
                check(
                    (await openRow('Shop schema').getAttribute(
                        'aria-selected'
                    )) === 'true',
                    'the arrow did not select the other row'
                );
                check(
                    await openDialog()
                        .getByRole('button', { name: 'Open', exact: true })
                        .isEnabled(),
                    'Open stays disabled with a row selected'
                );
                await page.keyboard.press('Enter');
                await page.waitForURL((u) => u.toString() !== before);
                await tableByName('customers').waitFor();
                check(
                    (await openDialog().count()) === 0,
                    'the dialog stays open after Enter'
                );
                check(
                    (await diagramTitle()) === 'Shop schema',
                    `the navbar says ${await diagramTitle()}`
                );
            }
        );

        await step('08 reload keeps the names and the list', async () => {
            await page.reload();
            await tableByName('customers').waitFor();
            check(
                (await diagramTitle()) === 'Shop schema',
                'the name was lost on reload'
            );
            await showOpenDialog();
            const names = (await openNames()).sort();
            check(
                names.join('|') === 'Diagram 2|Shop schema',
                `after reload: ${names}`
            );
            await page.keyboard.press('Escape');
        });

        await step('09 Actions > Delete removes the open diagram', async () => {
            await menu('Actions', 'Delete');
            const confirm = page
                .getByRole('alertdialog')
                .or(page.getByRole('dialog', { name: 'Delete Diagram' }))
                .first();
            await confirm.waitFor();
            await confirm.getByRole('button', { name: 'Delete' }).click();
            // the page goes to / and, with diagrams left, asks which to open
            await page.waitForURL(`${BASE}/`);
            await openDialog().waitFor({ timeout: 10000 });
            check(
                (await openDialog()
                    .getByRole('button', { name: 'Cancel' })
                    .count()) === 0,
                'the Open dialog can be cancelled with nothing open behind it'
            );
            await until(
                async () => (await openNames()).join() === 'Diagram 2',
                'the deleted diagram is still listed'
            );
            await shot('after-delete-open');
        });
    }
);

// ============================================================== flow 11
await flow(
    'F11',
    'diagram file: export, refuse bad files, import as a new diagram',
    {},
    async () => {
        const exported = '/tmp/qbase-flows-roundtrip.json';
        let originalUrl = '';
        await step(
            '01 seeded diagram with a type, an area and a note',
            async () => {
                await seededDiagram();
                originalUrl = page.url();
                await addUserType('mood', ['happy', 'sad']);
                await addArea('Billing');
                await addNoteTo('orders', 'check the totals');
                check((await regions().count()) === 1, 'no area');
                check((await memos().count()) === 1, 'no note');
            }
        );

        await step(
            '02 Backup > Export Diagram downloads the whole diagram',
            async () => {
                await menu('Backup', 'Export Diagram');
                const d = page.getByRole('dialog', { name: 'Export Diagram' });
                await d.getByText(/\.json \(about \d+ KB\)/).waitFor();
                const [dl] = await Promise.all([
                    page.waitForEvent('download', { timeout: 10000 }),
                    d.getByRole('button', { name: 'Download' }).click(),
                ]);
                await dl.saveAs(exported);
                check(
                    /\.json$/.test(dl.suggestedFilename()),
                    `file name ${dl.suggestedFilename()}`
                );
                const text = readFileSync(exported, 'utf8');
                const json = JSON.parse(text);
                check(typeof json === 'object' && json, 'not a JSON object');
                for (const word of [
                    'customers',
                    'orders',
                    'items',
                    'mood',
                    'happy',
                    'Billing',
                    'check the totals',
                ])
                    check(text.includes(word), `the file has no "${word}"`);
                await d.waitFor({ state: 'detached' });
            }
        );

        await step('03 a file that is not a diagram is refused', async () => {
            const bad = '/tmp/qbase-flows-bad.json';
            const garbage = '/tmp/qbase-flows-garbage.json';
            writeFileSync(bad, '{"hello": 1}');
            writeFileSync(garbage, 'this is not json at all');
            await menu('Backup', 'Restore Diagram');
            const d = page.getByRole('dialog', { name: 'Import Diagram' });
            const importBtn = d.getByRole('button', {
                name: 'Import',
                exact: true,
            });
            check(
                await importBtn.isDisabled(),
                'Import is enabled with no file'
            );
            for (const file of [bad, garbage]) {
                await d.locator('input[type=file]').setInputFiles(file);
                await importBtn.click();
                await d
                    .getByRole('alert')
                    .getByText(/not a diagram saved from QBase/)
                    .waitFor();
                check(page.url() === originalUrl, 'the page moved away');
            }
            await shot('import-refused');
            await d.getByRole('button', { name: 'Cancel' }).click();
            await d.waitFor({ state: 'detached' });
            await showOpenDialog();
            check(
                (await openNames()).length === 1,
                `a refused file left a diagram behind: ${await openNames()}`
            );
            await page.keyboard.press('Escape');
        });

        await step(
            '04 the exported file comes back as a new diagram',
            async () => {
                await menu('Actions', 'Import', '.json');
                const d = page.getByRole('dialog', { name: 'Import Diagram' });
                await d.locator('input[type=file]').setInputFiles(exported);
                await d.getByText('qbase-flows-roundtrip.json').waitFor();
                await d
                    .getByRole('button', { name: 'Import', exact: true })
                    .click();
                await page.waitForURL((u) => u.toString() !== originalUrl, {
                    timeout: 10000,
                });
                await tableByName('customers').waitFor();
                await idle();
                check(
                    (await tables().count()) === 3,
                    `${await tables().count()} tables`
                );
                check(
                    (await drawnEdges()) === 1,
                    `${await drawnEdges()} lines`
                );
                check(
                    (await regions().filter({ hasText: 'Billing' }).count()) ===
                        1,
                    'the area did not come back'
                );
                check(
                    (await memos()
                        .filter({ hasText: 'check the totals' })
                        .count()) === 1,
                    'the note did not come back'
                );
                await rail('Custom Types');
                await typeRow('mood').waitFor();
                await typeRow('mood')
                    .getByRole('button', { name: 'Show or hide the details' })
                    .click();
                check(
                    (await enumValues('mood')).join() === 'happy,sad',
                    `enum values: ${await enumValues('mood')}`
                );
                await shot('json-reimported');
            }
        );

        await step(
            '05 the original is still stored next to the copy; reload keeps it',
            async () => {
                await page.reload();
                await tableByName('customers').waitFor();
                check(
                    (await memos()
                        .filter({ hasText: 'check the totals' })
                        .count()) === 1,
                    'the note is gone after reload'
                );
                await showOpenDialog();
                const names = await openNames();
                check(names.length === 2, `stored diagrams: ${names}`);
                await page.keyboard.press('Escape');
            }
        );
    }
);

// ============================================================== flow 12
await flow(
    'F12',
    'custom types: enum values, use on a field, highlight, kind, delete; kept after reload',
    {},
    async () => {
        const fieldTypes = async (table) =>
            (
                await tableByName(table)
                    .locator('[data-testid^="field-"]')
                    .allInnerTexts()
            ).join(' | ');

        await step('01 seeded diagram has no custom types', async () => {
            await seededDiagram();
            await rail('Custom Types');
            await page.getByText('No custom types').waitFor();
        });

        await step(
            '02 New Type, rename it, add three values, remove one',
            async () => {
                await addUserType('mood', ['happy', 'sad', 'meh']);
                check(
                    (await enumValues('mood')).join() === 'happy,sad,meh',
                    `values: ${await enumValues('mood')}`
                );
                // a value that is already there is not added twice
                const box = typeRow('mood').getByRole('textbox', {
                    name: 'Add enum value...',
                });
                await box.fill('sad');
                await typeRow('mood')
                    .getByRole('button', { name: 'Add value' })
                    .click();
                await idle();
                check(
                    (await enumValues('mood')).filter((v) => v === 'sad')
                        .length === 1,
                    `duplicate value added: ${await enumValues('mood')}`
                );
                await box.fill('');
                await typeRow('mood')
                    .getByRole('button', { name: 'Remove meh' })
                    .click();
                await until(
                    async () =>
                        (await enumValues('mood')).join() === 'happy,sad',
                    'meh was not removed'
                );
                check(
                    (await typeRow('mood').innerText()).includes('Enum'),
                    'the row does not say Enum'
                );
                await shot('custom-type');
            }
        );

        await step(
            '03 the type is offered in the field type picker and used',
            async () => {
                await rail('Tables');
                await page
                    .getByRole('button', {
                        name: 'Show or hide the details: customers',
                    })
                    .click();
                const row = page
                    .getByTestId('table-row')
                    .filter({ hasText: 'customers' });
                await row
                    .getByRole('combobox', { name: /^Type: / })
                    .nth(1)
                    .click();
                await page.getByText('Custom types', { exact: true }).waitFor();
                await page
                    .getByRole('textbox', { name: 'Search types' })
                    .fill('mood');
                await page
                    .getByRole('option', { name: 'mood', exact: true })
                    .last()
                    .click();
                // the canvas chip of an enum field says "text" (EDT-113)
                await until(async () => {
                    const t = await fieldTypes('customers');
                    return /email\s*text/.test(t) && !/varchar/.test(t);
                }, 'the canvas chip of email did not change to the enum (text)');
                check(
                    (
                        await row
                            .getByRole('combobox', { name: /^Type: / })
                            .nth(1)
                            .innerText()
                    ).includes('mood'),
                    'the side panel does not show mood'
                );
            }
        );

        await step(
            '04 DBML shows the enum and the field using it',
            async () => {
                const text = await dbmlText();
                check(
                    /Enum ("public"\.)?"?mood"?\s*\{/.test(text),
                    'no Enum mood in DBML'
                );
                check(
                    /happy/.test(text) && /sad/.test(text),
                    'enum values missing in DBML'
                );
                check(
                    /"email"\s+("public"\.)?"?mood"?/.test(text),
                    'email is not of type mood in DBML'
                );
            }
        );

        await step(
            '05 Highlight Fields marks the canvas and is cleared by a click',
            async () => {
                await rail('Custom Types');
                await typeRow('mood')
                    .getByRole('button', { name: 'Actions' })
                    .click();
                await page
                    .getByRole('menuitem', { name: 'Highlight Fields' })
                    .click();
                const pill = page.getByRole('button', {
                    name: 'Highlighting "mood" - click to clear',
                });
                await pill.waitFor();
                await shot('type-highlight');
                await pill.click();
                await pill.waitFor({ state: 'detached' });
            }
        );

        await step(
            '06 reload keeps the type, its values and the field type',
            async () => {
                await waitSaved();
                await page.reload();
                await tableByName('customers').waitFor();
                await rail('Tables');
                await page
                    .getByRole('button', {
                        name: 'Show or hide the details: customers',
                    })
                    .click();
                check(
                    (
                        await page
                            .getByTestId('table-row')
                            .filter({ hasText: 'customers' })
                            .getByRole('combobox', { name: /^Type: / })
                            .nth(1)
                            .innerText()
                    ).includes('mood'),
                    'the field type mood was lost on reload'
                );
                await rail('Custom Types');
                await typeRow('mood')
                    .getByRole('button', { name: 'Show or hide the details' })
                    .click();
                check(
                    (await enumValues('mood')).join() === 'happy,sad',
                    `values after reload: ${await enumValues('mood')}`
                );
            }
        );

        await step(
            '07 kind Composite with a field; undo gives the enum back',
            async () => {
                await typeRow('mood')
                    .getByRole('combobox', { name: 'Kind' })
                    .click();
                await page.getByRole('option', { name: 'Composite' }).click();
                await typeRow('mood').getByText('No fields defined').waitFor();
                await typeRow('mood')
                    .getByRole('button', { name: 'Add Field' })
                    .click();
                const members = typeRow('mood').getByRole('textbox', {
                    name: 'Field name',
                });
                await until(
                    async () => (await members.count()) === 1,
                    'no member row'
                );
                check(
                    (await typeRow('mood').innerText()).includes('Composite'),
                    'the row does not say Composite'
                );
                await pane().click({ position: { x: 600, y: 600 } });
                await undo();
                await until(
                    async () => (await members.count()) === 0,
                    'undo did not remove the member'
                );
                await undo();
                await until(
                    async () =>
                        (await enumValues('mood')).join() === 'happy,sad',
                    'undo did not bring the enum values back'
                );
                check(
                    (await typeRow('mood').innerText()).includes('Enum'),
                    'undo did not bring the Enum kind back'
                );
            }
        );

        await step(
            '08 Delete Type removes it; undo brings it back',
            async () => {
                await typeRow('mood')
                    .getByRole('button', { name: 'Delete Type' })
                    .click();
                await page.getByText('No custom types').waitFor();
                await pane().click({ position: { x: 600, y: 600 } });
                await undo();
                await typeRow('mood').waitFor();
                await rail('Tables');
                const types = page
                    .getByTestId('table-row')
                    .filter({ hasText: 'customers' })
                    .getByRole('combobox', { name: /^Type: / });
                if ((await types.count()) === 0)
                    await page
                        .getByRole('button', {
                            name: 'Show or hide the details: customers',
                        })
                        .click();
                check(
                    (await types.nth(1).innerText()).includes('mood'),
                    `the field type after delete and undo: ${await types.nth(1).innerText()}`
                );
            }
        );
    }
);

// ============================================================== flow 13
await flow(
    'F13',
    'areas and notes: name, move a table in, write, filter, delete, undo; kept after reload',
    {},
    async () => {
        const areaRow = (name) =>
            page.getByTestId('area-row').filter({ hasText: name });
        const noteRows = () => page.getByTestId('note-row');

        await step('01 seeded diagram and an area named Billing', async () => {
            await seededDiagram();
            await addArea('Billing');
            await areaRow('Billing').getByText('Tables: 0').waitFor();
        });

        await step(
            '02 right-click Move to Area puts a table in the area',
            async () => {
                await tableByName('customers').click({
                    button: 'right',
                    position: { x: 100, y: 15 },
                });
                await page
                    .getByRole('menuitem', { name: 'Move to Area' })
                    .click();
                await page.getByRole('menuitem', { name: 'Billing' }).click();
                await areaRow('Billing').getByText('Tables: 1').waitFor();
                await idle();
                const t = await box(tableByName('customers'));
                const r = await box(regions().first());
                check(
                    t.x >= r.x - 1 &&
                        t.y >= r.y - 1 &&
                        t.x + t.width <= r.x + r.width + 1 &&
                        t.y + t.height <= r.y + r.height + 1,
                    `the table is not inside the area: ${JSON.stringify(t)} ${JSON.stringify(r)}`
                );
                await shot('moved-to-area');
            }
        );

        await step(
            '03 a note attached to orders, with its tie line',
            async () => {
                await addNoteTo('orders', 'ship before friday');
                await rail('Visuals');
                await page.getByRole('tab', { name: 'Notes' }).click();
                await noteRows()
                    .filter({ hasText: 'ship before friday' })
                    .waitFor();
                check(
                    (await noteRows()
                        .locator('[title="Attached to orders"]')
                        .count()) === 1,
                    'the note row does not say it is attached to orders'
                );
                check(
                    (await page.getByTestId('note-tie').count()) === 1,
                    'no tie line from the note to its table'
                );
            }
        );

        await step(
            '04 Escape drops an edit, leaving the box keeps it',
            async () => {
                const memo = memos().first();
                await memo.hover();
                await memo.getByRole('button', { name: 'Edit Note' }).click();
                const area = page.getByRole('textbox', { name: 'Note text' });
                await area.fill('thrown away');
                await area.press('Escape');
                await area.waitFor({ state: 'detached' });
                check(
                    (await memo.innerText()).includes('ship before friday'),
                    'Escape did not keep the old text'
                );
                await memo.getByText('ship before friday').dblclick();
                await area.fill('ship before friday\nand count twice');
                await area.blur();
                await memos().filter({ hasText: 'and count twice' }).waitFor();
                check(
                    (await noteRows().first().innerText()).includes(
                        'ship before friday'
                    ),
                    'the note row does not show the first line'
                );
            }
        );

        await step('05 the notes filter narrows and clears', async () => {
            const filter = page
                .getByRole('tabpanel')
                .getByRole('textbox', { name: 'Filter' });
            await filter.fill('zzz');
            await page.getByText('No notes found').waitFor();
            await filter.fill('friday');
            await noteRows().first().waitFor();
            await filter.fill('');
        });

        await step(
            '06 reload keeps the area, its table and the note',
            async () => {
                await waitSaved();
                await page.reload();
                await tableByName('customers').waitFor();
                await memos().filter({ hasText: 'and count twice' }).waitFor();
                check(
                    (await regions().filter({ hasText: 'Billing' }).count()) ===
                        1,
                    'the area is gone'
                );
                await rail('Visuals');
                await page.getByRole('tab', { name: 'Areas' }).click();
                await areaRow('Billing').getByText('Tables: 1').waitFor();
            }
        );

        await step('07 delete the note and the area, undo each', async () => {
            await page.getByRole('tab', { name: 'Notes' }).click();
            await noteRows()
                .first()
                .getByRole('button', { name: 'Note actions' })
                .click();
            await page.getByRole('menuitem', { name: 'Delete note' }).click();
            await until(
                async () => (await memos().count()) === 0,
                'the note is still drawn'
            );
            await pane().click({ position: { x: 600, y: 650 } });
            await undo();
            await until(
                async () => (await memos().count()) === 1,
                'undo did not bring the note back'
            );

            const r = await box(regions().first());
            await page.mouse.click(r.x + r.width - 20, r.y + r.height - 15, {
                button: 'right',
            });
            await page.getByRole('menuitem', { name: 'Delete Area' }).click();
            await until(
                async () => (await regions().count()) === 0,
                'the area is still drawn'
            );
            check(
                (await tables().count()) === 3,
                'deleting the area deleted tables'
            );
            await pane().click({ position: { x: 600, y: 650 } });
            await undo();
            await until(
                async () => (await regions().count()) === 1,
                'undo did not bring the area back'
            );
            await page.getByRole('tab', { name: 'Areas' }).click();
            await areaRow('Billing').getByText('Tables: 1').waitFor();
        });

        await step(
            '08 an edit followed at once by a reload is kept',
            async () => {
                await waitSaved();
                await rail('Visuals');
                await page.getByRole('tab', { name: 'Areas' }).click();
                await page
                    .getByRole('tabpanel')
                    .getByRole('button', { name: 'Add Area' })
                    .first()
                    .click();
                await until(
                    async () => (await regions().count()) === 2,
                    'no second area'
                );
                // the person reloads (or closes the tab) inside the 1 s autosave pause
                await page.reload();
                await tableByName('customers').waitFor();
                await regions().first().waitFor();
                await idle();
                const kept = await regions().count();
                if (kept !== 2)
                    throw new Error(
                        `an edit made inside the autosave pause was lost by a reload (areas after reload: ${kept}, expected 2)`
                    );
            }
        );
    }
);

// ============================================================== flow 14
const manySql = (n) =>
    Array.from(
        { length: n },
        (_, i) =>
            `CREATE TABLE public.t_${i} (id integer PRIMARY KEY${
                i ? `, parent_id integer REFERENCES public.t_${i - 1}(id)` : ''
            }, label text);`
    ).join('\n');
await flow(
    'F14',
    'eighty tables: windowed Tables list, filter, focus from the list',
    {},
    async () => {
        const listRoot = () =>
            page.locator('[data-window-root]').filter({
                has: page.getByTestId('table-row').first(),
            });
        const rowNames = async () =>
            (await page.getByTestId('table-row').allInnerTexts()).map(
                (s) => s.trim().split('\n')[0]
            );

        await step(
            '01 a SQL script of 80 tables builds the diagram',
            async () => {
                await chooseDatabase('PostgreSQL');
                await page.getByRole('radio', { name: 'SQL Script' }).click();
                await page
                    .getByRole('textbox', { name: 'SQL script' })
                    .fill(manySql(80));
                await page
                    .getByText('Found 80 tables and 79 relationships.')
                    .waitFor({ timeout: 15000 });
                await page
                    .getByRole('button', { name: 'Import', exact: true })
                    .click();
                await page.waitForURL(/\/diagrams\/.+/, { timeout: 15000 });
                await tables().first().waitFor({ timeout: 15000 });
                await idle();
            }
        );

        await step(
            '02 the Tables list draws only part of the 80 rows',
            async () => {
                await rail('Tables');
                await page.getByTestId('table-row').first().waitFor();
                const drawn = await page.getByTestId('table-row').count();
                check(
                    drawn > 5 && drawn < 80,
                    `${drawn} rows drawn for 80 tables`
                );
                check(
                    (await rowNames())[0] === 't_0',
                    `first row ${(await rowNames())[0]}`
                );
            }
        );

        await step(
            '03 scrolling the list to the end reaches t_79',
            async () => {
                await listRoot().evaluate((el) => {
                    el.scrollTop = el.scrollHeight;
                });
                const last = page.getByTestId('table-row').filter({
                    has: page.getByRole('button', {
                        name: 't_79',
                        exact: true,
                    }),
                });
                await until(
                    async () => (await last.count()) === 1,
                    't_79 is not drawn at the end'
                );
                await last.scrollIntoViewIfNeeded();
                check(await last.isVisible(), 't_79 is not visible');
                check(
                    !(await rowNames()).includes('t_0'),
                    't_0 is still drawn at the end of the list'
                );
                await shot('list-end');
            }
        );

        await step(
            '04 focus from the list centres that table on the canvas',
            async () => {
                const last = page.getByTestId('table-row').filter({
                    has: page.getByRole('button', {
                        name: 't_79',
                        exact: true,
                    }),
                });
                await last.hover();
                await last
                    .getByRole('button', { name: 'Focus on the canvas' })
                    .click();
                const node = tables().filter({
                    has: page.getByText('t_79', { exact: true }),
                });
                await node.first().waitFor();
                await idle();
                const n = await box(node.first());
                const p = await box(pane());
                check(
                    n.x >= p.x &&
                        n.x + n.width <= p.x + p.width &&
                        n.y >= p.y &&
                        n.y + n.height <= p.y + p.height,
                    `t_79 is not inside the canvas view: ${JSON.stringify(n)}`
                );
            }
        );

        await step(
            '05 the filter narrows the list to matching tables',
            async () => {
                const filter = page
                    .getByRole('textbox', { name: 'Filter' })
                    .first();
                await filter.fill('t_7');
                await until(
                    async () => (await rowNames()).length === 11,
                    'filter t_7 does not give 11 rows'
                );
                const names = await rowNames();
                check(
                    names.every((n) => n === 't_7' || /^t_7\d$/.test(n)),
                    `filtered rows: ${names}`
                );
                await filter.fill('nothing_like_this');
                await page
                    .getByText('No tables found matching your filter.')
                    .waitFor();
                await page
                    .getByRole('button', { name: 'Clear Filter' })
                    .click();
                await until(
                    async () => (await rowNames()).length > 11,
                    'Clear Filter does not bring the list back'
                );
            }
        );
    }
);

// ============================================================== flow 15
await flow(
    'F15',
    'error states: broken SQL and DBML, import into the diagram, Clear',
    {},
    async () => {
        await step('01 the new-diagram import refuses broken SQL', async () => {
            await chooseDatabase('PostgreSQL');
            await page.getByRole('radio', { name: 'SQL Script' }).click();
            const box = page.getByRole('textbox', { name: 'SQL script' });
            const importBtn = page.getByRole('button', {
                name: 'Import',
                exact: true,
            });
            await box.fill(
                'CREATE TABLE public.a (id integer PRIMARY KEY, status text;'
            );
            await page
                .getByRole('alert')
                .getByText(/Unclosed parenthesis/)
                .waitFor();
            check(
                await importBtn.isDisabled(),
                'Import is enabled for broken SQL'
            );
            await shot('broken-sql');
            await box.fill('hello world');
            await page
                .getByRole('alert')
                .getByText(/No valid SQL statements found/)
                .waitFor();
            check(
                await importBtn.isDisabled(),
                'Import is enabled for text with no SQL'
            );
            await box.fill(SEED_SQL);
            await page
                .getByText(/Found 3 tables/)
                .first()
                .waitFor();
            check(
                (await page.getByRole('alert').count()) === 0,
                'the alert stays for good SQL'
            );
            await importBtn.click();
            await page.waitForURL(/\/diagrams\/.+/);
            await tables().first().waitFor();
            await idle();
        });

        await step(
            '02 Import SQL into the diagram: broken text imports nothing',
            async () => {
                await menu('Actions', 'Import', 'SQL');
                const d = page.getByRole('dialog');
                await d
                    .getByRole('textbox', { name: 'SQL script' })
                    .fill('CREATE TABLE x (id int');
                await d.getByRole('alert').waitFor();
                check(
                    await d
                        .getByRole('button', { name: 'Import', exact: true })
                        .isDisabled(),
                    'Import is enabled for broken SQL'
                );
                await page.keyboard.press('Escape');
                await d.waitFor({ state: 'detached' });
                check((await tables().count()) === 3, 'tables changed');
            }
        );

        await step(
            '03 Import DBML into the diagram: broken, then good',
            async () => {
                await menu('Actions', 'Import', 'DBML');
                const d = page.getByRole('dialog');
                const box = d.getByRole('textbox', { name: 'DBML text' });
                await box.fill('Table broken {{{');
                await d.getByRole('alert').waitFor();
                const importBtn = d.getByRole('button', {
                    name: 'Import',
                    exact: true,
                });
                check(
                    await importBtn.isDisabled(),
                    'Import is enabled for broken DBML'
                );
                await shot('broken-dbml');
                await box.fill(
                    'Table "public"."extra" {\n  "id" integer [pk]\n}\n'
                );
                await d.getByText('1 table will be added.').waitFor();
                await importBtn.click();
                await page.getByText('Added 1 table').first().waitFor();
                await rail('Tables');
                await page
                    .getByTestId('table-row')
                    .filter({
                        has: page.getByRole('button', {
                            name: 'extra',
                            exact: true,
                        }),
                    })
                    .waitFor();
            }
        );

        await step(
            '04 Edit > Clear asks first; Clear empties the diagram for good',
            async () => {
                await menu('Edit', 'Clear');
                const confirm = page
                    .getByRole('alertdialog')
                    .or(page.getByRole('dialog', { name: 'Clear Diagram' }))
                    .first();
                await confirm.getByText(/cannot be undone/).waitFor();
                await confirm.getByRole('button', { name: 'Cancel' }).click();
                await confirm.waitFor({ state: 'detached' });
                check(
                    (await page.getByTestId('table-row').count()) === 4,
                    'Cancel cleared the diagram'
                );
                await menu('Edit', 'Clear');
                await confirm.getByRole('button', { name: 'Clear' }).click();
                await page.getByText('No tables', { exact: true }).waitFor();
                check(
                    (await tables().count()) === 0,
                    'tables left on the canvas'
                );
                check((await drawnEdges()) === 0, 'lines left on the canvas');
                await waitSaved();
                await page.reload();
                await page.locator('.react-flow').waitFor();
                await page.getByText('No tables', { exact: true }).waitFor();
                check(
                    (await tables().count()) === 0,
                    'the tables came back after reload'
                );
            }
        );
    }
);

// ============================================================== flow 16
await flow(
    'F16',
    'undo and redo across six kinds of edit, toolbar and Edit menu',
    {},
    async () => {
        /** What the design holds, read from the panel lists and the canvas. */
        const state = async () => {
            await rail('Custom Types');
            await page
                .getByRole('button', { name: 'New Type' })
                .first()
                .waitFor();
            const types = (await typeRows().allInnerTexts())
                .map((s) => s.trim().split('\n')[0])
                .sort();
            await rail('Tables');
            await page
                .getByRole('button', { name: 'Add Table' })
                .first()
                .waitFor();
            const names = (await page.getByTestId('table-row').allInnerTexts())
                .map((s) => s.trim().split('\n')[0])
                .sort();
            return JSON.stringify({
                tables: names,
                areas: await regions().count(),
                lines: await drawnEdges(),
                types,
            });
        };
        const toolbarButton = (name) =>
            page
                .getByRole('toolbar', { name: 'Canvas tools' })
                .getByRole('button', { name, exact: true });
        const menuItemDisabled = async (menuName, item) => {
            await page
                .getByRole('menubar')
                .getByText(menuName, { exact: true })
                .click();
            const it = page.getByRole('menuitem', { name: itemName(item) });
            await it.waitFor();
            const disabled =
                (await it.getAttribute('aria-disabled')) === 'true' ||
                (await it.getAttribute('data-disabled')) !== null;
            await page.keyboard.press('Escape');
            return disabled;
        };
        const states = [];

        await step('01 seeded diagram: nothing to undo or redo', async () => {
            await seededDiagram();
            check(
                await toolbarButton('Undo').isDisabled(),
                'Undo enabled on a fresh diagram'
            );
            check(
                await toolbarButton('Redo').isDisabled(),
                'Redo enabled on a fresh diagram'
            );
            check(
                await menuItemDisabled('Edit', 'Undo'),
                'Edit > Undo enabled on a fresh diagram'
            );
            states.push(await state());
        });

        await step('02 six edits of different kinds', async () => {
            const edits = [
                async () => {
                    await page
                        .getByRole('button', { name: 'Add Table' })
                        .first()
                        .click();
                },
                async () => {
                    const row = page.getByTestId('table-row').filter({
                        has: page.getByRole('button', {
                            name: 'items',
                            exact: true,
                        }),
                    });
                    await row
                        .getByRole('button', { name: 'Rename table' })
                        .click();
                    const input = page.getByRole('textbox', {
                        name: 'Rename table',
                    });
                    await input.fill('line_items');
                    await input.press('Enter');
                },
                async () => {
                    await tableByName('customers').click({
                        button: 'right',
                        position: { x: 100, y: 15 },
                    });
                    await page
                        .getByRole('menuitem', { name: 'Duplicate Table' })
                        .click();
                },
                async () => {
                    await pane().click({
                        button: 'right',
                        position: { x: 60, y: 60 },
                    });
                    await page
                        .getByRole('menuitem', { name: 'New Area' })
                        .click();
                },
                async () => {
                    await tableByName('orders').click({
                        button: 'right',
                        position: { x: 100, y: 15 },
                    });
                    await page
                        .getByRole('menuitem', { name: 'Delete Table' })
                        .click();
                },
                async () => {
                    await rail('Custom Types');
                    await page
                        .getByRole('button', { name: 'New Type' })
                        .first()
                        .click();
                },
            ];
            for (const [i, edit] of edits.entries()) {
                await edit();
                await until(
                    async () => (await state()) !== states[states.length - 1],
                    `edit ${i + 1} changed nothing`
                );
                await idle();
                states.push(await state());
            }
            const end = JSON.parse(states[6]);
            check(
                end.tables.includes('line_items') &&
                    !end.tables.includes('orders'),
                `end state ${states[6]}`
            );
            check(
                end.areas === 1 && end.types.length === 1,
                `end state ${states[6]}`
            );
            check(
                end.lines === 0,
                'the line of the deleted table is still drawn'
            );
            await shot('six-edits');
        });

        await step(
            '03 Undo walks back through every state, then is disabled',
            async () => {
                for (let i = 5; i >= 0; i -= 1) {
                    await toolbarButton('Undo').click();
                    await until(
                        async () => (await state()) === states[i],
                        `undo ${6 - i} did not give state ${i}: ${await state()} vs ${states[i]}`
                    );
                }
                check(
                    await toolbarButton('Undo').isDisabled(),
                    'Undo still enabled at the start'
                );
                check(
                    !(await menuItemDisabled('Edit', 'Redo')),
                    'Edit > Redo disabled after undo'
                );
            }
        );

        await step(
            '04 Redo walks forward again, from the toolbar and the Edit menu',
            async () => {
                for (let i = 1; i <= 6; i += 1) {
                    if (i % 2) await toolbarButton('Redo').click();
                    else await menu('Edit', 'Redo');
                    await until(
                        async () => (await state()) === states[i],
                        `redo ${i} did not give state ${i}`
                    );
                }
                check(
                    await toolbarButton('Redo').isDisabled(),
                    'Redo still enabled at the end'
                );
            }
        );

        await step(
            '05 a new edit after undo drops the redo history',
            async () => {
                await undo();
                await until(
                    async () => (await state()) === states[5],
                    'Ctrl+Z did not undo'
                );
                check(
                    await toolbarButton('Redo').isEnabled(),
                    'Redo disabled after undo'
                );
                await rail('Tables');
                await page
                    .getByRole('button', { name: 'Add Table' })
                    .first()
                    .click();
                await until(
                    async () => (await state()) !== states[5],
                    'the new edit changed nothing'
                );
                check(
                    await toolbarButton('Redo').isDisabled(),
                    'Redo stays enabled after a new edit'
                );
                await waitSaved();
                const now = await state();
                await page.reload();
                await tables().first().waitFor();
                check(
                    (await state()) === now,
                    'the state after reload differs'
                );
                check(
                    await toolbarButton('Undo').isDisabled(),
                    'the history survived the reload'
                );
            }
        );
    }
);

// ============================================================== flow 17
await flow(
    'F17',
    'schema lint: findings, show on canvas, Fix, undo, rule settings; kept after reload',
    {},
    async () => {
        const lintButton = () => page.getByRole('button', { name: /^Lint/ });
        const panel = () => page.getByTestId('lint-panel');
        const heading = () => panel().getByRole('heading', { level: 2 });
        const badge = async () =>
            (await page.getByTestId('lint-badge').count())
                ? (await page.getByTestId('lint-badge').innerText()).trim()
                : '';

        await step(
            '01 the seeded diagram has two findings on the Lint button',
            async () => {
                await seededDiagram();
                await until(
                    async () => (await badge()) === '2',
                    'the Lint badge does not say 2'
                );
            }
        );

        await step('02 the panel lists one warning and one info', async () => {
            await lintButton().click();
            await panel().waitFor();
            check(
                (await heading().innerText()).includes(
                    '(0 errors, 1 warnings, 1 info)'
                ),
                `heading: ${await heading().innerText()}`
            );
            check(
                (await panel().getByTestId('lint-finding').count()) === 2,
                'not two findings'
            );
            await panel()
                .getByText(/Foreign key orders\(customer_id\).*has no index/)
                .waitFor();
            await panel()
                .getByText('Table items has no relationships.')
                .waitFor();
            await shot('lint-panel');
        });

        await step('03 a finding shows its table on the canvas', async () => {
            await panel()
                .getByText('Table items has no relationships.')
                .click();
            const node = tableByName('items');
            await node.waitFor();
            await until(async () => {
                const n = await box(node);
                const p = await box(pane());
                return (
                    n.x >= p.x &&
                    n.x + n.width <= p.x + p.width &&
                    n.y >= p.y &&
                    n.y + n.height <= p.y + p.height
                );
            }, 'items is not in view after Show on the canvas');
        });

        await step(
            '04 Fix adds the index; undo brings the warning back',
            async () => {
                await panel().getByRole('button', { name: 'Fix' }).click();
                await page.getByText('Fix applied').first().waitFor();
                await until(
                    async () =>
                        (await heading().innerText()).includes(
                            '(0 errors, 0 warnings, 1 info)'
                        ),
                    'the warning stays after Fix'
                );
                await until(
                    async () => (await badge()) === '1',
                    'the badge does not say 1'
                );
                const dbml = await dbmlText();
                check(
                    /customer_id/.test(
                        dbml.split('Table "public"."orders"')[1] ?? ''
                    ) && /indexes/i.test(dbml),
                    'no index on orders.customer_id in DBML'
                );
                await pane().click({ position: { x: 5, y: 5 } });
                await undo();
                await until(
                    async () => (await badge()) === '2',
                    'undo did not bring the warning back'
                );
            }
        );

        await step(
            '05 turning a rule off in Lint settings hides its findings',
            async () => {
                if (!(await panel().isVisible())) await lintButton().click();
                await panel()
                    .getByRole('button', { name: 'Lint settings' })
                    .click();
                const d = page.getByRole('dialog', { name: 'Lint settings' });
                const rule = d.getByRole('checkbox', {
                    name: 'Enable Table without relationships',
                });
                check(
                    await rule.isChecked(),
                    'the orphan rule is off by default'
                );
                await rule.click();
                await d.getByText('10 of 12 on').waitFor();
                await d.getByRole('button', { name: 'Save' }).click();
                await d.waitFor({ state: 'detached' });
                await until(
                    async () =>
                        (await heading().innerText()).includes(
                            '(0 errors, 1 warnings, 0 info)'
                        ),
                    'the info finding stays with its rule off'
                );
                await panel().getByRole('button', { name: 'Fix' }).click();
                await panel().getByTestId('lint-clean').waitFor();
                check(
                    (await badge()) === '',
                    'the badge stays with no findings'
                );
            }
        );

        await step('06 reload keeps the fix and the rule setting', async () => {
            await waitSaved();
            await page.reload();
            await tables().first().waitFor();
            await idle();
            await lintButton().click();
            await panel().waitFor();
            await until(
                async () =>
                    (await panel().getByTestId('lint-clean').count()) === 1,
                `after reload the panel says: ${await heading()
                    .innerText()
                    .catch(() => '?')}`
            );
            await panel().getByRole('button', { name: 'Close lint' }).click();
            await panel().waitFor({ state: 'detached' });
        });
    }
);

// ============================================================== flow 18
/** Picks a language from the globe button's list (the list stays open after a pick). */
async function chooseLanguage(name) {
    const globe = page.locator('button:has(svg.lucide-globe)').first();
    if ((await globe.getAttribute('aria-expanded')) !== 'true')
        await globe.click();
    if (!(await page.getByRole('searchbox').isVisible()))
        await page.getByRole('dialog').getByRole('combobox').click();
    await page.getByText(name, { exact: true }).first().click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
}
/** Every visible text and accessible label outside the diagram's own data. */
const visibleTexts = () =>
    page.evaluate(() => {
        const out = new Set();
        const skip = (el) =>
            el.closest(
                'textarea, pre, code, .font-mono, .react-flow__node, [data-testid="table-row"] input'
            );
        const shown = (el) => {
            const r = el.getBoundingClientRect();
            return (
                r.width > 0 &&
                r.height > 0 &&
                getComputedStyle(el).visibility !== 'hidden'
            );
        };
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT
        );
        let n;
        while ((n = walker.nextNode())) {
            const el = n.parentElement;
            const t = n.textContent.replace(/\s+/g, ' ').trim();
            if (t && el && shown(el) && !skip(el)) out.add(t);
        }
        for (const el of document.querySelectorAll(
            '[aria-label],[placeholder],[title]'
        )) {
            if (!shown(el) || skip(el)) continue;
            for (const a of ['aria-label', 'placeholder', 'title']) {
                const v = el.getAttribute(a)?.replace(/\s+/g, ' ').trim();
                if (v) out.add(v);
            }
        }
        return [...out];
    });
await flow(
    'F18',
    'every language: panels, menus and dialogs show no raw keys and no English left over',
    {},
    async () => {
        // the diagram's own data, the same in every language
        const DATA = new Set([
            'Diagram 1',
            'check the totals',
            'Powered by Qubdi',
        ]);
        const looksEnglish = (s) =>
            !DATA.has(s) &&
            // a relationship's label is its two table names
            !/^\w+ - \w+$/.test(s) &&
            // "Type: <type name>": French uses the same word
            !/^Type: \S+$/.test(s) &&
            /[A-Za-z]{3,}/.test(s) &&
            s.split(/\s+/).filter((w) => /^[A-Za-z][a-z'-]+[.,:!?]?$/.test(w))
                .length >= 2 &&
            !/["{}()]/.test(s);
        const railButton = (i) =>
            page.getByRole('navigation').first().getByRole('button').nth(i);
        const closeAll = async () => {
            for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
            if (await page.getByTestId('lint-panel').count())
                await page
                    .locator('button:has(svg.lucide-list-checks)')
                    .click();
            await page.getByTestId('lint-panel').waitFor({ state: 'detached' });
            await page.getByRole('dialog').waitFor({ state: 'detached' });
        };
        const menuOpen = async (i) => {
            await page
                .getByRole('menubar')
                .getByRole('menuitem')
                .nth(i)
                .click();
            await page.getByRole('menu').first().waitFor();
        };
        /** Each screen opens something; the texts are read after it. */
        const screens = {
            tables: async () => {
                await railButton(2).click();
                const t = page
                    .getByTestId('table-row')
                    .first()
                    .locator('button[aria-expanded]')
                    .first();
                if ((await t.getAttribute('aria-expanded')) !== 'true')
                    await t.click();
            },
            refs: () => railButton(4).click(),
            types: async () => {
                await railButton(5).click();
                const t = typeRows()
                    .first()
                    .locator('button[aria-expanded]')
                    .first();
                if ((await t.getAttribute('aria-expanded')) !== 'true')
                    await t.click();
            },
            areas: async () => {
                await railButton(6).click();
                await page.getByRole('tab').first().click();
            },
            notes: async () => {
                await railButton(6).click();
                await page.getByRole('tab').nth(1).click();
            },
            menuActions: () => menuOpen(0),
            menuEdit: () => menuOpen(1),
            menuView: () => menuOpen(2),
            menuBackup: () => menuOpen(3),
            open: async () => {
                await page.keyboard.press('ControlOrMeta+o');
                await page
                    .getByRole('dialog')
                    .locator('tbody tr')
                    .first()
                    .waitFor();
            },
            exportJson: async () => {
                await menuOpen(3);
                await page
                    .getByRole('menu')
                    .getByRole('menuitem')
                    .nth(0)
                    .click();
                await page.getByRole('dialog').waitFor();
            },
            restore: async () => {
                await menuOpen(3);
                await page
                    .getByRole('menu')
                    .getByRole('menuitem')
                    .nth(1)
                    .click();
                await page.getByRole('dialog').waitFor();
            },
            exportSql: async () => {
                await menuOpen(0);
                await page
                    .getByRole('menu')
                    .getByRole('menuitem')
                    .nth(1)
                    .hover();
                await page
                    .getByRole('menu')
                    .nth(1)
                    .getByRole('menuitem')
                    .first()
                    .click();
                await page.getByRole('dialog').locator('textarea').waitFor();
            },
            lint: async () => {
                await page
                    .locator('button:has(svg.lucide-list-checks)')
                    .click();
                await page.getByTestId('lint-panel').waitFor();
            },
            lintSettings: async () => {
                await page
                    .locator('button:has(svg.lucide-list-checks)')
                    .click();
                await page
                    .getByTestId('lint-panel')
                    .locator('button')
                    .first()
                    .click();
                await page.getByRole('dialog').waitFor();
            },
            newDiagram: async () => {
                await railButton(0).click();
                await page
                    .getByRole('dialog')
                    .getByRole('radio')
                    .first()
                    .waitFor();
            },
        };
        const sweep = async () => {
            const seen = {};
            for (const [name, open] of Object.entries(screens)) {
                await open();
                await idle();
                seen[name] = await visibleTexts();
                await closeAll();
            }
            return seen;
        };
        let english;

        await step(
            '01 seeded diagram with a type, an area and a note',
            async () => {
                await seededDiagram();
                await addUserType('mood', ['happy']);
                await addArea('Billing');
                await addNoteTo('orders', 'check the totals');
                DATA.add('Billing');
            }
        );

        await step('02 English: read every screen', async () => {
            english = await sweep();
            for (const [name, texts] of Object.entries(english))
                check(texts.length > 5, `${name}: only ${texts.length} texts`);
        });

        const locales = [
            ['Deutsch (German)', 'de'],
            ['Français (French)', 'fr'],
            ['Italiano (Italian)', 'it'],
            ['Русский (Russian)', 'ru'],
        ];
        for (const [label, lang] of locales)
            await step(
                `03 ${lang}: no raw keys, no placeholders, no English text`,
                async () => {
                    await chooseLanguage(label);
                    await until(
                        async () =>
                            (
                                await page.evaluate(
                                    () => document.documentElement.lang
                                )
                            ).startsWith(lang) &&
                            !(
                                await page.getByRole('menubar').innerText()
                            ).includes('Actions'),
                        `${lang} did not load`
                    );
                    const seen = await sweep();
                    const problems = [];
                    const lintEnglish = [];
                    for (const [name, texts] of Object.entries(seen)) {
                        const en = new Set(english[name]);
                        for (const t of texts) {
                            if (
                                /\b(editor|canvas|qubdi)\.[A-Za-z]+\.[\w.]+/.test(
                                    t
                                )
                            )
                                problems.push(`${name}: raw key "${t}"`);
                            else if (/\{\{|\}\}/.test(t))
                                problems.push(`${name}: placeholder "${t}"`);
                            else if (en.has(t) && looksEnglish(t)) {
                                // the lint rule names, descriptions and findings come
                                // untranslated from shared/lint.ts (known bug)
                                if (name.startsWith('lint'))
                                    lintEnglish.push(t);
                                else problems.push(`${name}: English "${t}"`);
                            }
                        }
                    }
                    if (problems.length) await shot(`locale-${lang}`);
                    check(
                        problems.length === 0,
                        `\n    ${problems.join('\n    ')}`
                    );
                    knownBug(
                        lintEnglish.length > 0,
                        `${lang}: the Lint panel findings and the Lint settings rule names and descriptions stay English (${new Set(lintEnglish).size} strings, e.g. "${lintEnglish[0]}")`
                    );
                }
            );

        await step('04 back to English', async () => {
            await chooseLanguage('English');
            await until(
                async () =>
                    (await page.getByRole('menubar').innerText()).includes(
                        'Actions'
                    ),
                'English did not come back'
            );
        });
    }
);

// ============================================================== flow 19
/**
 * Light boxes in dark mode and text with too little contrast: every visible
 * element larger than 60x30 whose own background is light, and every text of
 * the given roots whose colour is too close to the background behind it.
 */
const darkAudit = (root = 'body') =>
    page.evaluate((rootSel) => {
        // any CSS colour (rgb, oklch, color(...)) through a 1x1 canvas
        const ctx = Object.assign(document.createElement('canvas'), {
            width: 1,
            height: 1,
        }).getContext('2d', { willReadFrequently: true });
        const cache = new Map();
        const parse = (c) => {
            if (!c || c === 'transparent') return null;
            if (cache.has(c)) return cache.get(c);
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = '#000';
            ctx.fillStyle = c;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            const out = a === 0 ? null : { r, g, b, a: a / 255 };
            cache.set(c, out);
            return out;
        };
        const lum = ({ r, g, b }) => {
            const f = (v) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const behind = (el) => {
            for (let e = el; e; e = e.parentElement) {
                const c = parse(getComputedStyle(e).backgroundColor);
                if (c && c.a > 0.5) return c;
            }
            return { r: 0, g: 0, b: 0, a: 1 };
        };
        const shown = (el) => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return (
                r.width > 0 &&
                r.height > 0 &&
                s.visibility !== 'hidden' &&
                Number(s.opacity) > 0.5
            );
        };
        const name = (el) =>
            `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}.${String(el.className).split(' ').slice(0, 3).join('.')}`;
        const scope = document.querySelector(rootSel) ?? document.body;
        const light = [];
        const faint = [];
        for (const el of scope.querySelectorAll('*')) {
            if (
                !shown(el) ||
                el.closest('svg, img, canvas, .react-flow__minimap')
            )
                continue;
            const r = el.getBoundingClientRect();
            const bg = parse(getComputedStyle(el).backgroundColor);
            if (
                bg &&
                bg.a > 0.5 &&
                r.width > 60 &&
                r.height > 30 &&
                lum(bg) > 0.5
            )
                light.push(
                    `${name(el)} ${getComputedStyle(el).backgroundColor}`
                );
            const own = [...el.childNodes].some(
                (n) => n.nodeType === 3 && n.textContent.trim()
            );
            const fg = own ? parse(getComputedStyle(el).color) : null;
            if (fg) {
                const b = behind(el);
                const [hi, lo] = [lum(fg), lum(b)].sort((x, y) => y - x);
                const ratio = (hi + 0.05) / (lo + 0.05);
                if (
                    ratio < 3 &&
                    !el.closest(
                        '[aria-disabled="true"], :disabled, [data-disabled]'
                    )
                )
                    faint.push(
                        `${name(el)} "${el.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}`
                    );
            }
        }
        return { light: [...new Set(light)], faint: [...new Set(faint)] };
    }, root);
await flow(
    'F19',
    'dark mode: no light boxes and readable text on canvas, panels, menus and dialogs',
    {},
    async () => {
        const audit = async (label, root) => {
            await idle();
            const { light, faint } = await darkAudit(root);
            await shot(`dark-${label}`);
            check(
                light.length === 0 && faint.length === 0,
                `${label}:\n    light: ${light.slice(0, 8).join('\n    ')}\n    faint: ${faint.slice(0, 8).join('\n    ')}`
            );
        };

        await step(
            '01 seeded diagram with a type, an area and a note in dark mode',
            async () => {
                await seededDiagram();
                await addUserType('mood', ['happy']);
                await addArea('Billing');
                await addNoteTo('orders', 'check the totals');
                await menu('View', 'Theme', 'Dark');
                await until(
                    () =>
                        page.evaluate(() =>
                            document.documentElement.classList.contains('dark')
                        ),
                    'the page is not dark'
                );
                const bg = await page.evaluate(
                    () => getComputedStyle(document.body).backgroundColor
                );
                check(
                    /rgb\((\d{1,2}|1[0-4]\d), /.test(bg),
                    `body background ${bg}`
                );
            }
        );

        await step('02 editor with the Tables panel open', async () => {
            await rail('Tables');
            await page
                .getByRole('button', {
                    name: 'Show or hide the details: customers',
                })
                .click();
            await audit('tables');
        });

        await step('03 Custom Types and Visuals panels', async () => {
            await rail('Custom Types');
            const t = typeRow('mood').getByRole('button', {
                name: 'Show or hide the details',
            });
            if ((await t.getAttribute('aria-expanded')) !== 'true')
                await t.click();
            await audit('types');
            await rail('Visuals');
            await page.getByRole('tab', { name: 'Notes' }).click();
            await audit('notes');
        });

        await step('04 DBML panel', async () => {
            await rail('DBML');
            await page.getByText(/Table "public"\."customers"/).waitFor();
            await audit('dbml');
        });

        await step(
            '05 open menus and the Open, Export SQL and Lint screens',
            async () => {
                await page
                    .getByRole('menubar')
                    .getByText('View', { exact: true })
                    .click();
                await audit('view-menu', '[role="menu"]');
                await page.keyboard.press('Escape');
                await showOpenDialog();
                await audit('open-dialog', '[role="dialog"]');
                await page.keyboard.press('Escape');
                await menu('Actions', 'Export SQL', 'PostgreSQL');
                await page
                    .getByRole('textbox', { name: 'Generated script' })
                    .waitFor();
                await audit('export-sql', '[role="dialog"]');
                await page.keyboard.press('Escape');
                await page.getByRole('button', { name: /^Lint/ }).click();
                await audit('lint', '[data-testid="lint-panel"]');
                await page.getByRole('button', { name: 'Close lint' }).click();
            }
        );

        await step('06 dark is kept after reload', async () => {
            await page.reload();
            await tables().first().waitFor();
            check(
                await page.evaluate(() =>
                    document.documentElement.classList.contains('dark')
                ),
                'light again after reload'
            );
            await audit('after-reload');
        });
    }
);

// ============================================================== flow 20
await flow(
    'F20',
    'keyboard only: Open, Rename, confirm and New dialogs keep and return the focus',
    {},
    async () => {
        const focusIn = (sel) =>
            page.evaluate((s) => !!document.activeElement?.closest(s), sel);
        const focusedLabel = () =>
            page.evaluate(() => {
                const a = document.activeElement;
                return (
                    a?.getAttribute('aria-label') ||
                    a?.textContent ||
                    a?.tagName ||
                    ''
                )
                    .trim()
                    .slice(0, 40);
            });
        const tabUntil = async (pred, what, max = 30) => {
            for (let i = 0; i < max; i += 1) {
                await page.keyboard.press('Tab');
                if (await pred()) return;
            }
            throw new Error(`Tab never reached ${what}`);
        };

        await step(
            '01 seeded diagram; Ctrl+O puts the focus in the dialog',
            async () => {
                await seededDiagram();
                await page.locator('[data-testid="diagram-canvas"]').focus();
                await showOpenDialog();
                await until(
                    () => focusIn('[role="dialog"]'),
                    'the focus is not in the Open dialog'
                );
            }
        );

        await step('02 Tab and Shift+Tab stay inside the dialog', async () => {
            const seen = new Set();
            for (let i = 0; i < 12; i += 1) {
                await page.keyboard.press(i < 8 ? 'Tab' : 'Shift+Tab');
                check(
                    await focusIn('[role="dialog"]'),
                    `focus left the dialog at ${await focusedLabel()}`
                );
                seen.add(await focusedLabel());
            }
            check(seen.size >= 4, `Tab visits only ${[...seen]}`);
        });

        await step(
            '03 row actions menu and Rename, all by keyboard',
            async () => {
                await openDialog()
                    .getByRole('searchbox')
                    .focus()
                    .catch(() => undefined);
                await openRow('Diagram 1').focus();
                await tabUntil(
                    async () =>
                        (await focusedLabel()) === 'Actions for Diagram 1',
                    'the row actions button'
                );
                await page.keyboard.press('Enter');
                await page.getByRole('menu').waitFor();
                // the menu items are Open, Rename, Make a copy, Delete
                await until(async () => {
                    if ((await focusedLabel()).startsWith('Rename'))
                        return true;
                    await page.keyboard.press('ArrowDown');
                    return false;
                }, 'ArrowDown never reached Rename');
                await page.keyboard.press('Enter');
                const d = page.getByRole('dialog', { name: 'Rename Diagram' });
                await d.waitFor();
                check(
                    (await focusedLabel()) === 'Diagram name',
                    `the rename box has no focus (${await focusedLabel()})`
                );
                await page.keyboard.press('ControlOrMeta+a');
                await page.keyboard.type('Typed by keys');
                await page.keyboard.press('Enter');
                await d.waitFor({ state: 'detached' });
                await openDialog().waitFor();
                await until(
                    async () => (await openNames()).includes('Typed by keys'),
                    'the keyboard rename did not apply'
                );
                await until(
                    () => focusIn('[role="dialog"]'),
                    'the focus did not come back to the Open dialog'
                );
            }
        );

        await step(
            '04 the delete confirm opens and Escape cancels it',
            async () => {
                await openDialog()
                    .getByRole('button', { name: 'Actions for Typed by keys' })
                    .focus();
                await page.keyboard.press('Enter');
                await page.getByRole('menu').waitFor();
                await until(async () => {
                    if ((await focusedLabel()).startsWith('Delete'))
                        return true;
                    await page.keyboard.press('ArrowDown');
                    return false;
                }, 'ArrowDown never reached Delete');
                await page.keyboard.press('Enter');
                const confirm = page
                    .getByRole('alertdialog')
                    .or(page.getByRole('dialog', { name: 'Delete Diagram' }))
                    .first();
                await confirm.waitFor();
                check(
                    await focusIn('[role="alertdialog"], [role="dialog"]'),
                    'the confirm has no focus'
                );
                await page.keyboard.press('Escape');
                await openDialog().waitFor();
                check(
                    (await openNames()).includes('Typed by keys'),
                    'Escape deleted the diagram'
                );
            }
        );

        await step(
            '05 Escape closes the Open dialog; focus is not lost',
            async () => {
                await page.keyboard.press('Escape');
                await openDialog().waitFor({ state: 'detached' });
                check(
                    await page.evaluate(
                        () =>
                            document.activeElement &&
                            document.activeElement !== document.body
                    ),
                    'the focus fell back to the page body'
                );
                check(
                    (await diagramTitle()) === 'Typed by keys',
                    'the navbar name did not follow the rename'
                );
            }
        );

        await step(
            '06 New from the rail: keys pick a database and go on to the import step',
            async () => {
                const newBtn = page
                    .getByRole('navigation', { name: 'Editor sections' })
                    .getByRole('button', { name: 'New' });
                await newBtn.focus();
                await page.keyboard.press('Enter');
                const d = page.getByRole('dialog', {
                    name: 'What is your Database?',
                });
                await d.waitFor();
                await d.getByRole('radio', { name: 'PostgreSQL' }).focus();
                // a radiogroup moves between its radios with the arrow keys (ARIA radio pattern)
                await page.keyboard.press('ArrowRight');
                await pause(200);
                knownBug(
                    (await focusedLabel()) === 'PostgreSQL',
                    'the database cards of the new-diagram dialog are role="radio" in a radiogroup but ignore the arrow keys, and every card is its own Tab stop'
                );
                await d.getByRole('radio', { name: 'PostgreSQL' }).focus();
                await tabUntil(
                    async () => (await focusedLabel()) === 'MariaDB',
                    'the MariaDB card',
                    6
                );
                await page.keyboard.press('Space');
                const next = page.getByRole('dialog', {
                    name: 'Import your Database',
                });
                await next.waitFor();
                check(
                    await focusIn('[role="dialog"]'),
                    'the focus is not in the import step'
                );
                await page.keyboard.press('Escape');
                await next.waitFor({ state: 'detached' });
                check(
                    await page.evaluate(
                        () =>
                            document.activeElement &&
                            document.activeElement !== document.body
                    ),
                    'the focus fell back to the page body after New'
                );
            }
        );
    }
);

await browser.close();
server.kill();

const failed = results.filter((r) => !r.ok);
writeFileSync(
    `${SHOTS}/results.json`,
    JSON.stringify({ results, problems: allProblems }, null, 2)
);
console.log(
    `\n${results.length - failed.length}/${results.length} steps passed`
);
for (const f of failed)
    console.log(`  FAILED ${f.name}: ${f.error.split('\n')[0]}`);
for (const k of knownBugs) console.log(`  KNOWN BUG ${k}`);
process.exit(failed.length ? 1 : 0);
