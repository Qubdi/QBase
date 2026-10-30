import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

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
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        // Vite 8 bundles with Rolldown, which has its own option for this
        rolldownOptions: {
            output: {
                // vendor code changes far less often than the app, so it gets
                // its own long-cached chunks
                codeSplitting: {
                    groups: [
                        {
                            name: 'react',
                            test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                        },
                        { name: 'xyflow', test: /node_modules[\\/]@xyflow/ },
                        { name: 'radix', test: /node_modules[\\/]@radix-ui/ },
                    ],
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
