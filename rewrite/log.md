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

| 2026-11-07 | `src/dialects` (registry, capability matrix, type catalogues, defaults; readers and writers for PostgreSQL, MySQL, SQL Server, SQLite; MariaDB and CockroachDB variants; read-only generic; converter) | n/a in this checkout | `spec/import-export.md` s1, s3, s9, s10 | clean author session, phase 5 | not run here | IMP-001, IMP-002, IMP-008, IMP-012 to IMP-014, IMP-016 to IMP-021, IMP-023 to IMP-039, EXP-001 to EXP-003, EXP-005 to EXP-016, EXP-017 to EXP-048 | tests: `src/dialects/writers.test.ts`, `src/dialects/converter.test.ts`; the spec samples S1 to S3 and the two converter samples pass byte for byte except the MySQL S3 blank lines (see below) |
| 2026-11-07 | `src/formats/sql` (importSql, exportSql, diagnostics, design builder, layout, check-expression checker) | n/a | `spec/import-export.md` s3, s9 | clean author session, phase 5 | not run here | IMP-015, IMP-018 to IMP-043, EXP-049, EXP-068 | tests: `src/formats/sql/import-sql.test.ts`; the reader is an own tokenizer and statement parser; `node-sql-parser` is used only for the tables a view reads (metadata flow) |
| 2026-11-07 | `src/formats/dbml` (import, export) | n/a | `spec/import-export.md` s4, s9.2 | clean author session, phase 5 | not run here | IMP-045 to IMP-055, EXP-050 to EXP-056 | tests: `src/formats/dbml/dbml.test.ts`; import uses `@dbml/core`, export is an own writer |
| 2026-11-07 | `src/lib/data/import-metadata` (fixed-path contract) and `src/formats/metadata` (loader, relationships, text repair, selection) | n/a | `spec/import-export.md` s5; `server/src/introspect` | clean author session, phase 5 | not run here | IMP-057, IMP-059 to IMP-065 | tests: `src/formats/metadata/load.test.ts`; `server/` typechecks against the contract (run in docker) |
| 2026-11-07 | `src/formats/file`, `src/formats/image` (JSON file writer on core/wire; pure image options, names, bounds, logo) | n/a | `spec/import-export.md` s9.3, s9.4 | clean author session, phase 5 | not run here | EXP-058 to EXP-066 | tests: `src/formats/file/diagram-file.test.ts`, `src/formats/image/export-options.test.ts` |

### Phase 5 decisions on "open check" items and spec conflicts

- MySQL `#` comments: read as comments in the MySQL reader (Q19). `CREATE TEMP TABLE`: not imported, one summary warning (Q19).
- IMP-017: every non-PostgreSQL reader reports skipped statement kinds (trigger, function, extension, ...) as one summary warning per kind.
- IMP-035/IMP-039: the source type name is kept lower-cased; MySQL `unsigned`, display width and enum/set values are dropped silently (the A1 sample expects no warning). An unknown type is kept as written.
- `DEFAULT NULL` is stored as no default (the A1 MySQL sample), although spec 3.6 says the text `NULL`.
- Single-column unique index on import: the column gets `unique` and the index is kept as well. Because the PostgreSQL writer skips such an index, the re-import loses it; the second export is identical (EXP-068 holds on text).
- Index names read back from a script already carry the table (or schema) prefix the PostgreSQL, SQLite and SQL Server writers add; the prefix is not added twice. Without this the spec's own idempotence rule cannot hold.
- MySQL export S3: the spec sample shows three blank lines after `CREATE DATABASE`, its rule and prose say two; the writer follows the rule (two). The test records this.
- EXP-007/EXP-008 (Q10): generic, Oracle and ClickHouse have no writer and give an error "SQL export is not supported"; CockroachDB writes through the PostgreSQL writer; a generic diagram goes through the converter as a PostgreSQL-like source.
- EXP-025 (Q1): the old spacing is kept (several blank lines in MySQL, two in SQL Server and SQLite).
- EXP-028 (Q11): SQL Server string defaults double the quotes.
- EXP-056: a relationship with an empty name is written with the fixed fallback `rel`.
- IMP-050 inline refs: the DBML library stores an inline `[ref: > a.id]` with the referenced table first; the importer keeps that order.
- IMP-054: DBML string defaults keep their quotes; IMP-053: accents are not replaced.
- SQL "Found N tables" count is an `info` diagnostic (third severity), not a warning.
- `core/wire` numbers the diagram itself first when exporting a file, so the first table is "1"; spec 9.3 starts at the table. Not changed (core).

### Phase 5 rows with no test or no code, and why

| Rows | Reason |
| --- | --- |
| IMP-003, IMP-056, IMP-058 | metadata scripts, editions picker and the SSMS dialog are product copy and UI |
| IMP-004 to IMP-007, IMP-009 to IMP-011, IMP-044 | dialog behaviour (tabs, live timing, cursor); the readers return the messages, counts and line numbers they need |
| IMP-064 (picker) | UI; the selection filter `selectMetadata` is tested |
| IMP-066 to IMP-072 | live import wizard and server behaviour, already in `server/` |
| IMP-073, IMP-074 | file import is `core/wire` (Phase 4) |
| IMP-075 to IMP-083 | import into an open diagram, re-sync and DBML apply (merge into an existing design) are not written in this phase; they need the store and commands |
| EXP-004, EXP-057 (toast), EXP-067 | dialog and canvas capture (Phase 6) |

### Phase 4 rows with no test in these modules, and why

| Rows | Reason |
| --- | --- |
| DAT-070 | importing inside a server project is the QBase server client (`lib/qubdi`), not core |
| DAT-071, DAT-073 to DAT-081 | server behaviour (`server/src/diagrams`), already original and tested there |
| DAT-083 to DAT-088 | server sync in `lib/qubdi` (local copy, fingerprints, autosave timing, sync state) |
| DAT-090 | the read-only viewer reads the server content; it is a view, not model code |
| DAT-089 | covered as a "drop": the stray `diagramId` is removed on read and never written (wire test) |
| EDT rows about layout, canvas, filter panel, menus, shortcuts, toasts, dialogs, pickers, DBML diff, auto-arrange layout, Move to Area placement (EDT-204, EDT-205), Clear dialog (EDT-226), clipboard and toasts (EDT-227 to EDT-229, EDT-235, EDT-236) | UI or store work in phases 5 and 6; the model pieces they need exist (commands, `planPaste`, `design.replace`, `resetHistory`) |
