// Writes the licence texts of the production dependencies of a package, for the
// copy of QBase that is shipped (the MIT, BSD, ISC and Apache licences ask that
// their notice travels with every copy, and Apache 2.0 section 4(d) also asks
// for a dependency's NOTICE file). Run in a folder with node_modules installed:
//   node third-party-licenses.mjs <package folder> > THIRD-PARTY-LICENSES.txt
// The Dockerfile runs it for the editor (served at /THIRD-PARTY-LICENSES.txt)
// and for the server (/app/THIRD-PARTY-LICENSES-server.txt).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const dir = path.resolve(process.argv[2] ?? '.');
if (!existsSync(path.join(dir, 'package.json'))) {
    process.stderr.write('usage: node third-party-licenses.mjs <package folder>\n');
    process.exit(2);
}

// npm ls exits non-zero for problems it merely reports (an optional package of
// another platform, say); its list on standard output is still complete
let listing;
try {
    listing = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
        cwd: dir,
        maxBuffer: 1 << 28,
        stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
} catch (error) {
    listing = error.stdout?.toString() ?? '';
}

const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
const declared = (info) =>
    typeof info.license === 'string'
        ? info.license
        : (info.license?.type ?? (info.licenses ?? []).map((l) => l.type).join(' OR ')) ||
          'not declared';
const repository = (info) => {
    const url = typeof info.repository === 'string' ? info.repository : info.repository?.url;
    return (url ?? info.homepage ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
};

const packages = new Map();
for (const folder of listing.trim().split('\n')) {
    if (!folder || path.resolve(folder) === dir) continue; // the package itself
    const manifest = path.join(folder, 'package.json');
    if (!existsSync(manifest)) continue;
    const info = JSON.parse(readFileSync(manifest, 'utf8'));
    if (!info.name || !info.version) continue;
    const files = readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    packages.set(`${info.name}@${info.version}`, {
        info,
        licenses: files.filter((f) => /^(licen[sc]e|copying|unlicense)/i.test(f)).sort(),
        notices: files.filter((f) => /^notice/i.test(f)).sort(),
        folder,
    });
}

const rule = '='.repeat(78);
const out = [
    'Third-party software in this copy of QBase',
    '',
    'QBase itself is licensed under the Apache License, Version 2.0 (see LICENSE).',
    `The ${packages.size} packages below are bundled into or installed with it, each under its own`,
    'licence, reproduced here as the package ships it.',
    '',
];
for (const [id, { info, licenses, notices, folder }] of [...packages].sort(([a], [b]) =>
    a.localeCompare(b)
)) {
    out.push(rule, id, `Licence: ${declared(info)}`);
    const where = repository(info);
    if (where) out.push(`Source:  ${where}`);
    out.push('');
    if (licenses.length === 0)
        out.push('(the package ships no licence file; the licence above is the one it declares)', '');
    for (const file of licenses) out.push(read(path.join(folder, file)), '');
    for (const file of notices) out.push(`NOTICE of ${info.name}:`, '', read(path.join(folder, file)), '');
}
process.stdout.write(out.join('\n') + '\n');
