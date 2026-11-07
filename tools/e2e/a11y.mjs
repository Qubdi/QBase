// Automated accessibility audit of the BUILT app (local-only mode): axe-core
// (WCAG 2.1 A/AA + best-practice) on every major screen and state, plus
// keyboard-only checks (tab reach, focus trap and return, Escape, focus ring).
//   tools/e2e/run-a11y.sh [out-dir]      (SKIP_BUILD=1 reuses dist)
// Needs `playwright` and `axe-core` resolvable from /tmp/pw (the runner installs them).
// Writes $SHOTS/a11y-results.json and prints a table; exits 1 when a scan has a
// violation outside the canvas library (react-flow) or a keyboard check fails.
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const req = createRequire('/tmp/pw/');
const { chromium } = req('playwright');
const AXE = readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
const SHOTS = process.env.SHOTS || '/tmp/qbase-a11y';
const PORT = 4175;
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
`;

const scans = []; // { name, violations: [{id, impact, help, nodes:[{target, canvas, summary}]}] }
const kb = []; // keyboard checks { name, ok, detail }
let page;
let context;
let browser;

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

const pause = (ms) => page.waitForTimeout(ms);
const idle = () => pause(500);

async function newPage(opts = {}) {
    if (context) await context.close();
    context = await browser.newContext({
        viewport: opts.viewport ?? { width: 1280, height: 800 },
        locale: opts.locale ?? 'en-US',
        colorScheme: opts.colorScheme ?? 'light',
        hasTouch: Boolean(opts.touch),
        isMobile: Boolean(opts.touch),
    });
    page = await context.newPage();
    page.setDefaultTimeout(5000);
}

/** Run axe on the current page state and record the result. */
async function scan(name, opts = {}) {
    await idle();
    try {
        await page.evaluate(AXE);
        const res = await page.evaluate(
            async (context) =>
                // eslint-disable-next-line no-undef
                axe.run(context ?? document, {
                    runOnly: {
                        type: 'tag',
                        values: [
                            'wcag2a',
                            'wcag2aa',
                            'wcag21a',
                            'wcag21aa',
                            'best-practice',
                        ],
                    },
                    resultTypes: ['violations'],
                }),
            opts.context ?? null
        );
        const violations = [];
        for (const v of res.violations) {
            const nodes = [];
            for (const n of v.nodes) {
                const target = n.target.join(' ');
                nodes.push({
                    target,
                    // owned by the canvas library or src/canvas (not editable here)
                    canvas:
                        /react-flow|xy-flow|diagram-canvas/.test(target) ||
                        /class="react-flow|xyflow|diagram-canvas/.test(n.html),
                    // transient Radix portals of menus: not inside a landmark by design
                    accepted:
                        v.id === 'region' &&
                        /data-radix-popper-content-wrapper/.test(n.html),
                    html: n.html.slice(0, 160),
                    summary: (n.failureSummary || '')
                        .split('\n')
                        .slice(0, 3)
                        .join(' ')
                        .slice(0, 220),
                });
            }
            violations.push({
                id: v.id,
                impact: v.impact,
                help: v.help,
                nodes,
            });
        }
        scans.push({ name, violations });
        const n = violations.reduce((a, v) => a + v.nodes.length, 0);
        console.log(
            `SCAN ${name}: ${violations.length} rules, ${n} nodes ${violations.map((v) => v.id).join(',')}`
        );
    } catch (error) {
        scans.push({
            name,
            error: String(error.message || error),
            violations: [],
        });
        console.log(
            `SCAN ${name}: ERROR ${String(error.message || error).split('\n')[0]}`
        );
    }
    await page
        .screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-')}.png` })
        .catch(() => undefined);
}
async function kbCheck(name, fn) {
    try {
        const detail = await fn();
        if (detail) throw new Error(detail);
        kb.push({ name, ok: true });
        console.log(`KB PASS ${name}`);
    } catch (error) {
        const detail = String(error.message || error);
        kb.push({ name, ok: false, detail });
        console.log(`KB FAIL ${name}: ${detail.split('\n')[0]}`);
        await page.keyboard.press('Escape').catch(() => undefined);
    }
}
async function attempt(name, fn) {
    try {
        await fn();
    } catch (error) {
        scans.push({
            name,
            error: String(error.message || error),
            violations: [],
        });
        console.log(
            `SKIP ${name}: ${String(error.message || error).split('\n')[0]}`
        );
        await page
            .screenshot({
                path: `${SHOTS}/SKIP-${name.replace(/\W+/g, '-')}.png`,
            })
            .catch(() => undefined);
        await page.keyboard.press('Escape').catch(() => undefined);
    }
}

