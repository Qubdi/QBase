#!/usr/bin/env node
// Lists the direct dependencies of the client and the server with their declared
// licences, and marks anything that is not clearly permissive for review.
// Run from the repository root after `npm ci` in both packages:
//   node tools/licences.mjs
// Output: rewrite/inventory/third-party-licences.csv
import fs from 'node:fs';

const rows = [];
for (const [scope, dir] of [
    ['client', '.'],
    ['server', 'server'],
]) {
    const pkg = JSON.parse(fs.readFileSync(`${dir}/package.json`, 'utf8'));
    for (const [group, deps] of [
        ['runtime', pkg.dependencies ?? {}],
        ['dev', pkg.devDependencies ?? {}],
    ]) {
        for (const name of Object.keys(deps)) {
            const candidates = [
                `${dir}/node_modules/${name}/package.json`,
                `node_modules/${name}/package.json`,
            ];
            const file = candidates.find((candidate) =>
                fs.existsSync(candidate)
            );
            let version = '?';
            let license = 'NOT INSTALLED';
            if (file) {
                const info = JSON.parse(fs.readFileSync(file, 'utf8'));
                version = info.version;
                license =
                    typeof info.license === 'string'
                        ? info.license
                        : (info.license?.type ??
                              (info.licenses ?? [])
                                  .map((entry) => entry.type)
                                  .join(' OR ')) ||
                          'UNKNOWN';
            }
            rows.push({ scope, group, name, version, license });
        }
    }
}
const permissive =
    /^(MIT|ISC|BSD-[23]-Clause|Apache-2\.0|0BSD|BlueOak-1\.0\.0|Unlicense|CC0-1\.0|Python-2\.0|MIT-0|\(.*\))$/;
const header = 'scope,group,package,version,license,needs_review';
const lines = rows.map((row) => {
    const review =
        permissive.test(row.license) &&
        !/GPL|SSPL|BUSL|UNKNOWN|NOT INSTALLED/.test(row.license)
            ? 'no'
            : 'yes';
    return [
        row.scope,
        row.group,
        row.name,
        row.version,
        row.license.replace(/,/g, ' '),
        review,
    ].join(',');
});
fs.writeFileSync(
    'rewrite/inventory/third-party-licences.csv',
    [header, ...lines].join('\n') + '\n'
);
const flagged = lines.filter((line) => line.endsWith(',yes'));
console.log(
    `${rows.length} direct dependencies; ${flagged.length} need review`
);
console.log(flagged.join('\n'));
const counts = {};
for (const row of rows) counts[row.license] = (counts[row.license] ?? 0) + 1;
console.log(counts);
