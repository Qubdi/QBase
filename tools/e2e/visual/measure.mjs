// Small measurement helpers shared by the scene files. They run inside the page and only read
// computed styles, boxes and attributes of what the user can see.
export const STYLE_PROPS = [
    'color',
    'backgroundColor',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'borderTopWidth',
    'borderTopColor',
    'borderTopLeftRadius',
    'boxShadow',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'opacity',
    'cursor',
    'outlineColor',
    'outlineWidth',
    'outlineOffset',
    'transitionProperty',
    'transitionDuration',
    'textTransform',
];

// Style and box of the first match of a locator (any Playwright locator).
export async function measure(locator, props = STYLE_PROPS) {
    const el = locator.first();
    if ((await el.count()) === 0) return { missing: true };
    return el.evaluate((node, p) => {
        const cs = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        const o = {
            tag: node.tagName.toLowerCase(),
            role: node.getAttribute('role'),
            text: (node.innerText || node.textContent || '')
                .trim()
                .slice(0, 80),
            box: {
                x: Math.round(r.x * 10) / 10,
                y: Math.round(r.y * 10) / 10,
                w: Math.round(r.width * 10) / 10,
                h: Math.round(r.height * 10) / 10,
            },
            style: {},
        };
        for (const k of p) o.style[k] = cs[k];
        return o;
    }, props);
}

// All CSS custom properties declared on :root (and the dark rule) with their computed values.
export async function rootVars(page) {
    return page.evaluate(() => {
        const names = new Set();
        for (const sheet of document.styleSheets) {
            let rules;
            try {
                rules = sheet.cssRules;
            } catch {
                continue;
            }
            const walk = (list) => {
                for (const rule of list) {
                    if (rule.style)
                        for (const n of rule.style)
                            if (
                                n.startsWith('--') &&
                                /^(:root|\.dark|html)/.test(
                                    rule.selectorText || ''
                                )
                            )
                                names.add(n);
                    if (rule.cssRules) walk(rule.cssRules);
                }
            };
            walk(rules);
        }
        const cs = getComputedStyle(document.documentElement);
        const o = {};
        for (const n of [...names].sort()) o[n] = cs.getPropertyValue(n).trim();
        return o;
    });
}

// Boxes + a few styles of every visible element matching a CSS selector (capped).
export async function measureAll(
    page,
    selector,
    props = ['color', 'backgroundColor', 'fontSize', 'fontWeight'],
    cap = 30
) {
    return page.evaluate(
        ([sel, p, c]) =>
            [...document.querySelectorAll(sel)]
                .filter((n) => n.getBoundingClientRect().width > 0)
                .slice(0, c)
                .map((n) => {
                    const cs = getComputedStyle(n);
                    const r = n.getBoundingClientRect();
                    const o = {
                        text: (
                            n.innerText ||
                            n.getAttribute('aria-label') ||
                            ''
                        )
                            .trim()
                            .slice(0, 60),
                        w: Math.round(r.width * 10) / 10,
                        h: Math.round(r.height * 10) / 10,
                    };
                    for (const k of p) o[k] = cs[k];
                    return o;
                }),
        [selector, props, cap]
    );
}

// Automatic inventory of the visible controls and text leaves of the top layer (an open dialog,
// menu, popover or listbox when there is one, else the whole page). Keyed "kind:name" so that
// two runs can be compared field by field.
export async function autoMeasure(page) {
    return page.evaluate(() => {
        const layers = [
            ...document.querySelectorAll(
                '[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper]'
            ),
        ].filter((n) => n.getBoundingClientRect().width > 0);
        const root = layers.length ? layers[layers.length - 1] : document.body;
        const out = {};
        const box = (r) => ({
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
        });
        const seen = new Map();
        const nodes = [root, ...root.querySelectorAll('*')];
        for (const n of nodes) {
            if (Object.keys(out).length >= 140) break;
            const tag = n.tagName.toLowerCase();
            if (
                [
                    'script',
                    'style',
                    'path',
                    'g',
                    'circle',
                    'line',
                    'rect',
                    'polyline',
                    'defs',
                    'clippath',
                ].includes(tag)
            )
                continue;
            const r = n.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            const interactive =
                [
                    'button',
                    'a',
                    'input',
                    'select',
                    'textarea',
                    'h1',
                    'h2',
                    'h3',
                    'h4',
                    'label',
                    'img',
                    'svg',
                ].includes(tag) || n.getAttribute('role');
            const ownText = [...n.childNodes].some(
                (c) => c.nodeType === 3 && c.textContent.trim()
            );
            if (!interactive && !ownText) continue;
            if (tag === 'svg' && n.closest('button,a,[role=menuitem]'))
                continue;
            const name = (
                n.getAttribute('aria-label') ||
                n.getAttribute('alt') ||
                n.getAttribute('placeholder') ||
                n.innerText ||
                n.value ||
                n.getAttribute('title') ||
                ''
            )
                .trim()
                .replace(/\s+/g, ' ')
                .slice(0, 40);
            let key = `${n.getAttribute('role') || tag}:${name}`;
            const c = (seen.get(key) || 0) + 1;
            seen.set(key, c);
            if (c > 1) key += `#${c}`;
            const cs = getComputedStyle(n);
            out[key] = {
                box: box(r),
                color: cs.color,
                bg: cs.backgroundColor,
                font: `${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight} ls=${cs.letterSpacing}`,
                radius: cs.borderTopLeftRadius,
                border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
                shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow,
                pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
                opacity: cs.opacity,
            };
        }
        return out;
    });
}

// Every visible English string of the page, untruncated: text of leaf elements plus aria-label,
// placeholder, title and alt attributes. Each entry says which kind it is and which role or tag
// carries it, so a copy inventory can be written from it.
export async function collectStrings(page) {
    return page.evaluate(() => {
        const out = [];
        const seen = new Set();
        const add = (kind, holder, text) => {
            const t = (text || '').replace(/\s+/g, ' ').trim();
            if (!t) return;
            const key = `${kind}|${holder}|${t}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ kind, holder, text: t });
        };
        for (const n of document.querySelectorAll('body *')) {
            const tag = n.tagName.toLowerCase();
            if (
                [
                    'script',
                    'style',
                    'path',
                    'g',
                    'circle',
                    'line',
                    'rect',
                    'polyline',
                    'defs',
                ].includes(tag)
            )
                continue;
            const r = n.getBoundingClientRect();
            const sr = n.classList.contains('sr-only');
            if ((r.width <= 0 || r.height <= 0) && !sr) continue;
            const holder = n.getAttribute('role') || tag;
            for (const a of ['aria-label', 'placeholder', 'title', 'alt'])
                add(a, holder, n.getAttribute(a));
            const own = [...n.childNodes]
                .filter((c) => c.nodeType === 3)
                .map((c) => c.textContent)
                .join(' ');
            add(sr ? 'sr-only' : 'text', holder, own);
        }
        return out.slice(0, 600);
    });
}
