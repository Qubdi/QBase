import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import UnpluginInjectPreload from 'unplugin-inject-preload/vite';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        // the bundle report is slow to write: `ANALYZE=1 npm run build`
        ...(process.env.ANALYZE
            ? [
                  visualizer({
                      filename: './stats/stats.html',
                      open: false,
                  }),
              ]
            : []),
        UnpluginInjectPreload({
            files: [
                {
                    entryMatch: /logo-light.png$/,
                    outputMatch: /logo-light-.*.png$/,
                },
                {
                    entryMatch: /logo-dark.png$/,
                    outputMatch: /logo-dark-.*.png$/,
                },
            ],
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            external: (id) => /__test__/.test(id),
            output: {
                // vendor code changes far less often than the app, so it gets
                // its own long-cached chunks
                manualChunks: (id) => {
                    if (!id.includes('node_modules')) return undefined;
                    if (/node_modules\/(react|react-dom|scheduler)\//.test(id))
                        return 'react';
                    if (id.includes('@xyflow')) return 'xyflow';
                    if (id.includes('@radix-ui')) return 'radix';
                    return undefined;
                },
                assetFileNames: (assetInfo) => {
                    if (
                        assetInfo.names &&
                        assetInfo.originalFileNames.some((name) =>
                            name.startsWith('src/assets/templates/')
                        )
                    ) {
                        return 'assets/[name][extname]';
                    }
                    return 'assets/[name]-[hash][extname]';
                },
            },
        },
    },
});
