# Phase 9 restore: Oracle, ClickHouse, Backup menu, New dialog tabs

Owner, 2026-11-08: "keep all old UI/UX". This file records the choices made where the spec is
silent or ambiguous. Rows: EXP-008, SHL-064, SHL-032, SHL-042, IMP-001.

## Oracle and ClickHouse

- No more open-only designs: `isOpenOnly`, the banner and the locked menus are gone. Stored
  files keep their type and edit like any other (wire round trip tests unchanged).
- Traits (editor 14.1): schema pickers for both; Oracle has no default schema, ClickHouse has
  `default`; no arrays, no custom types; checks for Oracle, none for ClickHouse; default new
  column type `number` for Oracle, `bigint` for ClickHouse (kept, so `bigint` is in the
  ClickHouse list as one of the SQL-standard aliases).
- Type lists: Oracle 23 names (lower case, like imported names); ClickHouse the UInt/Int
  families, Float, Decimal, String, FixedString, dates, UUID, Bool, Enum, LowCardinality, Tuple,
  Map, Nested, Array, IPv4/6, geo, JSON and SQL aliases, kept in ClickHouse's own spelling.
- SQL export (spec 9.1.1, 9.1.10): a generic generator (`src/dialects/generic/write.ts`).
  The spec says a same-type export falls back to the PostgreSQL generator; that would write
  PostgreSQL for an Oracle design, so the same type also uses the generic generator, with its
  own warning header ("-- Oracle (generic SQL)"). A pair with no converter (either side Oracle
  or ClickHouse, or generic to Oracle) gets the "A to B ... WARNING: there is no converter"
  header. Schemas, enums, checks and comments are written only where the target's capabilities
  say so; views are left out and reported as a warning. ClickHouse type names are written in
  ClickHouse's spelling.
- Export SQL menu: an Oracle or ClickHouse diagram offers its own type first, then the five
  standard targets. They are NOT offered as targets from other databases (spec A6 and open
  question 4: "never offered as targets"). Generic still has no writer.
- SQL import: Oracle has its own reader (quotes `"`, VARCHAR2(n CHAR|BYTE), NUMBER(p,s),
  `GENERATED ... ON NULL AS IDENTITY`, TIMESTAMP ... WITH LOCAL TIME ZONE, COMMENT ON) and the
  per-line warnings of spec 3.4. Semicolon warning is off (not listed for Oracle). Type
  detection for Generic text has an Oracle step before the PostgreSQL keywords (VARCHAR2,
  NUMBER(n), SYSDATE, SYS_GUID, BINARY_FLOAT/DOUBLE, PCTFREE/NOCOMPRESS/NOLOGGING, TABLESPACE).
  `INTERVAL DAY(n) TO SECOND(n)` keeps only "interval day" (not worth a special case).
- ClickHouse has no SQL reader (spec 3.1): the SQL tab is not offered, the Import > SQL menu item
  is disabled, and `importSql` still answers "Unsupported database type".
- DBML: both types use the common DBML code (like MySQL), no array support; tests in
  `src/dialects/p9-oracle-clickhouse.test.ts`.
- Database-metadata path: `loadFromDatabaseMetadata` already accepts any type; new scripts
  `src/features/import/scripts/oracle.ts` (USER_* views, 12.2+) and `clickhouse.ts` (`system.*`).
  Oracle: defaults, view definitions and check conditions are left out (LONG columns).
  ClickHouse: the sorting key is reported as the primary key, no foreign keys or indexes.
  **Neither script has been run against a live server** (no Oracle or ClickHouse here); the
  tests check the contract keys and that the metadata they would return loads.
- Field attributes: `fixedstring` takes a length, `decimal32..256` precision, Oracle `number`
  can auto-number, ClickHouse cannot; Oracle length limits (4000/2000/1000).

## Backup menu (SHL-064)

Fourth menu after View: Export diagram (JSON export dialog) and Restore diagram (JSON import
dialog), same handlers as the items under the first menu. Wording lives in
`editor.workspace.menu.backup.*` (8 languages), so the final wording can change in one place.
The first menu is still labelled "Diagram" (the old "Actions" wording comes with visual-copy).

## New diagram dialog (SHL-032, SHL-042)

- `database-picker.tsx`: Transactional tab (MySQL, PostgreSQL, MariaDB, SQLite, SQL Server,
  Oracle, CockroachDB) and Analytical tab (ClickHouse), three cards per row, two rows shown.
  "More databases" moves the window one row down (SQLite ... CockroachDB), "Primary databases"
  moves it back. Reading of the spec's "next or previous row".
- Cards show a neutral database icon; `DATABASE_LOGOS` in `database-groups.ts` is the empty
  map where a logo image address goes later.
- Generic: still the pre-selected type on every opening (IMP-004); since it has no card, a
  small link under the tabs ("Use a generic database instead") chooses it again.
- Button wording ("Blank diagram", "Continue") unchanged; the spec's "Empty diagram/database"
  wording comes with visual-copy.md.
