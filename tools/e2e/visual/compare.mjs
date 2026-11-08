// Compare two reference folders. Usage: node compare.mjs <old-dir> <new-dir>
// Prints the pixel difference percent per scene, writes diff PNGs to <parent>/diff (or DIFF_DIR),
// and lists measurement fields that differ between the two JSON files.
import process from 'node:process';
import { createRequire } from 'node:module';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';

if (process.argv[2] === '--elements') {
    const [, , , dirA, dirB, filter] = process.argv;
    if (!dirA || !dirB) {
        console.error(
            'usage: node compare.mjs --elements <dirA> <dirB> [scene filter]'
        );
        process.exit(2);
    }
    const { runElementsDiff } = await import('./elements-diff.mjs');
    runElementsDiff(dirA, dirB, filter);
    process.exit(0);
}

const req = createRequire('/tmp/pw/');
const pixelmatch = req('pixelmatch');
const { PNG } = req('pngjs');
const [oldDir, newDir] = process.argv.slice(2);
if (!oldDir || !newDir) {
    console.error('usage: node compare.mjs <old-dir> <new-dir>');
    process.exit(2);
}
const diffDir = process.env.DIFF_DIR || path.join(path.dirname(oldDir), 'diff');
mkdirSync(diffDir, { recursive: true });

const flatten = (v, prefix, out) => {
    if (v && typeof v === 'object') {
        for (const k of Object.keys(v))
            flatten(v[k], prefix ? `${prefix}.${k}` : k, out);
    } else out[prefix] = v;
    return out;
};
const roundish = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);

const names = readdirSync(oldDir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => f.slice(0, -4))
    .sort();
const rows = [];
for (const name of names) {
    const a = path.join(oldDir, `${name}.png`);
    const b = path.join(newDir, `${name}.png`);
    if (!existsSync(b)) {
        rows.push({ name, pct: null, note: 'missing in new' });
        continue;
    }
    const A = PNG.sync.read(readFileSync(a));
    const B = PNG.sync.read(readFileSync(b));
    const w = Math.max(A.width, B.width);
    const h = Math.max(A.height, B.height);
    const pad = (img) => {
        const o = new PNG({ width: w, height: h });
        o.data.fill(255);
        PNG.bitblt(img, o, 0, 0, img.width, img.height, 0, 0);
        return o;
    };
    const PA = pad(A);
    const PB = pad(B);
    const D = new PNG({ width: w, height: h });
    const n = pixelmatch(PA.data, PB.data, D.data, w, h, { threshold: 0.1 });
    writeFileSync(path.join(diffDir, `${name}.png`), PNG.sync.write(D));
    const fields = [];
    const ja = path.join(oldDir, `${name}.json`);
    const jb = path.join(newDir, `${name}.json`);
    if (existsSync(ja) && existsSync(jb)) {
        const fa = flatten(
            JSON.parse(readFileSync(ja, 'utf8')).measurements ?? {},
            '',
            {}
        );
        const fb = flatten(
            JSON.parse(readFileSync(jb, 'utf8')).measurements ?? {},
            '',
            {}
        );
        for (const k of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
            if (roundish(fa[k]) !== roundish(fb[k]))
                fields.push(
                    `${k}: old=${JSON.stringify(fa[k])} new=${JSON.stringify(fb[k])}`
                );
        }
    }
    rows.push({
        name,
        pct: (100 * n) / (w * h),
        note:
            A.width !== B.width || A.height !== B.height
                ? `size ${A.width}x${A.height} vs ${B.width}x${B.height}`
                : '',
        fields,
    });
}
rows.sort((x, y) => (y.pct ?? 101) - (x.pct ?? 101));
for (const r of rows) {
    console.log(
        `${r.pct === null ? '  n/a ' : r.pct.toFixed(2).padStart(6)}%  ${r.name}  ${r.note}`
    );
    for (const f of (r.fields || []).slice(0, 30)) console.log(`        ${f}`);
    if ((r.fields || []).length > 30)
        console.log(`        ... ${r.fields.length - 30} more`);
}
