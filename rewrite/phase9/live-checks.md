# Phase 9: live checks against real databases and the Docker image

Run on 2026-11-07/08 with throwaway containers (names `qbtest-*`, random passwords, bound to 127.0.0.1), all removed afterwards.

## Versions run

| Target            | Version                             | Result                                                                      |
| ----------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| PostgreSQL        | 18.6 (alpine), 16.15 (alpine)       | standard, Supabase and Timescale scripts all run; standard result imported  |
| CockroachDB       | CCL v26.3.5 (single node, insecure) | script run, result imported                                                 |
| MySQL             | 8.4.13                              | run, imported                                                               |
| MySQL 5.7 edition | 5.7.44                              | run, imported                                                               |
| MariaDB           | 11.8.9                              | run, imported                                                               |
| SQL Server        | not run                             | the image needs `ACCEPT_EULA`, which was not accepted on the owner's behalf |
| SQLite            | already tested on a real database   | unchanged                                                                   |

## How

The script text came from `metadataScriptFor(type, edition)` (dumped by a throwaway vitest file), was piped into `psql -At`, `cockroach sql --format=raw`, `mysql -N -r -B` / `mariadb`, and the single result cell was fed through `repairMetadataText`, `parseMetadataText` and `loadFromDatabaseMetadata`; the resulting design was printed table by table and compared with the DDL.

Sample schemas (written for this check): PostgreSQL had schemas `sales`/`hr`/`public`, an enum, a composite type, a domain, identity (always/by default) and serial columns, a generated column, array columns (`text[]`, `integer[][]`), composite primary and foreign keys, a self-referencing key, unique keys, partial, expression, `DESC`, GIN, GIN with operator class, `INCLUDE` and partial-unique indexes, a range-partitioned table with a partition, a view, a materialized view with an index, table and column comments, check constraints, and a table and column with spaces and quotes in the names. MySQL/MariaDB had auto_increment, unsigned, `ENUM`/`SET`, decimal, a generated column, fulltext, prefix and unique composite indexes, composite and self-referencing foreign keys with `ON DELETE`, check constraints, string/number/expression defaults, a view, comments, and awkward names. CockroachDB had a schema, an enum, `unique_rowid()`, arrays, comments, a descending index, a composite foreign key, a check and a view.

## Bugs found and fixed

1. MySQL 8 and 5.7: the script failed on every client with `ERROR 1271 Illegal mix of collations for operation 'concat'` (JSON_QUOTE is `utf8mb4_bin`, `CAST(.. AS CHAR)` and `IF(.., 'true', ..)` take the connection collation). Only MariaDB had run before. Fix: `n`, `b` and the precision piece are converted to `utf8mb4 COLLATE utf8mb4_bin`. Checked with `--default-character-set` utf8mb4, utf8mb3 and latin1 on 8.4, 5.7 and MariaDB.
2. MySQL 8: check expressions came back as `(`placed` > _latin1\'2000-01-01\')`. The escaped quotes and character-set introducers are now removed.
3. MySQL 8 / 5.7: a string default came back unquoted (`new`, `it's`), so the design lost that it was a string; MariaDB already quotes. Now strings are quoted with `QUOTE()`, numbers, `CURRENT_TIMESTAMP` and expression defaults (`DEFAULT_GENERATED`) are kept raw, and MariaDB's text `NULL` default is dropped.
4. MySQL: view columns reported a made-up default (`def=0`); no default is read for views now.
5. PostgreSQL: an index column was read through `pg_get_indexdef`, which quotes names (`"Mixed Col"`), so the index did not match its column and was silently dropped. Plain columns are now read from `pg_attribute` through `indkey`; expressions still use `pg_get_indexdef`.
6. PostgreSQL: a partial unique index (`UNIQUE ... WHERE deleted_at IS NULL`) was reported as `unique`, which made its column look unique. `unique` is now `indisunique AND indpred IS NULL`.
7. Import (`src/formats/metadata/load.ts`): the builder's warnings (an index on an expression such as `lower(email)` is dropped) were thrown away, so the user was not told. They are now returned as diagnostics.
8. Docker image: `docker build` failed at `npx tsc -b`, because `.dockerignore` removes every test folder and the project check includes the tests. The Dockerfile now runs `npx tsc -p tsconfig.image.json` (new file, same options without the test folders); CI still runs `tsc -b`. Test: `src/__tests__/docker-typecheck.test.ts`.
9. Server tests: `server/test` had the login `qbase:qbase` fixed. `TEST_PG_USER` and `TEST_PG_PASSWORD` can now replace it (default unchanged).

Tests added: `src/features/import/__tests__/server-scripts.test.ts` ("fixes found on live databases", 6 tests: assertions on the script text plus hand-written results for the unique and expression-index cases), `src/__tests__/docker-typecheck.test.ts`.

## Checked and correct

