# Phase 8 results: IMP and EXP rows

Slice: all `[ ]` rows with prefix IMP- and EXP- in rewrite/parity-checklist.md (148 rows; the three `[~]` rows IMP-003, IMP-056 and IMP-059 are not in the slice).
Counts: covered 144, fixed 1, missing 2, manual 0, dropped 1.
New test files: src/formats/sql/p8-imp-sql.test.ts, src/features/import/__tests__/p8-imp-box.test.tsx, src/features/import/__tests__/p8-imp-merge.test.ts, src/dialogs/create-diagram-dialog/p8-imp-new-diagram.test.tsx, src/components/qubdi/__tests__/p8-imp-live.test.tsx, src/formats/file/p8-imp-file.test.ts, src/dialects/p8-exp-converter.test.ts, src/features/export/__tests__/p8-exp-dialogs.test.tsx (65 tests, all pass).
Source fix: create-diagram-dialog.tsx starts with Generic chosen (IMP-004). Missing: EXP-051 (panel part) and EXP-057.
Most other rows were already proven by the tagged tests listed below; the live database parts of IMP-066 and IMP-068 (real read-only transaction, 20 s timeout) still need a manual run.

| ID | Result | Evidence |
| --- | --- | --- |
| IMP-001 | covered | src/formats/sql/p8-imp-sql.test.ts::IMP-001 the kept dialects |
| IMP-002 | covered | src/formats/sql/p8-imp-sql.test.ts::IMP-002 MariaDB uses the MySQL code, CockroachDB the PostgreSQL code |
| IMP-004 | fixed | create dialog had no type chosen at start; now Generic is pre-selected on every opening (src/dialogs/create-diagram-dialog/create-diagram-dialog.tsx); test src/dialogs/create-diagram-dialog/p8-imp-new-diagram.test.tsx::IMP-004 step 1 of the new diagram dialog |
| IMP-005 | covered | src/features/import/__tests__/p8-imp-box.test.tsx::IMP-005 the three methods |
| IMP-006 | covered | src/features/import/__tests__/p8-imp-box.test.tsx::IMP-006 pasting switches to the method that fits; src/features/import/__tests__/import-box-logic.test.ts::import box: which method a paste belongs to (IMP-006) |
| IMP-007 | covered | src/features/import/__tests__/p8-imp-box.test.tsx::IMP-007 IMP-009 IMP-010 IMP-011 live checks; src/workspace/__tests__/designs-dialogs.test.tsx::imports pasted SQL as the new diagram, the Import button waits for a clean reading |
| IMP-008 | covered | src/formats/sql/p8-imp-sql.test.ts::IMP-008 detecting the dialect for Generic text |
| IMP-009 | covered | src/features/import/__tests__/p8-imp-box.test.tsx::an error blocks the import and is listed with its line; clicking it moves the cursor, ::waits 500 ms after typing, ::warnings are shown in blue and do not block |
| IMP-010 | covered | src/features/import/__tests__/p8-imp-box.test.tsx::lists three errors and then "N more problems"; src/features/import/__tests__/import-box-logic.test.ts::lists three problems, then how many more |
| IMP-011 | covered | src/features/import/__tests__/p8-imp-box.test.tsx::waits 500 ms after typing (counts text "Found 1 tables and 0 links.") |
| IMP-012 | covered | src/formats/sql/import-sql.test.ts::IMP-012 empty, unterminated and unbalanced text block the import |
| IMP-013 | covered | src/formats/sql/import-sql.test.ts::IMP-013 broken cast and split decimal are fixable errors; src/features/import/__tests__/p8-imp-box.test.tsx::IMP-013 the repair button (button rewrites the text) |
| IMP-014 | covered | src/formats/sql/import-sql.test.ts::IMP-014 IMP-024 SQLite import; src/dialects/converter.test.ts::IMP-014 SQL Server reader warns about backticks |
| IMP-015 | covered | src/formats/sql/import-sql.test.ts::IMP-015 nothing to import is said; src/features/import/__tests__/p8-imp-box.test.tsx::text that gives no tables says there is nothing to import |
| IMP-016 | covered | src/formats/sql/import-sql.test.ts::IMP-016 PostgreSQL extension and function warnings, IMP-017 other dialects summarise |
| IMP-017 | covered | src/formats/sql/import-sql.test.ts::IMP-016 PostgreSQL extension and function warnings, IMP-017 other dialects summarise |
| IMP-018 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-018 |
| IMP-019 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-019 |
| IMP-020 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-020 |
| IMP-021 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-021 |
| IMP-022 | covered | src/formats/sql/p8-imp-sql.test.ts::IMP-022 direction and cardinality of imported links |
| IMP-023 | covered | src/formats/sql/import-sql.test.ts::IMP-023 inline REFERENCES is a blocking error |
| IMP-024 | covered | src/formats/sql/import-sql.test.ts::IMP-024 a key to a missing table is dropped with a warning, no table invented |
| IMP-025 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-025 |
| IMP-026 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-026 |
| IMP-027 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-027 |
| IMP-028 | covered | src/formats/sql/import-sql.test.ts::IMP-028 views get columns from the select list; select * gives none and a warning |
| IMP-029 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-029 |
| IMP-030 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-030 |
| IMP-031 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-031 |
| IMP-032 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-032 |
| IMP-033 | covered | src/formats/sql/import-sql.test.ts::IMP-033 COMMENT ON is read |
| IMP-034 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-034 |
| IMP-035 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-035 |
| IMP-036 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-036 |
| IMP-037 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-037 |
| IMP-038 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-038 |
| IMP-039 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-039 |
| IMP-040 | covered | src/formats/sql/p8-imp-sql.test.ts::IMP-040 IMP-044 what an imported diagram carries |
| IMP-041 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-041 |
| IMP-042 | covered | src/formats/sql/import-sql.test.ts::describe blocks tagged IMP-042 |
| IMP-043 | covered | src/formats/sql/p8-imp-sql.test.ts::IMP-043 tables of different schemas do not overlap; src/formats/sql/import-sql.test.ts::IMP-043 layout |
| IMP-044 | covered | src/formats/sql/p8-imp-sql.test.ts::is named "SQL Import (<type>)" unless the dialog gives a name; src/workspace/__tests__/designs-dialogs.test.tsx::imports pasted SQL (renamed Diagram 1) |
| IMP-045 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-045) |
| IMP-046 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-046) |
| IMP-047 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-047) |
| IMP-048 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-048) |
| IMP-049 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-049) |
| IMP-050 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-050) |
| IMP-051 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-051) |
| IMP-052 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-052) |
| IMP-053 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-053) |
| IMP-054 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-054) |
| IMP-055 | covered | src/formats/dbml/dbml.test.ts::describe IMP-045 to IMP-055 DBML import and round trip (test tagged IMP-055) |
| IMP-057 | covered | src/formats/metadata/load.test.ts::IMP-057 repairing pasted text |
| IMP-058 | covered | src/features/import/__tests__/p8-imp-box.test.tsx::IMP-058 SSMS truncation |
| IMP-060 | covered | src/formats/metadata/load.test.ts::IMP-059 IMP-060 IMP-061 IMP-063 IMP-065 metadata import (zoo sample) |
| IMP-061 | covered | src/formats/metadata/load.test.ts::IMP-059 IMP-060 IMP-061 IMP-063 IMP-065 metadata import (zoo sample) |
| IMP-062 | covered | src/formats/metadata/load.test.ts::IMP-062 views and dependencies, materialized |
| IMP-063 | covered | src/formats/metadata/load.test.ts::IMP-059 IMP-060 IMP-061 IMP-063 IMP-065 metadata import (zoo sample) |
| IMP-064 | covered | src/features/import/__tests__/p8-imp-box.test.tsx::IMP-064 the table picker; src/formats/metadata/load.test.ts::IMP-064 selecting tables; src/features/import/__tests__/import-box-logic.test.ts::table picker defaults (IMP-064) |
| IMP-065 | covered | src/formats/metadata/load.test.ts::IMP-059 IMP-060 IMP-061 IMP-063 IMP-065 metadata import (zoo sample) |
| IMP-066 | covered | src/components/qubdi/__tests__/p8-imp-live.test.tsx::IMP-066 the live import wizard (API mocked; reading a real PostgreSQL or SQL Server database is in manual script MT-282 area) |
| IMP-067 | covered | src/components/qubdi/__tests__/p8-imp-live.test.tsx::IMP-067 IMP-072 what the browser remembers; server/test/introspect-routes.test.ts::saves a connection without ever returning or storing the plaintext password |
| IMP-068 | covered | server/test/introspect-guards.test.ts::assertReadOnlySql (rejects every kind of write); the READ ONLY transaction and 20 s timeout (server/src/introspect/postgres.ts) run only against a live database |
| IMP-069 | covered | server/test/introspect-guards.test.ts::resolveAllowedTarget; server/test/introspect-routes.test.ts::SSRF protection (the setting name INTROSPECT_ALLOW_HOSTS is in the message in net-guard.ts but no test asserts it) |
| IMP-070 | covered | server/test/introspect-byte-budget.test.ts::defaults to a limit far above any real catalog (64 MB), ::closes the connection of a server that never stops sending |
| IMP-071 | covered | src/components/qubdi/__tests__/import-from-database-dialog.test.tsx::takes the local diagram back when the server refuses to create it |
| IMP-072 | covered | src/components/qubdi/__tests__/p8-imp-live.test.tsx::IMP-067 IMP-072 what the browser remembers |
| IMP-073 | covered | src/formats/file/p8-imp-file.test.ts::IMP-073 IMP-074 diagram file import; src/core/wire/wire.test.ts::DAT-066 / DAT-067 / DAT-068 / DAT-069 import |
| IMP-074 | covered | src/formats/file/p8-imp-file.test.ts::a bad file is refused with one error and builds nothing; src/dialogs/import-diagram-dialog/__tests__/import-diagram-dialog.test.tsx::shows an error for a file it cannot read, and creates nothing; ::creates the diagram in the open project |
| IMP-075 | covered | src/features/import/__tests__/import-box-logic.test.ts::places new tables 150 px right of the right-most existing one, ::a generic diagram takes the imported database type; src/workspace/__tests__/frame.test.tsx::import into the open diagram (IMP-075, IMP-076, spec 16.2) |
| IMP-076 | covered | src/features/import/__tests__/p8-imp-merge.test.ts::IMP-076 custom types and duplicates when importing into an open diagram; src/features/import/__tests__/import-box-logic.test.ts::reports a table that exists again and adds it anyway |
| IMP-077 | covered | src/lib/qubdi/__tests__/resync.test.ts::planning, ::selective apply |
| IMP-078 | covered | src/lib/qubdi/__tests__/resync.test.ts::planning, ::applying changes keeps what the user built (add/remove table, column, index, link), ::keeps descriptions written in the diagram and never reports them as changes |
| IMP-079 | covered | src/lib/qubdi/__tests__/resync.test.ts::renames, ::stored source identity |
| IMP-080 | covered | src/lib/qubdi/__tests__/resync.test.ts::adds a new column without disturbing layout, colours, areas, notes or comments, ::adds a new table near the tables it relates to, without overlap, and links it |
| IMP-081 | covered | src/features/dbml-diff/dbml-diff.test.ts::EDT-245 buildProposal (matching tables keep id, position and colour), ::EDT-242 a renamed table keeps its place and says so; src/pages/editor-page/side-panel/dbml-section/dbml-section.test.tsx::EDT-245 Accept Changes |
| IMP-082 | covered | src/features/dbml-diff/dbml-diff.test.ts::EDT-241 diffDesigns (added and removed tables), ::a table without fields survives an accepted DBML edit, ::custom types: added, removed and changed by name |
| IMP-083 | covered | src/features/dbml-diff/dbml-diff.test.ts::matching tables keep id, position and colour; new tables land right of all |
| EXP-001 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-001 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-002 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-002 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-003 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-003 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-004 | covered | src/features/export/__tests__/p8-exp-dialogs.test.tsx::EXP-004 the SQL dialog; src/workspace/__tests__/frame.test.tsx::SQL: shows the script for the target |
| EXP-005 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-005 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-006 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-006 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-007 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-007 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-008 | dropped | decision is drop; the unsupported-target message is still tested in src/dialects/converter.test.ts::EXP-007 EXP-008 targets without a writer give a clear error |
| EXP-009 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-009 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-010 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-010 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-011 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-011 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-012 | covered | src/dialects/converter.test.ts::describe/test tagged EXP-012 (converter.test.ts, plus menus.test.tsx and frame.test.tsx for the menu and dialog) |
| EXP-013 | covered | src/dialects/writers.test.ts::PostgreSQL export S1, S2, S3 (exact text from the spec samples) |
| EXP-014 | covered | src/dialects/writers.test.ts::PostgreSQL export S1, S2, S3 (exact text from the spec samples) |
| EXP-015 | covered | src/dialects/writers.test.ts::PostgreSQL export S1, S2, S3 (exact text from the spec samples) |
| EXP-016 | covered | src/dialects/writers.test.ts::PostgreSQL export S1, S2, S3 (exact text from the spec samples) |
| EXP-017 | covered | src/dialects/writers.test.ts::PostgreSQL export S1, S2, S3 (exact text from the spec samples) |
| EXP-018 | covered | src/dialects/writers.test.ts::PostgreSQL export S1, S2, S3 (exact text from the spec samples) |
| EXP-019 | covered | src/dialects/writers.test.ts::PostgreSQL export S1, S2, S3 (exact text from the spec samples) |
| EXP-020 | covered | src/dialects/writers.test.ts::EXP-020 to EXP-025 MySQL export S1, S2, S3 |
| EXP-021 | covered | src/dialects/writers.test.ts::EXP-020 to EXP-025 MySQL export S1, S2, S3 |
| EXP-022 | covered | src/dialects/writers.test.ts::EXP-020 to EXP-025 MySQL export S1, S2, S3 |
| EXP-023 | covered | src/dialects/writers.test.ts::EXP-020 to EXP-025 MySQL export S1, S2, S3 |
| EXP-024 | covered | src/dialects/writers.test.ts::EXP-020 to EXP-025 MySQL export S1, S2, S3 |
| EXP-025 | covered | src/dialects/writers.test.ts::EXP-020 to EXP-025 MySQL export S1, S2, S3 |
| EXP-026 | covered | src/dialects/writers.test.ts::EXP-026 to EXP-031 SQL Server export S1, S2, S3 |
| EXP-027 | covered | src/dialects/writers.test.ts::EXP-026 to EXP-031 SQL Server export S1, S2, S3 |
| EXP-028 | covered | src/dialects/writers.test.ts::EXP-026 to EXP-031 SQL Server export S1, S2, S3 |
| EXP-029 | covered | src/dialects/p8-exp-converter.test.ts::EXP-029 SQL Server index column limit; src/dialects/writers.test.ts::SQL Server S2 (index name [school_idx_enrol_course]) |
| EXP-030 | covered | src/dialects/writers.test.ts::EXP-026 to EXP-031 SQL Server export S1, S2, S3 |
| EXP-031 | covered | src/dialects/writers.test.ts::EXP-026 to EXP-031 SQL Server export S1, S2, S3 |
| EXP-032 | covered | src/dialects/writers.test.ts::EXP-032 to EXP-036 SQLite export S1, S2, S3 |
| EXP-033 | covered | src/dialects/writers.test.ts::EXP-032 to EXP-036 SQLite export S1, S2, S3 |
| EXP-034 | covered | src/dialects/writers.test.ts::EXP-032 to EXP-036 SQLite export S1, S2, S3 |
| EXP-035 | covered | src/dialects/writers.test.ts::EXP-032 to EXP-036 SQLite export S1, S2, S3 |
| EXP-036 | covered | src/dialects/writers.test.ts::EXP-032 to EXP-036 SQLite export S1, S2, S3 |
| EXP-037 | covered | src/dialects/converter.test.ts::EXP-037 tests (converter rules and integration fixes) |
| EXP-038 | covered | src/dialects/p8-exp-converter.test.ts::EXP-038 unsigned integers, decimals and long text in keys |
| EXP-039 | covered | src/dialects/converter.test.ts::EXP-039 tests (converter rules and integration fixes) |
| EXP-040 | covered | src/dialects/converter.test.ts::EXP-040 tests (converter rules and integration fixes) |
| EXP-041 | covered | src/dialects/converter.test.ts::EXP-041 tests (converter rules and integration fixes) |
| EXP-042 | covered | src/dialects/converter.test.ts::EXP-042 tests (converter rules and integration fixes) |
| EXP-043 | covered | src/dialects/converter.test.ts::EXP-043 tests (converter rules and integration fixes) |
| EXP-044 | covered | src/dialects/converter.test.ts::EXP-044 tests (converter rules and integration fixes) |
| EXP-045 | covered | src/dialects/converter.test.ts::EXP-045 tests (converter rules and integration fixes) |
| EXP-046 | covered | src/dialects/converter.test.ts::EXP-046 tests (converter rules and integration fixes) |
| EXP-047 | covered | src/dialects/converter.test.ts::EXP-047 tests (converter rules and integration fixes) |
| EXP-048 | covered | src/dialects/converter.test.ts::EXP-048 tests (converter rules and integration fixes) |
| EXP-049 | covered | src/formats/dbml/dbml.test.ts::EXP-049 check expression checker |
| EXP-050 | covered | src/formats/dbml/dbml.test.ts::EXP-050 EXP-052 EXP-053 EXP-055 EXP-056 DBML export; src/pages/editor-page/side-panel/dbml-section/dbml-section.test.tsx::EDT-238 EDT-239 the DBML section (Show inline refs button) |
| EXP-051 | missing | exportDbml leaves out empty and duplicate tables and returns diagnostics (tested in dbml.test.ts::EXP-051), but the DBML side panel (src/pages/editor-page/side-panel/dbml-section/dbml-section.tsx) never shows result.diagnostics, so the panel does not say which were left out |
| EXP-052 | covered | src/formats/dbml/dbml.test.ts::EXP-050 EXP-052 EXP-053 EXP-055 EXP-056 DBML export (+ EXP-053, EXP-054 tests) |
| EXP-053 | covered | src/formats/dbml/dbml.test.ts::EXP-050 EXP-052 EXP-053 EXP-055 EXP-056 DBML export (+ EXP-053, EXP-054 tests) |
| EXP-054 | covered | src/formats/dbml/dbml.test.ts::EXP-050 EXP-052 EXP-053 EXP-055 EXP-056 DBML export (+ EXP-053, EXP-054 tests) |
| EXP-055 | covered | src/formats/dbml/dbml.test.ts::EXP-050 EXP-052 EXP-053 EXP-055 EXP-056 DBML export (+ EXP-053, EXP-054 tests) |
| EXP-056 | covered | src/formats/dbml/dbml.test.ts::EXP-050 EXP-052 EXP-053 EXP-055 EXP-056 DBML export (+ EXP-053, EXP-054 tests) |
| EXP-057 | missing | no "// Error generating DBML: ..." text and no toast: exportDbml is not wrapped in a try/catch in dbml-section.tsx, so a throw would reach the React error boundary |
| EXP-058 | covered | src/formats/file/diagram-file.test.ts::EXP-058 EXP-059 JSON export; src/workspace/__tests__/frame.test.tsx::JSON: names the file QBase(<name>).json |
| EXP-059 | covered | src/formats/file/diagram-file.test.ts::carries no filter or config |
| EXP-060 | covered | src/formats/image/export-options.test.ts::EXP-060 to EXP-066 image export options |
| EXP-061 | covered | src/formats/image/export-options.test.ts::EXP-061 EXP-062 defaults; src/features/export/__tests__/p8-exp-dialogs.test.tsx::starts at 4x with dots on and transparent off |
| EXP-062 | covered | src/formats/image/export-options.test.ts::EXP-061 EXP-062 defaults; src/features/export/__tests__/p8-exp-dialogs.test.tsx::starts at 4x with dots on and transparent off |
| EXP-063 | covered | src/formats/image/export-options.test.ts::EXP-060 to EXP-066 image export options |
| EXP-064 | covered | src/formats/image/export-options.test.ts::EXP-060 to EXP-066 image export options |
| EXP-065 | covered | src/formats/image/export-options.test.ts::EXP-060 to EXP-066 image export options |
| EXP-066 | covered | src/formats/image/export-options.test.ts::EXP-060 to EXP-066 image export options |
| EXP-067 | covered | src/features/export/__tests__/p8-exp-dialogs.test.tsx::clears the selection, shows progress while exporting and closes when done; src/workspace/__tests__/providers.test.tsx::clears the selection first and reports what could not be captured |
| EXP-068 | covered | src/formats/sql/import-sql.test.ts::EXP-068 round trip (postgresql, mysql, sql_server, sqlite); src/formats/dbml/dbml.test.ts::IMP-045 to IMP-055 DBML import and round trip |
