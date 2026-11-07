# Review: core, persistence, store, dialects, formats, qbase adapters

Read-only correctness review of branch `rewrite/clean-room`. Throwaway tests
lived in the session scratchpad (vitest, docker node:24, not in the repo).
"Confirmed" means a script reproduced it; "by reading" means the code path was
traced but not run.

Checked and found sound: undo/redo exactness (a 200-run randomised test over
add/remove table, add/remove column, links, cardinality, schema change, keys,
duplicate, group delete gave 0 undo or redo mismatches), history coalescing,
autosave write ordering, serialise/parse of known keys, writer identifier
quoting (all four writers double the closing quote).

## Ranked findings

### 1. [high] SQL import is case-sensitive and drops data silently
- `src/dialects/shared/read-script.ts:91` (`findTable`), `:376`
  (`if (!c || !table) continue`), `src/formats/shared/design-builder.ts:113`
  (`find`), `src/formats/sql/import-sql.ts:34` (index filter).
- Names are compared with `===`. SQL folds unquoted names, so
  `CREATE TABLE Users (Id int ...)` followed by
  `ALTER TABLE orders ADD FOREIGN KEY (userid) REFERENCES users(id)` finds no
  table. The ALTER branch also `continue`s when the table is not found, even
  for a foreign key that does not need it.
- Confirmed: that script yields 2 tables, 0 links, `ALTER ... ADD COLUMN`
  lost, both `CREATE INDEX` lost, `COMMENT ON TABLE` lost. The only diagnostic
  is "Found 2 tables to import". No warning at all.
- Fix: compare with a fold keyed on token kind (unquoted word: lower-case for
  PG/SQLite, case-insensitive for MySQL/SQL Server; quoted ident: exact), in
  `findTable`, `DesignBuilder.find/byName`, the index filter, and the FK
  resolution. Emit a warning whenever an ALTER/INDEX/COMMENT names an unknown
  table.

### 2. [high] Duplicate FK constraint names in SQL Server and converter output
- `src/dialects/sql-server/write.ts:159`, `src/dialects/convert/engine.ts:444`,
  `src/core/model/defaults.ts:~232` (`createLink` name).
- A new link is named `<referenced table>_<referenced col>_fk`, so every child
  table that references `users.id` gets `users_id_fk`. The SQL Server writer
  uses `fk.name` verbatim and the converter does for every non-SQLite target.
  Constraint names are unique per schema in SQL Server and per database in
  MySQL.
- Confirmed: two tables referencing `users.id` gives
  `ADD CONSTRAINT [users_id_fk]` twice; the second statement fails.
- Fix: dedupe names in the writers (append `_2`, ...), or build the name from
  the holder side as the PG and MySQL writers do. Also dedupe in `createLink`.

### 3. [med-high] Late `QubdiDB` merge strands data behind the migration marker
- `src/persistence/dexie-adapter.ts:188` then
  `src/persistence/migrate-legacy.ts:55` (marker check),
  `src/persistence/merge-previous.ts`.
- Order is merge, then migrate. If the marker is already set (earlier start,
  or the merge failed once and the marker was set anyway), a later successful
  merge copies old-layout rows into `QBase`, deletes `QubdiDB`, and the
  migration returns early. The diagrams stay in the legacy stores and never
  reach `designs`/`design_index`.
- Confirmed with fake-indexeddb: QBase opened once (marker set), `QubdiDB`
  created with one diagram, QBase opened again: `ran:false`, legacy rows 1,
  `list()` empty, `QubdiDB` deleted.
- Fix: run the migration whenever the merge copied anything (ignore or clear
  the marker when `outcome === 'merged'`), and make the migration idempotent
  per diagram (it already skips ids present in `designs`). Do not delete
  `QubdiDB` until the migration has landed.

### 4. [med] Unquoted column names `key`, `period`, `exclude`, `like`, `index` are dropped on import
- `src/dialects/shared/read-table.ts:419-444` (`CONSTRAINT_STARTERS`,
  `startsConstraint`), used at `read-script.ts:~130`.
