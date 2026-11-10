import { fileURLToPath } from 'node:url';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { keepFontsAsFiles } from './vite.fonts';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

// @dbml/core's Parser also holds parsers for MySQL, PostgreSQL, SQL Server,
// Snowflake, Oracle, Rails schema and the old DBML grammar (about 14 MB built).
// This app calls only Parser.parse(text, 'dbmlv2') (src/formats/dbml/import-dbml.ts);
// SQL is read by its own code in src/formats and src/dialects. Those parsers are
// replaced by stubs that throw if ever called, so they stay out of the DBML chunk.
const UNUSED_DBML_PARSERS =
    /@dbml[\\/]core[\\/]lib[\\/]parse[\\/](?:ANTLR[\\/]ASTGeneration[\\/]index|deprecated[\\/](?:dbml|mssql|mysql|postgres|schemarb)Parser)\.mjs$/;
const unusedDbmlParsers = (): PluginOption => ({
    name: 'qbase-unused-dbml-parsers',
    enforce: 'pre',
    load(id) {
        const path = id.split('?')[0];
        if (!UNUSED_DBML_PARSERS.test(path)) return null;
        const unavailable = `() => { throw new Error('This DBML parser is not part of QBase'); }`;
        if (path.includes('ASTGeneration')) {
            return `export const parse = ${unavailable};`;
        }
        const name = /deprecated[\\/](\w+)\.mjs$/.exec(path)?.[1] ?? '';
        const fn = `require_${name}`;
        return `const parser = { parse: ${unavailable}, parseWithPegError: ${unavailable} };
export const ${fn} = () => parser;`;
    },
});

// Writing the bundle report is slow, so it is opt-in: `ANALYZE=1 npm run build`.
const plugins: PluginOption[] = [react(), unusedDbmlParsers()];
if (process.env.ANALYZE) {
    plugins.push(visualizer({ filename: './stats/stats.html', open: false }));
}

// Third-party code changes less often than ours: separate chunks keep it cached.
const vendorChunks = [
    {
        name: 'react',
        test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
    },
    { name: 'xyflow', test: /node_modules[\\/]@xyflow[\\/]/ },
    { name: 'radix', test: /node_modules[\\/]@radix-ui[\\/]/ },
];

// Template thumbnails keep a stable file name so the data can refer to them.
const isTemplateImage = (file: string) =>
    file.startsWith('src/assets/templates/');

export default defineConfig({
    plugins,
    resolve: { alias: { '@': srcDir } },
    build: {
        assetsInlineLimit: keepFontsAsFiles,
        // Vite 8 bundles with Rolldown and names this option differently
        rolldownOptions: {
            output: {
                codeSplitting: { groups: vendorChunks },
                assetFileNames: (asset) =>
                    asset.originalFileNames.some(isTemplateImage)
                        ? 'assets/[name][extname]'
                        : 'assets/[name]-[hash][extname]',
            },
        },
    },
});
