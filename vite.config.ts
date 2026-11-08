import { fileURLToPath } from 'node:url';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { keepFontsAsFiles } from './vite.fonts';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));

// Writing the bundle report is slow, so it is opt-in: `ANALYZE=1 npm run build`.
const plugins: PluginOption[] = [react()];
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