- A table body element is a constraint when its first word is `KEY`, `INDEX`,
  `PERIOD`, `EXCLUDE`, `LIKE`, ... In PostgreSQL `key`, `period`, `exclude`
  are legal unquoted column names (`key` is very common in settings tables).
- Confirmed: `CREATE TABLE settings (id int primary key, key text, value text, period int)`
  imports as `settings(id, value)`. No diagnostic.
- Fix: decide by the second token. `KEY`/`INDEX` is a constraint only if
  followed by `(`, a name then `(`, or `USING`; `PERIOD` only before `FOR`;
  `EXCLUDE` only before `USING` or `(`; `LIKE` only before a table name and
  not followed by a type word. Otherwise treat as a column and warn when an
  element is skipped.

### 5. [med] MySQL writer: backslash in string literals breaks the script
- `src/dialects/mysql/write.ts:104, 123, 169` (`asStringLiteral`).
- `asStringLiteral` doubles `'` only. MySQL (default sql_mode) treats `\` as
  an escape, so a trailing backslash escapes the closing quote.
- Confirmed: column comment `path C:\` gives ``COMMENT 'path C:\',`` which the
  server reads as an unterminated string and swallows the next lines. The same
  holds for string defaults (`default 'a\b'` is read as `a<backspace>`) and
  table comments. The converter (`engine.ts` MySQL branches) already escapes
  `\`, so the two paths disagree.
- Fix: a `mysqlString()` that doubles `\` and `'`, used for COMMENT, COMMENT=
  and string defaults in the MySQL writer.

### 6. [med] Converter leaks the tail of a multi-line CHECK as live SQL
- `src/dialects/convert/engine.ts:396-401` (`afterTable.push(...)`), also
  `foreignStatements.push('-- not created ...')` near `:441`.
- The "not created" line is a `--` comment built from `rule.expression` (and
  names) without collapsing newlines. Only the first line is commented.
- Confirmed: a pretty-printed CHECK that cannot be converted (PG to MySQL,
  `IN (SELECT ...)`) emits a second line `  id IN (SELECT 1))` outside any
  comment, so the script fails. A table or schema name with a newline can
  inject real statements the same way (also `-- Schema: ${schema}` in
  `postgresql/write.ts:~224` and `sql-server/write.ts:~177`, `-- Original schema:`
  in `sqlite/write.ts`).
- Fix: run every text spliced into a `--` comment through `oneLine()`
  (the `Notes` class already does).

### 7. [med] PostgreSQL writer: user type referenced unquoted and unqualified
- `src/dialects/postgresql/write.ts:~59` (`typeText`, `base = userTypes.has(raw) ? raw : lower`).
- `CREATE TYPE "Mood"` is quoted (and schema-qualified) but a column of that
  type is written bare: ``"id" Mood``. PG folds it to `mood`: "type does not
  exist". Same for names with spaces and for types outside `public`/search path.
- Confirmed output: `CREATE TYPE "Mood" AS ENUM ('a'); ... "id" Mood NOT NULL`.
- Fix: quote with `qualify(quoteDouble, type.schema, type.name)` when the
  column type matches a user type.

### 8. [med] Default names collide after a delete (`table_N`, `field_N`, `index_N`, `type_N`, `Area N`)
- `src/core/model/defaults.ts:86, 104, 164-166, 241, 259`,
  `src/core/commands/plan-column.ts:23, 120`.
- N is the current count plus one. Add two, delete the first, add one gives
  two entities named `table_2`; same for columns and indexes.
- Confirmed: `['table_2','table_2']`; columns `['id','field_3','field_3']`.
  Writers then emit duplicate `CREATE TABLE` or duplicate column names (and
  DBML export drops the second table with a warning). If the spec dictates the
  literal rule, add "first free N" as a clarification.
- Fix: loop N upward until no entity (same schema, case-insensitive) /
  column / key / type / region already uses the name.

### 9. [med] Index and FK names that collide or overflow in the SQL writers
- `src/dialects/mysql/write.ts:~135` (`idx_<table>_<cols>[_unique]`, no length
  clip; limit is 64) and `:~182` (FK name drops the referenced table);
  `src/dialects/postgresql/write.ts:~275` (`foreignKeyName` clipped to 60 so
  long names collide); `src/dialects/sqlite/write.ts:~139` (index names clipped
  to 60, `CREATE INDEX IF NOT EXISTS` then silently skips the second one).
