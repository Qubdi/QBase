// Scenes for the canvas of the editor: canvas, table cards, field rows, relationship lines,
// areas, notes, minimap, corner tools, menus and pointer behaviour. Selectors use the OLD
// editor's wording and read only what a user can see (boxes, computed styles, SVG attributes).
// Every probe is tolerant: a missing element gives { missing: true }, so the same scenes also run
// on the new editor. run(page) returns the measurements object (the runner stores it).
import { DESKTOP, PHONE, settle } from './steps.mjs';

const BOTH = ['light', 'dark'];
const L = ['light'];
const defs = [];
const def = (name, themes, viewport, run) => {
    for (const theme of themes) {
        defs.push({
            name: `canvas-${name}${viewport === PHONE ? '-phone' : ''}-${theme}`,
            viewport,
            theme,
            run,
        });
    }
};

export const SQL_DEMO = `CREATE TYPE public.mood AS ENUM ('calm', 'busy');
CREATE TABLE public.owners (id integer PRIMARY KEY, email varchar(120) NOT NULL UNIQUE, bio text, active boolean DEFAULT true);
CREATE TABLE public.pets (
    id integer NOT NULL,
    owner_id integer NOT NULL,
    name character varying(40) NOT NULL,
    mood public.mood DEFAULT 'calm'::public.mood,
    born date, seen timestamp, uid uuid, meta jsonb, weight numeric(10,2), tags text[], photo bytea, big bigint, ratio real
);
ALTER TABLE ONLY public.pets ADD CONSTRAINT pets_pkey PRIMARY KEY (id);
CREATE TABLE public.visits (pet_id integer NOT NULL, vet_id integer NOT NULL, at timestamp, PRIMARY KEY (pet_id, vet_id));
CREATE TABLE public.vets (id serial PRIMARY KEY, name text);
CREATE TABLE public.one (id integer PRIMARY KEY, pet_id integer UNIQUE);
ALTER TABLE ONLY public.pets ADD CONSTRAINT pets_owner_fk FOREIGN KEY (owner_id) REFERENCES public.owners(id);
ALTER TABLE ONLY public.visits ADD CONSTRAINT v_pet_fk FOREIGN KEY (pet_id) REFERENCES public.pets(id);
ALTER TABLE ONLY public.visits ADD CONSTRAINT v_vet_fk FOREIGN KEY (vet_id) REFERENCES public.vets(id);
ALTER TABLE ONLY public.one ADD CONSTRAINT one_fk FOREIGN KEY (pet_id) REFERENCES public.pets(id);
CREATE INDEX idx_pets_name ON public.pets USING btree (name);
CREATE UNIQUE INDEX idx_pets_uid ON public.pets USING btree (uid);
CREATE INDEX idx_pets_multi ON public.pets USING btree (born, seen);
`;

const PROPS = [
    'color',
    'backgroundColor',
    'backgroundImage',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'borderTopWidth',
    'borderTopStyle',
    'borderTopColor',
    'borderTopLeftRadius',
    'boxShadow',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'opacity',
    'cursor',
    'outlineStyle',
    'outlineColor',
    'transitionProperty',
    'transitionDuration',
    'transitionTimingFunction',
    'width',
    'height',
    'zIndex',
    'stroke',
    'strokeWidth',
    'strokeDasharray',
    'fill',
    'visibility',
    'filter',
];

// Box and computed style of the nth match of a CSS selector, or { missing: true }.
export async function probe(page, selector, nth = 0, props = PROPS) {
    return page
        .evaluate(
            ([sel, n, p]) => {
                const resolve = (sel) => {
                    const m = /^T\[(.+?)\]\s*(.*)$/.exec(sel);
                    if (!m) return [...document.querySelectorAll(sel)];
                    const t = [
                        ...document.querySelectorAll(
                            ':is(.react-flow__node-table,.react-flow__node-entity)'
                        ),
                    ].find((x) => x.innerText.trim().startsWith(m[1]));
                    if (!t) return [];
                    if (!m[2]) return [t];
                    return [
                        ...t.querySelectorAll(
                            m[2].startsWith('>') ? ':scope ' + m[2] : m[2]
                        ),
                    ];
                };
                const node = resolve(sel)[n];
                if (!node) return { missing: true };
                const cs = getComputedStyle(node);
                const r = node.getBoundingClientRect();
                const o = {
                    box: {
                        x: +r.x.toFixed(1),
                        y: +r.y.toFixed(1),
                        w: +r.width.toFixed(1),
                        h: +r.height.toFixed(1),
                    },
                    text: (node.textContent || '').trim().slice(0, 60),
                    size:
                        node.offsetWidth === undefined
                            ? null
                            : [node.offsetWidth, node.offsetHeight],
                    style: {},
                };
                for (const k of p) {
                    const v = cs[k];
                    if (v && v !== 'none' && v !== 'normal' && v !== 'auto')
                        o.style[k] = v;
                }
                return o;
            },
            [selector, nth, props]
        )
        .catch(() => ({ missing: true }));
}

// Card that contains the given visible text: walks up from the text to the first ancestor with a
// border and a background (a floating panel), then returns its box and style.
export async function probeCardWith(page, text) {
    return page
        .evaluate(
            ([t, p]) => {
                const el = [...document.querySelectorAll('body *')].find(
                    (n) =>
                        n.children.length === 0 &&
                        (n.textContent || '').trim() === t
                );
                if (!el) return { missing: true };
                let n = el;
                while (n && n !== document.body) {
                    const cs = getComputedStyle(n);
                    const r = n.getBoundingClientRect();
                    if (
                        parseFloat(cs.borderTopWidth) > 0 &&
                        r.width > 80 &&
                        cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
                    )
                        break;
                    n = n.parentElement;
                }
                if (!n || n === document.body) return { missing: true };
                const cs = getComputedStyle(n);
                const r = n.getBoundingClientRect();
                const o = {
                    box: {
                        x: +r.x.toFixed(1),
                        y: +r.y.toFixed(1),
                        w: +r.width.toFixed(1),
                        h: +r.height.toFixed(1),
                    },
                    cls: n.className.toString().slice(0, 200),
                    style: {},
                };
                for (const k of p) o.style[k] = cs[k];
                o.buttons = [...n.querySelectorAll('button')]
                    .slice(0, 8)
                    .map((b) => {
                        const bs = getComputedStyle(b);
                        const br = b.getBoundingClientRect();
                        return {
                            text: (
                                b.textContent ||
                                b.getAttribute('aria-label') ||
                                ''
                            )
                                .trim()
                                .slice(0, 20),
                            w: +br.width.toFixed(1),
                            h: +br.height.toFixed(1),
                            color: bs.color,
                            bg: bs.backgroundColor,
                            fs: bs.fontSize,
                            fw: bs.fontWeight,
                            radius: bs.borderTopLeftRadius,
                        };
                    });
                return o;
            },
            [text, PROPS]
        )
        .catch(() => ({ missing: true }));
}

