// Dump of every visible element on the page (app root, popovers, menus, dialogs, portals):
// stable path, tag, role, own text, box, curated computed styles, SVG details, pseudo-elements.
// Used by run.mjs (writes <scene>.elements.json) and read by compare.mjs --elements.
export const ELEMENT_STYLE_PROPS = [
    'display',
    'position',
    'width',
    'height',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopColor',
    'borderRightColor',
    'borderBottomColor',
    'borderLeftColor',
    'borderTopStyle',
    'borderTopLeftRadius',
    'borderTopRightRadius',
    'borderBottomLeftRadius',
    'borderBottomRightRadius',
    'backgroundColor',
    'backgroundImage',
    'color',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'textTransform',
    'textDecorationLine',
    'opacity',
    'boxShadow',
    'gap',
    'flexDirection',
    'flexWrap',
    'flexGrow',
    'flexShrink',
    'flexBasis',
    'alignItems',
    'justifyContent',
    'overflowX',
    'overflowY',
    'cursor',
    'zIndex',
    'transform',
    'filter',
    'outlineStyle',
    'outlineWidth',
    'outlineColor',
    'outlineOffset',
    'whiteSpace',
    'textOverflow',
    'visibility',
    'pointerEvents',
];

export async function dumpElements(page) {
    return page.evaluate((props) => {
        const SKIP = new Set([
            'SCRIPT',
            'STYLE',
            'NOSCRIPT',
            'LINK',
            'META',
            'HEAD',
            'TITLE',
            'BR',
        ]);
        const r1 = (n) => Math.round(n * 10) / 10;
        const out = [];
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        const own = (el) => {
            let t = '';
            for (const c of el.childNodes)
                if (c.nodeType === 3) t += c.textContent;
            return clean(t);
        };
        const name = (el) =>
            clean(
                el.getAttribute('aria-label') ||
                    el.getAttribute('title') ||
                    el.getAttribute('placeholder') ||
                    el.getAttribute('data-testid') ||
                    own(el) ||
                    el.getAttribute('name') ||
                    ''
            );
        const roleOf = (el) => el.getAttribute('role') || '';
        const stylesOf = (cs) => {
            const s = {};
            for (const p of props) s[p] = cs[p];
            return s;
        };
        const visible = (el, cs, r) => {
            if (cs.display === 'none' || cs.visibility === 'hidden')
                return false;
            if (r.width === 0 && r.height === 0 && !(el instanceof SVGElement))
                return false;
            return true;
        };
        const walk = (el, parentPath) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none') return;
            const r = el.getBoundingClientRect();
            const key = `${el.tagName.toLowerCase()}${roleOf(el) ? '[' + roleOf(el) + ']' : ''}${name(el) ? '"' + name(el) + '"' : ''}`;
            const siblings =
                walk.counts.get(parentPath) ||
                (walk.counts.set(parentPath, new Map()),
                walk.counts.get(parentPath));
            const idx = siblings.get(key) || 0;
            siblings.set(key, idx + 1);
            const p = `${parentPath}/${key}${idx ? '#' + idx : ''}`;
            const vis = visible(el, cs, r);
            if (vis) {
                const e = {
                    path: p,
                    tag: el.tagName.toLowerCase(),
                    role: roleOf(el),
                    cls:
                        typeof el.className === 'string'
                            ? el.className.slice(0, 200)
                            : '',
                    text: own(el),
                    box: {
                        x: r1(r.x),
                        y: r1(r.y),
                        w: r1(r.width),
                        h: r1(r.height),
                    },
                    style: stylesOf(cs),
                };
                for (const a of [
                    'type',
                    'aria-label',
                    'aria-expanded',
                    'aria-selected',
                    'aria-checked',
                    'data-state',
                    'disabled',
                    'href',
                    'placeholder',
                    'value',
                ]) {
                    const v = el.getAttribute(a);
                    if (v !== null) (e.attrs ||= {})[a] = v.slice(0, 100);
                }
                for (const ps of ['::before', '::after']) {
                    const pc = getComputedStyle(el, ps);
                    if (
                        pc.content &&
                        pc.content !== 'none' &&
                        pc.content !== 'normal'
                    ) {
                        (e.pseudo ||= {})[ps] = {
                            content: pc.content,
                            ...stylesOf(pc),
                        };
                    }
                }
                if (el instanceof SVGSVGElement) {
                    e.svg = {
                        outer: el.outerHTML.slice(0, 4000),
                        viewBox: el.getAttribute('viewBox'),
                        width: el.getAttribute('width'),
                        height: el.getAttribute('height'),
                        stroke: el.getAttribute('stroke'),
                        fill: el.getAttribute('fill'),
                        strokeWidth: el.getAttribute('stroke-width'),
                        paths: [
                            ...el.querySelectorAll(
                                'path,circle,rect,line,polyline,polygon,ellipse'
                            ),
                        ].map((n) => ({
                            tag: n.tagName.toLowerCase(),
                            d: n.getAttribute('d'),
                            attrs: Object.fromEntries(
                                [...n.attributes]
                                    .filter((a) => a.name !== 'd')
                                    .map((a) => [a.name, a.value])
                            ),
                        })),
                        parent: el.parentElement
                            ? (() => {
                                  const pr =
                                      el.parentElement.getBoundingClientRect();
                                  return {
                                      tag: el.parentElement.tagName.toLowerCase(),
                                      x: r1(pr.x),
                                      y: r1(pr.y),
                                      w: r1(pr.width),
                                      h: r1(pr.height),
                                  };
                              })()
                            : null,
                    };
                }
                out.push(e);
            }
            if (el instanceof SVGSVGElement) return; // children are described by the svg entry
            for (const c of el.children) if (!SKIP.has(c.tagName)) walk(c, p);
        };
        walk.counts = new Map();
        walk(document.body, '');
        return out;
    }, ELEMENT_STYLE_PROPS);
}
