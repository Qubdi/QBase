import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import { fixupConfigRules } from '@eslint/compat';
import tsParser from '@typescript-eslint/parser';
import reactRefresh from 'eslint-plugin-react-refresh';
import a11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

// Several plugins still publish eslintrc-style presets; this bridges them.
const legacy = new FlatCompat({
    baseDirectory: fileURLToPath(new URL('.', import.meta.url)),
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

const presets = fixupConfigRules(
    legacy.extends(
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:prettier/recommended'
    )
);

const ourRules = {
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-empty-object-type': 'off',

    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'off',
    'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
    ],

    ...a11y.configs.recommended.rules,
    // Radix's Checkbox draws the control inside the label element
    'jsx-a11y/label-has-associated-control': [
        'error',
        { controlComponents: ['Checkbox'], assert: 'either' },
    ],
    // status icons are focusable so keyboard users can reach their title
    'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { roles: ['tabpanel', 'status', 'img'] },
    ],

    // react-hooks 7 added React Compiler rules (refs, set-state-in-effect,
    // preserve-manual-memoization, use-memo). They are on everywhere, no file is
    // excepted.
};

export default [
    {
        ignores: ['server/**', '**/dist', '**/coverage', 'tailwind.config.js'],
    },
    ...presets,
    {
        languageOptions: { parser: tsParser, globals: globals.browser },
        plugins: { 'react-refresh': reactRefresh, 'jsx-a11y': a11y },
        settings: { react: { version: 'detect' } },
        rules: ourRules,
    },
    {
        // shadcn-style primitives export a variants helper next to the component
        files: ['src/platform/ui/**', 'src/platform/toast/**'],
        rules: { 'react-refresh/only-export-components': 'off' },
    },
];
