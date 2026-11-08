// Elements diff: node compare.mjs --elements <dirA> <dirB> [scene filter]
// A is the reference, B the new app. Reads <scene>.elements.json from both (written by run.mjs).
import process from 'node:process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOL = 0.5;

function loadAllow() {
    const f = path.join(here, 'kept-icons.txt');
    if (!existsSync(f)) return [];
    return readFileSync(f, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => {
            if (l.startsWith('/') && l.lastIndexOf('/') > 0) {
                const i = l.lastIndexOf('/');
                const re = new RegExp(l.slice(1, i), l.slice(i + 1));
                return (e) => re.test(e.path) || re.test(e.cls || '');
            }
            if (l.startsWith('box:')) {
                const [x0, y0, x1, y1] = l.slice(4).split(',').map(Number);
                return (e) =>
                    e.box.x >= x0 &&
                    e.box.y >= y0 &&
                    e.box.x + e.box.w <= x1 &&
                    e.box.y + e.box.h <= y1;
            }
            return (e) => e.path.includes(l) || (e.cls || '').includes(l);
        });
}

function category(e) {
    const p = e.path;
    const ctx = /\[dialog\]|\[alertdialog\]/.test(p)
        ? 'dialog '
        : /\[menu\]|\[listbox\]/.test(p)
          ? 'menu '
          : /\[tooltip\]/.test(p)
            ? 'tooltip '
            : '';
    let k;
    if (e.tag === 'svg') k = /key/i.test(p + e.cls) ? 'key icon' : 'icon';
    else if (e.role) k = e.role;
    else if (
        [
            'button',
            'input',
            'select',
            'textarea',
            'a',
            'label',
            'img',
            'table',
            'tr',
            'td',
            'th',
        ].includes(e.tag)
    )
        k = e.tag;
    else if (/chip|badge/i.test(e.cls)) k = 'chip';
    else k = e.text ? 'text' : 'box';
    if (/field/i.test(p) && !ctx) k = 'field ' + k;
    return ctx + k;
}

const area = (e) => Math.max(1, e.box.w * e.box.h);

function matchElements(a, b) {
    const pairs = [];
    const bByPath = new Map(b.map((e) => [e.path, e]));
    const usedB = new Set();
    const restA = [];
    for (const e of a) {
        const m = bByPath.get(e.path);
        if (m && !usedB.has(m)) {
            usedB.add(m);
            pairs.push([e, m, 'path']);
        } else restA.push(e);
    }
    const fb = new Map();
    for (const e of b) {
        if (usedB.has(e)) continue;
        const k = `${e.tag}|${e.role}|${e.text}`;
        (fb.get(k) || fb.set(k, []).get(k)).push(e);
    }
    const missing = [];
    for (const e of restA) {
        const list = fb.get(`${e.tag}|${e.role}|${e.text}`);
        // nearest in order by position
        if (list && list.length) {
            let bi = 0;
            let bd = Infinity;
            list.forEach((c, i) => {
                const d =
                    Math.abs(c.box.x - e.box.x) + Math.abs(c.box.y - e.box.y);
                if (d < bd) {
                    bd = d;
                    bi = i;
                }
            });
            const m = list.splice(bi, 1)[0];
            usedB.add(m);
            pairs.push([e, m, 'order']);
        } else missing.push(e);
    }
    const extra = b.filter((e) => !usedB.has(e));
    return { pairs, missing, extra };
}

function iconDiffs(x, y) {
    const out = [];
    if (!x.svg || !y.svg) return out;
    const A = x.svg,
        B = y.svg;
    for (const k of [
        'viewBox',
        'width',
        'height',
        'stroke',
        'fill',
        'strokeWidth',
    ])
        if (A[k] !== B[k]) out.push(`svg.${k}: ${A[k]} -> ${B[k]}`);
    const na = A.paths.length,
        nb = B.paths.length;
    if (na !== nb) out.push(`svg shapes: ${na} -> ${nb}`);
    for (let i = 0; i < Math.min(na, nb); i++) {
        const p = A.paths[i],
            q = B.paths[i];
        if (p.tag !== q.tag) out.push(`shape[${i}] tag: ${p.tag} -> ${q.tag}`);
        if (p.d !== q.d)
            out.push(
                `shape[${i}].d: ${String(p.d).slice(0, 70)} -> ${String(q.d).slice(0, 70)}`
            );
        for (const k of new Set([
            ...Object.keys(p.attrs),
            ...Object.keys(q.attrs),
        ])) {
            if (p.attrs[k] !== q.attrs[k])
                out.push(`shape[${i}].${k}: ${p.attrs[k]} -> ${q.attrs[k]}`);
        }
    }
    if (
        A.parent &&
        B.parent &&
        (Math.abs(A.parent.w - B.parent.w) > TOL ||
            Math.abs(A.parent.h - B.parent.h) > TOL)
    )
        out.push(
            `icon parent box: ${A.parent.w}x${A.parent.h} -> ${B.parent.w}x${B.parent.h}`
        );
    return out;
}

