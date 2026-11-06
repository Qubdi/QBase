# Rewrite log

One row per finished module. Add it in the same pull request that finishes the module.

How to fill it in:

- **Replaces**: the paths on `main` this module replaces (see `rewrite/inventory/src.csv`).
- **Spec**: the file in `rewrite/spec/` it was written from.
- **Author**: who wrote it, and whether they are a clean author (see `rewrite/provenance.md`).
- **Similarity**: output of `node tools/similarity.mjs --upstream <chartdb> --src <paths>`.
  Write the shared-line percentage and the longest identical run.
- **Parity**: the lines of `rewrite/parity-checklist.md` this module satisfies.

| Date | Module | Replaces | Spec | Author | Similarity | Parity | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-07 | src/platform/ui primitives (alert-dialog badge button checkbox dialog input popover scroll-area select separator table tabs textarea) | src/components/ui/* | n/a | shadcn CLI 4.23.0 output (`npx shadcn@latest add ... --overwrite`, new-york, run in a scratch copy with ui alias src/platform/ui); import paths and dialog showClose/DialogInternalContent adapted by hand | 9 of 13 files over the 30% limit (alert-dialog 63.5, select 60.2, table 62.1, tabs 55.3, dialog 44.4, scroll-area 39.5, input 35.7, checkbox 33.3, separator 30.0); longest run 12 (limit 25) | n/a | toast not offered by the CLI for this project (Radix); toast.tsx kept as is |
| 2026-11-07 | `src/core/model` (types, ids, defaults, primary-key sync, visibility filter, region membership, type suffix) | n/a in this checkout (owner fills from the inventory) | `rewrite/architecture.md` s3, `spec/data-format.md` s3 and s4, `spec/editor.md` 4, 10, 14 | clean author session (no ChartDB source read; see `provenance.md`) | not run here; owner runs `tools/similarity.mjs` | DAT-019 to DAT-023, DAT-025 to DAT-031, DAT-035 to DAT-039, DAT-041 to DAT-044, DAT-046 to DAT-051, DAT-053 to DAT-060 | tests: `src/core/model/model.test.ts`; no new dependency; ids of new designs are 25 characters like all others (DAT-060) |
| 2026-11-07 | `src/core/wire` (parse, serialise, upgrade, file export, file import, strict validation) | n/a in this checkout | `spec/data-format.md` s3, s5, s8 | clean author session | not run here | DAT-002 to DAT-006, DAT-012, DAT-019 to DAT-021, DAT-024, DAT-025, DAT-032 to DAT-034, DAT-040, DAT-045, DAT-052, DAT-059, DAT-061 to DAT-069, DAT-072, DAT-082, DAT-089 | tests: `src/core/wire/wire.test.ts`; version key is `qbaseFormat: 1` (open question); `length` is a number or `max` in the model and text on the wire; unknown keys kept per record and written back |
| 2026-11-07 | `src/core/commands` (command union, `apply` with inverse, planners, coalescing keys) | n/a in this checkout | `spec/editor.md` 3 to 11, 13, 17 | clean author session | not run here | EDT-014, EDT-036, EDT-037, EDT-075, EDT-077, EDT-094, EDT-099 to EDT-101, EDT-105, EDT-106, EDT-117, EDT-121, EDT-123, EDT-124, EDT-133 to EDT-136, EDT-138, EDT-139, EDT-141, EDT-144 to EDT-146, EDT-148, EDT-151, EDT-153 to EDT-155, EDT-157, EDT-167 to EDT-170, EDT-176, EDT-177, EDT-181, EDT-189, EDT-194, EDT-198 to EDT-203, EDT-207, EDT-210, EDT-217, EDT-223 to EDT-225, EDT-230 to EDT-234, EDT-237, EDT-274; DAT-023, DAT-047, DAT-048, DAT-050 | tests: `src/core/commands/commands.test.ts`; EDT-139, EDT-101, EDT-194 take the "change" decision (links removed with the column, one table only, kind switch clears); read-only and open-only (Oracle, ClickHouse) designs refuse every command |
| 2026-11-07 | `src/core/history` (undo and redo stacks, coalescing, depth cap, dispatch) | n/a in this checkout | `spec/editor.md` 13 | clean author session | not run here | EDT-014, EDT-219, EDT-220, EDT-222 to EDT-225, EDT-274 | tests: `src/core/history/history.test.ts`; EDT-222 decision: cap 200 steps (option), reset on switch; unlimited is `limit: 0` |
| 2026-11-07 | `src/persistence` (StorageAdapter, Dexie adapter, memory fallback, QubdiDB merge, one-time layout migration, sign-out and ownership, colour list) | n/a in this checkout | `spec/data-format.md` s2, s7, `architecture.md` s5 | clean author session | not run here | DAT-001 to DAT-018, DAT-091 | tests: `src/persistence/persistence.test.ts` with fake-indexeddb (Apache-2.0, dev dependency only); layout: `designs` and `design_index` stores added in Dexie version 15, old stores kept |

### Phase 4 rows with no test in these modules, and why

| Rows | Reason |
| --- | --- |
| DAT-070 | importing inside a server project is the QBase server client (`lib/qubdi`), not core |
| DAT-071, DAT-073 to DAT-081 | server behaviour (`server/src/diagrams`), already original and tested there |
| DAT-083 to DAT-088 | server sync in `lib/qubdi` (local copy, fingerprints, autosave timing, sync state) |
| DAT-090 | the read-only viewer reads the server content; it is a view, not model code |
| DAT-089 | covered as a "drop": the stray `diagramId` is removed on read and never written (wire test) |
| EDT rows about layout, canvas, filter panel, menus, shortcuts, toasts, dialogs, pickers, DBML diff, auto-arrange layout, Move to Area placement (EDT-204, EDT-205), Clear dialog (EDT-226), clipboard and toasts (EDT-227 to EDT-229, EDT-235, EDT-236) | UI or store work in phases 5 and 6; the model pieces they need exist (commands, `planPaste`, `design.replace`, `resetHistory`) |
