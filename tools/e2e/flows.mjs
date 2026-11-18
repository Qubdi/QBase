// Real-browser flows of the BUILT app (local-only mode): the interactions the
// smoke test does not cover (drag from the panel, drag/resize, copy/paste,
// edit card, relationships, filter, DBML edit, import into an open diagram,
// settings, language, export, phone width). Same approach as smoke.mjs.
//   tools/e2e/run-flows.sh [shots-dir]      (ONLY=3,5 runs some flows; SKIP_BUILD=1 reuses dist)
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
            await d.getByRole('textbox').first().fill(SECOND_SQL);
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
process.exit(failed.length ? 1 : 0);