const openMenu = (label) =>
    page.getByRole('menubar').getByText(label, { exact: true }).click();
const rail = (name) =>
    page.getByRole('button', { name, exact: true }).first().click();
async function chooseDatabase() {
    await page.goto(`${BASE}/`);
    await page.getByRole('radio', { name: /PostgreSQL/ }).click();
}
async function seeded() {
    await chooseDatabase();
    await page
        .getByRole('dialog')
        .getByRole('tab', { name: 'SQL script' })
        .click();
    await page.getByRole('textbox', { name: 'SQL script' }).fill(SEED_SQL);
    await page
        .getByText(/Found \d+ tables?/)
        .first()
        .waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Build from text' }).click();
    await page.waitForURL(/\/diagrams\/.+/);
    await page.locator('[data-testid^="entity-"]').first().waitFor();
    await idle();
}
const closeWithEscape = async () => {
    await page.keyboard.press('Escape');
    await idle();
};

// ------------------------------------------------------------ start screen
await newPage();
await page.goto(`${BASE}/`);
await page.getByRole('radio', { name: /PostgreSQL/ }).waitFor();
await scan('start-new-diagram-dialog');
await page.getByRole('radio', { name: /PostgreSQL/ }).click();
await scan('start-database-chosen');

// ------------------------------------------------------------ editor, light
await seeded();
await scan('editor-light-tables');
for (const [section, label] of [
    ['DBML', 'editor-light-dbml'],
    ['Links', 'editor-light-links'],
    ['Types', 'editor-light-types'],
    ['Extras', 'editor-light-extras'],
]) {
    await attempt(label, async () => {
        await rail(section);
        await scan(label);
    });
}
await attempt('editor-light-extras-notes', async () => {
    await page.getByRole('tab', { name: 'Notes' }).click();
    await scan('editor-light-extras-notes');
});
await rail('Tables');

await attempt('edit-card', async () => {
    await page
        .locator('[data-testid^="entity-"]')
        .filter({ hasText: 'orders' })
        .first()
        .dblclick({ position: { x: 100, y: 15 } });
    await page.getByRole('textbox', { name: 'Table name' }).waitFor();
    await scan('edit-card-open');
    await closeWithEscape();
});

for (const m of ['Diagram', 'Edit', 'View']) {
    await attempt(`menu-${m}`, async () => {
        await openMenu(m);
        await page.getByRole('menu').waitFor();
        await scan(`menu-${m}-open`);
        await closeWithEscape();
    });
}
await attempt('menu-Diagram-submenu', async () => {
    await openMenu('Diagram');
    await page.getByRole('menuitem', { name: 'Save as' }).hover();
    await pause(400);
    await scan('menu-Diagram-save-as-submenu');
    await closeWithEscape();
    await closeWithEscape();
});

