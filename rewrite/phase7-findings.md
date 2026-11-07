# Phase 7 findings (English wording, i18n, leftover content)

## Hard-coded text

- Routed through i18n: `components/color-picker` (`editor.common.colorPicker.*`), the 404 page and the
  page title and description (`editor.common.notFound.*`, `editor.common.app.*`), the Close and Loading
  labels in `platform/ui` and `platform/toast` (`editor.common.close`, `editor.common.loading`).
- Engine diagnostics (import, export, checks, refusals): the engines still write plain English so their
  tests and tools keep working. `src/lib/diagnostic-text.ts` maps each known message to
  `editor.diagnostics.*` (`src/i18n/editor/diagnostics.ts`) at the point where it is shown (import box,
  export SQL dialog, "import into" and "clear diagram" failure toasts). A message that is not in the table
  shows as the engine wrote it.
- Not translated on purpose: product names (QBase, Qubdi, SQL Server, PostgreSQL ...), the command
  failure details of `core/commands/apply.ts` (`No such column <id>` and similar; they report a broken
  caller, not something a person did), dev logs, wire keys, test ids.
- `src/i18n/__tests__/hard-coded-text.test.ts` scans the UI code (components, features, workspace,
  canvas, pages, platform, qbase, dialogs, context, helmet, store, hooks, lib/qubdi, persistence) for JSX
  text, text attributes (`aria-label`, `title`, `placeholder`, `alt`, `label`) and `title`,
  `description`, `message` properties holding a sentence. Add to `NAMES` or `ALLOWED` in that file for
  text that must stay literal.

## Wording changes in en.ts

- Sentence case everywhere: the canvas toolbar, menus, diff marks, dialogs and DBML buttons were Title
  Case ("Auto Arrange Diagram" is now "Auto arrange diagram", and so on).
- One spelling: "color" (the colour picker text the owner named already used it). "colour" in values
  became "color"; keys such as `canvas.region.colour` are unchanged.
- One term for a relationship: "link" in the clear-diagram and import texts became "relationship";
  "Open in sidebar" became "Open in side panel". "Link" still means a share link.
- Plurals: "Found 1 tables and 0 links." now reads "Found 1 table and 0 relationships."
- Quotes: table names in quotes use double quotes.
- Left alone, owner call: the rail and drawer entries `editor.workspace.rail.refs` and
  `...drawer.entries.refs` read "Links" (three tests look for that name); "Extras" for the visuals rail
  entry.
- The 20 non-English locale files were not touched and fall back to English for the new keys.

## Leftover ChartDB-era content

- No templates, example diagrams or thumbnails remain: `src/lib/data` holds only the metadata types and
  two thin loaders (`src/lib/data/import-metadata/import/index.ts`,
  `.../import/relationships.ts`, `.../metadata-types/database-metadata.ts`) and test files
  (`src/lib/data/sql-export/__tests__/*`, `src/lib/data/sql-import/__tests__/*`); `public/` has only
  `config.js`, `robots.txt`, `theme-init.js`.
- Deleted, nothing imported them: `src/lib/clone.ts`, `src/lib/env.ts`, `src/lib/domain/config.ts`,
  `src/assets/qubdi-mark.svg`.
- Still in tracked paths with the old layout (kept because they are imported): the whole
  `src/lib/data/**` tree, and `src/lib/export-import-utils.ts`. Moving them under `src/formats` is a
  rename for the owner; the names `lib/data` and `qbase/diagram-types` come from the old layout.
- ChartDB is still named in `.github/workflows/similarity.yaml`, `tools/similarity.mjs`,
  `tools/spec-check.mjs`, `tools/make-clean-checkout.sh` and `rewrite/*`. That is the clean-room tooling,
  not leftover content.
