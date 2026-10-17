import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        // The first test in a file pays for importing its modules (the DBML
        // parser and the admin pages are large), and a full run has a worker
        // per core, so 5 s is not enough on a busy machine. The server tests
        // already allow 20 s.
        testTimeout: 20_000,
        globals: true,
        exclude: ['node_modules/**', 'server/**'],
        environment: 'happy-dom',
        setupFiles: './src/test/setup.ts',
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'src/test/setup.ts'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