PostgreSQL 16 and 18 (same output apart from the version): all tables with schemas and comments, partition child hidden behind its parent, columns with types, lengths, numeric precision/scale, arrays, nullability, defaults, identity/serial flags, generated column (shown as a default expression), enum and composite types, composite and unique keys, composite and self-referencing foreign keys (one link per column), DESC / partial / GIN / INCLUDE indexes with access method, checks, views and materialized views (with `CREATE ... AS` text), names with spaces and quotes. Supabase and Timescale scripts ran without error; with an `auth` and a `_timescaledb_catalog` schema present, the standard script lists both, Supabase hides `auth`, Timescale hides `_timescaledb_catalog`. CockroachDB: everything above that it supports, `unique_rowid()` columns flagged as increment, comments, descending index kept as an index. MySQL 8.4 / 5.7 / MariaDB: keys, links, fulltext method, prefix index, unique composite, enum/set, decimal precision, comments, collation, views.

## Known limits seen (not fixed)

- Indexes on an expression and a generated column's expression are not representable; the index is dropped with a warning (item 7), generated columns import as ordinary columns with the expression as default.
- Index sort direction and partial predicates are not part of the design, so `DESC` and `WHERE` are lost on import.
- Domain-typed columns import with the domain name as their type; the domain itself is not listed.
- The server route `POST /api/introspect` (used by import-from-database and re-sync) returns no `check_constraints` and no composite types, unlike the scripts. Not changed (feature, not a bug); worth a ticket.
- CockroachDB indexes carry no access method.

## Server tests (item 4)

`server/` suite against a throwaway PostgreSQL 18.6 (`TEST_PG_PORT`, `TEST_PG_USER`, `TEST_PG_PASSWORD` set from the environment): 75 files passed, 1 skipped (SQL Server), 995 tests passed, 13 skipped (SQL Server), 91 s. No server bug found. The parity rows DAT-071 to DAT-081 were already `[x]` on these tests; DAT-077 (merge of rapid auto-publishes, previously manual) is now ticked on `db-scale.test.ts` against live PostgreSQL. The QBS server rows (QBS-035 to QBS-051) are covered by editor-side tests and were not changed. Note: `tsc` on `server/` reports implicit-any errors in `test/introspect-sqlserver.test.ts` (mssql types); this was already so and the file was not touched.

## Docker image (item 5)

`docker build -t qbtest-app .` succeeds after fix 8. Container started with the throwaway PostgreSQL on a private network:

- `/health` 200 `{"ok":true}`, Docker health status `healthy`.
- `/` 200 `text/html`, `/config.js` 200 `window.env = { QUBDI_BACKEND_URL: "/api" }`.
- API: first registration became admin, login and `/api/auth/me` and `/api/projects` worked, migrations ran at start.
- `POST /api/introspect` to a live PostgreSQL 18 on the same network: refused with `target_blocked` until `INTROSPECT_ALLOW_HOSTS` named the host (the guard works), then returned 10 tables, 2 views, 39 columns, 8 keys, 5 foreign keys, 19 indexes, 1 type.
- Playwright smoke: `tools/e2e/smoke.mjs` now takes `BASE_URL` (skips its own build and server). Pointed at the container it fails, as expected: its steps drive local-only mode and the image opens on the sign-in page of server mode. The `PASS` for the CSP step only. A server-mode browser flow (login, project, diagram, save, lock) is **not** covered by an automated run; this stays unverified.

## Not verified

SQL Server (all editions); the Wrangler command variant for D1; a psql variant; a browser run of server mode; the re-sync dialog against a live database through a browser (EDT-250); CockroachDB with a multi-node cluster or secure mode.

## Introspection and import fidelity (second pass)

Run on 2026-11-08 against throwaway containers `qbtest-pg18` (PostgreSQL 18.6), `qbtest-pg16` (16.15), `qbtest-mysql8` (MySQL 8.4.13), `qbtest-maria11` (MariaDB 11.8.9): random password, bound to 127.0.0.1, no volumes; all removed afterwards. SQL Server was **not** run (EULA not accepted); its changes are covered by unit tests with a fake pool only. The server has no MySQL, MariaDB or SQLite path: `POST /api/introspect` serves PostgreSQL and SQL Server only.

### Gaps closed