export function diffScene(a, b, allow) {
    const { pairs, missing, extra } = matchElements(a, b);
    const delta = new Map();
    for (const [x, y] of pairs)
        delta.set(x.path, [y.box.x - x.box.x, y.box.y - x.box.y]);
    const items = [];
    let matched = 0;
    for (const [x, y, how] of pairs) {
        const diffs = [];
        const kept = allow.some((f) => f(x)) || allow.some((f) => f(y));
        const dx = y.box.x - x.box.x,
            dy = y.box.y - x.box.y,
            dw = y.box.w - x.box.w,
            dh = y.box.h - x.box.h;
        if (Math.abs(dw) > TOL || Math.abs(dh) > TOL)
            diffs.push(`size: ${x.box.w}x${x.box.h} -> ${y.box.w}x${y.box.h}`);
        if (Math.abs(dx) > TOL || Math.abs(dy) > TOL) {
            const par = delta.get(x.path.slice(0, x.path.lastIndexOf('/')));
            const cascade =
                par &&
                Math.abs(par[0] - dx) <= TOL &&
                Math.abs(par[1] - dy) <= TOL;
            if (!cascade)
                diffs.push(
                    `pos: (${x.box.x},${x.box.y}) -> (${y.box.x},${y.box.y})`
                );
        }
        const props = [];
        for (const k of Object.keys(x.style)) {
            if (['width', 'height'].includes(k)) continue; // reported through the box
            if (x.style[k] !== y.style[k])
                props.push(`${k}: ${x.style[k]} -> ${y.style[k]}`);
        }
        if (x.text !== y.text) props.push(`text: "${x.text}" -> "${y.text}"`);
        for (const ps of ['::before', '::after']) {
            const p = x.pseudo?.[ps],
                q = y.pseudo?.[ps];
            if (JSON.stringify(p) !== JSON.stringify(q))
                props.push(
                    `${ps}: ${p ? p.content : 'none'} -> ${q ? q.content : 'none'}`
                );
        }
        const icon = iconDiffs(x, y);
        const all = [...diffs, ...props, ...icon];
        if (!all.length) {
            matched++;
            continue;
        }
        items.push({
            kind:
                kept && x.tag === 'svg'
                    ? 'kept new icon'
                    : icon.length
                      ? 'icon'
                      : 'diff',
            kept: kept && x.tag === 'svg',
            cat: category(x),
            path: x.path,
            how,
            details: all,
            impact: area(x) * all.length,
        });
    }
    for (const e of missing)
        items.push({
            kind: 'missing',
            cat: category(e),
            path: e.path,
            details: [
                `box ${e.box.w}x${e.box.h} at (${e.box.x},${e.box.y})${e.text ? ' "' + e.text + '"' : ''}`,
            ],
            impact: area(e) * 10,
        });
    for (const e of extra)
        items.push({
            kind: 'extra',
            cat: category(e),
            path: e.path,
            details: [
                `box ${e.box.w}x${e.box.h} at (${e.box.x},${e.box.y})${e.text ? ' "' + e.text + '"' : ''}`,
            ],
            impact: area(e) * 10,
        });
    items.sort((p, q) => q.impact - p.impact);
    return {
        items,
        matched,
        missing: missing.length,
        extra: extra.length,
        mismatched: items.filter(
            (i) =>
                i.kind === 'diff' ||
                i.kind === 'icon' ||
                i.kind === 'kept new icon'
        ).length,
    };
}