export async function probeAll(
    page,
    selector,
    cap = 12,
    props = ['color', 'backgroundColor']
) {
    return page
        .evaluate(
            ([sel, c, p]) => {
                const resolve = (sel) => {
                    const m = /^T\[(.+?)\]\s*(.*)$/.exec(sel);
                    if (!m) return [...document.querySelectorAll(sel)];
                    const t = [
                        ...document.querySelectorAll(
                            ':is(.react-flow__node-table,.react-flow__node-entity)'
                        ),
                    ].find((x) => x.innerText.trim().startsWith(m[1]));
                    if (!t) return [];
                    if (!m[2]) return [t];
                    return [
                        ...t.querySelectorAll(
                            m[2].startsWith('>') ? ':scope ' + m[2] : m[2]
                        ),
                    ];
                };
                return resolve(sel)
                    .slice(0, c)
                    .map((node) => {
                        const cs = getComputedStyle(node);
                        const r = node.getBoundingClientRect();
                        const o = {
                            text: (
                                node.textContent ||
                                node.getAttribute('aria-label') ||
                                ''
                            )
                                .trim()
                                .slice(0, 40),
                            w: +r.width.toFixed(1),
                            h: +r.height.toFixed(1),
                            x: +r.x.toFixed(1),
                            y: +r.y.toFixed(1),
                        };
                        for (const k of p) o[k] = cs[k];
                        return o;
                    });
            },
            [selector, cap, props]
        )
        .catch(() => []);
}

const viewport = (page) =>
    page.evaluate(() => {
        const v = document.querySelector('.react-flow__viewport');
        return v ? v.style.transform : null;
    });

// Every drawn line: path data, stroke styling and markers.
async function edges(page) {
    return page
        .evaluate(() =>
            [...document.querySelectorAll('.react-flow__edge')].map((g) => {
                const path = g.querySelector('.react-flow__edge-path');
                const cs = path ? getComputedStyle(path) : null;
                return {
                    cls: g.getAttribute('class'),
                    d: path && path.getAttribute('d'),
                    markerStart: path && path.getAttribute('marker-start'),
                    markerEnd: path && path.getAttribute('marker-end'),
                    stroke: cs && cs.stroke,
                    strokeWidth: cs && cs.strokeWidth,
                    dash: cs && cs.strokeDasharray,
                    opacity: cs && cs.opacity,
                };
            })
        )
        .catch(() => []);
}

// Top-left canvas element boxes (corner tools, minimap, legend button) in one call.
async function chrome(page) {
    return {
        minimap: await probe(page, '.react-flow__minimap'),
        minimapNodes: await probeAll(page, '.react-flow__minimap-node', 12, [
            'fill',
            'stroke',
        ]),
        minimapMask: await probe(page, '.react-flow__minimap-mask'),
        toolbar: await probe(
            page,
            '.react-flow__controls.horizontal [class*="rounded-xl"]'
        ),
        topLeftTools: await probe(page, '.react-flow__controls.vertical'),
        background: await probe(page, '.react-flow__background'),
        pattern: await page
            .evaluate(() => {
                const pt = document.querySelector(
                    '.react-flow__background pattern'
                );
                const c = document.querySelector(
                    '.react-flow__background-pattern'
                );
                return (
                    pt && {
                        w: pt.getAttribute('width'),
                        r: c && c.getAttribute('r'),
                        fill: c && getComputedStyle(c).fill,
                        viewport: document.querySelector(
                            '.react-flow__viewport'
                        ).style.transform,
                    }
                );
            })
            .catch(() => null),
        pane: await probe(page, '.react-flow__pane'),
    };
}

const nodeByName = (page, name) =>
    page
        .locator(':is(.react-flow__node-table,.react-flow__node-entity)')
        .filter({ hasText: new RegExp(`^\\s*${name}`) })
        .first();

async function box(page, name) {
    const b = await nodeByName(page, name).boundingBox();
    if (!b) throw new Error(`no table ${name}`);
    return b;
}

// Screen point of the middle of the nth line.
async function edgeMid(page, i) {
    return page.evaluate((n) => {
        const p = document.querySelectorAll('.react-flow__edge-path')[n];
        if (!p) return null;
        const pt = p.getPointAtLength(p.getTotalLength() / 2);
        const m = p.getScreenCTM();
        return {
            x: pt.x * m.a + pt.y * m.c + m.e,
            y: pt.x * m.b + pt.y * m.d + m.f,
        };
    }, i);
}

// ---- setup: the demo diagram built through the UI like a person would ----
async function pickDatabase(page) {
    const radios = page.getByRole('radio');
    await radios.nth(1).click();
    await settle(page, 600);
}

async function emptyDiagram(page) {
    await pickDatabase(page);
    await page
        .getByRole('button', { name: 'Empty database' })
        .or(page.getByRole('button', { name: 'Blank diagram instead' }))
        .first()
        .click();
    await page.getByRole('button', { name: 'Add Table' }).first().waitFor();
    await settle(page, 600);
}

async function importDemo(page, sql = SQL_DEMO) {
    await pickDatabase(page);
    await page
        .getByText('SQL Script', { exact: true })
        .or(page.getByRole('tab', { name: 'SQL script' }))
        .first()
        .click();
    await settle(page, 500);
    const monaco = page.locator('[role=dialog] .monaco-editor textarea').last();
    if (await monaco.count()) {
        await monaco.focus();
        await page.keyboard.insertText(sql);
        await settle(page, 700);
        await page.getByRole('button', { name: 'Import', exact: true }).click();
    } else {
        await page.getByRole('textbox', { name: 'SQL script' }).fill(sql);
        await settle(page, 700);
        await page
            .getByRole('button', { name: 'Build from text' })
            .or(page.getByRole('button', { name: 'Import', exact: true }))
            .first()
            .click();
    }
    await page
        .locator(
            ':is(.react-flow__node-table,.react-flow__node-entity), .react-flow__node'
        )
        .first()
        .waitFor();
    await settle(page, 2500);
}

async function showAll(page) {
    await page.getByRole('button', { name: 'Show All' }).first().click();
    await settle(page, 1000);
}

const demo = async (page) => {
    await importDemo(page);
    await showAll(page);
};

const menubar = async (page, top, item) => {
    await page.getByRole('menubar').getByText(top, { exact: true }).click();
    await settle(page, 300);
    await page.getByRole('menuitem', { name: item }).first().click();
    await settle(page, 400);
};

const ctx = async (page, x, y) => {
    await page.mouse.click(x, y, { button: 'right' });
    await settle(page, 450);
};

