import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/**', 'load/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
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