| Gap from the first pass | Now |
| ----------------------- | --- |
| `POST /api/introspect` returned no `check_constraints` and no composite types | PostgreSQL: check constraints (bare expression, partition children hidden like the script), enum and composite types. SQL Server: `check_constraints` (`sys.check_constraints`); `custom_types` is `[]` (it has none). |
| Index `DESC` lost on import | New `Key.descending` (ids of the members sorted high to low). Read from the `direction` field of every script and of the server (case-insensitive: the server says `DESC`). Writers: PostgreSQL, SQLite and MySQL emit `col DESC`; the cross-database converter emits it too. |
| Partial-index predicate lost | New `Key.where` (SQL text without `WHERE`). Metadata `indexes[].where` (PostgreSQL `pg_get_expr(indpred)`, SQLite from the index SQL, SQL Server server `filter_definition`). PostgreSQL and SQLite writers emit `WHERE ...`. A partial unique index is now reported as unique with its predicate; the import does not let it mark its column unique. The converter drops the predicate and says so in its notes. |
| Domain-typed column imported with the domain name as type | `Column.domain` keeps the name; `type`, length and precision are the domain's base type (script and server). The domain itself is not listed and no writer creates it (a custom-type list entry would need a new kind). |
| Generated column imported as an ordinary column with the expression as default | New `Column.generated = { expression, stored }`; the column has no default then. PostgreSQL (`attgenerated`, 12+; 18 `VIRTUAL` too), MySQL/MariaDB (`GENERATION_EXPRESSION`, `EXTRA`), server PostgreSQL, SQL Server server (`sys.computed_columns`). Writers: PostgreSQL `GENERATED ALWAYS AS (expr) STORED|VIRTUAL`, MySQL/MariaDB `GENERATED ALWAYS AS (expr) VIRTUAL|STORED`, SQLite `GENERATED ALWAYS AS (expr) STORED|VIRTUAL`. The converter writes an ordinary column and says so. |
| SQLite script dropped generated columns altogether and always said `asc` | Generated columns are listed (type only: the pragma gives no expression), `DESC` and the partial predicate are read from `pragma_index_xinfo` and the index SQL. Checked on `node:sqlite`. |
| SQL Server client script used `ic.is_descending` (no such column; the script would fail) | `ic.is_descending_key`. Not run on a server; the name is the one the server code already uses. |

Wire format (backward compatible): column keys `domain`, `generatedExpression`, `generatedStored`; index keys `descendingFieldIds` (list of field ids), `where`. All optional and omitted when empty; old files load unchanged and unknown keys are still kept. DBML export is unchanged: DBML has no syntax for `DESC`, partial predicates or generated columns, and the DBML diff (Accept Changes) must not see them as edits, so it does not compare them.

### Verified live

- PostgreSQL 18 and 16: the client script, run with `psql -At`, and `POST /api/introspect` (in-process app, real PostgreSQL, `server/test/introspect-extras.test.ts`) give the same design through the real importer: `DESC` on `(score DESC, id)`, two partial indexes (one unique) with `(deleted_at IS NULL)`, `sales.email` (varchar(120)) and `public.pos_int` domains, a stored generated column, two checks, one enum, one composite.
- MySQL 8.4 and MariaDB 11.8: `DESC`, a `STORED` and a `VIRTUAL` generated column, two checks (MySQL's `(`x` >= 0)` form and MariaDB's `` `x` >= 0``).
- Hand-written JSON fixtures taken from those results: `src/formats/metadata/fixtures/live-*.json`; test `src/formats/metadata/index-details.test.ts` (import, the three writers, wire round trip, old files, unknown keys, DBML, converter notes).
- Server tests: `server/test/introspect-extras.test.ts` (own database `qbase_extras`, partitioned table included), SQL Server fake-pool tests in `introspect-sqlserver-unit.test.ts`.

### Still open

