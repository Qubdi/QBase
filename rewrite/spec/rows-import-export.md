# Parity checklist rows: import and export

Source spec: `rewrite/spec/import-export.md`. Decision is a recommendation for the owner
(keep, change, or drop, with the reason). Q numbers refer to the open questions in the spec.

| ID | Area | Behaviour (what a person sees) | Decision | Status | Test |
| --- | --- | --- | --- | --- | --- |
| IMP-001 | Dialects | Diagrams can be Generic, PostgreSQL, MySQL, SQL Server, MariaDB, SQLite, CockroachDB (and Oracle, ClickHouse for old files) | keep PG, MySQL, MSSQL, SQLite, MariaDB, Cockroach, Generic; drop Oracle and ClickHouse import/export (rarely used, hand written) | [ ] | |
| IMP-002 | Dialects | MariaDB imports and exports through the MySQL code; CockroachDB through the PostgreSQL code | keep, nearly free | [ ] | |
| IMP-003 | Editions | Edition picker (Supabase, Timescale, MySQL 5.7, SQL Server 2016, Cloudflare D1 with Wrangler) changes the offered metadata script | keep only if the metadata script flow is kept (Q2) | [ ] | |
| IMP-004 | New diagram | Step 1 choose a database type (default Generic) or create an empty diagram | keep | [ ] | |
| IMP-005 | New diagram | Import box has three tabs: Smart Query (default), DDL, DBML | keep | [ ] | |
| IMP-006 | New diagram | Pasting text switches to the tab that fits (DBML, DDL, or JSON) and pretty prints JSON under 2 MB | keep, small and helpful | [ ] | |
| IMP-007 | New diagram | Import button is off while the box is empty or an error is shown | keep | [ ] | |
| IMP-008 | SQL import | Type Generic detects the dialect from the text (pg_dump, SQL Server, MySQL dump, SQLite, Oracle, then keywords), PostgreSQL if nothing matches | keep, tighten the markers | [ ] | |
| IMP-009 | SQL import | Live validation 500 ms after typing shows errors (red) and warnings (blue) with line numbers; clicking an error moves the cursor | keep | [ ] | |
| IMP-010 | SQL import | Up to 3 errors listed, then 'N more errors' | keep | [ ] | |
| IMP-011 | SQL import | Counts of tables and relationships shown when the text parses | keep | [ ] | |
| IMP-012 | SQL import | Empty text, no SQL keyword, unterminated string or comment, unbalanced parentheses are blocking errors | keep | [ ] | |
| IMP-013 | SQL import | PostgreSQL broken cast ': :' and split DECIMAL are errors with an Auto-fix button that rewrites the text | keep | [ ] | |
| IMP-014 | SQL import | Warnings for foreign syntax per dialect (SERIAL in MySQL, AUTO_INCREMENT in SQL Server, ENUM in SQLite, ...) with the line number | keep | [ ] | |
| IMP-015 | SQL import | A result with no tables and no relationships adds nothing and says nothing | change: show 'Nothing to import' | [ ] | |
| IMP-016 | SQL import | PostgreSQL: CREATE EXTENSION, FUNCTION, TRIGGER, POLICY, row level security and non-enum CREATE TYPE are skipped with a warning | keep | [ ] | |
| IMP-017 | SQL import | Other dialects skip unsupported statements silently | change: one summary warning per kind (Q4) | [ ] | |
| IMP-018 | SQL import | CREATE TABLE with columns, types, length, precision, scale, NOT NULL, DEFAULT, inline and table PRIMARY KEY, UNIQUE | keep | [ ] | |
| IMP-019 | SQL import | Composite primary keys and multi-column UNIQUE (as unique index) are read | keep | [ ] | |
| IMP-020 | SQL import | Auto numbering read from serial, IDENTITY, AUTO_INCREMENT, AUTOINCREMENT, GENERATED AS IDENTITY, nextval | keep | [ ] | |
| IMP-021 | SQL import | Foreign keys read from FOREIGN KEY, inline REFERENCES, ALTER TABLE ADD CONSTRAINT (also ALTER TABLE ONLY) | keep | [ ] | |
| IMP-022 | SQL import | Source is the referenced table, target is the table holding the key; cardinality from uniqueness; many-to-many never created | keep | [ ] | |
| IMP-023 | SQL import | MySQL inline REFERENCES is a blocking error that shows a corrected example | keep, it protects against silent loss | [ ] | |
| IMP-024 | SQL import | SQLite import creates a placeholder table for a foreign key that points at a table not in the script | change: do not invent tables, drop the key with a warning | [ ] | |
| IMP-025 | SQL import | CREATE INDEX (unique, USING btree/hash/gin/gist/...), MySQL KEY / UNIQUE KEY inline, SQL Server clustered words ignored | keep | [ ] | |
| IMP-026 | SQL import | CHECK constraints (column or table level) become table check expressions | keep | [ ] | |
| IMP-027 | SQL import | PostgreSQL CREATE TYPE AS ENUM becomes an enum custom type with ordered values | keep | [ ] | |
| IMP-028 | SQL import | CREATE VIEW becomes a view table with columns from its select list; SELECT * gives no columns | keep, warn on no columns (Q17) | [ ] | |
| IMP-029 | SQL import | PostgreSQL ALTER TABLE ADD COLUMN and ALTER COLUMN TYPE are applied to the earlier table | keep | [ ] | |
| IMP-030 | SQL import | pg_dump files (SET lines, COPY data, ALTER TABLE ONLY, comments) import cleanly | keep | [ ] | |
| IMP-031 | SQL import | MySQL dump files (ENGINE, CHARSET, conditional comments, backticks) import cleanly | keep | [ ] | |
| IMP-032 | SQL import | SQL Server scripts with GO, brackets, CLUSTERED, ON [PRIMARY], IDENTITY(a,b) import cleanly | keep | [ ] | |
| IMP-033 | SQL import | COMMENT ON TABLE/COLUMN statements are not read by the SQL importers | change: read them (PostgreSQL, Oracle) and MySQL COMMENT | [ ] | |
| IMP-034 | SQL import | Defaults are kept as written text (strings with quotes, calls, casts) | keep | [ ] | |
| IMP-035 | SQL import | Source type names are mapped to generic types and unknown types become text | change: keep the source type name, never text (Q8) | [ ] | |
| IMP-036 | SQL import | PostgreSQL synonyms fold to preferred names (character varying to varchar, int4 to int, ...) | keep, but keep 'integer' as written (Q8) | [ ] | |
| IMP-037 | SQL import | Array types type[] set isArray (PostgreSQL and CockroachDB only) | keep | [ ] | |
| IMP-038 | SQL import | Length and precision are stored in separate fields; SQL Server (max) kept as 'max' | keep | [ ] | |
| IMP-039 | SQL import | MySQL unsigned, display width and enum/set values are dropped | change: decide in Q7 | [ ] | |
| IMP-040 | SQL import | Imported tables get fresh ids, order numbers, colour #8eb7ff (views #b0b0b0, materialized #7d7d7d) | keep | [ ] | |
| IMP-041 | SQL import | A primary key index entry is added to every table with a primary key; named only if the constraint had a name | keep | [ ] | |
| IMP-042 | SQL import | Tables are sorted by name with views last | keep | [ ] | |
| IMP-043 | SQL import | Layout: connected tables near each other, isolated tables in a grid, no overlaps, per schema group | change: groups must not overlap each other | [ ] | |
| IMP-044 | SQL import | Diagram is named 'SQL Import (<type>)' then renamed 'Diagram <n>' by the dialog (for DBML) | keep | [ ] | |
| IMP-045 | DBML import | DBML is validated live; errors show line and column and highlight the line | keep | [ ] | |
| IMP-046 | DBML import | TableGroup and Note blocks are ignored; table header colours ignored | keep | [ ] | |
| IMP-047 | DBML import | Array types type[] accepted only for databases that support arrays, else a clear error | keep | [ ] | |
| IMP-048 | DBML import | check: `expr` and checks { } become table check constraints, validated with a position on error | keep | [ ] | |
| IMP-049 | DBML import | Many-to-many references (<>) are an error asking for a junction table | keep | [ ] | |
| IMP-050 | DBML import | Refs give cardinality from < > - symbols; source is the left side | keep | [ ] | |
| IMP-051 | DBML import | Composite primary key from an indexes [pk] block; named pk index kept | keep | [ ] | |
| IMP-052 | DBML import | Enum blocks become enum custom types; schema public/empty becomes the dialect default schema | keep | [ ] | |
| IMP-053 | DBML import | Accented letters are replaced by plain letters before parsing | change: stop doing it (Q9) | [ ] | |
| IMP-054 | DBML import | Default values lose their quotes (e.g. 'abc' stored as abc) | change: keep the quotes | [ ] | |
| IMP-055 | DBML import | DBML tables are placed on a simple grid without the layout pass | change: run the same layout as SQL import | [ ] | |
| IMP-056 | Metadata JSON | User gets a script per dialect and edition to run in their own client, then pastes one JSON cell | keep for the four main dialects (Q2) | [ ] | |
| IMP-057 | Metadata JSON | Pasted text is checked; 'Check JSON' repairs terminal decoration, CSV doubling, wrapper object, escaped quotes (two tries) | keep | [ ] | |
| IMP-058 | Metadata JSON | SSMS truncation at 65 535 characters opens an information dialog | keep if SQL Server scripts are kept | [ ] | |
| IMP-059 | Metadata JSON | JSON contract: tables, views (base64 definition), columns, pk_info, fk_info, indexes, check_constraints, custom_types, database_name, version | keep, it is shared with the server | [ ] | |
| IMP-060 | Metadata JSON | Columns ordered by ordinal position; duplicate column names collapsed | keep | [ ] | |
| IMP-061 | Metadata JSON | Indexes aggregated per name with column order; an index equal to the primary key becomes the primary key index | keep | [ ] | |
| IMP-062 | Metadata JSON | Views become view tables; 'materialized' in the definition marks a materialized view; view dependencies found by parsing the definition | keep | [ ] | |
| IMP-063 | Metadata JSON | Foreign keys, check constraints, enum and composite custom types are imported | keep | [ ] | |
| IMP-064 | Metadata JSON | More than 50 tables plus views opens a table picker (search, filters, select page, max 500) | keep | [ ] | |
| IMP-065 | Metadata JSON | Diagram named from database_name, edition stored on the diagram | keep | [ ] | |
| IMP-066 | Live import | Wizard: connect, choose schemas/tables/views, preview, create; PostgreSQL and SQL Server only | keep | [ ] | |
| IMP-067 | Live import | Connections can be saved per project; password encrypted on the server, never kept in the browser | keep | [ ] | |
| IMP-068 | Live import | Server reads in a read-only transaction with a 20 s timeout and rejects write keywords | keep | [ ] | |
| IMP-069 | Live import | Server refuses non-public hosts unless allow-listed; message names the setting | keep | [ ] | |
| IMP-070 | Live import | Metadata larger than 64 MB aborts with a message | keep | [ ] | |
| IMP-071 | Live import | Failed server create deletes the local copy so a retry makes no orphan | keep | [ ] | |
| IMP-072 | Live import | The source and the database names are remembered on the diagram for re-sync | keep | [ ] | |
| IMP-073 | Diagram JSON import | Only .json files; all ids replaced consistently; dates set to now | keep | [ ] | |
| IMP-074 | Diagram JSON import | A bad file shows one error and the dialog stays open; in a project the diagram is created on the server at once | keep | [ ] | |
| IMP-075 | Import into open diagram | New tables are placed 150 px right of the right-most table; history cleared; Generic diagram takes the imported type | keep | [ ] | |
| IMP-076 | Import into open diagram | Importing a table that already exists creates a duplicate; custom types and dependencies are not added | change: warn on duplicates, add custom types (Q5) | [ ] | |
| IMP-077 | Re-sync | Compare live metadata with the diagram by name and show a list of differences to accept | keep | [ ] | |
| IMP-078 | Re-sync | Differences: table, column, index, relationship added/removed/changed; comments ignored in re-sync | keep | [ ] | |
| IMP-079 | Re-sync | Possible renames offered for similar tables or columns (similarity 0.6); stored names keep a renamed object matched | keep | [ ] | |
| IMP-080 | Re-sync | Applying keeps positions, colours, areas, notes, comments; new tables placed in free space near related tables | keep | [ ] | |
| IMP-081 | DBML apply | Editing DBML in the side panel updates the open diagram, keeping ids, positions, colours of matched tables, fields and relationships | keep | [ ] | |
| IMP-082 | DBML apply | Tables missing from the DBML are removed; new tables are added; areas, notes, composite types kept | keep | [ ] | |
| IMP-083 | DBML apply | A new table from the DBML can land on top of an existing one | change: place it in free space | [ ] | |
| EXP-001 | SQL export | Menu offers the diagram's own type, then PostgreSQL, MySQL, SQL Server, MariaDB, SQLite (not itself) | keep | [ ] | |
| EXP-002 | SQL export | The diagram filter limits tables, relationships and dependencies that are exported | keep | [ ] | |
| EXP-003 | SQL export | An empty diagram shows the error state | keep | [ ] | |
| EXP-004 | SQL export | Dialog shows a spinner then a read-only code box with copy | keep | [ ] | |
| EXP-005 | SQL export | Same-dialect export uses the dialect's own generator; MySQL to MariaDB uses MySQL's | keep | [ ] | |
| EXP-006 | SQL export | Different dialect uses the converter with a header of conversion notes | keep | [ ] | |
| EXP-007 | SQL export | Types with no generator (generic, CockroachDB, Oracle, ClickHouse) export with the PostgreSQL generator | change: decide in Q10 | [ ] | |
| EXP-008 | SQL export | Oracle/ClickHouse sources and unsupported targets use a generic generator with a warning header | drop, replace by a clear 'not supported' message | [ ] | |
| EXP-009 | SQL export | Views are never written as CREATE TABLE | keep | [ ] | |
| EXP-010 | SQL export | Indexes equal to the primary key are not written; others sorted and one per line | keep | [ ] | |
| EXP-011 | SQL export | Foreign keys written after all tables; composite keys merged into one constraint | keep | [ ] | |
| EXP-012 | SQL export | Relationships whose table or field is missing are dropped | keep | [ ] | |
| EXP-013 | PostgreSQL export | CREATE SCHEMA IF NOT EXISTS, CREATE TYPE (enums then composites), CREATE SEQUENCE for nextval defaults | keep | [ ] | |
| EXP-014 | PostgreSQL export | Auto numbering written as serial/bigserial/smallserial; identity default as GENERATED BY DEFAULT AS IDENTITY | keep | [ ] | |
| EXP-015 | PostgreSQL export | PRIMARY KEY always a table constraint; UNIQUE inline except on key columns; CHECK lines | keep | [ ] | |
| EXP-016 | PostgreSQL export | Comments: '-- ' lines for tables and columns plus COMMENT ON TABLE/COLUMN/INDEX | keep | [ ] | |
| EXP-017 | PostgreSQL export | Indexes as CREATE [UNIQUE] INDEX "<table>_<name>" with USING for non-btree types | keep | [ ] | |
| EXP-018 | PostgreSQL export | Foreign keys grouped by schema with '-- Schema:' headers and generated names fk_<table>_<cols>_<ref>_<cols> cut to 60 | keep | [ ] | |
| EXP-019 | PostgreSQL export | Defaults: now() to CURRENT_TIMESTAMP, casts removed, calls and numbers kept, text quoted | keep | [ ] | |
| EXP-020 | MySQL export | Header '-- MySQL database export', START TRANSACTION and COMMIT; schema exported as CREATE DATABASE | keep | [ ] | |
| EXP-021 | MySQL export | Type mapping to MySQL names (boolean to TINYINT(1), uuid to CHAR(36), json/array/user-defined to JSON, enum to VARCHAR(50)) | keep | [ ] | |
| EXP-022 | MySQL export | VARCHAR without length gets (255); TEXT/BLOB index columns get a (255) prefix | keep | [ ] | |
| EXP-023 | MySQL export | Index names generated idx_<table>_<cols>[_unique]; foreign key names fk_<table>_<cols> | keep | [ ] | |
| EXP-024 | MySQL export | Comments written inline (COMMENT '...') and as '-- ' lines | keep | [ ] | |
| EXP-025 | MySQL export | Several blank lines between tables | change or keep: decide in Q1 | [ ] | |
| EXP-026 | SQL Server export | IF NOT EXISTS schema block with EXEC('CREATE SCHEMA ...'); tables with [brackets] | keep | [ ] | |
| EXP-027 | SQL Server export | IDENTITY(1,1) for auto numbering; (max) length written MAX; NULL not written | keep | [ ] | |
| EXP-028 | SQL Server export | Defaults unwrapped from SQL Server's extra parentheses; N'...' for text | keep, double the quotes (Q11) | [ ] | |
| EXP-029 | SQL Server export | Index named [<schema>_<name>]; more than 32 index columns truncated with a warning comment | keep | [ ] | |
| EXP-030 | SQL Server export | Foreign keys grouped by schema using the relationship's own name | keep | [ ] | |
| EXP-031 | SQL Server export | Table comment written as a /** */ block | keep | [ ] | |
| EXP-032 | SQLite export | Header, PRAGMA foreign_keys = ON when there are relationships, BEGIN TRANSACTION ... COMMIT | keep | [ ] | |
| EXP-033 | SQLite export | Schema dropped with an '-- Original schema:' comment; system tables replaced by a skip comment | keep | [ ] | |
| EXP-034 | SQLite export | Single integer primary key written inline with AUTOINCREMENT; other keys as a table constraint | keep | [ ] | |
| EXP-035 | SQLite export | Foreign keys written inside CREATE TABLE without names | keep | [ ] | |
| EXP-036 | SQLite export | Type mapping to SQLite affinities (bit to BOOLEAN, jsonb/array/user-defined to TEXT, binary to BLOB) | keep | [ ] | |
| EXP-037 | Converter | Each type read into a neutral kind then written for the target (table in spec 9.1.8.1) | keep | [ ] | |
| EXP-038 | Converter | Unsigned integers move up one size, decimals clamp to the target's limits, long text shortens only when part of a key | keep | [ ] | |
| EXP-039 | Converter | Columns whose type is approximated get a ' -- Was: <type>' comment and a note | keep | [ ] | |
| EXP-040 | Converter | Auto numbering rules per target; a failure becomes a note and the column is not numbered | keep | [ ] | |
| EXP-041 | Converter | Foreign key columns take the integer size of the column they reference | keep | [ ] | |
| EXP-042 | Converter | Foreign keys the target would refuse are not created and listed as comments | keep | [ ] | |
| EXP-043 | Converter | Defaults converted (now, date, time, uuid, booleans, strings, lists) or dropped with a note | keep | [ ] | |
| EXP-044 | Converter | CHECK expressions converted only when made of safe parts; otherwise listed as 'not created' | keep | [ ] | |
| EXP-045 | Converter | Indexes: hash/gin/gist/brin/fulltext/spatial become regular indexes with a note; names kept unique and within limits | keep | [ ] | |
| EXP-046 | Converter | SQLite target prefixes table names with the schema; MySQL target writes schemas as databases | keep | [ ] | |
| EXP-047 | Converter | Header lists conversion notes in sections: Type conversions, Default values, Auto numbering, Constraints, Indexes, Foreign keys, Schemas and views, Names | keep | [ ] | |
| EXP-048 | Converter | Views and empty tables are not exported, with a note | keep | [ ] | |
| EXP-049 | Check expressions | Check expressions are validated (position on error) before they are accepted in the editor or DBML | keep, define the list of functions (Q6) | [ ] | |
| EXP-050 | DBML export | Side panel shows DBML in standard form and in inline-reference form, switchable, regenerated on change | keep | [ ] | |
| EXP-051 | DBML export | Tables with no fields, duplicate tables and unnamed fields are left out; the panel says which | keep | [ ] | |
| EXP-052 | DBML export | Fields written with pk, unique, not null, increment, default, note attributes | keep | [ ] | |
| EXP-053 | DBML export | Composite primary key and indexes written in an indexes block; table comment as Note; checks as checks block | keep | [ ] | |
| EXP-054 | DBML export | Enums written first; arrays written type[] | keep | [ ] | |
| EXP-055 | DBML export | Relationships written as Ref lines with symbols from the cardinalities; duplicates written once | keep | [ ] | |
| EXP-056 | DBML export | Relationship names become fk_<index>_<name>; empty names get a fixed fallback (not random) | change: no random names | [ ] | |
| EXP-057 | DBML export | An export error shows '// Error generating DBML: ...' and a toast | keep | [ ] | |
| EXP-058 | JSON export | Downloads QBase(<name>).json, two-space indent, whole diagram, running string ids in a fixed order | keep | [ ] | |
| EXP-059 | JSON export | Local-only data (sync state, filter, config) is not included | keep | [ ] | |
| EXP-060 | Image export | PNG, JPEG and SVG from the menu; file named <diagram name>.<ext> | keep | [ ] | |
| EXP-061 | Image export | Scale 1x, 2x, 4x (default 4x) | keep | [ ] | |
| EXP-062 | Image export | Options: dot pattern background (default on) and transparent background (default off) | keep | [ ] | |
| EXP-063 | Image export | Follows the current light or dark theme (background #ffffff or #141414, dots #92939C or #777777) | keep | [ ] | |
| EXP-064 | Image export | Exports only the visible viewport | change: fit the whole diagram (Q13) | [ ] | |
| EXP-065 | Image export | JPEG with transparent on becomes black | change: use the theme background | [ ] | |
| EXP-066 | Image export | PNG and JPEG carry a logo bottom-left (height max(24, 2.4% of width), opacity 0.9); SVG has none | keep, needs a new logo asset (Q14) | [ ] | |
| EXP-067 | Image export | Selection outlines are cleared; a loading overlay shows while exporting | keep | [ ] | |
| EXP-068 | Round trip | Import then export then import gives the same model, and export of the re-import equals the first export (per kept dialect) | keep, Phase 5 done criterion | [ ] | |