export function runElementsDiff(dirA, dirB, filter) {
    const allow = loadAllow();
    const names = readdirSync(dirA)
        .filter((f) => f.endsWith('.elements.json'))
        .map((f) => f.slice(0, -14))
        .filter((n) => !filter || n.includes(filter))
        .sort();
    const results = [];
    for (const n of names) {
        const fb = path.join(dirB, `${n}.elements.json`);
        if (!existsSync(fb)) {
            results.push({ n, absent: true });
            continue;
        }
        const r = diffScene(
            JSON.parse(
                readFileSync(path.join(dirA, `${n}.elements.json`), 'utf8')
            ),
            JSON.parse(readFileSync(fb, 'utf8')),
            allow
        );
        results.push({ n, ...r });
    }
    let md = `# Elements diff\n\nA (reference): ${dirA}\nB (new): ${dirB}\n\n| scene | matched | mismatched | missing | extra | kept new icon |\n|---|---|---|---|---|---|\n`;
    for (const r of results) {
        md += r.absent
            ? `| ${r.n} | - | - | - | - | not captured in B |\n`
            : `| ${r.n} | ${r.matched} | ${r.mismatched} | ${r.missing} | ${r.extra} | ${r.items.filter((i) => i.kept).length} |\n`;
    }
    const global = [];
    for (const r of results)
        if (!r.absent)
            for (const i of r.items)
                if (!i.kept) global.push({ scene: r.n, ...i });
    // collapse the same mismatch repeated across scenes
    const sig = (i) =>
        `${i.cat}|${i.path.replace(/#\d+/g, '')}|${i.details.join(';')}`;
    const groups = new Map();
    for (const g of global) {
        const s = sig(g);
        const e = groups.get(s) || { ...g, scenes: [] };
        e.scenes.push(g.scene);
        groups.set(s, e);
    }
    const top = [...groups.values()].sort(
        (p, q) => q.impact * q.scenes.length - p.impact * p.scenes.length
    );
    md += `\n## Top mismatches across all scenes (same mismatch repeated in several scenes is merged)\n\n`;
    for (const g of top.slice(0, 60)) {
        md += `- **${g.kind}** [${g.cat}] \`${g.path}\` (${g.scenes.length} scene(s), e.g. ${g.scenes.slice(0, 3).join(', ')}, impact ${Math.round(g.impact)})\n${g.details
            .slice(0, 12)
            .map((d) => `    - ${d}`)
            .join('\n')}\n`;
    }
    const byCat = new Map();
    for (const r of results)
        if (!r.absent)
            for (const i of r.items)
                if (!i.kept) byCat.set(i.cat, (byCat.get(i.cat) || 0) + 1);
    md += `\n## Mismatches by element role\n\n${[...byCat]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `- ${k}: ${v}`)
        .join('\n')}\n`;
    md += `\n## Per scene\n`;
    for (const r of results) {
        if (r.absent || !r.items.length) continue;
        md += `\n### ${r.n}\n`;
        const cats = new Map();
        for (const i of r.items)
            (cats.get(i.cat) || cats.set(i.cat, []).get(i.cat)).push(i);
        for (const [c, list] of [...cats].sort(
            (a, b) => b[1][0].impact - a[1][0].impact
        )) {
            md += `\n**${c}** (${list.length})\n`;
            for (const i of list.slice(0, 15))
                md += `- ${i.kind}${i.kept ? '' : ''} \`${i.path}\`: ${i.details.slice(0, 8).join('; ')}\n`;
            if (list.length > 15) md += `- ... ${list.length - 15} more\n`;
        }
    }
    const outMd =
        process.env.OUT_MD ||
        path.join(path.dirname(path.resolve(dirB)), 'elements-diff.md');
    writeFileSync(outMd, md);
    console.log('scene'.padEnd(44) + 'matched mismatched missing extra kept');
    for (const r of results) {
        console.log(
            r.absent
                ? `${r.n.padEnd(44)}not captured in B`
                : `${r.n.padEnd(44)}${String(r.matched).padStart(7)} ${String(r.mismatched).padStart(10)} ${String(r.missing).padStart(7)} ${String(r.extra).padStart(5)} ${String(r.items.filter((i) => i.kept).length).padStart(4)}`
        );
    }
    console.log(`\nTop mismatches:`);
    top.slice(0, 25).forEach((g, i) =>
        console.log(
            `${i + 1}. ${g.kind} [${g.cat}] ${g.path} x${g.scenes.length} (${g.scenes[0]})\n     ${g.details.slice(0, 6).join('\n     ')}`
        )
    );
    console.log(`\nreport: ${outMd}`);
    return top;
}
