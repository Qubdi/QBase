import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./src/test/setup.ts'],
        // The first test of a file pays for importing its modules (the DBML
        // parser, the admin pages), and a full run uses one worker per core.
        // 5 s is too short on a busy machine; the server tests allow 20 s too.
        testTimeout: 20_000,
        // server/ has its own vitest run; .claude/ holds third-party agent
        // skills whose *.test.cjs files use node:test, not vitest
        exclude: [...configDefaults.exclude, 'server/**', '.claude/**'],
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude: ['node_modules/', 'src/test/setup.ts'],
        },
    },
});