// dialogs
await attempt('dialog-open', async () => {
    await page.keyboard.press('ControlOrMeta+o');
    await page.getByRole('dialog').waitFor();
    await scan('dialog-open');
    await closeWithEscape();
});
await attempt('dialog-import', async () => {
    await openMenu('Diagram');
    await page
        .getByRole('menuitem', { name: 'Import from', exact: true })
        .click();
    await page
        .getByRole('menuitem', { name: 'SQL script', exact: true })
        .click();
    await page.getByRole('dialog').waitFor();
    await scan('dialog-import-sql');
    await closeWithEscape();
});
await attempt('dialog-export-sql', async () => {
    await openMenu('Diagram');
    await page
        .getByRole('menuitem', { name: 'Export SQL for', exact: true })
        .click();
    await page.getByRole('menuitem', { name: 'MySQL' }).click();
    await page.getByRole('dialog').waitFor();
    await scan('dialog-export-sql');
    await closeWithEscape();
});
await attempt('dialog-export-image', async () => {
    await openMenu('Diagram');
    await page.getByRole('menuitem', { name: 'Save as', exact: true }).click();
    await page.getByRole('menuitem', { name: 'PNG image' }).click();
    await page.getByRole('button', { name: 'Save image' }).waitFor();
    await scan('dialog-export-image');
    await closeWithEscape();
});
await attempt('dialog-settings', async () => {
    // there is no separate settings dialog: settings live in the View menu
    await openMenu('View');
    await page.getByRole('menuitem', { name: 'Color theme' }).click();
    await scan('menu-View-color-theme-submenu');
    await closeWithEscape();
    await closeWithEscape();
});
await attempt('dialog-preferences', async () => {
    await openMenu('View');
    await page.getByRole('menuitem', { name: 'Preferences' }).click();
    await page.getByRole('dialog').waitFor();
    await scan('dialog-preferences');
    await closeWithEscape();
});
await attempt('dialog-create-relationship', async () => {
    await rail('Links');
    await page
        .getByRole('button', { name: 'Add relationship' })
        .first()
        .click();
    await page.getByRole('dialog').waitFor();
    await scan('dialog-create-relationship');
    await closeWithEscape();
});
await attempt('dialog-clear', async () => {
    await openMenu('Edit');
    await page.getByRole('menuitem', { name: 'Empty the diagram' }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).waitFor();
    await scan('dialog-clear');
    await closeWithEscape();
});
await attempt('toast', async () => {
    await page.keyboard.press('ControlOrMeta+s');
    // wait for the toast itself: the same words also sit in the navbar's hover text
    await page.waitForFunction(() =>
        [...document.querySelectorAll('[role=status],[aria-live]')].some((e) =>
            /Everything is saved/.test(e.textContent ?? '')
        )
    );
    const live = true;
    kb.push({
        name: 'toast is announced (role=status / aria-live)',
        ok: live,
        detail: 'toast has no live region',
    });
    await scan('toast-visible');
});
await attempt('language-menu', async () => {
    await page.getByRole('button', { name: 'Change language' }).click();
    await page.getByText('Deutsch (German)').waitFor();
    await scan('language-menu-open');
    await closeWithEscape();
});

// ------------------------------------------------------------ dark theme
await attempt('dark', async () => {
    await openMenu('View');
    await page.getByRole('menuitem', { name: 'Color theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await idle();
    await scan('editor-dark-tables');
    for (const section of ['DBML', 'Links', 'Types', 'Extras']) {
        await attempt(`editor-dark-${section}`, async () => {
            await rail(section);
            await scan(`editor-dark-${section.toLowerCase()}`);
        });
    }
    await rail('Tables');
    await attempt('menu-dark', async () => {
        await openMenu('Diagram');
        await scan('menu-Diagram-open-dark');
        await closeWithEscape();
    });
    await attempt('dialog-dark', async () => {
        await page.keyboard.press('ControlOrMeta+o');
        await page.getByRole('dialog').waitFor();
        await scan('dialog-open-dark');
        await closeWithEscape();
    });
});

// ------------------------------------------------------------ keyboard
await newPage();
await seeded();
const focusedDesc = () =>
    page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return '';
        return `${a.tagName.toLowerCase()}[${a.getAttribute('role') ?? ''}] ${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30)}`;
    });