- (closed in the third pass below) SQL-file import did not read `DESC`, `WHERE` or `GENERATED ALWAYS AS`.
- SQLite: a generated column's expression and check constraints are not in the pragma output; only the metadata for PostgreSQL, MySQL/MariaDB and the server has them.
- Domain: metadata/server path: only one level (a domain over a domain reports the inner domain's name as type); the domain's own CHECK and default are not read. (The SQL-file path follows a chain of domains to the innermost base type.)
- CockroachDB script: no domains, no generated columns (its catalog differs), unchanged otherwise.
- (closed in the third pass below, but still not run on a server) SQL Server writer and client script now carry `descending`, `where` and `generated`.
- PostgreSQL 11 and older: the script uses `attgenerated` (PostgreSQL 12+).
- The spec sentence (import-export.md, PostgreSQL metadata) says "enum types (not composites)"; the script already listed composites, IMP-063 requires them, and the server now does too. The contract is kept as the shared JSON and IMP-063; the spec sentence is outdated.
- Not driven in a browser: re-sync dialog (EDT-250).

## Third pass: SQL-file import, SQL Server

### Changed

| Gap | Now |
| --- | --- |
| SQL-file import dropped `DESC`, partial predicates, generated columns and domains | The readers (shared `read-table.ts`, `read-script.ts`) keep them. `CREATE [UNIQUE] INDEX ... (a DESC, b ASC) WHERE pred` (PostgreSQL, SQLite, SQL Server filtered index; the predicate ends before `WITH (...)`/`ON filegroup`) sets `Key.descending` / `Key.where`; MySQL `KEY (a DESC)` inside `CREATE TABLE` too. A partial unique index no longer marks its column unique. Generated columns: PostgreSQL `GENERATED ALWAYS AS (e) STORED|VIRTUAL`; MySQL/MariaDB/SQLite `GENERATED ALWAYS AS (e) VIRTUAL|STORED` and the short `AS (e)`; SQL Server `col AS (e) [PERSISTED [NOT NULL]]`. Stored = `STORED` or `PERSISTED`, else virtual. PostgreSQL `CREATE DOMAIN d AS base`: a column of type `d` gets `Column.domain = d` and the base type, length and precision (a domain over a domain resolves to the innermost base). |
| Diagnostics for what cannot be kept | Warnings: a domain's `DEFAULT`/`CHECK`/`COLLATE` (the column keeps name and base type only); `INCLUDE (...)` columns of an index; an expression index column such as `lower(name)` (dropped); a typeless computed column (`col AS (e)`, SQL Server and SQLite give no type): imported as the dialect's fallback type (`varchar` / `text`) with a warning. `CREATE DOMAIN` is no longer in the "skipped" count. |
| Writers did not round-trip them | PostgreSQL writes `CREATE DOMAIN d AS <base type>;` (before the tables; not for CockroachDB, which has none) and the column uses `d`. SQL Server writes `[col] AS (expr) [PERSISTED [NOT NULL]]`, `([a] DESC, [b]) WHERE pred`. MySQL cannot keep a partial index: `exportSql` now returns a warning per such index for MySQL/MariaDB targets (before it dropped the predicate silently). PostgreSQL, SQLite, MySQL writers unchanged (they already wrote DESC/WHERE/generated). |
| Converter (other family -> target) | Unchanged policy, now tested for SQL Server as target: `DESC` kept, a predicate is dropped and a computed column becomes an ordinary column, each with a conversion note (expressions are not translated between dialects). |
| SQL Server client script had no `where`, no `generated` | Both variants (FOR JSON and the 2016-and-below FOR XML text) select `i.filter_definition AS where` and `LEFT JOIN sys.computed_columns cmp` giving `generated` = `{expression: cmp.definition, stored: is_persisted}` (nested via `generated.expression` / `generated.stored` in FOR JSON; null for an ordinary column). `direction` already came from `ic.is_descending_key`. The server introspection (`server/src/introspect/sqlserver.ts`) already returned `where` and `generated`. |

Tests: `src/formats/sql/index-and-generated.test.ts` (per dialect: read, diagnostics, export-then-import gives the same columns/keys/DESC/WHERE/generated/domain, incl. SQL Server and MariaDB), `src/features/import/__tests__/sql-server-script.test.ts` (script text checks, hand-written result in the shape the script emits, load, write back, read back), the existing fake-pool test `server/test/introspect-sqlserver-unit.test.ts`. Parity row IMP-025 got a note (CREATE INDEX with DESC/WHERE); other rows untouched.

### Verified

- PostgreSQL 18 (throwaway container `qbtest-pg`, removed with its volume): the writer's output with `CREATE DOMAIN`, a `GENERATED ALWAYS AS (...) STORED` column, `"score" DESC` and `WHERE d IS NULL` runs without error.
- SQLite (`node:sqlite`): the writer's output with `GENERATED ALWAYS AS ... STORED|VIRTUAL`, `DESC` and `WHERE` runs.

### NOT run

- SQL Server: no container was started (EULA). The SQL Server client scripts (both variants), the SQL Server writer output (computed columns, filtered index, DESC) and the server's `sys.computed_columns` / `filter_definition` queries were checked by reading and by hand-written fixtures and the fake pool only. First thing to do on a real server: run the script and compare `generated` and `where`.
- MySQL/MariaDB writer output with `GENERATED` was not re-run in this pass (it was in the second pass).

### Still open

- SQL Server round trip loses the computed column's type: T-SQL has no type in `col AS (expr)`, so a design with a computed `varchar(101)` reads back as `varchar` with a warning (everything else, including the expression and PERSISTED, is kept). SQLite has the same only when the script omits the type (the writer writes it).
- Index `INCLUDE` columns and expression index columns are still not in the model (warned, dropped). The `WITH (...)` options of an index are ignored.
- The PostgreSQL writer writes `VIRTUAL` for a non-stored generated column; PostgreSQL 17 and older reject it (18 accepts it). Not changed.
- A domain's own `CHECK`/`DEFAULT`/`NOT NULL` is dropped (warned); the writer's `CREATE DOMAIN` carries only the base type, and when two columns name the same domain with different base types the first one wins.
- DBML export unchanged: DBML has no syntax for `DESC` per column, `WHERE` or generated columns (index settings are `type`, `name`, `unique`, `pk`, `note`), and the parser would reject invented syntax.
