# Spec: import and export

Status: draft for the clean author. Written from the observed behaviour of the old editor
(branch `main`). It describes what the editor does, in words, and gives our own invented
sample schemas and expected outputs. It contains no old code and no old test data.

How to read this file:

- "Must" is behaviour the rewrite has to keep (the parity rows in
  `rewrite/spec/rows-import-export.md` point back here).
- "Old behaviour" marks a quirk of the old editor. Each one is listed in section 12 and the
  owner decides whether to keep it. Unless a row says "keep", do not reproduce a quirk.
- The model (tables, fields, indexes, relationships, custom types, areas, notes) is defined in
  `rewrite/spec/data-format.md`. This file only uses those names. One rule matters here:
  in a relationship, `source` is the referenced ("one") table and `target` is the table that
  holds the foreign key ("many"). There is no many-to-many relationship.
- All sample outputs in section 10 were derived by reading the old behaviour, not by running
  it (the old tree has no installed tooling here). They are exact as far as the reading went.
  Phase 5 must run them against the old editor once (or ask the owner to) and reconcile any
  difference before the tests are frozen. Where a sample and a rule disagree, the rule wins and
  the sample must be fixed.

Contents

1. Dialects and editions
2. The ways to bring a schema in, and the ways to take it out
3. SQL import (paste or upload)
4. DBML import
5. Metadata JSON import ("Smart Query")
6. Import from a live database
7. Diagram JSON import
8. Importing into an existing diagram, re-sync and DBML apply
9. Exports: SQL, DBML, JSON, image
10. Samples with exact expected outputs
11. What to keep or drop, and the libraries the old code used
12. Quirks and defects of the old behaviour
13. Open questions for the owner

---

## 1. Dialects and editions

### 1.1 The database types

A diagram has one database type: `generic`, `postgresql`, `mysql`, `sql_server`, `mariadb`,
`sqlite`, `clickhouse`, `cockroachdb`, `oracle`. Display names: Generic, PostgreSQL, MySQL,
SQL Server, MariaDB, SQLite, ClickHouse, CockroachDB, Oracle.

Each type has its own list of column data types offered in the editor (the lists are part of
the editor spec, not this file). Names only, to show scope:

| Type | Data types offered (names) |
| --- | --- |
| generic | varchar, int, text, boolean, date, timestamp, decimal, datetime, json, uuid, bigint, binary, blob, char, double, enum, float, numeric, real, set, smallint, time, varbinary |
| postgresql / cockroachdb (same list) | integer, int, int4, varchar, text, boolean, bool, timestamp, timestamptz, date, bigint, int8, serial, json, jsonb, uuid, numeric, real, float4, double precision, float8, smallserial, bigserial, money, smallint, int2, char, time, timetz, interval, bytea, enum, geometric types (point, line, lseg, box, path, polygon, circle), network types (cidr, inet, macaddr, macaddr8), bit, bit varying, varbit, tsvector, tsquery, xml, range types (int4range, int8range, numrange, tsrange, tstzrange, daterange), oid and the reg* types, user-defined |
| mysql | int, varchar, text, boolean, timestamp, date, bigint, decimal, datetime, json, tinyint, smallint, mediumint, float, double, bit, char, tinytext, mediumtext, longtext, binary, varbinary, tinyblob, blob, mediumblob, longblob, enum, set, time, year, geometry, point, linestring, polygon, multipoint, multilinestring, multipolygon, geometrycollection |
| mariadb | the MySQL list plus uuid and bool |
| sql_server | int, bit, varchar, nvarchar, text, datetime, date, bigint, decimal, datetime2, uniqueidentifier, json, numeric, smallint, smallmoney, tinyint, money, float, real, char, nchar, ntext, binary, varbinary, image, datetimeoffset, smalldatetime, time, timestamp, xml, cursor, hierarchyid, sql_variant, geometry, geography |
| sqlite | integer, text, real, blob, null, int, varchar, timestamp, numeric, decimal, float, double, json, char, binary, varbinary, smallint, bigint, bool, boolean, time, date, datetime |
| oracle | VARCHAR2, NVARCHAR2, CHAR, NCHAR, CLOB, NCLOB, NUMBER, FLOAT, BINARY_FLOAT, BINARY_DOUBLE, DATE, TIMESTAMP (and WITH TIME ZONE / WITH LOCAL TIME ZONE), INTERVAL YEAR TO MONTH, INTERVAL DAY TO SECOND, BLOB, BFILE, RAW, LONG RAW, ROWID, UROWID, XMLType |
| clickhouse | UInt8..UInt256, Int8..Int256, Float32/64, Decimal-like aliases, String, FixedString, Date, Date32, DateTime, DateTime64, UUID, Boolean, Enum, LowCardinality, Tuple, Map, Nested, IPv4, IPv6, geo types, JSON, and many SQL-standard aliases |

A data type is stored as `{ id, name }`. For imports, `id` is the lower-case name with spaces
turned into underscores and `name` is the lower-case type name.

### 1.2 Capability matrix (what each type supports)

"Supports" means the editor offers the feature for diagrams of that type and the SQL exporter
for that type writes it. A dash means it is not offered and, on export, is left out.

| Feature | generic | PostgreSQL | CockroachDB | MySQL | MariaDB | SQL Server | SQLite | Oracle | ClickHouse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Schemas (tables grouped by schema) | - | yes | yes | - (a schema is exported as a database name) | - | yes | - | yes | yes |
| Default schema name | - | public | public | - | - | dbo | - | - | default |
| Enum custom types | - | yes | - | - | - | - | - | - | - |
| Composite custom types | - | yes (shown, edited, exported; import only from the metadata JSON) | - | - | - | - | - | - | - |
| Array columns | - | yes | yes | - | - | - | - | - | - |
| Check constraints | - | yes | yes | yes | yes | yes | yes | yes | - |
| Column and table comments | - | yes | yes | - (comments exist in the model; exported as COMMENT) | - | - (written as SQL comments) | - (written as SQL comments) | yes | - |
| Index types offered | - | btree, hash, gin | btree, hash, gin | - | - | - | - | - | - |
| Views | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Materialized views | - | yes (flagged when the view definition says so) | yes | - | - | - | - | - | - |
| Auto increment | yes | serial family or identity | same | AUTO_INCREMENT | AUTO_INCREMENT | IDENTITY(1,1) | only on a lone INTEGER primary key | identity | - |

Notes:

- "Check constraints" in the model are table-level expressions only (text). The editor
  validates the expression text with its own checker before accepting it (section 9.1.9).
- Views are stored as tables with `isView: true` (or `isMaterializedView`). A view never gets a
  `CREATE TABLE` on SQL export. Dependencies between a view and the tables it reads from are
  stored as `dependencies` and drawn as links.

### 1.3 Editions and clients

An edition does not change the model. It only changes the script offered to the user in the
"metadata JSON" flow (section 5) and a few filters inside it.

| Database type | Editions | Effect |
| --- | --- | --- |
| PostgreSQL | Supabase, Timescale | The script leaves out system schemas of that platform. Supabase hides: auth, extensions, pgsodium, realtime, storage, vault. Timescale hides its internal schemas. Client option "psql" changes how the script is run. |
| MySQL | "V5.7" | An alternative script without functions that 5.7 lacks. |
| SQL Server | "2016 and below" | An alternative script for old servers (no STRING_AGG). |
| SQLite | "Cloudflare D1" (clients: default, Wrangler) | A script that runs on D1; the Wrangler client gets a one-line CLI command. |
| MariaDB, ClickHouse, CockroachDB, Oracle, generic | none | - |

The chosen edition is stored on the diagram (`databaseEdition`) when the diagram is created from
a metadata JSON import.

---

## 2. The ways to bring a schema in, and the ways to take it out

| # | Flow | Where | Result |
| --- | --- | --- | --- |
| I1 | Paste SQL (DDL) of the chosen database type | New diagram dialog, or "Import" on an open diagram | tables, relationships, enums (PostgreSQL) |
| I2 | Upload SQL: the editor accepts text pasted into the box (there is no separate file picker in the SQL box) | same | same as I1 |
| I3 | Paste DBML | same (the DBML tab) | tables, relationships, enums |
| I4 | Paste the output of the "metadata script" (a JSON document) | same (the "Smart Query" tab, the default) | tables, views, relationships, enums/composites, check constraints, view dependencies |
| I5 | Import from a live database (PostgreSQL or SQL Server) | Project page wizard, server required | same as I4, plus the link to the source for re-sync |
| I6 | Import a saved diagram file (`.json`) | "Import diagram" in the new diagram dialog | a new diagram, ids replaced |
| I7 | Re-sync an existing diagram with its live database | Diagram menu | a list of differences to accept |
| I8 | Edit DBML in the side panel and apply | Editor side panel | existing diagram updated in place |

| # | Export | Where | Result |
| --- | --- | --- | --- |
| E1 | SQL script for a target database | Menu "Export SQL" | text shown in a dialog (copy or download) |
| E2 | DBML (standard and inline-reference forms) | Editor side panel | text, editable |
| E3 | Diagram JSON | Menu "Export as" JSON | a `.json` download named `QBase(<diagram name>).json` |
| E4 | Image: PNG, JPEG, SVG | Menu "Export as" | a download named `<diagram name>.<ext>` |

Export SQL targets offered in the menu: the diagram's own type first (or "Generic" when the
diagram is generic), then PostgreSQL, MySQL, SQL Server, MariaDB and SQLite, leaving out the
diagram's own type from the second group. Oracle, ClickHouse and CockroachDB are not offered as
targets (but an Oracle, ClickHouse or CockroachDB diagram can export to its own type, section
9.1.1).

The new diagram dialog flow: step 1 choose a database type (default Generic) or "create an empty
diagram"; step 2 the import box (tabs: Smart Query = I4, DDL = I1, DBML = I3, plus the edition
picker when the type has editions); when a metadata import has more than 50 tables plus views,
step 3 is a table picker (search, filter by tables/views/schema, select all on page, at most 500
selected; with fewer than 500 tables all tables, but not views, start selected). The import
button is disabled while there is an error message or the box is empty.

---

## 3. SQL import (paste or upload)

### 3.1 Pipeline

1. The user picks a database type (before pasting). `generic` means "detect".
2. Optional detection (section 3.2). On paste the box also switches its own tab (DBML, DDL or
   Smart Query) when the pasted text clearly belongs to another tab (section 3.3).
3. Pre-validation per dialect (section 3.4) shows errors and warnings live, 500 ms after the
   last keystroke.
4. Parse into an intermediate result: tables, columns, indexes, foreign keys, enums, warnings.
5. Convert to a diagram (section 3.8): ids, positions, colours, names, sorting.
6. The diagram's database type is the type the user picked. Importing SQL never changes the
   dialect of the text to another one.

MariaDB uses the MySQL importer. CockroachDB uses the PostgreSQL importer. Oracle has its own
importer. ClickHouse has no SQL importer (only the metadata JSON flow); a ClickHouse type shows
"Unsupported database type" if SQL import is attempted.

### 3.2 Detecting the dialect (type `generic` only)

If the user chose Generic, the first rule that matches decides; if none matches, PostgreSQL is
used. The checks are on the raw text:

1. pg_dump markers: `SET statement_timeout`, `SET lock_timeout`, `SET client_encoding`,
   `SET standard_conforming_strings`, `SELECT pg_catalog.set_config`, `ALTER TABLE ONLY`,
   `COMMENT ON EXTENSION`, `COPY ... FROM stdin`, or a comment line like `-- Name: x; Type: y`
   -> PostgreSQL (dump reader).
2. SQL Server markers: `SET ANSI_NULLS ON`, `SET QUOTED_IDENTIFIER ON`, `SET ANSI_PADDING ON`,
   `CREATE PROCEDURE`, `EXEC sys.sp_`, `[dbo].`, `IDENTITY(`, `NVARCHAR`, `UNIQUEIDENTIFIER`,
   `ALTER TABLE [`, `CREATE TABLE [dbo]`, `datetime2`, or any `[a].[b]` pair -> SQL Server.
3. MySQL dump: comments such as `-- MySQL dump`, `-- Host:`, `-- Server version:`; or backticks
   plus at least two of: `START TRANSACTION`, `CREATE TABLE ... IF NOT EXISTS`, `ENGINE=...`,
   `DEFAULT CHARSET=...`, `COLLATE=...`, `AUTO_INCREMENT=n`, `ALTER TABLE ... ADD CONSTRAINT ...
   FOREIGN KEY`, `-- MySQL|MariaDB dump` -> MySQL.
4. SQLite markers: `PRAGMA`, `INTEGER PRIMARY KEY AUTOINCREMENT`, `DEFAULT (datetime(`,
   `sqlite_sequence`, `CREATE TRIGGER`, `BEGIN`, `END;` -> SQLite.
5. Oracle format (its own check) -> Oracle.
6. `SERIAL PRIMARY KEY`, `CREATE EXTENSION`, `WITH (OIDS`, `RETURNS SETOF` -> PostgreSQL.
7. `AUTO_INCREMENT`, `ENGINE=InnoDB`, `DEFINER=` -> MySQL.

(Old behaviour: the SQL Server check is loose; any text with the word `BEGIN` is SQLite because
rule 4 only looks at the words. Keep the order, but the clean author may tighten the markers as
long as every example in this file is detected as written.)

### 3.3 Tab auto-switch on paste (any import box)

After a paste, if the text is: DBML (matches any of `Table x {`, `Ref: x`, `Enum x {`,
`TableGroup`, `Note x {` at a line start, or contains `[pk]` or `[ref: <`/`>`/`-`) -> switch to the
DBML tab; otherwise if it contains any of CREATE/ALTER/DROP TABLE, CREATE INDEX/VIEW/PROCEDURE/
FUNCTION/SCHEMA/DATABASE (case-insensitive) -> DDL tab; otherwise if it starts with `{` and ends
with `}` (or `[`..`]`) -> Smart Query tab. Otherwise nothing changes. JSON in the Smart Query
tab is pretty-printed after paste when the text is under 2 MB. DDL and DBML are never
reformatted.

### 3.4 Pre-validation messages (shown live, before parsing)

Validation produces errors (red, block the import) and warnings (blue, do not). Text is first
masked: comments and quoted text are blanked (line numbers kept) so only code is checked.