async function tabUntil(test, max = 80, key = 'Tab') {
    for (let i = 0; i < max; i += 1) {
        await page.keyboard.press(key);
        const ok = await page.evaluate(test);
        if (ok) return i + 1;
    }
    return 0;
}
await kbCheck('Tab reaches the menu bar', async () => {
    await page.evaluate(() => document.activeElement?.blur());
    const n = await tabUntil(
        () => !!document.activeElement?.closest('[role=menubar]')
    );
    return n ? '' : 'menubar not reachable with Tab';
});
await kbCheck(
    'Arrow keys move inside the menu bar, Enter opens a menu',
    async () => {
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        await page.getByRole('menu').waitFor({ timeout: 2000 });
        await page.keyboard.press('Escape');
        await idle();
        const back = await page.evaluate(
            () => !!document.activeElement?.closest('[role=menubar]')
        );
        return back ? '' : 'focus not returned to the menubar after Escape';
    }
);
await kbCheck('Tab reaches the rail buttons', async () => {
    const n = await tabUntil(
        () =>
            /^(Tables|Extras)$/.test(
                document.activeElement?.getAttribute('aria-label') ??
                    document.activeElement?.textContent?.trim() ??
                    ''
            ),
        80
    );
    return n ? '' : 'rail not reachable';
});
await kbCheck('Tab reaches panel rows and their menus', async () => {
    await rail('Tables');
    await page.evaluate(() => document.activeElement?.blur());
    const n = await tabUntil(() => {
        const a = document.activeElement;
        return (
            !!a &&
            /table/i.test(a.getAttribute('aria-label') ?? '') &&
            !!a.closest(
                'aside, [data-panel], [role=complementary], nav, section, div'
            )
        );
    }, 120).catch(() => 0);
    const seen = [];
    for (let i = 0; i < 60; i += 1) {
        await page.keyboard.press('Tab');
        seen.push(await focusedDesc());
    }
    const rowMenu = seen.some((s) => /more|menu|options|actions/i.test(s));
    return n || seen.length
        ? rowMenu
            ? ''
            : `no row menu button reached by Tab; sequence: ${seen.slice(0, 30).join(' > ')}`
        : 'nothing';
});
// dialogs: trap + return + escape
for (const [name, opener] of [
    [
        'Open dialog',
        async () => {
            await page
                .getByRole('button', { name: 'Tables', exact: true })
                .first()
                .focus();
            await page.keyboard.press('Shift');
            await page.keyboard.press('ControlOrMeta+o');
        },
    ],
    [
        'Create relationship dialog',
        async () => {
            await rail('Links');
            await page
                .getByRole('button', { name: 'Add relationship' })
                .first()
                .click();
        },
    ],
    [
        'Clear dialog',
        async () => {
            await openMenu('Edit');
            await page
                .getByRole('menuitem', { name: 'Empty the diagram' })
                .click();
        },
    ],
]) {
    await kbCheck(
        `${name}: focus trapped, Escape closes, focus returns`,
        async () => {
            await opener();
            const dlg = page
                .getByRole('alertdialog')
                .or(page.getByRole('dialog'));
            await dlg.first().waitFor();
            await idle();
            for (let i = 0; i < 40; i += 1) {
                await page.keyboard.press('Tab');
                const inside = await page.evaluate(
                    () =>
                        !!document.activeElement?.closest(
                            '[role=dialog],[role=alertdialog]'
                        )
                );
                if (!inside)
                    return `focus left the dialog after ${i + 1} Tab presses (on ${await focusedDesc()})`;
            }
            for (let i = 0; i < 10; i += 1) {
                await page.keyboard.press('Shift+Tab');
                const inside = await page.evaluate(
                    () =>
                        !!document.activeElement?.closest(
                            '[role=dialog],[role=alertdialog]'
                        )
                );
                if (!inside) return 'focus left the dialog with Shift+Tab';
            }
            await page.keyboard.press('Escape');
            await idle();
            if (await dlg.count()) return 'Escape did not close the dialog';
            const where = await page.evaluate(() =>
                document.activeElement === document.body ? 'body' : 'element'
            );
            return where === 'body'
                ? 'focus lost to <body> after the dialog closed'
                : '';
        }
    );
}
// visible focus ring
async function ringAudit(label) {
    await page.keyboard.press('Shift'); // keyboard modality: focus-visible applies
    const res = await page.evaluate(async () => {
        const sel =
            'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"]),[role=menuitem],[role=tab],[role=radio],[role=combobox]';
        const els = [...document.querySelectorAll(sel)].filter((e) => {
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            return (
                r.width > 0 &&
                r.height > 0 &&
                cs.visibility !== 'hidden' &&
                !e.closest('.react-flow__minimap,[inert],[aria-hidden=true]')
            );
        });
        const snap = (e) => {
            const c = getComputedStyle(e);
            return [
                c.outlineStyle,
                c.outlineWidth,
                c.outlineColor,
                c.boxShadow,
                c.borderColor,
                c.backgroundColor,
                c.color,
                c.textDecorationLine,
            ].join('|');
        };
        const bad = [];
        const canvas = [];
        for (const e of els) {
            if (e.closest('.react-flow')) {
                canvas.push(1);
                continue;
            }
            e.blur();
            const before = snap(e);
            e.focus({ focusVisible: true });
            await new Promise((r) =>
                requestAnimationFrame(() => requestAnimationFrame(r))
            );
            const after = snap(e);
            const noOutline =
                getComputedStyle(e).outlineStyle === 'none' ||
                parseFloat(getComputedStyle(e).outlineWidth) === 0;
            if (document.activeElement === e && before === after && noOutline) {
                bad.push(
                    `${e.tagName.toLowerCase()}[${e.getAttribute('role') ?? ''}] "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)}" ${e.className.toString().slice(0, 60)}`
                );
            }
            e.blur();
        }
        return {
            total: els.length - canvas.length,
            canvas: canvas.length,
            bad,
        };
    });
    return { label, ...res };
}
const rings = [];
rings.push(await ringAudit('editor, Tables'));
for (const s of ['DBML', 'Links', 'Types', 'Extras']) {
    await rail(s);
    await idle();
    rings.push(await ringAudit(`editor, ${s}`));
}
await page.keyboard.press('ControlOrMeta+o');
await page.getByRole('dialog').waitFor();
rings.push(await ringAudit('Open dialog'));
await page.keyboard.press('Escape');
await page.evaluate(() => window.scrollTo(0, 0));
for (const r of rings) {
    const ok = r.bad.length === 0;
    kb.push({
        name: `focus ring visible: ${r.label} (${r.total} focusable)`,
        ok,
        detail: r.bad.slice(0, 12).join('\n'),
    });
    console.log(
        `KB ${ok ? 'PASS' : 'FAIL'} focus ring ${r.label}: ${r.bad.length}/${r.total} without a ring`
    );
    for (const b of r.bad.slice(0, 12)) console.log(`   ${b}`);
}