// Opens the in-place edit card of a table (double click on its header).
async function openEdit(page, name) {
    const b = await box(page, name);
    await page.mouse.dblclick(b.x + b.width / 2, b.y + 15);
    await settle(page, 800);
    const open = await page
        .locator(
            ':is(.react-flow__node-table,.react-flow__node-entity):has(input) input'
        )
        .count();
    if (!open) {
        await ctx(page, b.x + 30, b.y + 15);
        await page.getByRole('menuitem', { name: 'Edit Table' }).click();
        await settle(page, 800);
    }
}

async function tableParts(page, name = 'pets') {
    const base = `T[${name}]`;
    return {
        card: await probe(page, `${base} > span > div`),
        header: await probe(page, `${base} .h-12`),
        chip: await probe(page, `${base} .h-12 > span`),
        name: await probe(page, `${base} label`),
        schema: await probe(page, `${base} label + div`),
        count: await probe(page, `${base} .tabular-nums`),
        row: await probe(page, `${base} .h-8`, 0),
        rowKey: await probe(page, `${base} .h-8 svg`, 0),
        rowName: await probe(page, `${base} .h-8 .truncate`, 0),
        typeChip: await probe(page, `${base} .h-8 .font-mono`, 0),
        typeChipText: await probe(page, `${base} .h-8 .font-mono span`, 0),
        nullable: await probe(page, `${base} .h-8 [title=Nullable]`, 0),
        rows: await probeAll(page, `${base} .h-8`, 14, [
            'height',
            'backgroundColor',
        ]),
        showMore: await probe(page, `${base} button`),
        handles: await probeAll(page, `${base} .react-flow__handle`, 8, [
            'opacity',
            'visibility',
            'width',
            'height',
            'backgroundColor',
        ]),
        resize: await probeAll(page, `${base} .react-flow__resize-control`, 8, [
            'width',
            'height',
            'backgroundColor',
            'cursor',
        ]),
    };
}

// ================= scenes =================

// 1. canvas
def('empty-diagram', BOTH, DESKTOP, async (page) => {
    await emptyDiagram(page);
    return {
        chrome: await chrome(page),
        empty: await probe(page, '.react-flow'),
    };
});
def('demo-fit', BOTH, DESKTOP, async (page) => {
    await demo(page);
    return {
        chrome: await chrome(page),
        viewport: await viewport(page),
        edges: await edges(page),
        pets: await tableParts(page, 'pets'),
        owners: await tableParts(page, 'owners'),
        one: await tableParts(page, 'one'),
    };
});
def('demo-fit', L, PHONE, async (page) => {
    await demo(page);
    return {
        chrome: await chrome(page),
        viewport: await viewport(page),
        pets: await tableParts(page, 'pets'),
    };
});
def('demo-fit', ['dark'], PHONE, async (page) => {
    await demo(page);
    return { chrome: await chrome(page), viewport: await viewport(page) };
});
def('cursor-states', L, DESKTOP, async (page) => {
    await demo(page);
    const out = {};
    out.pane = await probe(page, '.react-flow__pane', 0, ['cursor']);
    out.rootClass = await page.evaluate(
        () => document.querySelector('.react-flow').className
    );
    const b = await box(page, 'pets');
    await page.mouse.move(b.x + b.width / 2, b.y + 10);
    out.overHeader = await page
        .evaluate(
            () =>
                getComputedStyle(
                    document.elementFromPoint(window.__x, window.__y) ||
                        document.body
                ).cursor
        )
        .catch(() => null);
    out.nodeCursor = await probe(
        page,
        ':is(.react-flow__node-table,.react-flow__node-entity)',
        0,
        ['cursor']
    );
    await page.keyboard.down('Space');
    await settle(page, 200);
    out.spaceRootClass = await page.evaluate(
        () => document.querySelector('.react-flow').className
    );
    out.spacePane = await probe(page, '.react-flow__pane', 0, ['cursor']);
    await page.keyboard.up('Space');
    await page.mouse.move(900, 200);
    await page.mouse.down();
    await page.mouse.move(930, 230);
    out.panningPane = await probe(page, '.react-flow__pane', 0, ['cursor']);
    out.panningRoot = await page.evaluate(
        () => document.querySelector('.react-flow').className
    );
    await page.mouse.up();
    return out;
});

