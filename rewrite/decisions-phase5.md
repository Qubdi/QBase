# Phase 5 decisions and open points

From the clean author's report (2026-11-07). Accepted by the assistant on the owner's standing
instruction; spec contradictions are listed so the owner can overrule them.

## Accepted choices

- MySQL `#` comments are read as comments; `CREATE TEMP TABLE` is not imported (summary warning).
- Non-PostgreSQL readers give one summary warning per skipped statement kind.
- Source type names are kept as written, lower-cased; MySQL `unsigned`, display width and enum/set
  values are dropped silently (the MySQL sample expects no warning).
- `DEFAULT NULL` is stored as no default (the MySQL sample wins over spec 3.6).
- Generic, Oracle and ClickHouse have no SQL writer: an error "SQL export is not supported".
  CockroachDB writes through the PostgreSQL writer; a generic diagram converts as PostgreSQL-like.
- The SQL reader is our own tokenizer and DDL parser; `node-sql-parser` is used only to find the
  tables a view reads. DBML import uses `@dbml/core`; DBML export is our own writer.
- "Found N tables" is an `info` diagnostic (third severity).
- Writers skip the table/schema prefix on index names that already start with it (keeps
  import-export-import idempotent).

## Spec contradictions (unverified against the old editor)

1. MySQL export sample S3 shows three blank lines after `CREATE DATABASE`; the rule says two. The
   writer follows the rule.
2. A single-column unique index sets `unique` on the column and keeps the index; the PostgreSQL
   writer then skips that index, so a re-import loses the index (the second export is identical).
3. MySQL enum columns export as `VARCHAR(50)`, so enums do not round-trip as types.
4. `core/wire` numbers the diagram first (first table is "1"); spec 9.3 expects "0".
5. Spec 10.1 says the customers table has no index; the model adds a primary-key index to every
   table with a primary key.
6. Inline DBML refs keep the library's order (referenced table first); spec 4 is ambiguous.
7. Layout test (IMP-043) asserts a weaker property than the spec wording, which cannot hold in
   general.
8. Check-expression functions are not restricted: any name followed by a bracket counts as a call
   (owner to confirm).

## Not done (Phase 6)

IMP-075 to IMP-083: import into an open diagram, re-sync and DBML apply (need the store and
commands). EXP-004, the EXP-057 toast and EXP-067 are UI. IMP-003/056/058 (metadata scripts,
editions picker, SSMS dialog) are product copy and UI.

## Owner to confirm

- Run the spec's sample outputs once against the old editor (needs a running old build) to settle
  the contradictions above.