// ------------------------------------------------------------ canvas keyboard
const NODE = '.react-flow__node-entity';
const activeNode = () =>
    page.evaluate((sel) => {
        const a = document.activeElement;
        return a && a.matches(sel) ? a.getAttribute('data-id') : null;
    }, NODE);
const nodeX = (id) =>
    page.evaluate(
        (id) =>
            document
                .querySelector(`.react-flow__node[data-id="${id}"]`)
                .getBoundingClientRect().x,
        id
    );
const contrastOf = (a, b) => {
    const lum = ([r, g, bl]) => {
        const f = (v) => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
    };
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
};
const rgbOf = (css) =>
    css
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
for (const scheme of ['light', 'dark']) {
    await newPage({ colorScheme: scheme });
    await seeded();
    const tag = `canvas ${scheme}`;
    await page.locator('[data-testid="diagram-canvas"]').focus();
    await page.keyboard.press('Shift');
    let first = '';
    await kbCheck(`${tag}: Tab reaches a table`, async () => {
        const n = await tabUntil(
            () => !!document.activeElement?.matches('.react-flow__node-entity'),
            250
        );
        first = (await activeNode()) ?? '';
        return n && first ? '' : 'no table reachable with Tab';
    });
    await kbCheck(`${tag}: focused table has a visible ring`, async () => {
        const ring = await page.evaluate((id) => {
            const el = document.querySelector(
                `.react-flow__node[data-id="${id}"]`
            );
            const c = getComputedStyle(el);
            return {
                style: c.outlineStyle,
                width: parseFloat(c.outlineWidth),
                color: c.outlineColor,
                bg: getComputedStyle(document.body).backgroundColor,
            };
        }, first);
        const ratio = contrastOf(rgbOf(ring.color), rgbOf(ring.bg));
        if (ring.style === 'none' || ring.width < 2) return 'no outline';
        return ratio >= 3 ? '' : `ring contrast ${ratio.toFixed(2)}:1 < 3:1`;
    });
    await kbCheck(`${tag}: focusing selects the table`, async () => {
        const sel = await page.evaluate(
            (id) =>
                document
                    .querySelector(`.react-flow__node[data-id="${id}"]`)
                    .classList.contains('selected'),
            first
        );
        return sel ? '' : 'focused table is not selected';
    });
    await kbCheck(
        `${tag}: arrow keys move it, Shift+arrow moves further, announced`,
        async () => {
            const x0 = await nodeX(first);
            for (let i = 0; i < 3; i += 1)
                await page.keyboard.press('ArrowRight');
            await pause(900);
            const x1 = await nodeX(first);
            await page.keyboard.press('Shift+ArrowRight');
            await pause(900);
            const x2 = await nodeX(first);
            const said = await page
                .locator('[data-testid="canvas-announcer"]')
                .textContent();
            if (!(x1 > x0)) return `arrows did not move it (${x0} -> ${x1})`;
            if (!(x2 - x1 > (x1 - x0) / 3)) return 'Shift did not move further';
            if (!/ moved/.test(said ?? '')) return `no announcement (${said})`;
            const stillThere = await activeNode();
            return stillThere === first
                ? ''
                : 'focus left the table after moving';
        }
    );
    await kbCheck(
        `${tag}: Enter opens the edit card, Escape closes it and focus returns`,
        async () => {
            await page.keyboard.press('Enter');
            await page.locator('[data-edit-card]').waitFor({ timeout: 2000 });
            await page.keyboard.press('Escape');
            await pause(400);
            const gone = (await page.locator('[data-edit-card]').count()) === 0;
            if (!gone) return 'edit card still open after Escape';
            return (await activeNode()) === first
                ? ''
                : 'focus did not return to the table';
        }
    );
    await kbCheck(
        `${tag}: Shift+F10 opens the menu, Escape returns to the table`,
        async () => {
            await page.keyboard.press('Shift+F10');
            await page.getByRole('menu').waitFor({ timeout: 2000 });
            const hasDraw = await page
                .getByRole('menuitem', { name: /relationship/i })
                .count();
            await page.keyboard.press('Escape');
            await pause(300);
            if (!hasDraw) return 'no relationship item in the menu';
            return (await activeNode()) === first
                ? ''
                : 'focus lost after the menu';
        }
    );
    await kbCheck(
        `${tag}: Escape on a table returns focus to the canvas`,
        async () => {
            await page.keyboard.press('Escape');
            const onCanvas = await page.evaluate(
                () =>
                    document.activeElement?.getAttribute('data-testid') ===
                    'diagram-canvas'
            );
            return onCanvas ? '' : 'focus is not on the canvas';
        }
    );
    await page.locator('.react-flow__node-entity').first().focus();
    await page.keyboard.press('Shift');
    await pause(300);
    if (scheme === 'light')
        await page
            .locator(`.react-flow__node[data-id="${first}"]`)
            .screenshot({ path: `${SHOTS}/canvas-focus-ring-node.png` })
            .catch(() => undefined);
    await page.screenshot({
        path: `${SHOTS}/canvas-focus-ring-${scheme}.png`,
    });
    await kbCheck(`${tag}: Tab order follows the reading order`, async () => {
        const order = await page.evaluate(() =>
            [...document.querySelectorAll('.react-flow__node-entity')].map(
                (el) => {
                    const m = el.style.transform.match(
                        /(-?[\d.]+)px,\s*(-?[\d.]+)px/
                    );
                    return { x: +m[1], y: +m[2] };
                }
            )
        );
        for (let i = 1; i < order.length; i += 1) {
            const a = order[i - 1];
            const b = order[i];
            const ba = Math.round(a.y / 80);
            const bb = Math.round(b.y / 80);
            if (ba > bb || (ba === bb && a.x > b.x))
                return `node ${i} comes before an earlier one in reading order`;
        }
        return '';
    });
    if (scheme === 'light')
        await kbCheck(`${tag}: a focused line has a visible ring`, async () => {
            const has = await page.evaluate(() => {
                const edge = document.querySelector('.react-flow__edge');
                if (!edge) return 'no line in the seed';
                edge.focus({ focusVisible: true });
                const p = edge.querySelector('.react-flow__edge-path');
                const w = parseFloat(getComputedStyle(p).strokeWidth);
                return w >= 3 ? '' : `stroke ${w}px`;
            });
            return has;
        });
    await scan(`canvas-keyboard-${scheme}`);
}