- Scenario: two indexes on the same columns with different method (btree and
  hash) both become `idx_t_a`; two FKs from `orders` on column `a` to
  different tables both become `fk_orders_a` in MySQL (error, names are
  database-wide). In SQLite the colliding index is skipped without a message.
- Fix: track used names per scope in each writer (as the converter does with
  `usedIndexNames`) and suffix on collision, clipping after dedupe.

### 10. [med] Export uses the target's default schema when applying the diagram filter
- `src/formats/sql/export-sql.ts:84`.
- The UI computes visibility with `traitsOf(design.databaseType).defaultSchema`
  (`store/selectors.ts:34`, canvas, filter tree). Export passes
  `target.defaultSchema`. A PG design with schema-less tables and a filter
  `{schemaIds:['public']}` exported to MySQL (no default schema) hides every
  schema-less table, so the result is empty or "Nothing to export".
  Exporting to SQL Server maps them to `dbo` and hides them too.
- Fix: pass the source dialect's default schema (`dialectFor(design.databaseType).defaultSchema`).

### 11. [low-med] Deleting many tables is quadratic
- `src/core/commands/apply.ts:~307` (`removeEntity` via `runGroup`).
- Each `entity.remove` copies the three part maps (all columns/keys/rules),
  re-filters `entities.order` and `links.order`, and re-scans all links.
- Measured on 500 tables, 998 links: delete 400 tables = 1.18 s on the main
  thread (undo is fast). A single column edit is ~1 ms, serialise 9 ms, so only
  bulk delete (and likely paste/duplicate of many) stalls.
- Fix: add a batched removal (one pass: build the id set, filter order and
  links once, delete parts with one copy) and have `planDeleteEntities` emit it.

### 12. [low-med] Link `item.update` with a many/many result is not an exact inverse
- `src/core/commands/apply.ts:770-779`.
- The patch is applied, then `normaliseCardinality` rewrites `sourceCardinality`,
  but the inverse is computed from the patch keys only.
- Confirmed: link many/one, patch `{targetCardinality:'many'}`: undo gives
  one/one instead of many/one. UI planners always send both fields so the UI
  is safe; the wire/`updateField`-style API and any future single-field caller
  are not.
- Fix: diff `item` against the normalised `updated` and build the inverse patch
  from the real changed keys.

### 13. [low-med] `item.update` validates `x/y/width/height` but not nested `box`
- `src/core/commands/apply.ts:759`; `plan-visual.ts` (`patch: { box }`).
- Regions and memos keep geometry in `box`, so `NaN`, `Infinity`, zero or
  negative sizes pass. IndexedDB keeps `NaN`; `JSON` export turns it into
  `null`, which `parse` reads back as 0/default. Entity `width` is also not
  clamped to `TABLE_WIDTH.min/max` (`apply.ts:~230`).
- Fix: validate `patch.box.*` the same way and clamp/refuse non-positive sizes.

### 14. [low-med] `splitStatements` mishandles `END IF/LOOP/WHILE` inside procedures
- `src/dialects/shared/statements.ts:73`.
- Only `BEGIN`/`CASE` raise the block depth but every `END` lowers it, so
  `... BEGIN IF x THEN ...; END IF; ... END;` closes the block at `END IF`
  and the next `;` flushes mid-procedure. Also no `DELIMITER` handling for MySQL
  dumps. Impact is bounded (procedures are skipped) but the trailing garbage
  statement is read as DDL.
- Fix: do not count `END` when followed by `IF|LOOP|WHILE|REPEAT|CASE` (CASE END
  is the only one that closes a CASE).

### 15. [low] Script reader: other silent drops
- `read-script.ts:~118` duplicate column in a table is skipped without a
  diagnostic; `design-builder.ts:~172` an index whose columns partly do not
  resolve is kept with fewer members (a composite UNIQUE silently becomes a
  weaker constraint); `import-sql.ts:~70` `builder.hasTable` with an
  unqualified name matches any schema, so `CREATE TABLE users` after
  `CREATE TABLE public.users` is dropped as a duplicate, and an unqualified
  FK target picks the first schema that has the name.