// 2. table card states
def('table-default', BOTH, DESKTOP, async (page) => {
    await demo(page);
    return {
        pets: await tableParts(page, 'pets'),
        visits: await tableParts(page, 'visits'),
        owners: await tableParts(page, 'owners'),
    };
});
def('table-hover', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const b = await box(page, 'owners');
    await page.mouse.move(b.x + b.width / 2, b.y + 8);
    await settle(page, 500);
    return {
        owners: await tableParts(page, 'owners'),
        headerButtons: await probeAll(page, 'T[owners] .h-12 button', 4, [
            'width',
            'height',
            'color',
        ]),
    };
});
def('table-selected', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const b = await box(page, 'owners');
    await page.mouse.click(b.x + b.width / 2, b.y + 8);
    await settle(page, 500);
    return {
        owners: await tableParts(page, 'owners'),
        others: await tableParts(page, 'pets'),
        zIndex: await probe(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity).selected',
            0,
            ['zIndex']
        ),
    };
});
def('table-multi-select', L, DESKTOP, async (page) => {
    await demo(page);
    const a = await box(page, 'owners');
    const c = await box(page, 'vets');
    await page.mouse.click(a.x + a.width / 2, a.y + 8);
    await page.keyboard.down('Shift');
    await page.mouse.click(c.x + c.width / 2, c.y + 8);
    await page.keyboard.up('Shift');
    await settle(page, 500);
    return {
        selected: await probeAll(page, '.react-flow__node.selected', 6, [
            'zIndex',
        ]),
        nodesAttrs: await probe(page, '.react-flow__nodesselection-rect'),
        selectionRect: await probe(
            page,
            '.react-flow__nodesselection-rect',
            0,
            ['backgroundColor', 'borderTopColor', 'borderTopWidth']
        ),
    };
});
def('selection-box-drag', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await page.keyboard.down('Shift');
    await page.mouse.move(430, 80);
    await page.mouse.down();
    await page.mouse.move(800, 300, { steps: 6 });
    await settle(page, 300);
    const m = {
        box: await probe(page, '.react-flow__selection'),
        box2: await probe(page, '.react-flow__selection', 0, [
            'backgroundColor',
            'borderTopColor',
            'borderTopWidth',
            'borderTopStyle',
        ]),
    };
    return m;
});
def('table-dragging', L, DESKTOP, async (page) => {
    await demo(page);
    const b = await box(page, 'owners');
    await page.mouse.move(b.x + b.width / 2, b.y + 8);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + 108, { steps: 8 });
    await settle(page, 300);
    return {
        dragging: await probe(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity).dragging'
        ),
        owners: await tableParts(page, 'owners'),
        classes: await page.evaluate(() =>
            [
                ...document.querySelectorAll(
                    ':is(.react-flow__node-table,.react-flow__node-entity)'
                ),
            ].map((n) => n.className)
        ),
    };
});
def('table-snap-drag', L, DESKTOP, async (page) => {
    await demo(page);
    await page
        .getByRole('button', { name: 'Snap to Grid (Hold Shift)' })
        .click();
    await settle(page, 300);
    const b = await box(page, 'owners');
    await page.mouse.move(b.x + b.width / 2, b.y + 8);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 33, b.y + 8 + 27, { steps: 8 });
    await page.mouse.up();
    await settle(page, 400);
    const after = await box(page, 'owners');
    return {
        before: b,
        after,
        dx: after.x - b.x,
        dy: after.y - b.y,
        viewport: await viewport(page),
        snapButton: await probe(
            page,
            'button[aria-label="Snap to Grid (Hold Shift)"]'
        ),
    };
});
def('table-field-hover', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const row = nodeByName(page, 'pets').locator('.h-8').nth(2);
    await row.hover();
    await settle(page, 500);
    return {
        row: await probe(page, 'T[pets] .h-8', 2),
        actions: await probeAll(page, 'T[pets] .h-8:nth-child(3) button', 3, [
            'width',
            'height',
        ]),
        hoverCard: await probe(
            page,
            'body > div.pointer-events-none.fixed.z-50'
        ),
        hoverCardText: await page.evaluate(
            () =>
                document.querySelector(
                    'body > div.pointer-events-none.fixed.z-50'
                )?.innerText ?? null
        ),
    };
});
def('table-key-field-hover', L, DESKTOP, async (page) => {
    await demo(page);
    const row = nodeByName(page, 'pets').locator('.h-8').nth(0);
    await row.hover();
    await settle(page, 900);
    return {
        hoverCard: await probe(
            page,
            'body > div.pointer-events-none.fixed.z-50'
        ),
        text: await page.evaluate(
            () =>
                document.querySelector(
                    'body > div.pointer-events-none.fixed.z-50'
                )?.innerText ?? null
        ),
    };
});
def('table-show-more', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const before = await probe(page, 'T[pets]');
    await nodeByName(page, 'pets').getByText('Show More').click();
    await settle(page, 600);
    return {
        before,
        after: await probe(page, 'T[pets]'),
        parts: await tableParts(page, 'pets'),
        toggle: await probeAll(page, 'T[pets] button', 8, [
            'fontSize',
            'color',
        ]),
    };
});
def('table-attributes-hidden', L, DESKTOP, async (page) => {
    await demo(page);
    await menubar(page, 'View', 'Hide Field Attributes');
    return { pets: await tableParts(page, 'pets') };
});
def('table-compact', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await menubar(page, 'View', 'Compact Tables');
    await settle(page, 500);
    return {
        pets: await tableParts(page, 'pets'),
        owners: await tableParts(page, 'owners'),
    };
});
def('cardinality-hidden', L, DESKTOP, async (page) => {
    await demo(page);
    await menubar(page, 'View', 'Hide Cardinality');
    return { edges: await edges(page) };
});
def('minimap-hidden', L, DESKTOP, async (page) => {
    await demo(page);
    await menubar(page, 'View', 'Hide Mini Map');
    return { chrome: await chrome(page) };
});

// edit card
def('edit-card', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await openEdit(page, 'pets');
    const sel =
        ':is(.react-flow__node-table,.react-flow__node-entity):has(input) > span > div';
    return {
        card: await probe(page, sel),
        header: await probe(page, `${sel} .h-12`),
        schemaSelect: await probe(page, `${sel} .h-12 [aria-haspopup=dialog]`),
        nameInput: await probe(page, `${sel} .h-12 input`),
        row: await probe(page, `${sel} input.h-8`, 0),
        typeSelect: await probe(page, `${sel} [aria-haspopup=dialog].h-8`, 0),
        toggles: await probeAll(page, `${sel} button[aria-pressed]`, 6, [
            'width',
            'height',
            'color',
            'backgroundColor',
        ]),
        footer: await probe(page, `${sel} > div:last-child`),
        buttons: await probeAll(page, `${sel} button`, 10, [
            'width',
            'height',
            'color',
        ]),
        dimmed: await probeAll(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity):not(.selected) > span > div',
            6,
            ['opacity', 'filter']
        ),
        edgesNow: await edges(page),
    };
});
def('edit-card', L, PHONE, async (page) => {
    await demo(page);
    await openEdit(page, 'owners');
    return {
        card: await probe(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity):has(input) > span > div'
        ),
        viewport: await viewport(page),
    };
});
def('edit-card-type-popup', L, DESKTOP, async (page) => {
    await demo(page);
    await openEdit(page, 'owners');
    await page
        .locator(
            ':is(.react-flow__node-table,.react-flow__node-entity):has(input) [aria-haspopup=dialog].h-8'
        )
        .first()
        .click();
    await settle(page, 600);
    return {
        popup: await probe(page, '[data-radix-popper-content-wrapper] > *'),
        items: await probeAll(
            page,
            '[data-radix-popper-content-wrapper] [role=option], [data-radix-popper-content-wrapper] [cmdk-item]',
            8,
            ['height', 'fontSize', 'backgroundColor']
        ),
    };
});
def('edit-card-colour-popup', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await openEdit(page, 'owners');
    const sw = page
        .locator(
            ':is(.react-flow__node-table,.react-flow__node-entity):has(input) [aria-haspopup=dialog]'
        )
        .last();
    await sw.click();
    await settle(page, 600);
    return {
        popup: await probe(page, '[data-radix-popper-content-wrapper] > *'),
        swatches: await probeAll(
            page,
            '[data-radix-popper-content-wrapper] button[class*="size-8"]',
            14,
            [
                'backgroundColor',
                'width',
                'height',
                'borderTopColor',
                'borderTopWidth',
            ]
        ),
        swatchNames: await page.evaluate(() =>
            [
                ...document.querySelectorAll(
                    '[data-radix-popper-content-wrapper] button[class*="size-8"]'
                ),
            ].map(
                (b) =>
                    b.getAttribute('aria-label') ||
                    b.title ||
                    b.style.backgroundColor
            )
        ),
        hex: await probe(page, '[data-radix-popper-content-wrapper] input'),
    };
});
def('table-colour-applied', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await openEdit(page, 'owners');
    await page
        .locator(
            ':is(.react-flow__node-table,.react-flow__node-entity):has(input) [aria-haspopup=dialog]'
        )
        .last()
        .click();
    await settle(page, 400);
    await page
        .locator('[data-radix-popper-content-wrapper] button[class*="size-8"]')
        .nth(8)
        .click();
    await settle(page, 400);
    await page.keyboard.press('Escape');
    await page.mouse.click(1100, 650);
    await settle(page, 500);
    return { owners: await tableParts(page, 'owners') };
});
def('edit-card-add-field', L, DESKTOP, async (page) => {
    await demo(page);
    await openEdit(page, 'vets');
    await page.getByRole('button', { name: 'Add Field' }).click();
    await settle(page, 600);
    return {
        card: await probe(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity):has(input) > span > div'
        ),
    };
});