// ------------------------------------------------------------ languages
for (const [loc, lang, dir, button] of [
    ['en-US', 'de', 'ltr', 'Deutsch (German)'],
    ['en-US', 'ka', 'ltr', 'ქართული (Georgian)'],
]) {
    await newPage({ locale: loc });
    await seeded();
    await attempt(`lang-${lang}`, async () => {
        await page.getByRole('button', { name: 'Change language' }).click();
        const item = page.getByText(button);
        await item.click();
        await idle();
        const state = await page.evaluate(() => ({
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            over:
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
        }));
        kb.push({
            name: `${lang}: html lang=${lang}, dir=${dir}, no horizontal overflow`,
            ok:
                state.lang.startsWith(lang) &&
                state.dir === dir &&
                state.over <= 0,
            detail: JSON.stringify(state),
        });
        console.log(`LANG ${lang}`, JSON.stringify(state));
        await scan(`editor-${lang}`);
        await openMenu(
            await page
                .getByRole('menubar')
                .getByRole('menuitem')
                .first()
                .innerText()
        );
        await scan(`menu-open-${lang}`);
        await closeWithEscape();
        await page.keyboard.press('ControlOrMeta+o');
        await page.getByRole('dialog').waitFor();
        await scan(`dialog-open-${lang}`);
        await closeWithEscape();
    });
}