- Fix: warn on each skip; require every index member to resolve or drop the
  whole index with a warning; prefer same-schema match and warn on ambiguity.

### 16. [low] Wire parse and serialise edge cases
- `src/core/wire/parse.ts:295`: a column id of `__proto__` is written with
  `columns[final] = ...` on a plain object, so the column vanishes (confirmed
  0 fields, no warning). Same for keys and rules. Use `Object.create(null)` or
  a `Map`, or reject such ids via `uniqueId`.
- `parse.ts:300`: with two tables sharing a raw id, `columnMaps.set(rawId, ...)`
  keeps the last table's columns, so a link to the first table's column is
  dropped (with a warning). Key the map by the final entity id and resolve
  links against the first table.
- `parse.ts` column `type`: only `id`/`name` are read and written
  (`serialise.ts:~25`); any other key on the wire `type` object is dropped
  (confirmed `{id,name,foo:1}` becomes `{id,name}`). Keep it as `extra`.
- `serialise.ts`: `JSON.stringify` of a design with a ~10k-deep unknown value
  throws `RangeError` (confirmed), so autosave fails on every attempt for that
  doc. Only reachable from a hostile server copy.
- `parse.ts`: dependencies are not checked against existing tables.

### 17. [low] Autosave and provider
- `src/store/autosave.ts:56`: the debounce has no max wait; continuous editing
  (drag, typing without a 1 s pause) never saves. Add a max delay (e.g. 10 s).
- A failed save is only retried on the next change (by design); the unmount
  flush in `editor-provider.tsx:~42` is the last chance and its error is
  swallowed. Surface the failure.
- Confirmed: `adapter.remove(id)` while the store is dirty, then `flush()`,
  recreates the deleted design (`exists: true`). Dispose or mark the store
  clean before deleting the open diagram, or have `save` refuse ids deleted
  in this session.
- `src/store/selectors.ts:32` `selectVisibleEntities` returns a new array on
  every call; with zustand 5 `useStore` that is an infinite render loop if a
  component ever uses it directly (currently only tests do).

### 18. [low] Smaller issues
- `src/dialects/detect.ts:~25`: `CREATE PROCEDURE` is an SQL Server signal and
  is checked before MySQL/PG rules, so a MySQL or PG script with a procedure
  and no header is detected as SQL Server. Move it behind stronger signals.
- `src/qbase/wire-edits.ts:~35`: `'name' in patch` with `undefined` removes
  the key (`name`, `primaryKey`, ...). Skip undefined for required fields.
- `src/qbase/editor-api.ts`: `updateDiagramData(..., {resetHistory:false})`
  keeps snapshot-based steps (`entity.restore`) against a swapped design; an
  undo then fails `not-found` and, because `history.move` leaves the failing
  step on top, undo is stuck. Drop a step that fails with `not-found`/`invalid`.
- `src/formats/dbml/export-dbml.ts:~170`: index `type:` writes `gin`, `fulltext`,
  `spatial`, which the DBML parser does not accept (only btree/hash), so the
  export does not re-import. `prepare.ts` brace counting also counts braces
  inside strings/notes.
- `src/dialects/*/write.ts` and `convert/engine.ts`: CHECK expressions, column
  defaults that look like function calls (`FUNCTION_CALL = /^[\w.]*\(.*\)$/s`)
  and type names are emitted raw. That is by design for SQL text, but a
  default such as `f(1); DROP TABLE x; g(2)` passes through unchanged.
  Acceptable only if the exported script is treated as untrusted-by-the-user.
- `merge-previous.ts:~44`: rows merge by primary key and "never overwrite";
  auto-increment numeric ids from two old databases can collide and the
  `QubdiDB` copy is dropped when `QubdiDB` is then deleted. Only matters for
  very old numeric-id rows.
- Layout (`formats/shared/layout.ts`) terminates and is fine on a 500-table
  star (import 180 ms); the lexer handles 200k INSERTs in 0.4 s.
