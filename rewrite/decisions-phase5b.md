# Phase 5b decisions and open points (integration)

## Decisions

1. **Kept SQL export code is replaced, not repaired.** The old cross-dialect convert
   (`canonical`, `checks`, `defaults`, `render-type`, `convert-schema`) and `foreign-keys` are removed:
   `src/dialects/convert` and `src/formats/sql/export-sql` do the same job. Their output-level tests are
   kept and run through `src/qbase/sql-adapters.ts` (`exportDiagramSql`: wire-shaped diagram to model to
   writer); the tests of the removed internals (`parseSourceType`, `renderType`, `convertCheck`,
   `parseDefault`, `collectForeignKeys`) are deleted (they stay in git history, commit before this one).
2. **Kept SQL import validators are replaced** by the dialect readers (`dialects/*/read.ts`,
   `dialects/shared/validate.ts`); their tests are ported to the reader diagnostics.
3. **Metadata.** `src/qbase/metadata-adapters.ts` gives C17 and C18 their wire shapes; QBase code imports
   it directly. `@/lib/data/import-metadata/import` stays the model-level loader the clean author tests.
4. **Type catalogue** is provided by `src/qbase/dialect-types.ts` (`provideDialectTypes`), called from
   `main.tsx` and the test setup.

## Behaviour the old tests expect that the new converter lacks (tests skipped with `it.skip`)

Needs a change in `src/dialects` (not done here):

- A time-zone type approximated to MySQL `DATETIME` gets no `-- Was:` comment and no note.
- SQLite target: no single note that decimals are only `NUMERIC affinity`.
- MySQL target: an auto numbered column that is in the primary key but not its first column gets no
  `KEY (col)`; MySQL then refuses the table (error 1075).
- PostgreSQL target from a MySQL source writes `TEXT` upper case; the type table of the spec says `text`.
- SQL Server target: enum CHECK values are not written as `N'..'` national strings.
- Array columns stored as JSON get the default `'{}'` where `'[]'` is the JSON array.
- A table or column name longer than the target keeps (MySQL 64) is written unchanged, with no "Names"
  note.
- SQL Server reader: no warning for backtick-quoted names (the old validator had one).
- The foreign key note reads `child: FOREIGN KEY ("code") child -> parent) not created: ...` (a stray
  bracket, no "on").

## Differences taken as decided (tests changed)

- Generic, Oracle and ClickHouse have no SQL writer: an error, not the old "-- no converter" text.
  The old `canConvert` is replaced by checks on diagnostics. Generic to generic is therefore no longer
  exported.
- No `onlyRelationships` and no `isDBMLFlow` option: DBML has its own writer (hostile names are tested there).
- Key sized text columns are shortened to 768 (MySQL) as the spec says, not 255.
- Note wording follows the spec (`not an integer column: the column is not numbered`, ...).
- Imported PostgreSQL/SQL Server diagrams mark a column `unique` when a single-column unique index
  covers it, the primary key index included (the old importer did; re-sync compares it).


## Update after the converter fixes

The six `it.skip` tests are enabled again; three needed their expected wording updated to the new
notes (time zone is lost, `N'` prefix on SQL Server check strings, long-name notes). All of
`src/lib/data/sql-export` now runs with nothing skipped.
