# Phase 6c decisions (workspace, designs, import, export, settings)

From the workspace agent's report (2026-11-07). Accepted by the assistant on the owner's standing
instruction to decide small things autonomously.

## Accepted choices

- EDT-221: shortcuts yield to a focused text box (undo stays with the box); only Mod+M and Mod+F work
  inside text boxes. EDT-257: Mod+S shows a toast ("everything is saved" or "saving").
- Oracle and ClickHouse designs: banner, no SQL import or export; **JSON and image export stay
  available** (answer to the agent's question 2: the data is the user's, and these exports do not
  need a writer).
- IMP-076: an existing table is added anyway and reported in a warning. IMP-075: history cleared
  after import (kept per spec; a single undo step would be friendlier: revisit in Phase 9).
- Delete of the open diagram sets it read-only first so autosave cannot write it back.
- Create dialog: one grid of the registered dialects (no Transactional/Analytical tabs).
- Metadata queries: only SQLite (tested against real SQLite). PostgreSQL, MySQL and SQL Server show
  "no ready-made query yet" until someone can run them against real servers.
- The canvas must register with `useRegisterCanvas({ fitAll, toggleFilter, captureTarget? })` and
  must not listen for Mod+0 or Mod+F itself; its root needs `data-slot="canvas"`; image export
  measures `.react-flow__viewport` and `.react-flow__node`.

## Answers to the agent's open questions

1. The old-path assertions in `src/i18n/__tests__/qubdi-workspace.test.ts` (and the path reads in
   `lazy-dbml.test.ts`) are repointed to the new layout when the canvas lands (they are our tests
   of our own rules: strings are looked up, not written out).
2. See above: JSON and image export stay for open-only databases.
3. Mod+O inside a project keeps the spec (A8) behaviour; revisit if users ask.

## Follow-ups

- `src/qbase/diagram-provider.tsx`: under `/:project/diagrams` with no diagram id it opens the
  browser's default or newest local diagram instead of the fallback; it should skip the default when
  the workspace has no `localDiagramId`.
- `src/lib/utils/index.ts` must export `getOperatingSystem` (clipboard hook imports it from
  `@/lib/utils`).
- PostgreSQL, MySQL and SQL Server metadata queries; long-press menus on phones (EDT-009);
  translating the engines' English diagnostics (Phase 7).
- The workspace agent ran prettier once over `src/features` before narrowing to its folders; this
  only reformats files.
