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

    // react-hooks 7 added React Compiler rules. They are on everywhere; the
    // files that still break set-state-in-effect or refs are listed in the
    // override at the bottom, and a migrated file is removed from it.
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

    {
        // not yet migrated to the React Compiler rule `set-state-in-effect`
        files: [
            'src/canvas/diagram-canvas.tsx',
            'src/components/qubdi/access-banner.tsx',
            'src/components/qubdi/connections-dialog.tsx',
            'src/components/qubdi/diagram-access.tsx',
            'src/components/qubdi/drift-control.tsx',
            'src/components/qubdi/drift-dialog.tsx',
            'src/components/qubdi/import-from-database-dialog.tsx',
            'src/components/qubdi/lint-control.tsx',
            'src/components/qubdi/lint-settings-dialog.tsx',
            'src/components/qubdi/members-dialog.tsx',
            'src/components/qubdi/project-open-dialog.tsx',
            'src/components/qubdi/publish-control.tsx',
            'src/components/qubdi/resync-dialog.tsx',
            'src/components/qubdi/share-dialog.tsx',
            'src/components/qubdi/two-factor-dialog.tsx',
            'src/components/qubdi/use-edit-lock.ts',
            'src/dialogs/create-diagram-dialog/create-diagram-dialog.tsx',
            'src/dialogs/import-database-dialog/import-database-dialog.tsx',
            'src/features/designs/open-design-dialog.tsx',
            'src/features/designs/rename-design-dialog.tsx',
            'src/features/designs/use-design-list.ts',
            'src/features/export/export-image-dialog.tsx',
            'src/features/export/export-sql-dialog.tsx',
            'src/features/links/refs-section.tsx',
            'src/features/tables/tables-section.tsx',
            'src/hooks/use-cursor-list.ts',
            'src/hooks/use-paged-list.ts',
            'src/pages/admin-page/diagram-links-dialog.tsx',
            'src/pages/admin-page/new-project-dialog.tsx',
            'src/pages/admin-page/new-user-dialog.tsx',
            'src/pages/admin-page/overview-panel.tsx',
            'src/pages/admin-page/project-settings.tsx',
            'src/pages/admin-page/projects-panel.tsx',
            'src/pages/admin-page/user-sessions-dialog.tsx',
            'src/pages/admin-page/users-panel.tsx',
            'src/pages/editor-page/side-panel/dbml-section/dbml-section.tsx',
            'src/pages/share-viewer-page/share-viewer-page.tsx',
            'src/platform/panel/debounced-input.tsx',
            'src/qbase/diagram-provider.tsx',
        ],
        rules: { 'react-hooks/set-state-in-effect': 'off' },
    },
    {
        // not yet migrated to the React Compiler rule `refs`
        files: [
            'src/canvas/diagram-canvas.tsx',
            'src/canvas/field-row.tsx',
            'src/canvas/use-viewport.ts',
            'src/components/qubdi/diagram-access.tsx',
            'src/components/qubdi/drift-control.tsx',
            'src/components/qubdi/drift-dialog.tsx',
            'src/components/qubdi/lint-control.tsx',
            'src/components/qubdi/server-autosave.tsx',
            'src/components/qubdi/share-dialog.tsx',
            'src/context/qubdi-context/qubdi-provider.tsx',
            'src/features/tables/fields/fields-editor.tsx',
            'src/features/tables/windowed-list.tsx',
            'src/hooks/use-cursor-list.ts',
            'src/hooks/use-paged-list.ts',
            'src/platform/panel/debounced-input.tsx',
            'src/platform/panel/sortable-list.tsx',
            'src/store/editor-provider.tsx',
            'src/workspace/canvas-bridge-context.ts',
            'src/workspace/use-workspace-commands.ts',
        ],
        rules: { 'react-hooks/refs': 'off' },
    },
];
