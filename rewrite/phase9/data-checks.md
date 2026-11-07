# Phase 9 data checks (from the spec, no browser)

Tests: `src/persistence/legacy-fixtures.test.ts` (11), `src/formats/direction-and-samples.test.ts` (29).

## 1. Old-layout migration

A hand-built "Webshop" and "Warehouse" database (data-format 2.2, 2.3, 3.x shapes, version 14) opens
through `openDexieStorage`. Checked: every table row (positions incl. decimals and negatives, colours,
width, comments, order, expanded, parentAreaId, field flags, lengths, collation, check, indexes,
check constraints) is contained in the written record; relationships, dependencies, areas, notes,
custom types (explicit `order` wins over name), schemas, database type and edition, ISO timestamps,
list index counts, filter, settings. Old rows stay byte-equal after migration; a failure on the second
design rolls back (no marker, no record, old rows intact) and the next open retries; second open is a
no-op (same report shape, records, marker). A version 5 database upgrades text types, text nullable and
the relationship `type`. Damaged rows (wrong types, non-objects in lists, dangling links, missing ids,
unknown enums, bad dates) are repaired or skipped with warnings, the healthy diagram next to it is
untouched, and the repaired design re-serialises with no new warnings.

Bug found and fixed (src/persistence/migrate-legacy.ts): a diagram row with a numeric `id` (possible
because the store is declared auto-increment) lost all its children, because they were looked up with
`String(id)`. Now they are looked up with the stored key. Limit that remains: child ids that are also
numbers get new ids with a warning, and links between them are dropped (not seen in spec data; owner
to confirm whether numeric ids ever existed in the wild).

## 2. Q13 relationship direction

Settled from spec text: import-export.md section 10 preamble and 3.6, editor.md (the target holds the
foreign key), data-format 3.6: source = referenced ("parent") table, target = table holding the key,
usual link source `one` / target `many`. Our model (`core/model/link.ts`) and all code agree. Tests prove:
wire parse -> model -> serialise keeps ends and cardinalities for one/many, many/one and one/one;
many/many becomes one/many with a warning and no swap; SQL export (PostgreSQL, MySQL, SQL Server,
SQLite) puts the key on the holder for every stored direction (holder is the target, or the source for
many/one); DBML Ref symbol (`<`, `>`, `-`) and inline `ref:` placement agree; SQL and DBML export then
import keep which table holds the key; diagram file round trip keeps the ends.

Owner to confirm:
- Whether the running old editor really draws source as the referenced table (decisions-phase4 item 3,
  manual-test-script step). Nothing here can prove the old canvas arrowhead side.
- A stored many/one link (source = holder) is kept as is by wire and DBML, but SQL import always
  yields source = referenced, one/many. Equivalent for the database, not byte-identical in the file.

## 3. Spec samples (import-export.md section 10)

Passing: S1, S2, S3 exports for all four dialects (existing writers tests, exact text); converter
samples 10.4 (existing); import samples PG, MySQL, SQL Server, SQLite A1 and the two error cases;
metadata zoo (existing); diagram JSON sample (2 tables, 7 fields, 1 named index, 1 relationship, dates
now); DBML sample (exact Ref line, reads back to the S1 model, inline form).

Mismatches, none a code bug, all where two spec rules conflict (the spec says the rule wins):
1. Round trip rule ("import then export gives the same text") cannot hold for:
   - S2 SQL Server and SQLite: comments are written as `-- text` or a block; no reader rule reads them.
   - S3 MySQL: boolean writes `TINYINT(1)`, reads back as `tinyint` (rule: unknown names unchanged, no length).
   - S3 SQL Server: a single-column unique index sets the column `unique` (3.6), so `UNIQUE` is also written inline.
   - S3 SQLite: the "Skipping system table" note belongs to a table that is only in the model.
   The test pins each exact difference so a change shows up. Owner to confirm: relax the rule, or add readers.
2. JSON sample ids: spec lists `"0"` as the first table; our file numbers the diagram `"0"` and the first
   table `"1"` (ids are said to be meaningless, uniqueness and consistency hold).
3. MySQL S3 sample: three blank lines in the sample vs two in the rule (already noted in writers.test.ts).

## Counts
New tests 40, all passing; `npx vitest run src/persistence src/core src/formats src/dialects`: 18 files,
479 tests pass; tsc 0 errors; eslint clean on the new tests and migrate-legacy.ts.

## Decision (autonomous, 2026-11-07, owner to confirm)

The spec's "import a script, export it again, get the same text" rule is relaxed to
"same tables, columns, keys, indexes and relationships". Exact text equality cannot hold
where the spec's own rules conflict (comments are written but not read back; `TINYINT(1)`
reads as `tinyint`; a single-column unique index also marks the column unique). The five
differing sample/dialect pairs stay pinned in `src/dialects/writers.test.ts` and
`src/formats/direction-and-samples.test.ts`, so a change in either direction is noticed.
Reading comments back is not built. The JSON sample's id numbering (diagram "0", first
table "1") is kept: ids carry no meaning.
