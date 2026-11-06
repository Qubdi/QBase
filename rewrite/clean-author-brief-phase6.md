# Brief for the clean author: Phase 6b, the canvas

You are a CLEAN AUTHOR in a clean-room rewrite of a database-diagram editor (QBase). This file
is your CLAUDE.md. Read all of it before doing anything.

## The one rule

You must not read, open, search for or ask about ChartDB's source code, nor the `main` branch of
the QBase repository, nor any copy of either. You work only from the files in this checkout. If a
file here seems to contain code from another project, stop and tell the owner. Do not browse
outside this directory (no `..`, no other paths under the owner's home, no `/tmp` folders you did
not create, no web search for ChartDB code). Library documentation for npm packages (including
`@xyflow/react`) is fine. If you already know the ChartDB project from training, do not reproduce
its structure, names or algorithms; design from the spec.

## What you write

The diagram surface of `rewrite/architecture.md` section 7, new original code under `src/canvas/`:

- the xyflow canvas: nodes for entities (tables and views), edges for links, nodes for regions
  (areas) and memos (notes); pan, zoom, minimap, controls, selection and multi-select, moving with
  snapping, resizing, the overlap outline, fit to screen, auto arrange, right-click menus (desktop,
  not in read-only), drag and drop of new items, the field rows and their look, collapsing long
  tables, relationship drawing and the two ways to create one by dragging, the toolbar and chrome
  of the canvas, the visibility filter's effect on what is drawn
- node components are pure views of one record from the store; positions come from the design;
  measured sizes live in the store's `ui` slice; a drag updates local node state and sends ONE move
  command on release
- everything that changes the design goes through the store (`src/store`, `edit(command)`); read
  the store and `src/core` (model types, commands, history, wire) first and use them; do not change
  them (list needed changes in your final message)
- dialogs, the side panel, forms and menus are NOT yours: where the canvas needs one (for example
  the relationship dialog, the rename box on a node), expose a typed callback prop or a small
  `CanvasHooks` interface in `src/canvas/hooks.ts` that the workspace fills in later
- strings come from i18n keys under a `canvas` namespace that you add in `src/i18n/locales/en.ts`
  (our own English wording; other languages fall back to English)

## What you read

- `rewrite/architecture.md`, `rewrite/spec/editor.md` (sections 2, 3.1, 3.3 to 3.7, 4.1 to 4.4,
  4.9, 5 to 9 as far as the canvas shows them, 15 and shortcuts that act on the canvas),
  `rewrite/spec/data-format.md` (for what is stored), `rewrite/spec/owner-decisions.md` (dropped
  features: dependencies, type-colours legend, templates)
- `rewrite/parity-checklist.md` rows `EDT-*` about the canvas, tables, fields, indexes, links, areas,
  notes, filters, selection and clipboard; tick nothing, but name each test after the row it covers
- `src/core/**`, `src/store/**`, `src/platform/ui/**`, `src/globals.css`, `tailwind.config.js`

## How to work

1. Own names, own component structure; do not mirror any existing editor's layout of files.
2. Tests alongside, with React Testing Library and happy-dom (the repo's `vitest.config.ts` and
   `src/test/setup.ts` need `src/i18n/i18n`; this checkout keeps `src/i18n`, so they should work;
   if not, add your own `vitest.phase6.config.ts` and tell the owner). xyflow needs a few DOM
   stubs (ResizeObserver, DOMMatrixReadOnly) in tests: put them in your test helper.
3. Docker for node tooling: `docker run --rm -u $(id -u) -v "$PWD":/w -w /w node:24 npx vitest run
   src/canvas` (`npm ci` first if `node_modules` is missing).
4. Gates before hand-back: `npx tsc -p tsconfig.app.json --noEmit` clean for your files;
   `npx eslint src/canvas --max-warnings 0` clean; tests pass.
5. Add a row to `rewrite/provenance.md` (author "clean author session, phase 6 canvas", has read
   ChartDB source: no) before your first commit and one row per finished module to
   `rewrite/log.md`.
6. Commit to a branch `clean/phase6` in this checkout, one module per commit; never push. If the
   husky hook fails, commit with `-c core.hooksPath=/dev/null`.
7. The owner runs a similarity gate afterwards (30% shared lines / 25-line run). Do not lay out
   data tables and enums in the most obvious order if another structure is as clear.

## Order

1. canvas shell: provider wiring, xyflow setup, pan, zoom, fit, minimap, controls, background
2. entity node (table and view), field rows, collapse, colours, selection, move with snap, resize
3. link edges and creating links by dragging
4. regions and memos
5. context menus, drop of new items, auto arrange, overlap outline, filter effect
6. toolbar and chrome

## Done when

- each canvas EDT row marked keep or change has a test, or an entry in `rewrite/log.md` saying why
  not (UI-only rows such as dialogs belong to other authors)
- gates in step 4 pass
- your final message lists the `CanvasHooks` the workspace must implement, open questions and spec
  contradictions

## Hand-back

Stop when done and report the branch name. The owner copies `src/canvas` and your i18n and log
changes out of this checkout (not a merge).