// 3. relationship lines
def('edge-default', BOTH, DESKTOP, async (page) => {
    await demo(page);
    return {
        edges: await edges(page),
        markers: await page.evaluate(() =>
            [...document.querySelectorAll('marker')].map((m) => ({
                id: m.id,
                w: m.getAttribute('markerWidth'),
                h: m.getAttribute('markerHeight'),
                refX: m.getAttribute('refX'),
                circle: m.querySelector('circle') && {
                    r: m.querySelector('circle').getAttribute('r'),
                    fill: getComputedStyle(m.querySelector('circle')).fill,
                },
                label: m.querySelector('text')?.textContent,
            }))
        ),
    };
});
def('edge-hover', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const m = await edgeMid(page, 0);
    await page.mouse.move(m.x, m.y);
    await settle(page, 500);
    return {
        mid: m,
        edges: await edges(page),
        handleDot: await probe(page, '.react-flow__edgelabel-renderer > *'),
        cursor: await probe(page, '.react-flow__edge', 0, ['cursor']),
    };
});
def('edge-selected', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const m = await edgeMid(page, 3);
    await page.mouse.click(m.x, m.y);
    await settle(page, 500);
    return {
        mid: m,
        edges: await edges(page),
        dot: await probe(
            page,
            '.react-flow__edgelabel-renderer > * button, .react-flow__edgelabel-renderer button'
        ),
        highlighted: await probeAll(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity) .bg-teal-500\\/20, :is(.react-flow__node-table,.react-flow__node-entity) [class*="bg-teal"]',
            6,
            ['backgroundColor']
        ),
    };
});
def('edge-popover', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const m = await edgeMid(page, 3);
    await page.mouse.click(m.x, m.y);
    await settle(page, 300);
    await page.mouse.click(m.x, m.y);
    await settle(page, 600);
    return {
        popover: await probeCardWith(page, '1:1'),
    };
});
def('edge-popover-one-to-one', L, DESKTOP, async (page) => {
    await demo(page);
    const m = await edgeMid(page, 2);
    await page.mouse.click(m.x, m.y);
    await settle(page, 300);
    await page.mouse.click(m.x, m.y);
    await settle(page, 600);
    return { edges: await edges(page) };
});
def('edge-self-or-cardinality-zoom', L, DESKTOP, async (page) => {
    await demo(page);
    for (let i = 0; i < 3; i++)
        await page.getByRole('button', { name: 'Zoom In' }).click();
    await settle(page, 700);
    return { edges: await edges(page), viewport: await viewport(page) };
});
def('link-drag-preview', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const src = await box(page, 'vets');
    const dst = await box(page, 'owners');
    await page.mouse.move(src.x + src.width / 2, src.y + 30);
    await settle(page, 300);
    const handle = await page.evaluate((nm) => {
        const n = [
            ...document.querySelectorAll(
                ':is(.react-flow__node-table,.react-flow__node-entity)'
            ),
        ].find((x) => new RegExp(`^\\s*${nm}\\b`).test(x.innerText));
        return [...n.querySelectorAll('.react-flow__handle.source')].map(
            (h) => {
                const r = h.getBoundingClientRect();
                return {
                    x: r.x + r.width / 2,
                    y: r.y + r.height / 2,
                    w: r.width,
                    h: r.height,
                    pos: h.getAttribute('data-handlepos'),
                    id: h.getAttribute('data-handleid'),
                };
            }
        );
    }, 'vets');
    const h =
        handle.find((x) => x.w > 0 && x.x > src.x + src.width / 2) ||
        handle[handle.length - 1];
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(dst.x - 40, dst.y + 80, { steps: 10 });
    await settle(page, 300);
    const preview = await page.evaluate(() => {
        const c = document.querySelector('.react-flow__connection path');
        if (!c) return null;
        const cs = getComputedStyle(c);
        return {
            d: c.getAttribute('d'),
            stroke: cs.stroke,
            width: cs.strokeWidth,
            dash: cs.strokeDasharray,
        };
    });
    return {
        handles: handle,
        preview,
        connLine: await probe(page, '.react-flow__connection-path'),
    };
});
def('link-drag-snap-target', L, DESKTOP, async (page) => {
    await demo(page);
    const src = await box(page, 'vets');
    const dst = await box(page, 'owners');
    await page.mouse.move(src.x + src.width - 4, src.y + 30);
    await page.mouse.down();
    await page.mouse.move(dst.x + 40, dst.y + 62, { steps: 12 });
    await settle(page, 300);
    return {
        valid: await probeAll(
            page,
            '.react-flow__handle.connectingto, .react-flow__handle.valid',
            4,
            ['backgroundColor', 'width', 'height']
        ),
        classes: await page.evaluate(() =>
            [...document.querySelectorAll('.react-flow__handle')]
                .filter((h) => /connecting|valid/.test(h.className))
                .map((h) => h.className.slice(0, 160))
        ),
        preview: await probe(page, '.react-flow__connection-path'),
    };
});
def('link-quick-card', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const b = await box(page, 'vets');
    await ctx(page, b.x + 30, b.y + 10);
    await page.getByRole('menuitem', { name: 'Add Relationship' }).click();
    await settle(page, 700);
    return {
        card: await probe(
            page,
            '[role=dialog], [data-radix-popper-content-wrapper] > *'
        ),
        fields: await probeAll(
            page,
            '[role=dialog] button, [role=dialog] label',
            14,
            ['height', 'fontSize', 'color']
        ),
    };
});

