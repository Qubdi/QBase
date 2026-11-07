# Phase 9 cleanup

Method: an import graph from `src/main.tsx` (plus test files) found source files nothing imports. No `vitest.phase*.config.ts` files existed. Locale files are loaded by `import.meta.glob`; `src/router.ts`, `src/qbase/sql-adapters.ts` and the fixtures/test helpers are used by tests, so they stay.

## Deleted files
- `src/components/code-snippet/` (config.ts, use-bundled-monaco.ts and its test): the Monaco loader; nothing imports it.
- `src/platform/ui/separator.tsx`: unused.
- `src/features/tables/field-hover-card.tsx` and its test: only the test used it.
- `src/hooks/use-selected-table-ids.ts` and its test: only the test used it.
- `src/components/select-box/` (select-box-filter.ts and its test): only the test used it.

## Removed dependencies (no file imports them)
dependencies: `@dbml/parse` (still installed through `@dbml/core`), `@monaco-editor/react`, `monaco-editor`, `@radix-ui/react-accordion`, `-avatar`, `-context-menu`, `-hover-card`, `-icons`, `-separator`, `-toggle`, `-toggle-group`, `ahooks`, `cmdk`, `fast-deep-equal`, `framer-motion`, `nanoid`, `react-hotkeys-hook`, `react-markdown`, `react-resizable-panels`, `react-responsive`, `react-use`, `remark-gfm`.
devDependencies: none removed. The other flagged ones are used without an import: `@typescript/native` provides the `tsc` binary, `@vitest/ui` serves `npm run test:ui`, and the eslint plugins are named in `eslint.config.mjs`.
`package-lock.json` and `rewrite/inventory/third-party-licences.csv` were regenerated (156 packages gone).

## DBML loads on demand
`analyzeImport` in `src/features/import/analyze-import.ts` imports `import-dbml` dynamically and returns a promise for the DBML method only (SQL and metadata stay synchronous). `ImportBox` shows the box as pending until it answers. In the build, `import-box` refers to the 15.6 MB `import-dbml` chunk only through `import()`.