Common to MySQL, MariaDB, SQLite, SQL Server:

- Empty text -> error "SQL script is empty" (line 1, suggestion "Add CREATE TABLE statements to
  import").
- No SQL keyword (CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, SELECT, TABLE, INDEX, VIEW,
  TRIGGER, FUNCTION, PROCEDURE, GRANT, REVOKE) -> error "No valid SQL statements found".
- Unterminated quoted text or block comment -> error "Unterminated quoted text" or
  "Unterminated block comment" at the line where it starts.
- Parentheses: first unmatched `)` -> "Unmatched closing parenthesis"; unclosed `(` -> "Unclosed
  parenthesis" at the line of the first unclosed one.
- No semicolon anywhere (MySQL, MariaDB, SQLite) -> warning "SQL statements should end with
  semicolons (;)". Not for SQL Server (statements may end at `GO` or newlines).
- Foreign syntax, each reported once per line as a warning "Line N: <message>":
  - MySQL/MariaDB: `SERIAL` (use AUTO_INCREMENT); `GENERATED ... AS IDENTITY`; `IDENTITY(a,b)`;
    `::` cast; `[name]` brackets.
  - SQLite: `ENUM(` (use CHECK); `AUTO_INCREMENT`; `SERIAL`; `GENERATED ... AS IDENTITY`;
    `IDENTITY(a,b)`. Error (blocking): `CREATE SCHEMA` -> "CREATE SCHEMA is not supported in
    SQLite" (suggestion "Remove schema creation statements for SQLite").
  - SQL Server: `AUTO_INCREMENT`; `SERIAL`; `GENERATED ... AS IDENTITY`; `CREATE TABLE IF NOT
    EXISTS`; `::` cast; backticks.
- Counting: when at least one table or view is found, the first warning is "Found N table(s)
  [and M view(s)] to import."

PostgreSQL and CockroachDB:

- Empty / no statements: the same two errors.
- Statement without semicolon: warning.
- A broken cast `: :` is an error "Invalid cast operator ": :" found. PostgreSQL uses "::" for
  type casting." and an auto-fix is offered (replace `: :` by `::`).
- A `DECIMAL(p,` / `NUMERIC(p,` whose scale is on the next line is an error "DECIMAL type
  declaration is split across lines. This may cause parsing errors." with an auto-fix that joins
  the two lines.
- Warnings: CREATE EXTENSION found ("These will be skipped during import."), function
  definitions found, trigger definitions found ("These will not be imported."), more than 100
  statements ("Large SQL file detected (N statements). Import may take some time."), GEOGRAPHY(
  or GEOMETRY( ("PostGIS geographic types detected. These will be imported but may not display
  geometric data."), and the "Found N tables and M views to import." line.
- When the text has errors that have a fix, the "Auto-fix" button shows; pressing it shows
  "Auto-fixing SQL syntax errors..." for one second, replaces the text, then the success note
  "SQL syntax errors were automatically fixed." appears with the remaining warnings. The text
  with errors is not parsed while an auto-fix is pending.

Oracle: the Oracle validator warns (per line) about `AUTO_INCREMENT`, `SERIAL`, `IDENTITY(a,b)`,
`TINYINT`, `MEDIUMINT`, `NVARCHAR(max)`, `VARCHAR(max)`, `UNIQUEIDENTIFIER`, `DATETIME2`, `JSONB`
and `::` casts, each with the Oracle equivalent in the message.

After validation, the text is also actually parsed (the same code that will import it). A parse
failure becomes the single red message under the box. The message is the parser's own message
with a leading "Error parsing ...:" removed; if the message contains `line N` and `column M` they
are taken as the location, and clicking an error line puts the cursor there. Up to 3 errors are
listed, then "N more error(s)".

When parsing succeeds, the status line shows the counts: tables and relationships found.

### 3.5 What is recognised, per dialect

All dialects: comments (`-- ...` and `/* ... */`; MySQL `#` comments are an open check, Q19) are ignored; strings that
contain comment markers are respected; keywords and types are case-insensitive; quoted
identifiers use the dialect's quotes ("x" for PostgreSQL/SQLite, `x` for MySQL, [x] for SQL
Server, "x" for Oracle) and a doubled quote inside is an escaped quote; schema-qualified names
are supported (`schema.table`).

Statements that create objects, and what they become:

| Statement | PostgreSQL / Cockroach | MySQL / MariaDB | SQL Server | SQLite | Oracle |
| --- | --- | --- | --- | --- | --- |
| `CREATE TABLE` | table + columns | same | same (also manual fallback parser) | same | same |
| `CREATE TABLE IF NOT EXISTS` | yes | yes | warning (not valid T-SQL) but imported | yes | n/a |
| `CREATE TEMP TABLE` | counted by the validator (whether it is imported is an open check, Q19) | - | - | counted by the validator | - |
| Inline `PRIMARY KEY`, table `PRIMARY KEY (a, b)` | yes -> `primaryKey` on each column | yes | yes (also `CONSTRAINT n PRIMARY KEY [CLUSTERED]`) | yes | yes |
| `NOT NULL`, `NULL` | yes | yes | yes | yes | yes |
| `UNIQUE` (inline or table level) | column `unique` for a single column; a multi-column UNIQUE becomes a unique index | same | same | same | same |
| `DEFAULT expr` | text kept (section 3.6) | same | same | same | same |
| Auto numbering | `serial`, `bigserial`, `smallserial`, `GENERATED ... AS IDENTITY` -> `increment: true` | `AUTO_INCREMENT` | `IDENTITY(a,b)` | `AUTOINCREMENT` on `INTEGER PRIMARY KEY` | `GENERATED ... AS IDENTITY` |
| Foreign keys, inline `REFERENCES t(c)` | yes | NOT allowed: error (section 3.7) | n/a | yes | yes |
| Foreign keys, `FOREIGN KEY (a) REFERENCES t (b)` / `CONSTRAINT n ...` | yes | yes | yes | yes | yes |
| `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` | yes (also `ALTER TABLE ONLY`) | yes | yes | yes (regex fallback) | yes |
| `ALTER TABLE ... ADD [COLUMN]` | yes (adds the column to the table seen earlier) | - | - | - | - |
| `ALTER TABLE ... ALTER COLUMN ... TYPE` | yes (changes the type) | - | - | - | - |
| `ALTER TABLE ... ADD PRIMARY KEY / UNIQUE` | yes (dump reader) | - | yes | - | yes |
| `CREATE [UNIQUE] INDEX n ON t (cols)` | yes, with `USING btree|hash|gin|gist|spgist|brin` stored as the index type | yes (also inline `KEY n (cols)` / `INDEX` / `UNIQUE KEY`) | yes (clustered/nonclustered words ignored) | yes | yes |
| `CHECK (expr)` (column or table level, named or not) | table-level check constraint (text) | yes | yes | yes | yes |
| `CREATE TYPE x AS ENUM (...)` | enum custom type with the values in order, `public` schema if none | - | - | - | - |
| `CREATE VIEW` / `CREATE OR REPLACE VIEW` / (SQL Server `CREATE OR ALTER VIEW`) | a table with `isView: true`; columns from the explicit column list or the select list (alias, or last name part of a column reference); `SELECT *` gives no columns | same | same | same | - |
| Column and table comments | `COMMENT ON TABLE/COLUMN ... IS '...'` is NOT read in the SQL path (old behaviour; comments only arrive through the metadata JSON) | `COMMENT '...'` on a column or table is read | - | - | - |

Statements that are ignored silently (any statement that is not in the table above is ignored the same way; this list is the minimum): `SET ...`, `SELECT pg_catalog.set_config`, `ALTER ...
OWNER TO`, `GRANT`, `REVOKE`, `INSERT`, `COPY ... FROM stdin` data, `DROP`, `USE`, `START
TRANSACTION`, `BEGIN`, `COMMIT`, `PRAGMA`, `SET ANSI_*`, `GO`, `CREATE DATABASE`, `CREATE
SCHEMA` (except the SQLite error above), `SET IDENTITY_INSERT`, MySQL conditional comments
`/*!40101 ... */`, table options (`ENGINE=`, `DEFAULT CHARSET=`, `COLLATE=`, `AUTO_INCREMENT=n`,
`ROW_FORMAT`), the `ONLY` keyword, `WITH (...)` storage options, tablespace and filegroup
clauses (`ON [PRIMARY]`, `TEXTIMAGE_ON`), `ON DELETE/ON UPDATE` actions (read into the
intermediate result but not stored in the diagram: the model has no actions).

Statements that are skipped with a warning (PostgreSQL and CockroachDB; the text "will be skipped
during import" is shown): `CREATE EXTENSION`, `CREATE FUNCTION`/`CREATE OR REPLACE FUNCTION`,
`CREATE TRIGGER`, `CREATE POLICY`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, and
`CREATE TYPE` that is not an enum (composite types from SQL are skipped; "Non-enum type
definitions are not supported and will be skipped"). Other dialects skip the same kinds of
statements without telling the user.

Not recognised, and not an error: `CREATE SEQUENCE` (but a column default `nextval('s')` is kept
as text and marks `increment`), `CREATE DOMAIN`, `CREATE MATERIALIZED VIEW` (old behaviour: not
read; the DBML/metadata flows do read materialized views), `CREATE PROCEDURE`, partition clauses,
generated columns (`GENERATED ALWAYS AS (expr) STORED`: the column is read, the expression is
dropped), exclusion constraints, `INHERITS`.

### 3.6 Types and defaults

Type names are read and then mapped. The old importer mapped every source type through a fixed
affinity table of the dialect to one of the generic type ids and fell back to `text` for a type
it did not know, which silently changes the column. The rule for the rewrite (a change, row
IMP-035): keep the source type name, lower-cased, as `{id, name}`, apply the PostgreSQL synonym
table below only for PostgreSQL and CockroachDB, and never fall back to `text`; an unknown type
is kept as written. Length and precision are stored separately:

- `varchar(n)`, `char(n)`, `nvarchar(n)`, `nchar(n)` -> `characterMaximumLength: "n"`;
  SQL Server `(max)` -> `"max"` (the SQL export writes `MAX`; a metadata import may give `"-1"`).
- `decimal(p, s)` / `numeric(p, s)` -> `precision: p`, `scale: s`. `(p)` alone -> precision only.
  A scale or precision that is split over two lines is accepted.
- `type[]` -> the base type with `isArray: true`, only for PostgreSQL and CockroachDB; in other
  dialects a trailing `[]` is an error from the parser.
- MySQL `int(11)`: the display width is dropped. `unsigned` is dropped (old behaviour; the
  model has no unsigned flag). `enum('a','b')` and `set(...)` keep only the type name (the values
  are not stored; see open question Q7).
- SQLite type names are free text; the importer keeps the declared name. A column declared
  `INTEGER PRIMARY KEY` (with or without AUTOINCREMENT) is not null and primary key; with
  `AUTOINCREMENT` it is `increment: true`.

PostgreSQL synonyms (to the preferred spelling, case-insensitive): character varying -> varchar,
character -> char, bool -> boolean, integer -> int (old behaviour; see Q8), int2 -> smallint,
int4 -> int, int8 -> bigint, float4 -> real, float8 -> double precision, timestamp with time zone
-> timestamptz, timestamp without time zone -> timestamp, datetime -> timestamp, time with time
zone -> timetz, time without time zone -> time, bit varying -> varbit.

Auto numbering: `serial`/`bigserial`/`smallserial` stay as the type name and set
`increment: true` (so a table exported again says `serial`). `GENERATED ALWAYS|BY DEFAULT AS
IDENTITY` on an integer type sets `increment: true`, and the type stays `integer`/`bigint`.

Defaults: the default is stored as text exactly as written, without the word DEFAULT, with
surrounding quotes kept for strings (`'open'`), and with function calls kept (`now()`,
`gen_random_uuid()`, `CURRENT_TIMESTAMP`). PostgreSQL casts (`'x'::text`) are kept as written in
the model; the exporter removes them (section 9.1.4). `NULL` default is stored as the text
`NULL`. A default of `nextval(...)` is kept and marks `increment: true`.

### 3.7 Relationships and cardinality

Each foreign key column pair becomes one relationship; a composite foreign key becomes one
relationship per column pair (all with the same name). The relationship name is the constraint
name when there is one, otherwise `<table>_<column>_<reftable>_<refcolumn>` (old behaviour for
DBML; for SQL the parsers use the constraint name or generate `fk_<table>_<column>`).

The model direction: source = referenced table and column, target = the table that holds the key.
Cardinality is decided by uniqueness: the source side is `one` when the referenced column is the
whole primary key or unique, else `many`; the target side is `one` when the key column is unique
or is the whole primary key, else `many`. If both would be `many`, the source side becomes `one`
(a foreign key always points at one row). A foreign key whose referenced table is not in the
import is dropped silently, except that SQLite imports create an empty placeholder table for a
referenced table that is missing (old behaviour; row IMP-024 asks the owner).

MySQL and MariaDB: an inline `REFERENCES` in a column definition is a blocking error: "MySQL
does not support inline REFERENCES in column definitions (line N). Please use FOREIGN KEY
constraints instead:" followed by a corrected example. (MySQL silently ignores such a clause, so
the importer refuses rather than losing the key.)

### 3.8 Building the diagram (ids, positions, colours, order)

- Diagram: new id; name `SQL Import (<type>)` (the new-diagram dialog renames it, see 8.1);
  database type = the picked type; `createdAt` and `updatedAt` now.
- Ids: every table, field, index, relationship, custom type gets a fresh random id (25 lower-case
  letters and digits). Order numbers: tables get `order` = their position in the source.
- Schema: a table keeps its schema name from the SQL; a table without one gets an empty schema
  (not the dialect default).
- Colours: tables `#8eb7ff`; views `#b0b0b0`; materialized views `#7d7d7d`.
- Fields: `unique` is set for a single-column unique constraint or a single-column unique index;
  a primary key column is not null.
- Indexes: each `CREATE INDEX` becomes an index (name, unique flag, ordered field ids, optional
  type). A column that does not exist in the table is skipped; an index left with no columns is
  dropped. After all tables are built, each table gets a primary key index entry added if it has
  primary key columns: `isPrimaryKey: true`, `unique: true`, the primary key field ids, and an
  empty name when the constraint had no name (the old editor does this for every import path).
- Check constraints: each becomes `{expression}` (text between the outer parentheses).
- Positions: first a grid of 4 per row with 300 spacing, then the layout pass (below).
- Sorting: tables sorted by name (locale compare), with views after tables.
- Layout pass (`perSchema` mode): tables are grouped by schema and each group is laid out on its
  own; connected tables (with at least one relationship) first, most connected first, placed
  near their neighbours, then tables with no relationship in a grid below. Gaps are 100, start at
  (100, 100). Tests must check properties, not coordinates: no two tables overlap, every
  coordinate is finite and not negative, tables joined by a relationship are closer than
  unconnected ones in the same group. (Old behaviour: each schema group starts at the same
  corner, so tables of different schemas can overlap. The rewrite must not overlap them, row
  IMP-043.)
- Table width defaults to the minimum table width; `expanded` is not set.

### 3.9 Errors the user sees (summary)

Blocking (red, Import disabled): empty box, no SQL keywords, unterminated string or comment,
unbalanced parentheses, SQLite `CREATE SCHEMA`, MySQL inline `REFERENCES`, PostgreSQL broken
cast and split decimal (with auto-fix), and any parser failure. Warnings (blue, Import allowed):
foreign syntax, missing semicolons, skipped statement kinds, large files, PostGIS types, the
"Found N tables and M views" count. When the import produces zero tables and zero relationships
the dialog stays open and nothing is added (no message in the old editor; the rewrite should say
"Nothing to import", row IMP-015).

---

## 4. DBML import

DBML is parsed by a maintained DBML library (section 11). Pre-processing happens first because
the library does not know some constructs that QBase accepts:

- `TableGroup ... {}` and `Note name {}` blocks are removed (not imported).
- Array types `type[]` and `type(n)[]` are accepted: the `[]` is stripped before parsing and the
  field is marked `isArray`. This is an error ("Array types are not supported for <type>
  database. Field "x" has array type "t[]" which is not allowed.", with line and column) when the
  database type does not support arrays (only PostgreSQL and CockroachDB do).
- Field-level `check: \`expr\`` in the attribute list and table-level `checks { \`expr\` [name:
  'n'] }` blocks are read as check constraints (all become table-level) and removed before
  parsing. Each expression is validated by the check-expression checker (section 9.1.9); an
  invalid one is an error at its line and column.
- `Table "schema"."name" [headercolor: #hex] {` : the colour attribute is removed.
- Characters with accents (á é í ó ú ñ ç and capitals) are replaced by their plain letters before
  parsing (old behaviour; see Q9 - this changes names).
- An enum used as a type without values is turned into varchar.

Errors:

- Syntax errors: the library's first error is shown with line and column; the line is
  highlighted in the box and clicking the message moves the cursor.
- A many-to-many reference (`<>`) is an error: "Many-to-many references (<>) are not supported:
  "A" and "B". Add a junction table that references both." with the line of the reference.
- A reference to a missing table or field is an error "Invalid relationship: tables not found" /
  "fields not found". An index naming a missing column is an error "Index references
  non-existent column: x".

Mapping:

- Tables: name, schema (`public` or empty means "no schema" and is replaced by the default schema
  of the picked database type when it has one: public, dbo, default); `Note` becomes the table
  comment; field `note` becomes the comment; field type name goes through the same type rules as
  SQL import (3.6), with `(n)` -> length and `(p,s)` -> precision/scale; `pk` -> primary key (and
  not null); `unique`; `not null`; `increment`; `default` (quotes, backticks removed, so the
  text 'abc' is stored as abc - old behaviour, row IMP-054); a field is not null if it is pk,
  increment, or its type requires it.
- Indexes block: `name`, `unique`, `type` (kept only if it is one of the known index types),
  `note` (index comment). An index with `pk` is the composite primary key: its columns become
  primary key fields; if it has a name, a primary key index with that name is kept. A normal
  index duplicating the primary key columns is dropped. An unnamed index gets
  `idx_<table>_<col>_<col>`.
- References: `Ref: a.x > b.y`, `Ref name: ...`, inline `[ref: > t.c]`. Relation symbols give the
  cardinalities directly (`<` one-to-many, `>` many-to-one, `-` one-to-one). Source = the left
  endpoint as written, target = the right endpoint. The relationship name is
  `<srcTable>_<srcField>_<tgtTable>_<tgtField>`.
- Enums become enum custom types (name, schema, values; quotes removed from values).
- Table layout: the same grid (4 per row, 300 spacing, colour `#8eb7ff`), no layout pass for
  DBML import (old behaviour; the rewrite should run the same layout as SQL import, row IMP-055).
- Diagram name: `DBML Import`; the new-diagram dialog replaces it with `Diagram <n>` where n is
  the number of existing diagrams plus one.
- Database type for enum schema default and array validation = the picked type.

The DBML box validates on every change: with no error it shows the table and relationship
counts; with an error it shows the first error.

---

## 5. Metadata JSON import ("Smart Query")

### 5.1 The flow

1. The user picks a database type (and an edition or client if the type has them).
2. The editor shows a SQL script for that type (and edition). The user runs it in their own
   client (psql, SSMS, mysql, sqlite3, sqlplus, clickhouse-client, wrangler ...).
3. The script returns one cell holding a JSON document. The user pastes that cell.
4. The box checks it, fixes common mangling on request, then imports.

Scripts exist for: PostgreSQL (with Supabase/Timescale variants and a psql variant), CockroachDB,
MySQL (and 5.7), MariaDB, SQL Server (and 2016), SQLite (and Cloudflare D1, with a Wrangler
command variant), Oracle, ClickHouse. A SQL Server result shown in SSMS is truncated at 65 535
characters; when the pasted text is exactly 65 535 characters long an information dialog opens
explaining how to export without truncation. The script text itself is part of the product copy
and is not specified here: it must produce the format in 5.2 for the database in question; the
clean author may write new queries.

### 5.2 The JSON format (the contract)

An object with these keys (all arrays hold flat objects; names are exactly as written):

- `database_name` (string), `version` (string, the server version text).
- `tables`: `{ schema, table, rows?, type?, engine?, collation?, comment? }`.
- `views`: `{ schema, view_name, view_definition? }`. `view_definition` is base64 text of the
  definition: UTF-8 for every database, UTF-16 little endian for SQL Server.
- `columns`: `{ schema, table, name, type, ordinal_position, nullable (boolean or 0/1),
  character_maximum_length? (string or null), precision? ({precision, scale} or null), default?,
  collation?, comment?, is_identity?, is_array? }`. Columns of views are included, with
  `table` = the view name.
- `pk_info`: `{ schema, table, column, pk_def }`, one row per primary key column.
- `fk_info`: `{ schema, table, column, foreign_key_name, reference_schema?, reference_table,
  reference_column, fk_def }`, one row per column pair; `schema/table/column` is the table that
  holds the key.
- `indexes`: `{ schema, table, name, column, index_type, cardinality?, size?, unique (boolean or
  0/1), direction, column_position }`, one row per index column.
- `check_constraints?`: `{ schema, table, expression }`.
- `custom_types?`: `{ schema, type, kind: "enum"|"composite", values? , fields? ([{field, type}]) }`.

### 5.3 Repairing pasted text

"Check JSON" (offered when the text contains `{` and `}` but is not valid metadata; at most two
tries, one second each) rewrites the text. It must handle, in order: drop everything before the
first `{` and after the last `}`; remove carriage returns, newlines, arrows and box-drawing
characters (terminal decoration), trailing commas, leading commas in arrays, `"precision":
"null"`, `"nullable": "false"/"true"` text; replace array-looking defaults by null; CSV exports
that double all quotes; the wrapper `[{"metadata_json_to_import": "{...}"}]` (inner object found by
counting braces); text that is a JSON string with escaped quotes. If still invalid the text is
left changed and the error stays "Invalid JSON. Please correct it or contact us at
support@qubdi.dev for help." (the address is a product value, see Q12). A box with no `{`/`}` shows
that error at once.

### 5.4 Building the diagram

- Name: `database_name` if not empty, else `Diagram <n>`.
- Tables: one per `tables` row, keyed by schema and name (an empty/blank schema means none). Each
  gets its columns sorted by `ordinal_position` (duplicate column names within a table are
  collapsed to the first). Table comment from `comment`.
- Fields: name; type `{id: lower-case type with spaces as underscores, name: lower-case type}`
  after the PostgreSQL synonym table (PostgreSQL and CockroachDB only); `primaryKey` if listed in
  `pk_info`; `unique` if a single-column unique index covers it; `nullable`; length, precision,
  scale only when present and non-zero; `default` (text); `collation`; `increment` from
  `is_identity` when present; `isArray` from `is_array` when present; comment.
- Indexes: rows with the same schema+name are aggregated into one index with its columns in
  `column_position` order; `type` = `index_type` lower-cased. If the table has a primary key and
  an index with exactly the primary key columns exists, that index becomes the primary key index
  (`isPrimaryKey: true`, its name kept) and is not listed as an ordinary index. Every table then
  gets a primary key index entry as in 3.8.
- Views: a table with `isView: true`; materialized when its decoded definition contains the word
  "materialized"; colours as in 3.8. Dependencies (view reads table) are found by parsing the
  decoded definition with a SQL parser (the PostgreSQL grammar for every dialect; MySQL/MariaDB
  definitions are lightly rewritten first so that they parse) and matching the table names found
  against the imported tables; failures are ignored silently. Each dependency is
  `{ tableId: the table read, dependentTableId: the view }`.
- Relationships: one per `fk_info` row, with the rules of 3.7; a row whose table or column is
  missing is dropped. A table with more than one primary key column counts as "complex" and its
  columns are never `one` just because they are primary keys.
- Custom types: one per `custom_types` row (enum with values, composite with fields); schema
  empty means none.
- Check constraints: from `check_constraints`.
- Positions: layout pass as in 3.8 (perSchema mode), colours as in 3.8.
- `databaseEdition` stored when an edition was chosen.

### 5.5 Selecting tables

Before building, if the metadata has more than 50 tables plus views the user chooses which to
import (section 2). Filtering the metadata by the selection keeps: selected tables and views;
their columns, keys, indexes; foreign keys when either end is selected (so a relationship can
point to an unselected table: it is then dropped when the diagram is built); custom types of
schemas that have a selected table or view, or types used by a selected column.

---

## 6. Import from a live database

Needs the QBase server. Supported: PostgreSQL and SQL Server only (the wizard shows a dialect
choice; default ports 5432 and 1433).

Wizard, three steps:

1. Connect: dialect, host, port, database, user, password, "use SSL", "trust the server
   certificate" (SQL Server and self-signed). Optionally "save this connection as <name>"; a saved
   connection (stored by the server, password encrypted) can be reused, with an optional new
   password. Pressing Connect asks the server for a catalogue; errors show the server message
   with the password removed; nothing else is stored.
2. Select: a tree of schemas, tables and views with checkboxes, all selected at first; select a
   schema as a whole; the preview counts selected schemas, tables and views.
3. Preview, then Create: the server reads the metadata of the selected tables and the editor
   builds the diagram exactly like a metadata JSON import (section 5.4), with the diagram name
   defaulting to the database name; the diagram is stored, created on the server inside the
   project, and opened. The browser remembers the source (saved connection id, or inline
   connection without password), the selected tables and schemas, the names the objects have in
   the database now (for re-sync, section 8.2) and the time. If the server step fails after the
   local copy was made, the local copy is deleted so a retry does not leave an orphan.

Server contract (the clean author of the server side must keep this):

- Two operations: list the catalogue (schemas with their tables and views) and introspect (given
  schemas and an optional list of `schema.table` keys, return metadata in the format of 5.2 plus
  `dialect`). Introspect filters foreign keys so that both ends are in the selection.
- Read only: one read-only transaction (PostgreSQL), a statement timeout of 20 s, every query
  checked for write keywords (insert, update, delete, merge, drop, alter, create, truncate,
  grant, revoke, exec, execute, call, copy, into ...) before it is sent.
- Network guard: the host is resolved first and refused when it is not public (loopback, private,
  link-local, unspecified, multicast, reserved), unless it is in the administrator's allow list
  (an environment setting); message says "Connections to X are blocked (...). Ask the server admin
  to add it to INTROSPECT_ALLOW_HOSTS."
- Response size cap of 64 MB of bytes received, then the connection is closed with "The database
  sent more than 64 MB of metadata; the connection was closed."
- Only users who can write in some project may use typed-in credentials; saved connections need
  write permission in their project; an unknown or forbidden saved connection is 404. Each run is
  written to the audit log with dialect and host only. Per-user rate limit on outbound
  connections. Saved connections need an encryption key configured on the server (otherwise the
  capability check says saved connections are off; changing the key makes old saved passwords
  unusable: error 409 `connection_key_changed`).
- PostgreSQL metadata includes: schemas other than system schemas, ordinary and partitioned
  tables, views and materialized views, columns with decoded length/precision/scale from the type
  modifier (numeric, character, bit, time and interval types; negative scales included), array
  flag, identity or `nextval` default marks `is_identity`, collations, comments, primary keys,
  foreign keys, indexes (by access method, with direction), enum types (not composites) and check
  constraints. SQL Server metadata includes tables, views (definition in UTF-16 base64), columns,
  identity, defaults, extended-property comments, keys, foreign keys, indexes, check constraints.

---

## 7. Diagram JSON import

- Input: a `.json` file chosen in a file picker that accepts only `.json`.
- The file is the export of section 9.3. It is validated against the model schema; the fields
  `createdAt` and `updatedAt` of the diagram are replaced by the current time (the stored values
  are ignored).
- Every id in the file (diagram, tables, fields, indexes, relationships, dependencies, areas,
  notes, custom types) is replaced by a fresh id, and every reference is rewritten consistently.
- The diagram is added to the local store and opened; when the user is inside a project the diagram
  is created on the server in that project at once (and the local copy is deleted if that fails).
- Any failure (not JSON, wrong shape, the server refusing) shows one error: title and description
  from the import dialog ("could not import"; the text is product copy). The dialog stays open.
- Old files remain valid: relationship cardinalities from before many-to-many was removed
  become one-to-many; unknown extra keys are ignored by the validator's non-strict mode (to be
  confirmed with the data-format spec).

---

## 8. Importing into an existing diagram, re-sync and DBML apply

### 8.1 Importing more tables into an open diagram

"Import" inside an open diagram opens the same box with the diagram's database type fixed (the
tabs may be limited by the caller). The import is built as a separate diagram (as in sections 3
to 5), then:

- If it holds no tables and no relationships nothing happens.
- Tables are shifted right: when the diagram already has tables, x offset = (right edge of the
  right-most table, using width or 250 when unset) + 150; y unchanged. No other collision check.
- The new tables and relationships are added; nothing is merged or de-duplicated: importing a
  table that already exists makes a second table with the same name (old behaviour, row IMP-076;
  the rewrite must at least warn).
- If the diagram's type was generic it becomes the imported type. Custom types and dependencies
  of the import are NOT added (old behaviour; row IMP-076).
- The undo and redo history is cleared.

For a new diagram (new-diagram dialog) the result is stored, becomes the default diagram, the
dialog closes and the editor opens it.

### 8.2 Re-sync with the live database (I7)

Only for diagrams made with the live import (the source is remembered). The editor reads fresh
metadata (all remembered tables, schemas) and compares it with the diagram, by name, without
changing anything, then shows a list of differences with checkboxes. The user applies the
selected ones.

Comparison (a pure function; the same code also runs on the server for drift detection):

- Both sides are turned into a neutral description: tables keyed `schema.name`, columns (name,
  canonical type, nullable, primary key, unique, default, length, precision, scale, identity,
  comment), indexes (name, unique, columns), relationships (name, from table + columns, to
  table + columns).
- Canonical types: lower case, spaces and underscores equal, with aliases folded: int/int4/serial/
  serial4 -> integer, int8/bigserial/serial8 -> bigint, int2/smallserial -> smallint,
  float8/float -> double precision, float4 -> real, bool -> boolean, bpchar/character -> char,
  character varying -> varchar, decimal -> numeric, timestamp with(out) time zone -> timestamptz /
  timestamp, time with(out) time zone -> timetz / time; array suffix `[]` kept.
- Tables are paired in passes, strongest first: the name remembered at the last sync (this keeps a
  table matched when someone renamed it in the diagram), then exact `schema.name`. An ambiguous
  pairing is never guessed. Columns the same way inside a matched table.
- Kinds of difference: table added, table removed, table comment changed (not reported in
  re-sync, which ignores comments so that descriptions written in the diagram are never "synced
  away"; drift detection reports them), column added / removed / changed (the list of changed
  attributes), index added / removed (an index that only backs the primary key is ignored; indexes
  compared by uniqueness and column list, not name), relationship added / removed / changed.
- Possible renames: a removed and an added table (or column) are offered as a rename when they look
  alike (similarity of their columns by name and type, or same type for a lone column pair),
  threshold 0.6; accepting a rename replaces the pair of "removed" and "added" by one rename and
  brings the follow-up attribute changes that only make sense after it.
- Applying: renames first, then removals, then additions, then column and index changes, then
  relationships. Everything the changes do not touch is kept exactly: positions, colours, areas,
  notes, comments, descriptions, ids. A new table is placed in a free spot next to the tables it has
  foreign keys with (a placement helper looks for a free box, no overlap). Removing a table
  removes its relationships and dependencies; removing a column removes it from indexes (an index
  left empty is removed) and its relationships. New columns are inserted at the position they have
  in the database.
- After applying, the remembered names are refreshed (so the next sync knows each object by the
  name it has in the database now) and the time is stored.

### 8.3 Editing DBML in the side panel (I8)

The side panel shows the diagram as DBML (section 9.2). In edit mode the user changes the text and
applies. The text is parsed like a DBML import (section 4) with the diagram's database type, then
merged into the open diagram:

- Tables are matched by schema + name (then by name only if the diagram's table has a schema; then
  by the default schema). A matched table keeps its id, position, colour, width, order and
  `createdAt`; fields are matched by name and keep their id and `createdAt`; the edited text wins
  for type, nullable, unique, primary key, comments and check constraints.
- Indexes match by name, else by (same fields, unique flag, primary-key flag); the id and name of
  the existing index are kept.
- A table in the text that is not in the diagram is added (as parsed, at a grid position; the old
  editor can place it over an existing table, row IMP-083). A table missing from the text is
  removed.
- Relationships match by their two ends (either direction); the existing id is kept and
  cardinalities come from the text. Relationships missing from the text are removed.
- Custom types: enums come from the text; composite types of the diagram are kept (DBML cannot
  express them). Areas and notes are kept untouched. Dependencies are matched by the two tables.
- A syntax error shows the DBML error and nothing changes.

---

## 9. Exports

### 9.1 SQL

#### 9.1.1 Choosing the generator

The export dialog filters the diagram first (tables, relationships and dependencies that the
current diagram filter shows; the filter's default schema is the target's default schema), then:

1. If the diagram's type equals the target type, the dialect's own generator runs: PostgreSQL ->
   section 9.1.3; MySQL and MariaDB -> 9.1.5; SQL Server -> 9.1.6; SQLite -> 9.1.7. Types with no
   generator of their own (generic, CockroachDB, Oracle, ClickHouse) fall back to the PostgreSQL
   generator (old behaviour, Q10).
2. A MySQL diagram exported to MariaDB uses the MySQL generator.
3. Otherwise, if both the diagram's type and the target have a converter (sources: PostgreSQL,
   CockroachDB, MySQL, MariaDB, SQL Server, SQLite, generic; targets: PostgreSQL, MySQL, MariaDB,
   SQL Server, SQLite), the converter runs (9.1.8).
4. Otherwise (Oracle and ClickHouse sources; Oracle, ClickHouse, CockroachDB, generic targets) a
   generic generator runs and its script starts with a warning comment saying that no converter
   exists (9.1.10).

An empty diagram (no tables) exports an empty string; the dialog then shows the error state.
The dialog shows a spinner while the script is made, then the script in a read-only code box with
copy and download. An exception shows the error state with a support mail link.

The tests treat the output as text compared exactly, with `\n` line ends and no trailing spaces.

#### 9.1.2 Words used below

- "Quoted name": an identifier written with the dialect's quote and with the quote character
  doubled inside (`"` for PostgreSQL/SQLite, backtick for MySQL, `[` `]` with `]` doubled for SQL
  Server).
- "Real columns of an index": the index's field ids looked up in the table; ids not found are
  skipped.
- "Primary key columns": the table's fields with `primaryKey` in field order.
- "Skipped index": an index flagged `isPrimaryKey` or whose real columns are the same set as the
  primary key columns (order ignored) are not written (PostgreSQL, MySQL, SQLite, converter).
  SQL Server only skips indexes flagged `isPrimaryKey`.
- Index statements are collected per table, sorted with locale string comparison on the whole
  statement, and written one per line.
- Foreign keys: the relationships are turned into constraints. The table that holds the key is
  the one on the `many` side (if both sides have the same cardinality, the target). A relationship
  with a missing table, a missing field, or whose table is a view, is dropped. Relationships
  between the same two tables whose referenced columns together are exactly the primary key of
  the referenced table, when that key has more than one column, are merged into one composite
  constraint in primary key order (named only when all the parts share a name).
- A field comment is written on the line above the column as `    -- text` (one line per line
  of comment) in PostgreSQL, MySQL, SQL Server and SQLite generators; a table comment is written
  above `CREATE TABLE` as `-- text` (SQL Server: a `/**` ... `*/` block, with `*/` inside
  written as `* /`).
- Auto numbering: the field's `increment` flag.

#### 9.1.3 PostgreSQL generator (diagram type = target = PostgreSQL)

Output, in order. Each part is optional and only written when it has content.

1. Schemas: for each distinct schema of the tables and of the custom types, in first-seen order:
   `CREATE SCHEMA IF NOT EXISTS "<schema>";` then one blank line after the last.
2. Custom types, enums first and then composites, each group sorted by name:
   `CREATE TYPE "<schema>"."<name>" AS ENUM ('a', 'b');` (schema part only if there is one; a
   quote in a value is doubled) and `CREATE TYPE "<name>" AS ("f1" type1, "f2" type2);`
   (composite), then one blank line after the last.
3. Sequences: every `nextval('<name>'...)` found in a default produces
   `CREATE SEQUENCE IF NOT EXISTS <name>;` (unique, in order), then one blank line.
4. Tables, in diagram order, views skipped, separated by one blank line:
   - table comment lines `-- ...` first if any;
   - `CREATE TABLE "<schema>"."<table>" (` (schema part only if set), a newline;
   - one line per column, `    ` + comment lines (see 9.1.2) + `"<name>" <type><not null><identity><unique><default>`,
     lines joined with `,\n`;
   - then `,\n    PRIMARY KEY ("a", "b")` if any primary key columns (always as a table
     constraint, never named);
   - then for each non-empty check: `,\n    CHECK (<expression>)`;
   - then `\n);`
   - then `\nCOMMENT ON TABLE <table> IS '<text>';` if the table has a comment, and
     `\nCOMMENT ON COLUMN <table>."<col>" IS '<text>';` for each commented column (quotes
     doubled, line breaks and runs of spaces become one space, trimmed);
   - then, if there are index statements, `\n-- Indexes\n` and the statements, each
     `CREATE [UNIQUE ]INDEX "<name>" ON <table>[ USING <TYPE>] (<cols>);` where `<TYPE>` is the
     index type upper-cased and written only when the type is set and is not btree, and `<name>` is
     `<table>_<index name>` with every character outside letters, digits, underscore replaced by an
     underscore; when that is longer than 60 characters the index name alone (cut to 60) is used;
     a unique index on one column that is already `UNIQUE` inline is not written;
   - then `COMMENT ON INDEX "<name>" IS '<text>';` for indexes with comments, one per line;
   - then `\n` (the table text ends with a newline).
5. Foreign keys, if any relationships: a blank line, `-- Foreign key constraints`, then grouped by
   the schema of the table that holds the key (a table without a schema counts as `public`),
   groups sorted by schema name: `-- Schema: <schema>` and the statements
   `ALTER TABLE <table> ADD CONSTRAINT "<name>" FOREIGN KEY(<cols>) REFERENCES <reftable>(<refcols>);`.
   Groups after the first are preceded by a blank line. The name is always generated:
   `fk_<table>_<col>_<col>_<reftable>_<refcol>` (every column joined with `_`), characters outside
   letters, digits, underscore replaced by `_`, cut to 60 characters (the relationship's own name
   is not used). The script does not end with a newline after the last statement.

Column text:

- Type: the type name lower-cased; `user-defined` -> `jsonb`; `array` -> `text[]`. `varchar`,
  `character varying`, `char`, `character` with a length -> `name(length)`. `decimal`/`numeric`
  with precision and scale -> `name(p, s)`, with precision only -> `name(p)`. An array field or a
  name ending `[]` gets exactly one `[]` suffix.
- Auto numbering: if `increment` and the column is not nullable and the type is integer or int ->
  `serial`; bigint -> `bigserial`; smallint -> `smallserial` (the size and the sequence default
  are not written). A column whose type already is one of the serial names is written as is.
- `NOT NULL` if not nullable. Nullable columns have no suffix.
- A default that contains the word `identity` writes ` GENERATED BY DEFAULT AS IDENTITY` and no
  default.
- ` UNIQUE` only if the column is not a primary key column and `unique`.
- Default: see 9.1.4. Not written for a serial column that also has a `nextval` default.

#### 9.1.4 Defaults in the PostgreSQL generator

Take the stored text, trim. If it is a quoted string followed by a cast (`'x'::character
varying(10)`) use the quoted string. Then: `now()` -> `CURRENT_TIMESTAMP`; for json/jsonb columns a
default that calls a JSON builder keeps its text without outer quotes; a text containing
`nextval` is kept; the known function forms (`CURRENT_TIMESTAMP`, `NOW()`, `GETDATE()`,
`CURRENT_DATE`, `CURRENT_TIME`, `UUID()`, `NEWID()`, `NEXT VALUE FOR ...`, `IDENTITY(a,b)`) and
any `name(...)` call are kept; the keywords NULL, TRUE, FALSE, CURRENT_TIMESTAMP, CURRENT_DATE,
CURRENT_TIME, CURRENT_USER, SESSION_USER, SYSTEM_USER are kept; text that is already quoted is
kept; numbers `-?\d+(\.\d+)?` are kept; anything else is quoted as a string with `'` doubled.

#### 9.1.5 MySQL / MariaDB generator

- First line `-- MySQL database export`, then `START TRANSACTION;`.
- For each distinct table schema: `CREATE DATABASE IF NOT EXISTS \`<schema>\`;` then one blank
  line after the last.
- Each table (views skipped) is the text: table comment as `-- ...` lines, then a newline, then
  `CREATE TABLE IF NOT EXISTS \`<schema>\`.\`<table>\` (` and the columns, joined `,\n`, then
  `,\n    PRIMARY KEY (...)`, checks as `,\n    CHECK (<expr>)`, then `\n)`, then `
  COMMENT='<text>'` if the table has a comment, then `;\n`; then, if there are indexes,
  `\n-- Indexes\n` and the statements; then `\n`. Tables are joined by `\n`. (The consequence is a
  run of blank lines between tables; see the samples.)
- Column: `    ` + comment lines + `` `name` ``, space, type (below), ` NOT NULL` if not nullable,
  ` AUTO_INCREMENT` if `increment` (or a primary key column whose default says identity,
  autoincrement or nextval), ` UNIQUE` if not primary key and unique, ` DEFAULT <value>` (not
  written when `increment` or the default is an identity/autoincrement/nextval marker), and
  ` COMMENT '<text>'` when the column has a comment.
- Type mapping (case-insensitive input -> output): int, integer -> INT; smallint -> SMALLINT;
  bigint -> BIGINT; decimal, numeric -> DECIMAL; float -> FLOAT; double, real -> DOUBLE; char,
  character -> CHAR; varchar, character varying, nvarchar -> VARCHAR; text, ntext -> TEXT;
  longtext, mediumtext, tinytext keep their name upper-case; date -> DATE; datetime, timestamp,
  datetime2 -> DATETIME; time -> TIME; blob, binary -> BLOB; varbinary -> VARBINARY; bit -> BIT;
  boolean, bool -> TINYINT(1); enum -> VARCHAR(50); set -> VARCHAR(255); json, jsonb -> JSON; uuid
  -> CHAR(36); geometry, geography -> GEOMETRY; array, user-defined, any `x[]` -> JSON; anything
  else: the input unchanged (not upper-cased).
- Length: VARCHAR, CHAR, VARBINARY with a length -> `(n)`; VARCHAR without a length -> `(255)`.
  DECIMAL/NUMERIC with precision and scale -> `(p, s)`, precision only -> `(p)`.
- Default: `now()` and `current_timestamp` -> `CURRENT_TIMESTAMP`; `newid()` and `uuid()` ->
  `UUID()`; the known function forms and keywords and numbers and already-quoted text are kept;
  anything else is quoted. Identity-like defaults are dropped.
- Indexes: `CREATE [UNIQUE ]INDEX \`idx_<table>_<col>_<col>[_unique]\` ON <table> (<cols>);`
  (`_unique` suffix for unique indexes, the stored index name is ignored); a column of type text,
  mediumtext, longtext or blob in an index is written `\`col\`(255)`; skipped indexes as in 9.1.2.
- Foreign keys after all tables: a blank line, `-- Foreign key constraints`, then
  `ALTER TABLE <table> ADD CONSTRAINT \`fk_<table>_<col>_<col>\` FOREIGN KEY(<cols>) REFERENCES
  <reftable>(<refcols>);` one per line (the relationship name is not used); the script ends with
  a blank line, `COMMIT;` and a newline.

#### 9.1.6 SQL Server generator

- For each distinct schema:
  `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '<schema>')`, `BEGIN`,
  `    EXEC('CREATE SCHEMA [<schema>]');`, `END;` (each on its own line; a quote in the name is
  doubled, a `]` is doubled and then the quotes doubled).
- Each table (views skipped): comment as a `/**` ... `*/` block, then
  `CREATE TABLE [schema].[table] (`, the columns joined `,\n`, `,\n    PRIMARY KEY ([a], [b])`
  if any, checks `,\n    CHECK (<expr>)`, `\n);\n`, then if there are indexes `\n-- Indexes\n` and
  the statements, then `\n`. Tables joined by `\n`.
- Column: `    ` + comment lines + `[name] <type><not null><identity><unique><default>`. The type
  name is written as stored (not mapped). Length for varchar, nvarchar, char, nchar, varbinary:
  `(n)`; the stored length `-1` writes `(MAX)`. decimal/numeric: `(p, s)` or `(p)`. ` NOT NULL` if
  not nullable (nullable columns have no suffix). ` IDENTITY(1,1)` if `increment` or the default
  says identity. ` UNIQUE` if not a primary key column. ` DEFAULT <value>` unless `increment` or
  identity.
- Default: `nextval` -> `IDENTITY(1,1)`; the stored text with one extra pair of parentheses is
  unwrapped (`((0))` -> `0`, `(N'x')` -> `N'x'`, `(NULL)` -> `NULL`, `(getdate())` ->
  `getdate()`, `(fn(...))` -> `fn(...)`, `('x')` -> `N'x'`); a lone `*` -> `N'*'`; text that has
  an operator character and is not already quoted, a function or a keyword is quoted as `N'...'`;
  quoted text, function forms, keywords and numbers are kept; anything else is quoted `'...'`
  (without doubling quotes: old behaviour, Q11).
- Indexes: `CREATE [UNIQUE ]INDEX [<schema>_<index name>] ON <table> (<cols>);` (the schema
  prefix only when the table has a schema); an index flagged `isPrimaryKey` is skipped; more than
  32 columns is truncated to 32 with the comment line `/* WARNING: This index originally had N
  columns. It has been truncated to 32 columns due to SQL Server's index column limit. */`
  above it.
- Foreign keys: blank line, `-- Foreign key constraints`, grouped by the schema of the table
  that holds the key (`dbo` when it has none) sorted, `-- Schema: <schema>` then
  `ALTER TABLE <table> ADD CONSTRAINT [<name>] FOREIGN KEY(<cols>) REFERENCES <reftable>(<refcols>);`
  where the name is the relationship's own name, else `fk_<table>_<col>_<col>`. No trailing
  newline.

#### 9.1.7 SQLite generator

- `-- SQLite database export`; if there are relationships, `PRAGMA foreign_keys = ON;` and a blank
  line; then `BEGIN TRANSACTION;`.
- Each table (views skipped). A table named like a SQLite system table (sqlite_sequence,
  sqlite_stat1..4, sqlite_master) is replaced by the line `-- Skipping SQLite system table:
  "<name>"`. Otherwise: `-- Original schema: <schema>` line when the table has a schema (the
  schema is dropped from the name), the table comment lines, `CREATE TABLE IF NOT EXISTS "<table>" (`.
- Column: comment lines + `"name" <type>` + ` PRIMARY KEY[ AUTOINCREMENT]` (only when this is the
  table's single primary key column and its type is integer or int; AUTOINCREMENT when `increment`
  or its default says identity/autoincrement/nextval) + ` NOT NULL` + ` UNIQUE` (not for primary key
  columns) + ` DEFAULT <value>`.
- Type: a primary key column of type int/integer -> `INTEGER`; integer, text, real, blob, numeric,
  decimal, boolean, date, datetime, timestamp, float, double, varchar, char, int, smallint, tinyint,
  bigint, json -> the name upper-cased; nchar, nvarchar, ntext, character varying, character ->
  TEXT; datetime2 -> DATETIME; binary, varbinary, image, geometry, geography -> BLOB; bit ->
  BOOLEAN; user-defined, jsonb, array, any `x[]` -> TEXT; mediumint -> INTEGER; anything else
  upper-cased. Length `(n)` for VARCHAR, CHAR, TEXT; `(p, s)` or `(p)` for DECIMAL, NUMERIC, REAL,
  FLOAT, DOUBLE.
- After the columns: `,\n    PRIMARY KEY (...)` when there are primary key columns and the key is
  not the single integer column, checks as `,\n    CHECK (<expr>)`, then one
  `,\n    FOREIGN KEY(<cols>) REFERENCES "<reftable>"(<refcols>)` per constraint held by this table
  (no names, no schema), then `\n);\n`.
- Indexes: `CREATE [UNIQUE ]INDEX IF NOT EXISTS "<table>_<index name>"` with every char outside
  letters, digits, underscore replaced by `_`, cut to 60, then a newline and
  `ON "<table>" (<cols>);`; written after the table under `\n-- Indexes\n`; then `\n`.
- Default: `now()` and `current_timestamp` -> `CURRENT_TIMESTAMP`; identity-like defaults are
  dropped; `newid()`/`uuid()` -> `lower(hex(randomblob(16)))`; a default containing `datetime(''now'')`
  -> `CURRENT_TIMESTAMP`; the known forms, keywords, numbers, quoted text kept; else quoted.
- Tables are joined by `\n`; the script ends with a blank line and `COMMIT;` and a newline.

#### 9.1.8 Converter (different dialect, 7 sources, 4 targets)

Principle: deterministic, never guess. Each column type is read in the dialect it came from into a
neutral description, then written in the target dialect. Anything with no safe equivalent is left
out of the statements and reported in a header and, for columns, a trailing comment.

Script layout:

1. Header: `-- <Source> to <Target> conversion`, `-- Generated by QBase`. With no notes a blank
   line follows. With notes: `--`, `-- CONVERSION NOTES (N items):`, then for each section in the
   order first used: `--`, `-- <Section>:`, and `--   - <where>: <text>` lines (no blank
   lines inside), then `--` and a blank line. Sections: "Type conversions", "Default values",
   "Auto numbering", "Constraints", "Indexes", "Foreign keys", "Schemas and views", "Names". The same
   note is not repeated. Line breaks in a note become spaces. Labels: PostgreSQL, CockroachDB, MySQL,
   MariaDB, SQL Server, SQLite, Oracle, ClickHouse, "generic SQL".
2. Schemas: the default schema of the source (public for PostgreSQL, dbo for SQL Server) is not
   written. Other schemas: PostgreSQL `CREATE SCHEMA IF NOT EXISTS "s";`, MySQL `CREATE DATABASE
   IF NOT EXISTS \`s\`;`, SQL Server
   `IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 's') EXEC('CREATE SCHEMA [s]');`, SQLite:
   nothing and every table name gets the prefix `<schema>_` (note "SQLite has no schemas: table
   names are prefixed with the schema name"). A blank line after the schemas (not for SQLite).
3. Views are not exported (note "N view(s) not exported: only tables are converted"). A table with
   no columns is not exported (note "not exported: the table has no columns").
4. `CREATE TABLE <name> (` + lines joined `,\n` + `\n)` + (MySQL table comment ` COMMENT='...'`) + `;`.
   Each line is four spaces + text. The lines are: columns, then constraints in this order: the
   primary key (`PRIMARY KEY (a, b)`; absent when SQLite numbers the column inline), `KEY (col)`
   for a MySQL auto numbered column that is not indexed, enum CHECKs, user CHECKs, and for SQLite
   the foreign keys `FOREIGN KEY (a) REFERENCES <table> (b)`.
5. Column: `<quoted name> <type>` then, MySQL/PostgreSQL/SQLite: ` NOT NULL` (primary key, auto
   numbered, or not nullable), ` AUTO_INCREMENT` (MySQL), ` UNIQUE` (not when the column is the
   sole primary key), ` DEFAULT <value>`, ` COMMENT '...'` (MySQL). SQL Server order: type,
   ` IDENTITY(1,1)`, ` NOT NULL` or ` NULL` (nullable columns say ` NULL` explicitly), ` UNIQUE`,
   default. SQLite auto numbered: `"c" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT`.
   A column whose type was only approximated gets a line comment ` -- Was: <original type name>`
   after its comma.
6. Column comments: PostgreSQL `COMMENT ON COLUMN`, MySQL inline, SQL Server and SQLite as `-- `
   lines above the column. Table comments: PostgreSQL `COMMENT ON TABLE`, MySQL inline, SQL
   Server and SQLite `-- ` lines above the table. MySQL comments have `\` doubled in other
   string literals.
7. Types: section 9.1.8.1. Defaults: 9.1.8.2. Checks: 9.1.8.3.
8. Auto numbering: PostgreSQL -> `serial`, `bigserial`, `smallserial` by size; MySQL ->
   `AUTO_INCREMENT`; SQL Server -> `IDENTITY(1,1)`; SQLite -> only a lone integer primary key.
   Problems become notes in "Auto numbering" and the column is not numbered: not an integer
   column; PostgreSQL: size not 16/32/64; MySQL/SQL Server/SQLite: only one column per table;
   SQLite: not the whole primary key.
9. Foreign key column types follow the referenced column when both are integers of different
   size or sign (note "changed to match T.c, which it references").
10. Indexes after the table under `\n-- Indexes\n`, the primary key one skipped, sorted:
    `CREATE [UNIQUE ]INDEX "<name>" ON <table> (<cols>);`, name = the stored name or
    `idx_<table>_<cols>`, made unique across the script (suffix `_<table>_<n>`), cut to the
    target's limit (PostgreSQL 63, MySQL 64, SQL Server 128). Hash, gin, gist, spgist, brin,
    fulltext, spatial, xml indexes become ordinary ones (note "<type> index created as a regular
    index"). A name longer than the limit adds a note in "Names".
11. Foreign keys (not SQLite): after all tables, a blank line, `-- Foreign key constraints`,
    `ALTER TABLE <table> ADD CONSTRAINT <name> FOREIGN KEY (<cols>) REFERENCES <reftable> (<refcols>);`
    (a space before each parenthesis), name = the relationship's name or `fk_<table>_<cols>`.
    Keys the target database would refuse (the referenced columns do not identify a row: not the
    primary key, not unique, not a unique index) are not created: note in "Foreign keys" and the
    line `-- not created (<reason>): FOREIGN KEY (<cols>) on <table> -> <reftable>` in the list.
    Reasons: "T.c is only part of a composite key, and no database accepts a foreign key to part of
    a key"; "T.c is not unique, and no database accepts a foreign key to a column that is not".
12. Key sized columns: a column that is in a primary key, a unique column, an index or a foreign
    key is "key sized": the target shortens unlimited text or very long varchars (MySQL 768
    characters, SQL Server 450 national / 900 other, with a note) so that an index can be made.

9.1.8.1 Type mapping. Each source type name is normalised (lower case, `unsigned`/`zerofill`
removed, `(...)` arguments read, spaces and underscores treated alike), then mapped to a neutral
kind, then written. Neutral kinds and how each dialect names them:

| Neutral | PostgreSQL | MySQL | SQL Server | SQLite |
| --- | --- | --- | --- | --- |
| int 8 bits | smallint | TINYINT | SMALLINT (signed) / TINYINT (unsigned) | INTEGER |
| int 16 | smallint | SMALLINT | SMALLINT | INTEGER |
| int 24 | integer | MEDIUMINT | INT | INTEGER |
| int 32 | integer | INT | INT | INTEGER |
| int 64 | bigint | BIGINT | BIGINT | INTEGER |
| unsigned int | one size larger: 8 -> smallint, 16/24 -> integer, 32 -> bigint, 64 -> numeric(20, 0) | `<name> UNSIGNED` | 8 -> TINYINT, 16/24 -> INT, 32 -> BIGINT, 64 -> DECIMAL(20, 0) | INTEGER |
| decimal(p, s) | numeric(p, s), numeric(p), numeric | DECIMAL(p, s) (max 65 / 30; no precision: DECIMAL(38, 10)) | DECIMAL(p, s) (max 38; no precision: DECIMAL(38, 10)) | DECIMAL(p, s) or NUMERIC (note: no fixed point type) |
| float 32 | real | FLOAT | REAL | REAL |
| float 64 | double precision | DOUBLE | FLOAT | REAL |
| bool | boolean | TINYINT(1) | BIT | BOOLEAN |
| char(n) | char(n) (default 1) | CHAR(n) up to 255, then VARCHAR(n) up to 16383, then MEDIUMTEXT | NCHAR(n) up to 4000 or CHAR(n) up to 8000 else VARCHAR/NVARCHAR(MAX) | CHAR(n) |
| varchar(n) | varchar(n), text when no length | VARCHAR(n) up to 16383 else MEDIUMTEXT; no length: LONGTEXT | NVARCHAR(n)/VARCHAR(n) up to 4000/8000 else (MAX); no length: (MAX) | VARCHAR(n), TEXT when no length |
| text (tiny/regular/medium/long) | text | TINYTEXT / TEXT / MEDIUMTEXT / LONGTEXT | NVARCHAR(MAX) or VARCHAR(MAX) | TEXT |
| binary / varbinary / blob | bytea | BINARY(n) / VARBINARY(n) / TINYBLOB..LONGBLOB | BINARY(n) / VARBINARY(n) / VARBINARY(MAX) | BLOB |
| date | date | DATE | DATE | DATE |
| time (with/without zone) | time / timetz | TIME | TIME | TIME |
| datetime / timestamp | timestamp / timestamptz | DATETIME | DATETIME2 / DATETIMEOFFSET | DATETIME |
| json / jsonb | json / jsonb (jsonb when the source says jsonb or is not PostgreSQL) | JSON | NVARCHAR(MAX) (NVARCHAR(450) in a key) | TEXT |
| uuid | uuid | CHAR(36) | UNIQUEIDENTIFIER | CHAR(36) |
| xml | xml | LONGTEXT | XML | TEXT |
| enum (values known) | varchar(255) + CHECK (col IN (...)) | ENUM('a', 'b') | NVARCHAR(255) + CHECK | TEXT + CHECK |
| enum (values unknown, MySQL source) | varchar(255) + CHECK omitted, note | VARCHAR(255) | NVARCHAR(255) | TEXT |
| bit string(n) | bit(n) / varbit | BIT(n) up to 64 else BINARY | BIT (n = 1) else BINARY(n/8) | INTEGER up to 63 else BLOB |
| geometry / geography | bytea (note, PostGIS not assumed) | GEOMETRY (geography -> GEOMETRY, note) | GEOMETRY / GEOGRAPHY | BLOB |
| array of X | X[] | JSON | NVARCHAR(MAX) (note) | TEXT (note) |

Source type names with special meaning: serial/bigserial/smallserial (auto numbering with the
size), tinyint (SQL Server: 0..255, otherwise signed), integer (SQLite: 64 bit), real (PostgreSQL
and SQL Server 32 bit, others 64), float (MySQL 32 bit unless `(n)` says otherwise), bit (SQL
Server and SQLite: boolean; MySQL `bit(1)`: boolean), money -> decimal(19, 4) on SQL Server, 19, 2
otherwise (note), smallmoney -> decimal(10, 4), year -> int 16, timestamp (SQL Server: row
version, becomes BINARY(8) with a note), rowversion, set -> varchar(255) (note), interval, inet,
cidr, macaddr, macaddr8, geometric types, tsvector, tsquery, range types -> varchar or text with a
note, user-defined / unknown / sql_variant / hierarchyid / cursor -> long text with a note ("unknown
type "x"; stored as text"), oid and reg* -> bigint-sized number (note). A PostgreSQL enum or
composite custom type by name: an enum becomes the neutral enum with its values; a composite
becomes jsonb/JSON text with a note.

9.1.8.2 Defaults. A default is parsed in the source's way into one of: now (now(),
current_timestamp, getdate(), sysdatetime(), utc_timestamp, datetime('now'), ...), current date,
current time, uuid (gen_random_uuid(), uuid_generate_v1..5, uuid(), newid(), newsequentialid(),
randomblob use), null, true/false, number, string (with quotes and casts removed, doubled quotes
undone), list (`ARRAY[...]` -> JSON text), auto numbering (nextval, identity, autoincrement), or
raw (not understood). Outer parentheses and casts are removed first. Then it is written for the
target: null -> NULL; booleans -> `true`/`false` on a boolean column in PostgreSQL, `1`/`0`
elsewhere; numbers as written (quoted for text and date columns); strings quoted (SQL Server `N'..'`
for national text, MySQL doubles backslashes); now -> `CURRENT_TIMESTAMP` (PostgreSQL, MySQL,
SQLite), `GETDATE()` or `SYSDATETIMEOFFSET()` for a timezone column (SQL Server); current date ->
`CURRENT_DATE` / `(CURRENT_DATE)` (MySQL) / `CAST(GETDATE() AS DATE)`; current time likewise;
uuid -> `gen_random_uuid()` / `(UUID())` / `NEWID()` (`CONVERT(VARCHAR(36), NEWID())` on text
columns) / a SQLite expression building a version 4 UUID. MySQL wraps a literal default in
parentheses for TEXT, BLOB, JSON and spatial columns. A default that cannot be kept (a date
function on a number column, a raw expression, a bad boolean text, a list on a non-list column) is
dropped and a note says why ("the default expression X was not converted").

9.1.8.3 CHECK constraints. Only expressions made of column names, string and number literals,
comparison and arithmetic operators, AND, OR, NOT, IN, BETWEEN, LIKE, IS [NOT] NULL, parentheses,
and these functions: LOWER, UPPER, ABS, COALESCE, NULLIF, and length functions (`CHAR_LENGTH`,
`CHARACTER_LENGTH`, `LEN`, and `LENGTH` unless the source is MySQL, where it counts bytes) are
converted; the length function takes the target's name (CHAR_LENGTH for PostgreSQL and MySQL, LEN
for SQL Server, LENGTH for SQLite); identifiers are re-quoted for the target; outer parentheses are
dropped. Anything else (casts, other functions, dialect operators) is not created: a note in
"Constraints" ("CHECK (...) not created: it uses <reason>") and the line `-- not created (uses
<reason>): CHECK (...)` below the table.

#### 9.1.9 The check-expression checker

A check expression entered in the editor, or read from DBML, is validated before it is accepted.
Accept: an expression using column names, literals, comparison, arithmetic, boolean operators,
IN, BETWEEN, LIKE, IS NULL, balanced parentheses and a small list of safe functions. Reject with a
position (line and column inside the expression): unbalanced parentheses or quotes, an empty
expression, statements (`;`), subqueries (`SELECT`), comments, and clearly dangerous keywords
(DROP, DELETE, INSERT, UPDATE, ALTER, CREATE, EXEC). The exact list of accepted functions is a
product choice (Q6); the converter's list above is the minimum. The error message names the problem
and the position.

#### 9.1.10 The generic fallback (no converter)

Used for Oracle and ClickHouse diagrams exported to another type, and for any target without a
converter. Output: if the types differ, the three comment lines `-- <Source> to <Target>`,
`-- WARNING: there is no converter for this pair. Column types and defaults are`, `-- copied as
written and need to be checked before this script is run.` and a blank line. Then, one statement
group per table in diagram order: `CREATE SCHEMA IF NOT EXISTS "<s>";` for each schema; enums and
composites as `CREATE TYPE` when the target supports custom types; `CREATE SEQUENCE IF NOT EXISTS
<n>;`; each table as `CREATE TABLE "<schema>"."<table>" (` with `  "<col>" <type>` lines
(two-space indent), `NOT NULL`, `UNIQUE`, `/* AUTO_INCREMENT */` as a comment for auto numbered
columns, defaults formatted, inline `PRIMARY KEY` for a single key or a final
`PRIMARY KEY (a, b)`, `CHECK (...)` for checks when the target supports them, `);`, `COMMENT ON ...`
where the target supports it, sorted `CREATE INDEX` statements; and `ALTER TABLE ... ADD CONSTRAINT
fk_<table>_<cols> FOREIGN KEY (...) REFERENCES ...;`. This path is old and low value; the owner may
drop it (section 11).

### 9.2 DBML

DBML export is shown in the side panel in two forms: "standard" (relationships as separate `Ref`
statements at the end) and "inline" (each relationship written as `[ref: ...]` on the column that
holds the key). The user toggles the form. The text is regenerated whenever the diagram changes.

Rules (the library that writes DBML may own whitespace; tests must compare DBML by parsing it
back, not byte for byte, except for the lines marked exact):

- Tables with no fields are left out; tables with an identical `schema.name` after the first are
  left out; fields with empty names are left out (the panel tells the user which tables lost
  fields); a duplicate field name gets `_2`, `_3` ...; relationships whose table or field is gone
  are left out; names `from` and `to` in a table called `relation` are renamed so the DBML parses.
- Each table: `Table "<name>" {` or `Table "<schema>"."<name>" {`, then one line per field:
  `  "<name>" <type> [<attributes>]` where attributes are, in this order, `pk`, `unique`,
  `not null`, `increment`, `default: <value>`, `note: '<text>'`. A composite primary key is an
  `indexes { (a, b) [pk] }` block (with `name:` when the primary key index has a name). Other
  indexes: `indexes { col [name: "n", unique, type: gin, note: '...'] }` and `(a, b) [...]` for
  several columns. The table comment is `Note: '<text>'`. Check constraints are
  `checks { \`expr\` }` inside the table (single-column ones are written as the table's `checks` too).
  Enum types are written first, `Enum "<schema>"."<name>" { "a" "b" }` (exact: the schema part only
  if there is one, one value per line indented by four spaces, quotes escaped with a backslash).
  Array fields are written `type[]`. View tables are not exported.
- Types: the type name as stored, with `(n)` or `(p, s)` when the field has a length or precision;
  a multi-word type name is written in double quotes; the types of dialects without DBML types are
  written as their SQL name.
- Defaults: strings in single quotes, numbers bare, expressions in backticks (`` `now()` ``);
  PostgreSQL casts are removed first (`'x'::text` -> `'x'`), `('now')` -> `now()`, and for
  PostgreSQL `CURRENT_DATE()` -> `CURRENT_DATE`.
- Relationships (exact): `Ref "fk_<index>_<name>":"<schema>"."<table>"."<field>" <sym>
  "<schema>"."<table>"."<field>"` where index is the position (from 0) and name is the
  relationship name with every character outside letters, digits, underscore replaced by `_` (a
  random short text when the name is empty: the rewrite must use a fixed fallback `rel`);
  the symbol and order: target-many/source-one (the usual foreign key) -> `<referenced table> <
  <table that holds the key>`; source many, target one -> same order with `<`; one-to-one -> `-`
  with the source first. Parts without a schema omit the schema segment. Refs are separated by a
  blank line. In the inline form the ref is written on the field of the table that holds the key.
  Two relationships joining the same four columns in either direction are written once.
- Empty result: when the diagram has no usable table the text is empty. On an export error the
  text is `// Error generating DBML: <message>` (after any enums) and the panel shows a toast
  "DBML Export Error".

### 9.3 JSON

- A `.json` file named `QBase(<diagram name>).json`, pretty printed with two-space indent, UTF-8.
- Content: the whole diagram (id, name, databaseType, databaseEdition, tables, relationships,
  dependencies, areas, customTypes, notes, createdAt, updatedAt) in the shape of
  `rewrite/spec/data-format.md`, section 5, with one change: ids are replaced by running numbers
  as strings ("0", "1", ...) in this order: for each table in order its own id, then its fields in
  order, then its indexes in order; then relationships, dependencies, areas, notes, custom types in
  their order. All references use the new ids. The same diagram always produces the same file
  except for the dates.
- There is a one second pause with a spinner before the download (cosmetic; not required).
- Local-only data is not exported: sync state, filter, config.

### 9.4 Image

Formats: PNG, JPEG, SVG (menu "Export as"). Options in the dialog (all three formats share the
dialog):

| Option | Values | Default |
| --- | --- | --- |
| Scale (pixel ratio) | 1x, 2x, 4x | 4x |
| Include pattern background (the dot grid) | on/off | on |
| Transparent background | on/off | off |

(The theme is not an option: the export follows the current light or dark theme.)

Behaviour:

- What is exported is what is on screen: the current viewport of the canvas, at its current
  zoom and pan, not the whole diagram. The output size in CSS pixels is the size of the canvas
  area; the file is that size times the scale. (Old behaviour, Q13; many users expect "fit all".)
- Selection is cleared first so selection outlines are not drawn.
- Background: transparent -> none (PNG and SVG keep the alpha; JPEG has no alpha: old behaviour
  gives a black background, the rewrite must use the theme background instead); otherwise white
  `#ffffff` in the light theme and `#141414` in the dark theme. The dot pattern, when on: dots every
  16 px (times zoom), radius half a pixel times zoom, colour `#92939C` in light and `#777777` in
  dark, behind everything, drawn even when the background is transparent.
- Relationship lines and their end markers are exported with the colours they have on screen;
  fonts are not embedded (the export uses the page's fonts as they render).
- PNG and JPEG get the product logo (light or dark version for the theme) in the bottom-left
  corner: height max(24, 2.4% of the image width), margin max(12, half the height), opacity 0.9.
  SVG has no logo. (A branding item: Q14 - the rewrite needs its own logo asset.)
- A loading overlay shows while exporting. If the canvas cannot be found nothing is exported and
  the overlay closes.
- File name `<diagram name>.png|jpeg|svg`; JPEG quality 1.

---

## 10. Samples with exact expected outputs

The model of each sample is written in a neutral table; the exporter input is a diagram of the
named database type with exactly these values. Fields not mentioned are false/absent. Ids and
dates do not matter. Relationship: source = the referenced table and field ("one"), target =
the table that holds the key ("many").

Round trip rule for every sample script in this section: importing the script (with the same
database type) and exporting again produces the same script text (idempotence). Importing alone
must produce the tables, fields and flags of the model, with type names in the dialect's own
spelling (and the normalisations of section 3.6), and no warnings.

### 10.1 Model S1 "customers and orders" (no schema)

customers: id (int, primary key, not null, increment); email (varchar 120, not null, unique);
full_name (varchar 80, nullable); created_at (timestamp, not null, default = the dialect's now).
orders: id (int, primary key, not null, increment); customer_id (int, not null); total (decimal
10,2, not null, default 0). Index on orders: name `idx_orders_customer`, not unique, columns
customer_id. Relationship: name `fk_orders_customers`, source customers.id (one), target
orders.customer_id (many).

Dialect type names used in the model: PostgreSQL: integer, varchar, timestamp (default `now()`),
numeric. MySQL: int, varchar, timestamp (default `CURRENT_TIMESTAMP`), decimal. SQL Server: int,
varchar, datetime2 (default `getdate()`), decimal. SQLite: integer, varchar, timestamp (default
`CURRENT_TIMESTAMP`), decimal.

PostgreSQL output:

```
CREATE TABLE "customers" (
    "id" serial NOT NULL,
    "email" varchar(120) NOT NULL UNIQUE,
    "full_name" varchar(80),
    "created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
    "id" serial NOT NULL,
    "customer_id" integer NOT NULL,
    "total" numeric(10, 2) NOT NULL DEFAULT 0,
    PRIMARY KEY ("id")
);
-- Indexes
CREATE INDEX "orders_idx_orders_customer" ON "orders" ("customer_id");

-- Foreign key constraints
-- Schema: public
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_customer_id_customers_id" FOREIGN KEY("customer_id") REFERENCES "customers"("id");
```

(No newline after the last line.)

MySQL output (note the three blank lines between the tables: they are part of the contract):

```
-- MySQL database export
START TRANSACTION;

CREATE TABLE IF NOT EXISTS `customers` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(120) NOT NULL UNIQUE,
    `full_name` VARCHAR(80),
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
);



CREATE TABLE IF NOT EXISTS `orders` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `customer_id` INT NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
);

-- Indexes
CREATE INDEX `idx_orders_customer_id` ON `orders` (`customer_id`);

-- Foreign key constraints
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_customer_id` FOREIGN KEY(`customer_id`) REFERENCES `customers`(`id`);

COMMIT;
```

SQL Server output (two blank lines between the tables):

```
CREATE TABLE [customers] (
    [id] int NOT NULL IDENTITY(1,1),
    [email] varchar(120) NOT NULL UNIQUE,
    [full_name] varchar(80),
    [created_at] datetime2 NOT NULL DEFAULT getdate(),
    PRIMARY KEY ([id])
);


CREATE TABLE [orders] (
    [id] int NOT NULL IDENTITY(1,1),
    [customer_id] int NOT NULL,
    [total] decimal(10, 2) NOT NULL DEFAULT 0,
    PRIMARY KEY ([id])
);

-- Indexes
CREATE INDEX [idx_orders_customer] ON [orders] ([customer_id]);

-- Foreign key constraints
-- Schema: dbo
ALTER TABLE [orders] ADD CONSTRAINT [fk_orders_customers] FOREIGN KEY([customer_id]) REFERENCES [customers]([id]);
```

SQLite output (two blank lines between the tables):

```
-- SQLite database export
PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "customers" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "email" VARCHAR(120) NOT NULL UNIQUE,
    "full_name" VARCHAR(80),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS "orders" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "total" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    FOREIGN KEY("customer_id") REFERENCES "customers"("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "orders_idx_orders_customer"
ON "orders" ("customer_id");

COMMIT;
```

### 10.2 Model S2 "courses and enrolments" (comments, check, composite key)

courses: code (varchar 10, primary key, not null); title (varchar 100, not null, comment "Display
name"); credits (smallint, not null, default 3). Table comment "Course catalogue". Check:
`credits > 0`.
enrolments: student_id (int, not null, primary key part 1); course_code (varchar 10, not null,
primary key part 2); grade (char 1, nullable). Index: name `idx_enrol_course`, not unique, columns
course_code, grade. Relationship: name `fk_enrol_course`, source courses.code (one), target
enrolments.course_code (many).
For PostgreSQL and SQL Server both tables are in the schema `school`; for MySQL and SQLite there is
no schema. Types: PostgreSQL integer, varchar, smallint, char; MySQL int, varchar, smallint, char;
SQL Server int, varchar, smallint, char; SQLite integer, varchar, smallint, char.
A composite primary key means the key is the pair (student_id, course_code). The index
(course_code, grade) is not the primary key, so it is written.

PostgreSQL:

```
CREATE SCHEMA IF NOT EXISTS "school";

-- Course catalogue
CREATE TABLE "school"."courses" (
    "code" varchar(10) NOT NULL,
    -- Display name
    "title" varchar(100) NOT NULL,
    "credits" smallint NOT NULL DEFAULT 3,
    PRIMARY KEY ("code"),
    CHECK (credits > 0)
);
COMMENT ON TABLE "school"."courses" IS 'Course catalogue';
COMMENT ON COLUMN "school"."courses"."title" IS 'Display name';

CREATE TABLE "school"."enrolments" (
    "student_id" integer NOT NULL,
    "course_code" varchar(10) NOT NULL,
    "grade" char(1),
    PRIMARY KEY ("student_id", "course_code")
);
-- Indexes
CREATE INDEX "enrolments_idx_enrol_course" ON "school"."enrolments" ("course_code", "grade");

-- Foreign key constraints
-- Schema: school
ALTER TABLE "school"."enrolments" ADD CONSTRAINT "fk_enrolments_course_code_courses_code" FOREIGN KEY("course_code") REFERENCES "school"."courses"("code");
```

MySQL (no blank line between `START TRANSACTION;` and the table comment, one blank line after the
comment; three blank lines between tables):

```
-- MySQL database export
START TRANSACTION;
-- Course catalogue

CREATE TABLE IF NOT EXISTS `courses` (
    `code` VARCHAR(10) NOT NULL,
    -- Display name
    `title` VARCHAR(100) NOT NULL COMMENT 'Display name',
    `credits` SMALLINT NOT NULL DEFAULT 3,
    PRIMARY KEY (`code`),
    CHECK (credits > 0)
) COMMENT='Course catalogue';



CREATE TABLE IF NOT EXISTS `enrolments` (
    `student_id` INT NOT NULL,
    `course_code` VARCHAR(10) NOT NULL,
    `grade` CHAR(1),
    PRIMARY KEY (`student_id`, `course_code`)
);

-- Indexes
CREATE INDEX `idx_enrolments_course_code_grade` ON `enrolments` (`course_code`, `grade`);

-- Foreign key constraints
ALTER TABLE `enrolments` ADD CONSTRAINT `fk_enrolments_course_code` FOREIGN KEY(`course_code`) REFERENCES `courses`(`code`);

COMMIT;
```

SQL Server (the schema block is directly followed by the table comment block; two blank lines
between tables):

```
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'school')
BEGIN
    EXEC('CREATE SCHEMA [school]');
END;
/**
Course catalogue
*/
CREATE TABLE [school].[courses] (
    [code] varchar(10) NOT NULL,
    -- Display name
    [title] varchar(100) NOT NULL,
    [credits] smallint NOT NULL DEFAULT 3,
    PRIMARY KEY ([code]),
    CHECK (credits > 0)
);


CREATE TABLE [school].[enrolments] (
    [student_id] int NOT NULL,
    [course_code] varchar(10) NOT NULL,
    [grade] char(1),
    PRIMARY KEY ([student_id], [course_code])
);

-- Indexes
CREATE INDEX [school_idx_enrol_course] ON [school].[enrolments] ([course_code], [grade]);

-- Foreign key constraints
-- Schema: school
ALTER TABLE [school].[enrolments] ADD CONSTRAINT [fk_enrol_course] FOREIGN KEY([course_code]) REFERENCES [school].[courses]([code]);
```

SQLite (two blank lines between tables; the composite key is a table constraint, the foreign key is
inside the table):

```
-- SQLite database export
PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;
-- Course catalogue
CREATE TABLE IF NOT EXISTS "courses" (
    "code" VARCHAR(10) NOT NULL,
    -- Display name
    "title" VARCHAR(100) NOT NULL,
    "credits" SMALLINT NOT NULL DEFAULT 3,
    PRIMARY KEY ("code"),
    CHECK (credits > 0)
);


CREATE TABLE IF NOT EXISTS "enrolments" (
    "student_id" INTEGER NOT NULL,
    "course_code" VARCHAR(10) NOT NULL,
    "grade" CHAR(1),
    PRIMARY KEY ("student_id", "course_code"),
    FOREIGN KEY("course_code") REFERENCES "courses"("code")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "enrolments_idx_enrol_course"
ON "enrolments" ("course_code", "grade");

COMMIT;
```

### 10.3 Model S3 (one dialect-specific table each)

PostgreSQL: custom enum type `ticket_status` with values open, closed, `it's done`. Table
`tickets`: id (bigint, primary key, not null, increment); status (type `ticket_status`, not null,
default `'open'`); tags (text, array, nullable); payload (jsonb, nullable, default `'{}'`); title
(varchar 200, not null, unique). Indexes: `idx_tickets_tags` type gin on tags;
`uq_tickets_status_title` unique on status, title. No relationships.

```
CREATE TYPE "ticket_status" AS ENUM ('open', 'closed', 'it''s done');

CREATE TABLE "tickets" (
    "id" bigserial NOT NULL,
    "status" ticket_status NOT NULL DEFAULT 'open',
    "tags" text[],
    "payload" jsonb DEFAULT '{}',
    "title" varchar(200) NOT NULL UNIQUE,
    PRIMARY KEY ("id")
);
-- Indexes
CREATE INDEX "tickets_idx_tickets_tags" ON "tickets" USING GIN ("tags");
CREATE UNIQUE INDEX "tickets_uq_tickets_status_title" ON "tickets" ("status", "title");
```

(The script ends with one newline.)

MySQL: schema `app` (a database name). Table `events`: id (bigint, primary key, not null,
increment); code (varchar, no length, not null, unique); body (text, nullable); active (boolean,
not null, default `true`); payload (json, nullable). Indexes: `idx_body` on body; `uq_code` unique
on code. (The stored index names are ignored by this generator.)

```
-- MySQL database export
START TRANSACTION;
CREATE DATABASE IF NOT EXISTS `app`;



CREATE TABLE IF NOT EXISTS `app`.`events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(255) NOT NULL UNIQUE,
    `body` TEXT,
    `active` TINYINT(1) NOT NULL DEFAULT true,
    `payload` JSON,
    PRIMARY KEY (`id`)
);

-- Indexes
CREATE INDEX `idx_events_body` ON `app`.`events` (`body`(255));
CREATE UNIQUE INDEX `idx_events_code_unique` ON `app`.`events` (`code`);


COMMIT;
```

Check the blank lines: after the `CREATE DATABASE` line there are two blank lines; at the end, the
last index line is followed by two blank lines and `COMMIT;` (no foreign keys section because there
are no relationships; the table text ends with a newline and the script then appends a blank line).

SQL Server: table `Invoice` (no schema): Id (int, primary key, not null, increment); Number
(varchar, length `-1`, not null); IssuedAt (datetimeoffset, not null, default
`(sysdatetimeoffset())`); Total (money, not null, default `((0))`); Paid (bit, not null, default
`((0))`); Note (nvarchar 500, nullable, default `(N'n/a')`). Index: `IX_Invoice_Number` unique on
Number.

```
CREATE TABLE [Invoice] (
    [Id] int NOT NULL IDENTITY(1,1),
    [Number] varchar(MAX) NOT NULL,
    [IssuedAt] datetimeoffset NOT NULL DEFAULT sysdatetimeoffset(),
    [Total] money NOT NULL DEFAULT 0,
    [Paid] bit NOT NULL DEFAULT 0,
    [Note] nvarchar(500) DEFAULT N'n/a',
    PRIMARY KEY ([Id])
);

-- Indexes
CREATE UNIQUE INDEX [IX_Invoice_Number] ON [Invoice] ([Number]);
```

(One newline at the end.)

SQLite: tables `files` and `sqlite_sequence` (columns name, seq), no relationships. files: id
(integer, primary key, not null, increment); path (varchar 255, not null, unique); size (bigint,
nullable); is_public (boolean, not null, default 0); checksum (blob, nullable). Index
`uq_files_path_size` unique on path, size.

```
-- SQLite database export
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "files" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    "path" VARCHAR(255) NOT NULL UNIQUE,
    "size" BIGINT,
    "is_public" BOOLEAN NOT NULL DEFAULT 0,
    "checksum" BLOB
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "files_uq_files_path_size"
ON "files" ("path", "size");

-- Skipping SQLite system table: "sqlite_sequence"

COMMIT;
```

### 10.4 Converter samples

PostgreSQL diagram S1 (types as in 10.1, default `now()`) exported to MySQL:

```
-- PostgreSQL to MySQL conversion
-- Generated by QBase

CREATE TABLE `customers` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(120) NOT NULL UNIQUE,
    `full_name` VARCHAR(80),
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
);

CREATE TABLE `orders` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `customer_id` INT NOT NULL,
    `total` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
);

-- Indexes
CREATE INDEX `idx_orders_customer` ON `orders` (`customer_id`);

-- Foreign key constraints
ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_customers` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`);
```

(One newline at the end.)

PostgreSQL diagram S3 (the tickets model of 10.3) exported to SQLite:

```
-- PostgreSQL to SQLite conversion
-- Generated by QBase
--
-- CONVERSION NOTES (3 items):
--
-- Type conversions:
--   - tickets.tags: text is an array
--   - tickets.tags: stored as JSON text
--
-- Indexes:
--   - tickets.idx_tickets_tags: gin index created as a regular index
--

CREATE TABLE "tickets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "tags" TEXT, -- Was: text
    "payload" TEXT DEFAULT '{}',
    "title" VARCHAR(200) NOT NULL UNIQUE,
    CHECK ("status" IN ('open', 'closed', 'it''s done'))
);

-- Indexes
CREATE INDEX "idx_tickets_tags" ON "tickets" ("tags");
CREATE UNIQUE INDEX "uq_tickets_status_title" ON "tickets" ("status", "title");
```

(One newline at the end.)

### 10.5 Import samples (hand written scripts, with the expected model)

Each of these is imported with the dialect named. After each: what must come out. "No warning"
means the validation area shows only the "Found ..." line.

PostgreSQL A1, a dump-style script (detected as a dump because of the `SET` line when the type is
Generic):

```
SET statement_timeout = 0;
CREATE TYPE public.mood AS ENUM ('calm', 'busy');
CREATE TABLE public.pets (
    id integer NOT NULL,
    name character varying(40) NOT NULL,
    mood public.mood DEFAULT 'calm'::public.mood
);
ALTER TABLE ONLY public.pets ADD CONSTRAINT pets_pkey PRIMARY KEY (id);
CREATE TABLE public.vets (id serial PRIMARY KEY, pet_id integer REFERENCES public.pets(id));
CREATE INDEX idx_pets_name ON public.pets USING btree (name);
```

Expected: enum `mood` (values calm, busy; schema public); table `pets` (schema public): id
primary key not null; name type `varchar` length 40 not null; mood type `mood`, nullable, default
`'calm'::public.mood` (stored as written); table `vets`: id type `serial`, increment, primary key;
pet_id integer nullable. One relationship: source pets.id (one), target vets.pet_id (many). Index
`idx_pets_name` on pets.name, not unique, type btree; each table also has its primary key index
entry. Tables sorted pets, vets. No warning (the `SET` line is ignored silently).

MySQL A1:

```
CREATE TABLE `pets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(40) NOT NULL,
  `kind` enum('cat','dog') DEFAULT 'cat',
  PRIMARY KEY (`id`),
  KEY `idx_pets_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE `vets` (
  `id` int NOT NULL,
  `pet_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_vets_pet` FOREIGN KEY (`pet_id`) REFERENCES `pets` (`id`)
);
```

Expected: pets: id int, primary key, increment; name varchar 40 not null; kind type `enum`, nullable,
default `'cat'`; index `idx_pets_name` non-unique on name. vets: id int primary key; pet_id int
nullable (the `DEFAULT NULL` is stored as no default); relationship named `fk_vets_pet`, source
pets.id (one), target vets.pet_id (many). `ENGINE` and `CHARSET` ignored. No warning.

MySQL error case: `CREATE TABLE a (id INT PRIMARY KEY); CREATE TABLE b (a_id INT REFERENCES
a(id));` -> blocking error naming line 1 (or the line of the clause) with the "inline REFERENCES"
message.

SQL Server A1:

```
CREATE TABLE [dbo].[Pets] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [Name] NVARCHAR(40) NOT NULL,
    CONSTRAINT [PK_Pets] PRIMARY KEY CLUSTERED ([Id])
)
GO
CREATE TABLE [dbo].[Vets] ([Id] INT NOT NULL PRIMARY KEY, [PetId] INT NULL)
GO
ALTER TABLE [dbo].[Vets] ADD CONSTRAINT [FK_Vets_Pets] FOREIGN KEY ([PetId]) REFERENCES [dbo].[Pets]([Id])
```

Expected: Pets (schema dbo): Id int, primary key, increment; Name `nvarchar` length 40 not null. Vets:
Id int primary key; PetId int nullable. Relationship `FK_Vets_Pets`, source Pets.Id (one), target
Vets.PetId (many). No semicolons: no warning (SQL Server does not need them). Type and column
names keep the case written (type names lower-cased: `int`, `nvarchar`).

SQLite A1:

```
CREATE TABLE pets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE vets (id INTEGER PRIMARY KEY, pet_id INTEGER REFERENCES pets(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX uq_pets_name ON pets(name);
```

Expected: pets: id integer, primary key, not null, increment; name text not null. vets: id integer,
primary key; pet_id integer nullable; relationship (generated name) source pets.id (one), target
vets.pet_id (many) (the `ON DELETE CASCADE` is not stored). Index `uq_pets_name` unique on
pets.name. A script with `CREATE SCHEMA x;` shows the blocking error of 3.4.

Metadata JSON sample (PostgreSQL, tiny, invented):

```
{"database_name":"zoo","version":"PostgreSQL 16.2",
 "tables":[{"schema":"public","table":"keepers","comment":"People"},{"schema":"public","table":"animals"}],
 "views":[],
 "columns":[
  {"schema":"public","table":"keepers","name":"id","type":"integer","ordinal_position":1,"nullable":false,"is_identity":true},
  {"schema":"public","table":"keepers","name":"name","type":"character varying","ordinal_position":2,"nullable":false,"character_maximum_length":"60"},
  {"schema":"public","table":"animals","name":"id","type":"integer","ordinal_position":1,"nullable":false},
  {"schema":"public","table":"animals","name":"keeper_id","type":"integer","ordinal_position":2,"nullable":true},
  {"schema":"public","table":"animals","name":"weight","type":"numeric","ordinal_position":3,"nullable":true,"precision":{"precision":6,"scale":2}}],
 "pk_info":[{"schema":"public","table":"keepers","column":"id","pk_def":"PRIMARY KEY (id)"},{"schema":"public","table":"animals","column":"id","pk_def":"PRIMARY KEY (id)"}],
 "fk_info":[{"schema":"public","table":"animals","column":"keeper_id","foreign_key_name":"animals_keeper_fk","reference_schema":"public","reference_table":"keepers","reference_column":"id","fk_def":"FOREIGN KEY (keeper_id) REFERENCES keepers(id)"}],
 "indexes":[{"schema":"public","table":"animals","name":"animals_keeper_idx","column":"keeper_id","index_type":"btree","unique":false,"direction":"ASC","column_position":1}]}
```

Expected diagram: name `zoo`, type PostgreSQL. Tables animals and keepers (sorted by name), both
schema public, colour `#8eb7ff`. keepers: table comment `People`; id integer, primary key, not null,
increment; name `varchar` length 60 not null. animals: id integer primary key not null; keeper_id
integer nullable; weight numeric precision 6 scale 2. Index `animals_keeper_idx` btree on
keeper_id. One relationship `animals_keeper_fk`, source keepers.id (one), target animals.keeper_id
(many). Primary key index entries present on both tables. The paste `[{"metadata_json_to_import":
"..."}]` form of the same document must give the same diagram after "Check JSON".

Diagram JSON sample: export of model S1 gives a file whose ids are "0".."N" in the order of 9.3:
"0" customers, "1".."4" its four fields, then (no indexes) "5" orders, "6".."8" its three fields,
"9" its index, then "10" the relationship. Import of that file gives a diagram with 2 tables, 7
fields, 1 index, 1 relationship, new random ids, all references consistent, dates now.

DBML sample (S1, standard form; whitespace is the writer's, so compare by parsing):

```
Table "customers" {
  "id" integer [pk, not null, increment]
  "email" varchar(120) [unique, not null]
  "full_name" varchar(80)
  "created_at" timestamp [not null, default: `now()`]
}

Table "orders" {
  "id" integer [pk, not null, increment]
  "customer_id" integer [not null]
  "total" numeric(10,2) [not null, default: 0]

  Indexes {
    customer_id [name: "idx_orders_customer"]
  }
}

Ref "fk_0_fk_orders_customers":"customers"."id" < "orders"."customer_id"
```

Exact line: the `Ref` line. In the inline form the `Ref` is replaced by
`"customer_id" integer [not null, ref: > "customers"."id"]` on the key column.

---

## 11. What to keep or drop, and the libraries the old code used

### 11.1 Recommendation on dialects (to cut effort)

| Dialect | Recommend | Why |
| --- | --- | --- |
| PostgreSQL | keep (full: import, export, live import, metadata script) | the main target, richest features (enums, composites, arrays, schemas) |
| MySQL | keep | very common |
| SQL Server | keep | common in business; live import already exists |
| SQLite | keep | common, small |
| MariaDB | keep as an alias of MySQL for import, export and labels (no code of its own) | nearly free |
| CockroachDB | keep as an alias of PostgreSQL for import and export; drop its own metadata script unless asked | nearly free |
| Generic | keep (default type, "detect") | needed for new diagrams |
| Oracle | drop SQL import/export and its metadata script for v1; keep the type list only if the owner wants Oracle diagrams to open | hand-written importer (about 1 100 lines), no converter, tiny audience |
| ClickHouse | drop SQL import/export and its metadata script for v1; keep the type list only if needed | no SQL importer, no converter, tiny audience |

If Oracle and ClickHouse diagrams exist in saved files they must still open (data-format spec); the
choice here is only about import and export.

Editions and clients: keep PostgreSQL Supabase and Timescale (two filters), MySQL 5.7, SQL Server
2016, SQLite Cloudflare D1 + Wrangler only if the metadata-script flow is kept for that dialect (Q2).
Live import (PostgreSQL, SQL Server) makes the scripts unnecessary for those two when a server is
used; the scripts are still the only way for a local-only user.

Recommend dropping the "Generic fallback" generator (9.1.10) and the PostgreSQL fallback for types
without a generator: export an error or an "unsupported" message instead, which is simpler to specify.

Recommend keeping the converter (9.1.8) as specified: it is the most valuable and best defined
part.

### 11.2 Libraries the old code uses (names and licences only)

| Purpose | Library | Licence |
| --- | --- | --- |
| SQL parsing (PostgreSQL grammar used for views and as the base of every importer) | node-sql-parser | Apache-2.0 |
| DBML parse and write | @dbml/core and @dbml/parse | Apache-2.0 |
| Image export (PNG, JPEG, SVG) | html-to-image | MIT |
| Schema validation of the diagram file and metadata | zod | MIT |
| Random ids | nanoid | MIT |
| Live import drivers (server) | pg (PostgreSQL), mssql with tedious (SQL Server) | MIT |
| Code box for the import and export dialogs | monaco-editor and @monaco-editor/react | MIT |

All are maintained and MIT or Apache-2.0, so they may be used (keep their notices). The old importers
also contain a lot of hand-written text scanning on top of node-sql-parser (comment stripping,
statement splitting, regexes for views, inline keys, ALTER TABLE) because the library fails on some
dialect constructs. The clean author should write one tokeniser and statement splitter per dialect
family and use the library (or a different maintained one per dialect) only for CREATE TABLE
bodies, and must treat the examples in section 10 and the rules of section 3 as the contract.

---

## 12. Quirks and defects of the old behaviour (do not reproduce unless the owner says so)

1. Layout `perSchema` starts every schema group at the same origin: tables overlap across schemas.
2. DBML import skips the layout pass (grid only) and DBML apply can drop new tables onto existing
   ones.
3. Importing into an open diagram can duplicate tables, and loses custom types and dependencies of
   the import.
4. Unknown column types become `text` in SQL import (data loss); `unsigned`, enum values, display
   widths are dropped.
5. DBML import removes quotes from default values (`'abc'` becomes `abc`) and replaces accented
   letters.
6. `COMMENT ON` statements are not read by the SQL importers (only the metadata and DBML flows
   bring comments in).
7. SQL Server default quoting does not double quotes (`'it's'` is broken) and the default `nextval`
   becomes `IDENTITY(1,1)` as a default.
8. JPEG export with "transparent" gives a black background.
9. Image export covers only the visible part of the canvas.
10. Types without a generator (generic, CockroachDB, Oracle, ClickHouse) export with the PostgreSQL
    generator without saying so.
11. The generic fallback generator has two-space indentation and different quoting from every
    dialect generator.
12. The exported SQL is not idempotent across tables in MySQL/SQL Server/SQLite spacing (multiple
    blank lines between tables); kept in the samples because tests compare text exactly, but the
    owner may choose to normalise to one blank line (Q1) and then update the samples.
13. `integer` is mapped to the preferred synonym `int` on import for PostgreSQL, but exporting writes
    `serial` or `integer` depending on the flags, so the type name may change across a round trip
    (Q8).
14. `SQL Server` detection and `Generic` auto-detection are loose (any `BEGIN` selects SQLite).
15. Relationship names in the DBML export are random when empty.

---

## 13. Open questions for the owner

- Q1. SQL whitespace: keep the exact old spacing (several blank lines between tables in MySQL, SQL
  Server, SQLite) or normalise to exactly one blank line? Normalising makes the samples simpler;
  keeping preserves byte parity with old exports that users may have in version control.
- Q2. Keep the metadata-script flow for every dialect, or only for the four main ones, now that the
  server does live import for PostgreSQL and SQL Server? Which editions and clients stay?
- Q3. Oracle and ClickHouse: drop SQL import/export and the metadata scripts (recommended)? Should
  such diagrams still open and be editable?
- Q4. May a SQL import warn when it meets an unsupported or ignored statement for dialects other than
  PostgreSQL (today they stay silent)? Recommended: yes, one summary warning per kind.
- Q5. Importing into an existing diagram: merge by name (like re-sync) instead of always adding? At
  minimum warn about duplicates. Which behaviour does the owner want?
- Q6. The list of functions the check-expression checker accepts (9.1.9) and whether dialect-specific
  checks (such as a regex operator) should be accepted and exported only to their own dialect.
- Q7. Store enum values and `unsigned` for MySQL columns (the model has nowhere to keep them)? If yes
  the data-format spec needs new field attributes.
- Q8. PostgreSQL type spelling on import: keep `integer` as written (recommended) or fold to `int`?
- Q9. DBML: stop replacing accented letters (they are valid in quoted names)? Recommended: yes.
- Q10. Export to a type with no generator (generic, CockroachDB): use the PostgreSQL output (as
  before) or refuse with a message? CockroachDB is close to PostgreSQL but not identical.
- Q11. SQL Server string defaults: double the quotes (fixing a bug) even though old exports did not?
- Q12. Product copy: support address in the JSON error message, the import and export help text, the
  per-dialect instructions for producing a DDL file (pg_dump, mysqldump, sqlite `.schema`,
  SSMS "Script Tables as"): who writes the new text?
- Q13. Image export: export the whole diagram fitted to its size (recommended) or the current
  viewport (as before)? Is the logo watermark staying, with a new asset?
- Q14. Logo asset for exports needed from the owner (light and dark).
- Q15. Re-sync and drift: stay PostgreSQL and SQL Server only, or extend live import to MySQL?
- Q16. Is `rows`/`size` metadata (row counts in `tables`) shown anywhere? The old import stored it
  nowhere; drop it from the contract?
- Q17. Should the clean author also have the old importers' sample behaviour for "views" with
  `SELECT *` (no columns) and for views whose select list is complex? Recommended: a view with no
  derivable columns is imported empty with a warning.
- Q18. Confirm that Phase 5 may run the old editor once to confirm the samples in section 10
  (they were derived by reading, not by running).
- Q19. Items marked "open check" in section 3.5 (MySQL `#` comments, temporary tables) were not confirmed by
  reading; Phase 5 must confirm them against the old editor or decide the new behaviour.