// 4. areas and notes
async function newAt(page, kind, x, y) {
    await ctx(page, x, y);
    await page.getByRole('menuitem', { name: kind }).click();
    await settle(page, 700);
}
def('area-default', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Area', 960, 180);
    const sel = ':is(.react-flow__node-area,.react-flow__node-region)';
    return {
        node: await probe(page, sel),
        body: await probe(page, `${sel} > span > div`),
        header: await probe(page, `${sel} .h-8`),
        title: await probe(page, `${sel} .text-editable`),
        grip: await probe(page, `${sel} .h-8 svg`),
        resize: await probeAll(page, `${sel} .react-flow__resize-control`, 8, [
            'width',
            'height',
            'backgroundColor',
            'cursor',
            'borderTopColor',
        ]),
    };
});
def('area-selected', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Area', 960, 180);
    const a = await page
        .locator(':is(.react-flow__node-area,.react-flow__node-region)')
        .boundingBox();
    await page.mouse.click(a.x + 150, a.y + 100);
    await settle(page, 500);
    return {
        body: await probe(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region) > span > div'
        ),
        resize: await probeAll(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region) .react-flow__resize-control',
            8,
            [
                'width',
                'height',
                'backgroundColor',
                'borderTopColor',
                'borderTopWidth',
            ]
        ),
        cls: await page.evaluate(
            () =>
                document.querySelector(
                    ':is(.react-flow__node-area,.react-flow__node-region)'
                ).className
        ),
    };
});
def('area-hover-pencil', L, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Area', 960, 180);
    const a = await page
        .locator(':is(.react-flow__node-area,.react-flow__node-region)')
        .boundingBox();
    await page.mouse.move(a.x + 60, a.y + 16);
    await settle(page, 400);
    return {
        pencil: await probe(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region) button'
        ),
        area: await probe(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region)'
        ),
    };
});
def('area-resize-drag', L, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Area', 960, 180);
    const a = await page
        .locator(':is(.react-flow__node-area,.react-flow__node-region)')
        .boundingBox();
    await page.mouse.click(a.x + 150, a.y + 100);
    const before = await probe(
        page,
        ':is(.react-flow__node-area,.react-flow__node-region)'
    );
    await page.mouse.move(a.x + a.width - 1, a.y + a.height - 1);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width + 80, a.y + a.height + 60, {
        steps: 6,
    });
    await settle(page, 300);
    const during = await probe(
        page,
        ':is(.react-flow__node-area,.react-flow__node-region)'
    );
    const cursor = await probe(
        page,
        '.react-flow__resize-control.bottom.right',
        0,
        ['cursor']
    );
    await page.mouse.up();
    return {
        before,
        during,
        after: await probe(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region)'
        ),
        cursor,
        minSizeTry: null,
    };
});
def('area-with-tables', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const b = await box(page, 'vets');
    await newAt(page, 'New Area', b.x - 40, b.y - 60);
    await ctx(page, b.x + 30, b.y + 10);
    await page.getByRole('menuitem', { name: 'Move to Area' }).hover();
    await settle(page, 500);
    const shot = await page.getByRole('menuitem').allInnerTexts();
    await page
        .getByRole('menuitem', { name: 'Area 1' })
        .first()
        .click()
        .catch(() => undefined);
    await settle(page, 600);
    return {
        submenu: shot,
        area: await probe(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region)'
        ),
        vets: await probe(page, 'T[vets]'),
        zAreas: await probeAll(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region), :is(.react-flow__node-table,.react-flow__node-entity)',
            8,
            ['zIndex']
        ),
    };
});
def('area-colour-popup', L, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Area', 960, 180);
    const a = await page
        .locator(':is(.react-flow__node-area,.react-flow__node-region)')
        .boundingBox();
    await page.mouse.click(a.x + 150, a.y + 100, { button: 'right' });
    await settle(page, 500);
    const items = await page.getByRole('menuitem').allInnerTexts();
    return { items, menu: await probe(page, '[role=menu]') };
});
def('area-edit-title', L, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Area', 960, 180);
    await page
        .locator(
            ':is(.react-flow__node-area,.react-flow__node-region) .text-editable'
        )
        .dblclick();
    await settle(page, 500);
    await page.keyboard.type('Billing');
    await settle(page, 300);
    return {
        input: await probe(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region) input'
        ),
        area: await probe(
            page,
            ':is(.react-flow__node-area,.react-flow__node-region)'
        ),
    };
});
def('note-default', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Note', 960, 560);
    const sel = ':is(.react-flow__node-note,.react-flow__node-memo)';
    return {
        node: await probe(page, sel),
        body: await probe(page, `${sel} > div`),
        bar: await probe(page, `${sel} > div > div:first-child`),
        text: await probe(page, `${sel} .italic`),
        fold: await probe(page, `${sel} .absolute.bottom-0`),
        toolbar: await probe(page, `${sel} .absolute.right-2`),
    };
});
def('note-hover-toolbar', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Note', 960, 560);
    const a = await page
        .locator(':is(.react-flow__node-note,.react-flow__node-memo)')
        .boundingBox();
    await page.mouse.move(a.x + 60, a.y + 60);
    await settle(page, 500);
    return {
        toolbar: await probe(
            page,
            ':is(.react-flow__node-note,.react-flow__node-memo) .absolute.right-2'
        ),
        buttons: await probeAll(
            page,
            ':is(.react-flow__node-note,.react-flow__node-memo) .absolute.right-2 > *',
            4,
            ['width', 'height', 'backgroundColor', 'color']
        ),
    };
});
async function writeNote(page, md) {
    const a = await page
        .locator(':is(.react-flow__node-note,.react-flow__node-memo)')
        .boundingBox();
    await page.mouse.dblclick(a.x + 60, a.y + 60);
    await settle(page, 500);
    await page.keyboard.insertText(md);
    await settle(page, 300);
}
const MD =
    '# Title\n\nSome **bold**, *italic* and `code`.\n\n- first\n- second\n\n1. one\n2. two\n\n> quote\n\n[link](https://example.com)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
def('note-editing', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Note', 960, 460);
    await writeNote(page, MD);
    return {
        textarea: await probe(
            page,
            ':is(.react-flow__node-note,.react-flow__node-memo) textarea'
        ),
        node: await probe(
            page,
            ':is(.react-flow__node-note,.react-flow__node-memo)'
        ),
    };
});
def('note-markdown', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Note', 960, 460);
    await writeNote(page, MD);
    await page.mouse.click(520, 700);
    await settle(page, 500);
    const sel = ':is(.react-flow__node-note,.react-flow__node-memo)';
    return {
        node: await probe(page, sel),
        h1: await probe(page, `${sel} h1`),
        strong: await probe(page, `${sel} strong`),
        code: await probe(page, `${sel} code`),
        li: await probe(page, `${sel} li`),
        quote: await probe(page, `${sel} blockquote`),
        link: await probe(page, `${sel} a`),
        table: await probe(page, `${sel} table`),
        p: await probe(page, `${sel} p`),
    };
});
def('note-colour-popup', L, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Note', 960, 460);
    const a = await page
        .locator(':is(.react-flow__node-note,.react-flow__node-memo)')
        .boundingBox();
    await page.mouse.move(a.x + 60, a.y + 60);
    await page.getByRole('button', { name: 'Change color' }).click();
    await settle(page, 500);
    return {
        popup: await probe(page, '[data-radix-popper-content-wrapper] > *'),
        swatches: await probeAll(
            page,
            '[data-radix-popper-content-wrapper] button[class*="size-"], [data-radix-popper-content-wrapper] [role=button]',
            16,
            ['backgroundColor', 'width', 'height']
        ),
    };
});