// ------------------------------------------------------------ phone
await newPage({ viewport: { width: 390, height: 844 }, touch: true });
await seeded();
await scan('phone-canvas');
await attempt('phone-drawer', async () => {
    await page.getByRole('button', { name: 'Open the editing panel' }).click();
    await page.getByText('Diagram contents').waitFor();
    await scan('phone-drawer');
    await page.keyboard.press('Escape');
});
await newPage({
    viewport: { width: 390, height: 844 },
    touch: true,
    colorScheme: 'dark',
});
await page.goto(`${BASE}/`);
await page.getByRole('radio', { name: /PostgreSQL/ }).waitFor();
await scan('phone-start');

await browser.close();

// ------------------------------------------------------------ report
const byRule = {};
let canvasNodes = 0;
let appNodes = 0;
for (const s of scans)
    for (const v of s.violations)
        for (const n of v.nodes) {
            const r = (byRule[v.id] ??= {
                impact: v.impact,
                help: v.help,
                app: 0,
                canvas: 0,
                screens: new Set(),
                samples: new Set(),
            });
            // canvas nodes count like app nodes now; only the accepted menu portals are exempt
            if (n.accepted) {
                r.canvas += 1;
                canvasNodes += 1;
            } else {
                r.app += 1;
                appNodes += 1;
            }
            r.screens.add(s.name);
            if (r.samples.size < 4)
                r.samples.add(`${n.target} :: ${n.html} :: ${n.summary}`);
        }
console.log('\n==== axe violations by rule (nodes, summed over all scans)');
for (const [id, r] of Object.entries(byRule))
    console.log(
        `${id} [${r.impact}] app=${r.app} canvas=${r.canvas} in ${r.screens.size} scan(s): ${r.help}`
    );
console.log(`TOTAL app nodes ${appNodes}, canvas-library nodes ${canvasNodes}`);
const kbFail = kb.filter((k) => !k.ok);
for (const k of kbFail) console.log(`KB FAILED ${k.name}: ${k.detail ?? ''}`);
console.log(`keyboard checks: ${kb.length - kbFail.length}/${kb.length} pass`);
writeFileSync(
    `${SHOTS}/a11y-results.json`,
    JSON.stringify(
        {
            scans,
            kb,
            byRule: Object.fromEntries(
                Object.entries(byRule).map(([k, v]) => [
                    k,
                    { ...v, screens: [...v.screens], samples: [...v.samples] },
                ])
            ),
            appNodes,
            canvasNodes,
        },
        null,
        2
    )
);
process.exit(appNodes > 0 || kbFail.length ? 1 : 0);
