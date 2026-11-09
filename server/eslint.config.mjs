import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/**', 'load/results/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    // the load tests: k6 scripts (.js) and plain Node scripts (.mjs), each with
    // the globals its runtime gives
    {
        files: ['load/**/*.js'],
        languageOptions: {
            globals: { __ENV: 'readonly', __VU: 'readonly', __ITER: 'readonly', open: 'readonly' },
        },
    },
    {
        files: ['load/**/*.mjs'],
        languageOptions: {
            globals: {
                URL: 'readonly',
                console: 'readonly',
                fetch: 'readonly',
                performance: 'readonly',
                process: 'readonly',
                setTimeout: 'readonly',
            },
        },
    },
    {
        languageOptions: { parserOptions: { projectService: false } },
        rules: {
            // an underscore marks a deliberately unused argument
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    }
);