// 5. minimap, corner tools, legends, menus
def('minimap-demo', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Area', 960, 180);
    await newAt(page, 'New Note', 960, 560);
    return {
        chrome: await chrome(page),
        nodes: await page.evaluate(() =>
            [...document.querySelectorAll('.react-flow__minimap-node')].map(
                (n) => ({
                    fill: getComputedStyle(n).fill,
                    stroke: getComputedStyle(n).stroke,
                    w: n.getAttribute('width'),
                    h: n.getAttribute('height'),
                    cls: n.getAttribute('class'),
                })
            )
        ),
    };
});
def('corner-tools-hover', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const out = {};
    for (const name of [
        'Zoom In',
        'Zoom Out',
        'Show All',
        'Undo',
        'Redo',
        'Auto Arrange Diagram',
        'Highlight Overlapping Tables',
        'Filter Tables',
        'Snap to Grid (Hold Shift)',
    ]) {
        const btn = page.getByRole('button', { name, exact: true }).first();
        if (!(await btn.count())) continue;
        await btn.hover({ force: true, timeout: 3000 }).catch(() => undefined);
        await settle(page, 900);
        out[name] = {
            button: await probe(page, `button[aria-label="${name}"]`),
            tip: await page.evaluate(() => {
                const t = document.querySelector('[role=tooltip]');
                if (!t) return null;
                const r = t.getBoundingClientRect();
                const cs = getComputedStyle(t.parentElement);
                return {
                    text: t.textContent,
                    w: r.width,
                    h: r.height,
                    bg: cs.backgroundColor,
                    color: cs.color,
                    fs: cs.fontSize,
                };
            }),
        };
    }
    return {
        out,
        toolbarText: await page.evaluate(
            () =>
                document.querySelector('.react-flow__controls.horizontal')
                    ?.innerText
        ),
        percent: await probe(
            page,
            '.react-flow__controls.horizontal button:not([aria-label])'
        ),
    };
});
def('corner-tools', BOTH, PHONE, async (page) => {
    await demo(page);
    return {
        chrome: await chrome(page),
        buttons: await probeAll(page, '.react-flow__controls button', 12, [
            'width',
            'height',
        ]),
    };
});
def('highlight-overlap', L, DESKTOP, async (page) => {
    await demo(page);
    const a = await box(page, 'owners');
    const c = await box(page, 'vets');
    await page.mouse.move(c.x + c.width / 2, c.y + 8);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 20, a.y + 40, { steps: 10 });
    await page.mouse.up();
    await settle(page, 400);
    await page
        .getByRole('button', { name: 'Highlight Overlapping Tables' })
        .click();
    await settle(page, 800);
    return {
        buttonOn: await probe(
            page,
            'button[aria-label="Highlight Overlapping Tables"]'
        ),
        tables: await probeAll(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity) > span > div',
            6,
            ['borderTopColor', 'backgroundColor', 'boxShadow', 'opacity']
        ),
        chip: await page.evaluate(() =>
            [
                ...document.querySelectorAll(
                    '[class*="amber"],[class*="red-"],[class*="orange"]'
                ),
            ]
                .slice(0, 6)
                .map((n) => n.className.toString().slice(0, 120))
        ),
    };
});
def('filter-panel', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await page.getByRole('button', { name: 'Filter Tables' }).click();
    await settle(page, 700);
    return {
        popup: await probeCardWith(page, 'Filter Tables'),
        rows: await probeAll(page, 'svg.lucide-eye', 6, [
            'width',
            'height',
            'color',
        ]),
    };
});
def('type-legend', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await page.getByText('Type colours').click();
    await settle(page, 600);
    return {
        button: await page
            .getByText('Type colours')
            .first()
            .boundingBox()
            .catch(() => null),
        popup: await probe(page, '[data-radix-popper-content-wrapper] > *'),
        chips: await probeAll(
            page,
            '[data-radix-popper-content-wrapper] .font-mono, [data-radix-popper-content-wrapper] [class*="font-mono"]',
            8,
            [
                'color',
                'backgroundColor',
                'fontSize',
                'fontWeight',
                'width',
                'height',
            ]
        ),
        text: await page.evaluate(
            () =>
                document.querySelector('[data-radix-popper-content-wrapper]')
                    ?.innerText
        ),
    };
});
def('type-chip-tints', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await nodeByName(page, 'pets').getByText('Show More').click();
    await settle(page, 600);
    return {
        chips: await page.evaluate(() =>
            [
                ...document.querySelectorAll(
                    ':is(.react-flow__node-table,.react-flow__node-entity) .h-8 .font-mono'
                ),
            ].map((c) => {
                const cs = getComputedStyle(c);
                return {
                    type: c.textContent.trim(),
                    color: cs.color,
                    bg: cs.backgroundColor,
                    cls: c.className.slice(-70),
                    fs: cs.fontSize,
                    fw: cs.fontWeight,
                    w: +c.getBoundingClientRect().width.toFixed(1),
                    h: +c.getBoundingClientRect().height.toFixed(1),
                };
            })
        ),
    };
});
def('ctx-menu-pane', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await ctx(page, 1000, 250);
    return {
        menu: await probe(page, '[role=menu]'),
        items: await probeAll(page, '[role=menuitem]', 8, [
            'height',
            'fontSize',
            'color',
            'paddingLeft',
        ]),
        seps: await probeAll(page, '[role=menu] [role=separator]', 6, [
            'height',
            'backgroundColor',
        ]),
    };
});
def('ctx-menu-table', BOTH, DESKTOP, async (page) => {
    await demo(page);
    const b = await box(page, 'pets');
    await ctx(page, b.x + 60, b.y + 30);
    return {
        menu: await probe(page, '[role=menu]'),
        items: await probeAll(page, '[role=menuitem]', 8, [
            'height',
            'fontSize',
            'color',
        ]),
        selected: await probe(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity).selected'
        ),
    };
});
def('ctx-menu-submenu', L, DESKTOP, async (page) => {
    await demo(page);
    await newAt(page, 'New Area', 960, 180);
    const b = await box(page, 'pets');
    await ctx(page, b.x + 60, b.y + 30);
    await page.getByRole('menuitem', { name: 'Move to Area' }).hover();
    await settle(page, 600);
    return {
        menus: await probeAll(page, '[role=menu]', 3, ['width', 'height']),
    };
});
def('ctx-menu-pane', L, PHONE, async (page) => {
    await demo(page);
    await ctx(page, 200, 300);
    return { menu: await probe(page, '[role=menu]') };
});
def('arrange-confirm', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await page.getByRole('button', { name: 'Auto Arrange Diagram' }).click();
    await settle(page, 700);
    return {
        dialog: await probe(page, '[role=alertdialog], [role=dialog]'),
        buttons: await probeAll(
            page,
            '[role=alertdialog] button, [role=dialog] button',
            4,
            ['height', 'backgroundColor', 'color']
        ),
        overlay: await probe(
            page,
            '[data-state=open][class*="bg-black"], [data-state=open][class*="bg-background"]'
        ),
    };
});
def('arrange-applied', L, DESKTOP, async (page) => {
    await demo(page);
    await page.getByRole('button', { name: 'Auto Arrange Diagram' }).click();
    await page
        .getByRole('button', { name: 'Auto Arrange', exact: true })
        .click();
    await settle(page, 1500);
    return {
        nodes: await page.evaluate(() =>
            [
                ...document.querySelectorAll(
                    ':is(.react-flow__node-table,.react-flow__node-entity)'
                ),
            ].map((n) => ({
                t: n.style.transform,
                text: n.innerText.slice(0, 8),
            }))
        ),
        viewport: await viewport(page),
    };
});

