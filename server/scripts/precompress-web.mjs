// Writes a .br and a .gz beside each large text file of the built editor, so
// the server can send them as they are (`preCompressed` in src/web.ts) instead
// of the full file. Run on the build output: node precompress-web.mjs <dist>
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.wasm']);
// below this, the saving is smaller than the cost of another file
const MIN_BYTES = 1024;

const root = process.argv[2];
if (!root) {
    process.stderr.write('usage: node precompress-web.mjs <dist folder>\n');
    process.exit(2);
}

const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
    });

let before = 0;
let after = 0;
for (const file of walk(root)) {
    if (!COMPRESSIBLE.has(path.extname(file)) || statSync(file).size < MIN_BYTES) continue;
    const data = readFileSync(file);
    const br = brotliCompressSync(data, {
        params: {
            [constants.BROTLI_PARAM_QUALITY]: 11,
            [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
        },
    });
    const gz = gzipSync(data, { level: 9 });
    // a compressed copy that is not smaller is not worth sending
    if (br.length < data.length) writeFileSync(`${file}.br`, br);
    if (gz.length < data.length) writeFileSync(`${file}.gz`, gz);
    before += data.length;
    after += Math.min(br.length, data.length);
}
process.stdout.write(
    `precompressed ${(before / 1048576).toFixed(1)} MB to ${(after / 1048576).toFixed(1)} MB (brotli)\n`
);