// 6. zoom, pan and fit behaviour
def('zoom-limits', L, DESKTOP, async (page) => {
    await demo(page);
    const steps = [];
    for (let i = 0; i < 14; i++) {
        await page.getByRole('button', { name: 'Zoom In' }).click();
        await settle(page, 120);
        steps.push(
            await page.evaluate(
                () =>
                    document.querySelector(
                        '.react-flow__controls.horizontal button:not([aria-label])'
                    )?.textContent
            )
        );
    }
    await settle(page, 500);
    const max = await viewport(page);
    const outSteps = [];
    for (let i = 0; i < 25; i++) {
        await page.getByRole('button', { name: 'Zoom Out' }).click();
        await settle(page, 120);
        outSteps.push(
            await page.evaluate(
                () =>
                    document.querySelector(
                        '.react-flow__controls.horizontal button:not([aria-label])'
                    )?.textContent
            )
        );
    }
    await settle(page, 500);
    return {
        zoomInSteps: steps,
        max,
        zoomOutSteps: outSteps,
        min: await viewport(page),
        zoomInDisabled: await probe(page, 'button[aria-label="Zoom In"]', 0, [
            'opacity',
        ]),
        zoomOutDisabled: await probe(page, 'button[aria-label="Zoom Out"]', 0, [
            'opacity',
        ]),
    };
});
def('wheel-behaviour', L, DESKTOP, async (page) => {
    await demo(page);
    const v0 = await viewport(page);
    await page.mouse.move(900, 300);
    await page.mouse.wheel(0, 200);
    await settle(page, 400);
    const v1 = await viewport(page);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -200);
    await page.keyboard.up('Control');
    await settle(page, 400);
    const v2 = await viewport(page);
    return { v0, afterPlainWheel: v1, afterCtrlWheel: v2 };
});
def('fit-animation', L, DESKTOP, async (page) => {
    await demo(page);
    for (let i = 0; i < 3; i++)
        await page.getByRole('button', { name: 'Zoom In' }).click();
    await settle(page, 700);
    await page.evaluate(() => {
        window.__samples = [];
        const t0 = performance.now();
        const tick = () => {
            const v = document.querySelector('.react-flow__viewport');
            window.__samples.push([
                Math.round(performance.now() - t0),
                v && v.style.transform,
            ]);
            if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
        };
        tick();
    });
    await page.getByRole('button', { name: 'Show All' }).click();
    await settle(page, 1700);
    const samples = await page.evaluate(() => window.__samples);
    const changes = samples.filter(
        (s, i) => i === 0 || s[1] !== samples[i - 1][1]
    );
    return {
        firstChange: changes[1]?.[0],
        lastChange: changes[changes.length - 1]?.[0],
        count: changes.length,
        head: changes.slice(0, 3),
        tail: changes.slice(-3),
    };
});
def('pinch-and-pan', L, PHONE, async (page) => {
    await demo(page);
    const v0 = await viewport(page);
    const client = await page.context().newCDPSession(page);
    const touch = (type, pts) =>
        client.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await touch('touchStart', [
        { x: 150, y: 400 },
        { x: 250, y: 400 },
    ]);
    for (let i = 1; i <= 8; i++)
        await touch('touchMove', [
            { x: 150 - i * 10, y: 400 },
            { x: 250 + i * 10, y: 400 },
        ]);
    await touch('touchEnd', []);
    await settle(page, 500);
    const v1 = await viewport(page);
    await touch('touchStart', [{ x: 200, y: 300 }]);
    for (let i = 1; i <= 8; i++)
        await touch('touchMove', [{ x: 200 + i * 8, y: 300 + i * 6 }]);
    await touch('touchEnd', []);
    await settle(page, 400);
    return { v0, afterPinch: v1, afterPan: await viewport(page) };
});
def('auto-pan-edge-drag', L, DESKTOP, async (page) => {
    await demo(page);
    const v0 = await viewport(page);
    const b = await box(page, 'owners');
    await page.mouse.move(b.x + b.width / 2, b.y + 8);
    await page.mouse.down();
    await page.mouse.move(1272, b.y + 8, { steps: 8 });
    await settle(page, 1200);
    const v1 = await viewport(page);
    await page.mouse.up();
    return { v0, duringEdgeHold: v1 };
});
def('table-keyboard-focus', BOTH, DESKTOP, async (page) => {
    await demo(page);
    await page.keyboard.press('Tab');
    for (let i = 0; i < 12; i++) {
        const onNode = await page.evaluate(() =>
            document.activeElement?.classList.contains('react-flow__node')
        );
        if (onNode) break;
        await page.keyboard.press('Tab');
    }
    await settle(page, 400);
    return {
        focused: await probe(
            page,
            '.react-flow__node:focus, .react-flow__node:focus-visible'
        ),
        inner: await probe(page, '.react-flow__node:focus > span > div'),
    };
});

// 7. DBML diff marks
def('dbml-diff', L, DESKTOP, async (page) => {
    await demo(page);
    await page.getByText('DBML', { exact: true }).first().click();
    await settle(page, 800);
    const ed = page.locator('.monaco-editor textarea').last();
    await ed.focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText(
        '\nTable extra_table {\n  id integer [pk]\n}\n'
    );
    await settle(page, 1500);
    return {
        text: await page.evaluate(() => document.body.innerText.slice(0, 600)),
        nodes: await probeAll(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity)',
            10,
            ['opacity']
        ),
        badges: await page.evaluate(() =>
            [
                ...document.querySelectorAll(
                    ':is(.react-flow__node-table,.react-flow__node-entity) [class*="emerald"],:is(.react-flow__node-table,.react-flow__node-entity) [class*="green"],:is(.react-flow__node-table,.react-flow__node-entity) [class*="red"]'
                ),
            ]
                .slice(0, 6)
                .map((n) => n.className.toString().slice(0, 140))
        ),
    };
});

// 8. new diagram creation of a table through the UI, view tables
def('add-table-ui', BOTH, DESKTOP, async (page) => {
    await emptyDiagram(page);
    await page.getByRole('button', { name: 'Add Table' }).first().click();
    await settle(page, 900);
    return {
        chrome: await chrome(page),
        table: await tableParts(page, 'table_1'),
        allTables: await probeAll(
            page,
            ':is(.react-flow__node-table,.react-flow__node-entity)',
            3,
            ['opacity']
        ),
        viewport: await viewport(page),
    };
});

export const scenes = defs.map(({ name, viewport, theme, run }) => ({
    name,
    viewport,
    theme,
    run,
}));
