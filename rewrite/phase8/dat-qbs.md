# Phase 8: DAT and QBS rows

Rows: 143 (DAT 91 minus ticked, QBS 52). covered 138, missing 3, manual 1, dropped 1, fixed 0.
New tests (all pass, eslint clean, tsc clean): `p8-qbs-*` under src/qbase, src/__tests__, src/workspace/__tests__, src/components/qubdi/__tests__, src/context/qubdi-context/__tests__ (14 files, 68 tests) and `server/test/p8-dat-server-limits.test.ts` (5 tests, no database needed).
Server tests under server/test need a live PostgreSQL (global-setup) and were not run here; rows that rest on them say so. No source bug was found, so nothing under src was changed.

| ID | Class | Evidence |
| --- | --- | --- |
| DAT-001 | covered | src/persistence/persistence.test.ts::DAT-001 diagrams live in the browser database QBase and survive reloads |
| DAT-002 | covered | src/persistence/persistence.test.ts::DAT-002 / DAT-003 / DAT-004 / DAT-005 / DAT-006 a database from the oldest editor opens upgraded; src/core/wire/wire.test.ts::DAT-002 an upgrade never writes the legacy keys back |
| DAT-003 | covered | src/core/wire/wire.test.ts::DAT-003 a plain-text type becomes {id, name} |
| DAT-004 | covered | src/core/wire/wire.test.ts::DAT-004 nullable text becomes a boolean, in any letter case |
| DAT-005 | covered | src/core/wire/wire.test.ts::DAT-005 the relationship type text becomes two cardinalities |
| DAT-006 | covered | src/core/wire/wire.test.ts::DAT-006 many to many opens as one to many; src/persistence/persistence.test.ts::DAT-006 the version 14 step turns many/many rows into one/many |
| DAT-007 | covered | src/persistence/persistence.test.ts::DAT-007 adds rows it does not have, never overwrites, and deletes QubdiDB |
| DAT-008 | covered | src/persistence/persistence.test.ts::DAT-008 a failed move leaves QubdiDB untouched, merges nothing, and the next start retries |
| DAT-009 | covered | src/persistence/persistence.test.ts::DAT-009 remembers the default diagram and export dates |
| DAT-010 | covered | src/persistence/persistence.test.ts::DAT-010 a saved filter is remembered per diagram |
| DAT-011 | covered | src/persistence/persistence.test.ts::DAT-011 with no saved filter and several schemas only the first is shown at first; src/core/model/model.test.ts::DAT-011 |
| DAT-012 | covered | src/core/wire/wire.test.ts::DAT-012 keeps the file order of relationships and custom types (decision: stored order kept, sorted by name once at migration); src/persistence/persistence.test.ts::keeps every collection, order, unknown keys (migration sort) |
| DAT-013 | covered | src/persistence/persistence.test.ts::DAT-013 deleting a diagram removes it, its filter, and resets it as default (one record per diagram) |
| DAT-014 | covered | src/persistence/persistence.test.ts::DAT-014 writes only the new stores; the old stores are left as they were / the list is newest first |
| DAT-015 | covered | src/persistence/persistence.test.ts::DAT-015 sign-out deletes both databases and every qbase. key, and keeps the rest; also p8-qbs-sync QBS-048 |
| DAT-016 | covered | src/persistence/persistence.test.ts::DAT-016 a different person clears the copies first and becomes the owner |
| DAT-017 | covered | src/persistence/persistence.test.ts::DAT-017 copies with no recorded owner are claimed, not deleted |
| DAT-018 | covered | src/persistence/persistence.test.ts::DAT-018 falls back to memory when IndexedDB cannot open; blocked localStorage reads as empty |
| DAT-019 | covered | src/core/wire/wire.test.ts::DAT-019 a diagram has id, name, type, edition and two dates |
| DAT-020 | covered | src/core/wire/wire.test.ts::DAT-020 / DAT-021 accepts every stored type, including the open-only ones; src/qbase/p8-qbs-contract.test.tsx::QBS-006 |
| DAT-021 | covered | src/core/model/model.test.ts::DAT-021 editions only fit their own database type; src/core/wire/wire.test.ts::drops an edition that does not fit the type |
| DAT-022 | covered | src/core/model/model.test.ts::DAT-022 a blank diagram has every list empty and the dates set / uses the localized default name |
| DAT-023 | covered | src/core/commands/commands.test.ts::DAT-023 the updated date moves on every real change |
| DAT-024 | covered | src/core/wire/wire.test.ts::DAT-024 missing child lists are empty |
| DAT-025 | covered | src/core/wire/wire.test.ts::DAT-025 holds all the table keys |
| DAT-026 | covered | src/core/model/model.test.ts::DAT-026 a new table is table_N with an id primary-key column and its primary-key index |
| DAT-027 | covered | src/core/model/model.test.ts::DAT-027 default colours |
| DAT-028 | covered | src/core/model/model.test.ts::DAT-028 with visible schemas the default is used if visible, else the first |
| DAT-029 | covered | src/core/model/model.test.ts::DAT-029 width limits |
| DAT-030 | covered | src/core/model/model.test.ts::DAT-030 expanded and parent area are plain properties of a table, kept by commands |
| DAT-031 | covered | src/core/model/model.test.ts::DAT-031 a table fully inside a region belongs to it |
| DAT-032 | covered | src/core/wire/wire.test.ts::DAT-032 serialising writes order for every table, equal to list position / with order hints, the hints decide |
| DAT-033 | covered | src/core/wire/wire.test.ts::DAT-033 a column keeps every key |
| DAT-034 | covered | src/core/wire/wire.test.ts::DAT-034 / DAT-040 reads text numbers as numbers and writes them back as text; keeps max; text "null" means no length |
| DAT-035 | covered | src/core/model/model.test.ts::DAT-035 / DAT-036 a new field is field_N, nullable, not unique, not a key, default type |
| DAT-036 | covered | src/core/model/model.test.ts::DAT-035 / DAT-036 default type per database (it.each) |
| DAT-037 | covered | src/core/model/model.test.ts::DAT-037 the array flag only counts for databases and types that allow it |
| DAT-038 | covered | src/core/model/model.test.ts::DAT-038 length, then precision and scale, then precision |
| DAT-039 | covered | src/core/model/model.test.ts::DAT-039 a custom type used as a column type stores its name as both id and name |
| DAT-040 | covered | src/core/wire/wire.test.ts::DAT-040 the column-level check is kept and written back |
| DAT-041 | covered | src/core/wire/wire.test.ts::DAT-041 an index keeps its keys |
| DAT-042 | covered | src/core/model/model.test.ts::DAT-042 the primary-key index lists exactly the primary-key columns (follows the columns, comes first, empty name) |
| DAT-043 | covered | src/core/model/model.test.ts::DAT-043 a new index |
| DAT-044 | covered | src/core/commands/commands.test.ts::DAT-044 / EDT-144 gin needs array, json, jsonb, tsvector or hstore columns |
| DAT-045 | covered | src/core/wire/wire.test.ts::DAT-045 every stored index type still loads |
| DAT-046 | covered | src/core/wire/wire.test.ts::DAT-046 a link keeps its keys |
| DAT-047 | covered | src/core/commands/commands.test.ts::DAT-047 / EDT-170 / EDT-176 the many side is always the target |
| DAT-048 | covered | src/core/commands/commands.test.ts::DAT-048 many to many can never be stored |
| DAT-049 | covered | src/core/model/model.test.ts::DAT-049 a new link is one to one and named after table and column |
| DAT-050 | covered | src/core/commands/commands.test.ts::EDT-168 / DAT-050 a second link between the same two columns, in either direction, returns the first |
| DAT-051 | covered | src/core/model/model.test.ts::DAT-051 a new check is empty; src/core/wire/wire.test.ts::DAT-051 check constraints |
| DAT-052 | covered | src/core/wire/wire.test.ts::DAT-052 dependencies load and are written back unchanged |
| DAT-053 | covered | src/core/wire/wire.test.ts::DAT-053 enum and composite custom types |
| DAT-054 | covered | src/core/model/model.test.ts::DAT-054 a new custom type is an enum named type_N |
| DAT-055 | covered | src/core/model/model.test.ts::DAT-055 a new area; src/core/wire/wire.test.ts::DAT-055 / DAT-056 areas and notes |
| DAT-056 | covered | src/core/model/model.test.ts::DAT-056 a new note; src/core/wire/wire.test.ts::DAT-055 / DAT-056 areas and notes |
| DAT-057 | covered | src/core/wire/wire.test.ts::DAT-057 areas, notes and custom types: numbered first ascending, the rest after |
| DAT-058 | covered | src/core/model/model.test.ts::DAT-058 the visibility filter (union logic, tidy) |
| DAT-059 | covered | src/core/model/model.test.ts::DAT-059 a child id is 25 lower-case letters and digits; src/core/wire/wire.test.ts::DAT-059 ids |
| DAT-060 | covered | src/core/model/model.test.ts::DAT-060 a new diagram id has the same shape as any other id, no browser prefix |
| DAT-061 | covered | src/core/wire/wire.test.ts::DAT-061 the file name and the 2-space indent |
| DAT-062 | covered | src/core/wire/wire.test.ts::DAT-062 ids become counters and every reference follows |
| DAT-063 | covered | src/core/wire/wire.test.ts::DAT-063 a dependency with a missing end is left out |
| DAT-064 | covered | src/core/wire/wire.test.ts::DAT-064 the version key is written on every output / a file without the key opens as version 1 |
| DAT-065 | covered | src/core/wire/wire.test.ts::DAT-065 holds no filter, config or diagramId |
| DAT-066 | covered | src/core/wire/wire.test.ts::DAT-066 a new diagram: fresh ids, fresh dates |
| DAT-067 | covered | src/core/wire/wire.test.ts::DAT-067 refuses text that is not JSON / a file with a missing required key / something that is not an object |
| DAT-068 | covered | src/core/wire/wire.test.ts::DAT-068 drops unknown keys |
| DAT-069 | covered | src/core/wire/wire.test.ts::DAT-069 a file from the earlier editor has the same shape and opens |
| DAT-070 | covered | src/dialogs/import-diagram-dialog/__tests__/import-diagram-dialog.test.tsx::creates the diagram in the open project and opens it at its project URL |
| DAT-071 | covered | server/test/diagrams.test.ts::creates a diagram in a project; server/test/snapshots.test.ts::lets an editor publish v1 with a note (server tests need a live PostgreSQL; not run here) |
| DAT-072 | covered | server/test/diagrams.test.ts::rejects content whose collections or scalars have the wrong type / keeps unknown keys in the content; src/core/wire/wire.test.ts::DAT-072 passes the server schema |
| DAT-073 | covered | server/test/diagrams.test.ts::refuses a save based on an older copy and leaves the newer one alone / needs the base when content is saved (live PostgreSQL) |
| DAT-074 | covered | server/test/locks.test.ts::gives the lock to the first editor and tells the second who has it; src/components/qubdi/__tests__/access-banner.test.tsx::says who is editing; use-edit-lock.test.tsx::says who is editing when the lock is taken |
| DAT-075 | covered | server/test/p8-dat-server-limits.test.ts::DAT-075 is 50 MB for a diagram by default; server/test/diagrams.test.ts::lets the diagram routes take a body past the ordinary limit |
| DAT-076 | covered | server/test/snapshots.test.ts::lets an editor publish v1 with a note / keeps only the newest N versions; server/test/p8-dat-server-limits.test.ts::keeps the newest 200 snapshots by default (note limit of 500 is in the route schema, only checkable against the live server) |
| DAT-077 | manual | merging rapid auto-publishes (service coalesceSeconds, default 300 s checked in p8-dat-server-limits) needs a live PostgreSQL and no server test exists for the merge; publish-on-every-change is covered by server/test/snapshots.test.ts::publishes on every real change once enabled. Run the server tests against a database to settle it |
| DAT-078 | covered | server/test/snapshots.test.ts::is not fooled by key order or a bare updatedAt bump (live PostgreSQL) |
| DAT-079 | covered | server/test/diagrams.test.ts::hides a diagram with nothing published from viewers; server/test/snapshots.test.ts::keeps viewers on the snapshot while editors keep changing the working copy |
| DAT-080 | covered | server/test/diagram-summary.test.ts::describes each diagram: database, counts, creation date and creator (live PostgreSQL) |
| DAT-081 | covered | server/test/snapshots.test.ts::lists and fetches versions for any member, newest first; server/test/p8-dat-server-limits.test.ts::the version list returns at most 500 versions |
| DAT-082 | covered | src/core/wire/wire.test.ts::DAT-082 keeps the real ids; src/lib/qubdi/__tests__/content.test.ts::keeps table, field and relationship ids untouched |
| DAT-083 | covered | src/lib/qubdi/__tests__/open-remote.test.ts::revives dates and assigns the new local id / rejects content that is not a diagram / downloads the diagram on the first visit and remembers the binding |
| DAT-084 | covered | src/lib/qubdi/__tests__/open-remote.test.ts::replaces a viewer's copy once the server has a newer version / never replaces an editor copy that has edits the server lacks |
| DAT-085 | covered | src/lib/qubdi/__tests__/sent-content.test.ts::recognises what was sent, whatever the key order or updatedAt; src/components/qubdi/__tests__/p8-qbs-autosave.test.tsx::when the server holds exactly what was sent, it takes that version and saves again, with no conflict |
| DAT-086 | covered | src/lib/qubdi/__tests__/autosave.test.ts::waits ten seconds by default / sends an edit made during a save right after it, never in parallel / retries; src/components/qubdi/__tests__/p8-qbs-autosave.test.tsx::waits ten seconds, then sends once |
| DAT-087 | covered | src/lib/qubdi/__tests__/sync-state.test.ts::stores and reads state per diagram / never writes a password into storage |
| DAT-088 | covered | src/lib/qubdi/__tests__/get-latest.test.ts::hands the database source on to the copy that will be downloaded; open-remote.test.ts::gives the new copy the database source that Get latest kept |
| DAT-089 | dropped | decision "drop"; the wire test still shows the stray key is removed on read |
| DAT-090 | covered | src/lib/qubdi/__tests__/viewer-model.test.ts::fills defaults and lays out tables that have no coordinates / drops edges that point at missing tables / never throws on malformed content |
| DAT-091 | covered | src/persistence/persistence.test.ts::DAT-091 the custom colour list normalises to #rrggbb, ignores invalid entries, caps at 12; src/lib/__tests__/custom-colors.test.ts |
| QBS-001 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-001 useDiagram offers the capabilities QBase code uses (new hook shape, change) |
| QBS-002 | covered | src/qbase/qbase.test.ts::what an edit replaces (C1) keeps the array of every section the edit did not touch / moves updatedAt; src/qbase/p8-qbs-contract.test.tsx::QBS-002 hook: a table edit gives new tables |
| QBS-003 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-003 while another diagram loads, nothing of the old one is shown (the provider holds its children back with a spinner instead of handing out a placeholder diagram; ServerAutosave still guards currentDiagram.id) |
| QBS-004 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-004 DiagramProvider readonly refuses edits and writes nothing to storage; src/store/store.test.ts::never writes while read-only; read-only-actions.test.tsx (change: store flag) |
| QBS-005 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-005 the saved shape stays; src/qbase/qbase.test.ts::diagramSchema accepts a diagram revived from server JSON / fills missing collections |
| QBS-006 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-006 saved string values do not change (change: internal names are ours) |
| QBS-007 | missing | `databaseTypeToLabelMap` and `databasesWithSchemas` exist (at `@/qbase/diagram-types`) and are tested in src/qbase/p8-qbs-contract.test.tsx::QBS-007; `dataTypeMap` is not provided under that name: QBase code uses `knownTypes` from `@/qbase/type-catalogue` instead |
| QBS-008 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-008 useStorage offers add, delete, list and get / refuses to be used outside the provider |
| QBS-009 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-009 the storage provider opens QBase and moves the earlier QubdiDB; src/lib/qubdi/__tests__/local-data.test.ts::adoptLegacyLocalData (the app opens through openStorage; adoptLegacyLocalData stays exported but the provider does not call it) |
| QBS-010 | covered | src/qbase/qbase.test.ts::replacing the whole diagram (C8) (3 tests) |
| QBS-011 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-011 side panel and focus capabilities; src/qbase/qbase.test.ts::the side panel and canvas (C9, C10) |
| QBS-012 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-012 ThemeProvider inside LocalConfigProvider renders its children; src/context/local-config-context/__tests__/stored.test.tsx::lets the page open with the defaults when storage is refused |
| QBS-013 | covered | src/platform/toast/__tests__/toast.test.tsx::shows a title and description / renders the destructive variant, an action; src/platform/toast/__tests__/p8-shl-toast.test.tsx |
| QBS-014 | covered | src/__tests__/p8-qbs-boundaries.test.ts::QBS-014 the UI primitives QBase files use exist with the names they import |
| QBS-015 | covered | src/components/qubdi/__tests__/get-latest-control.test.tsx; project-diagrams.test.tsx; src/pages/admin-page/__tests__/diagram-links-dialog.test.tsx; src/pages/editor-page/top-navbar/__tests__/last-saved.test.tsx::says when the diagram was saved; src/lib/qubdi/__tests__/new-diagram.test.ts::emptyDiagram (all pass) |
| QBS-016 | covered | src/__tests__/p8-qbs-boundaries.test.ts::QBS-016 the metadata type and schema stay at their fixed path; QBS-051 shows the file needs only zod |
| QBS-017 | covered | src/formats/metadata/load.test.ts::builds the expected diagram; src/lib/qubdi/__tests__/import-from-db.test.ts::importing a real postgresql / sqlserver catalog (describe.each) |
| QBS-018 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-018 createRelationshipsFromMetadata makes one relationship per foreign key row; src/lib/data/sql-export/__tests__/no-many-to-many.test.ts |
| QBS-019 | missing | the old module names `escapeSQLComment`, `determineCardinality`, `sqlImportToDiagram`, `validateWithRules`, `DialectRules` and the canvas helpers `carryMeasured`, `PlacedRect`, `canvas-utils`, `FieldTypeLegend` are not provided; the kept tests were adapted instead (`exportBaseSQL` is a test helper in src/lib/data/sql-export/__tests__/builders.ts over `@/qbase/sql-adapters`; `validateSQL` is local to sql-validator-dialects.test.ts; `findFreeShift` lives in src/canvas/placement). Checked in src/__tests__/p8-qbs-boundaries.test.ts::QBS-019 |
| QBS-020 | covered | src/__tests__/p8-qbs-boundaries.test.ts::QBS-020 i18n works outside React and locale files keep their shape (3 tests) |
| QBS-021 | missing | `cn` and `generateId` are tested (src/qbase/p8-qbs-contract.test.tsx::QBS-021); the `area-utils` module is not at `@/lib/utils` (nothing imports it; region membership is in src/core/model/region-membership.ts) |
| QBS-022 | covered | src/workspace/__tests__/p8-qbs-order.test.tsx::QBS-022 / QBS-024 the editor page provider order (toaster once: p8-qbs-app) |
| QBS-023 | covered | src/__tests__/p8-qbs-app.test.tsx::QBS-023 App composition (session wraps router, password dialog, one toaster; admin route in both route tables); src/__tests__/router.test.tsx |
| QBS-024 | covered | src/workspace/__tests__/p8-qbs-order.test.tsx::the access gate sits inside storage and outside the editor providers |
| QBS-025 | covered | src/workspace/__tests__/p8-qbs-frame.test.tsx::QBS-025 a full-width banner row sits between the navbar and the content (desktop and phone) |
| QBS-026 | covered | src/components/qubdi/__tests__/server-save-status.test.tsx::shows saving, saved and failure states / retries a failed save from the icon / says when someone else saved first and offers to overwrite / shows the fallback until there is something to report |
| QBS-027 | covered | src/components/qubdi/__tests__/get-latest-control.test.tsx::is an icon in the navbar / is hidden %s / asks first / replaces the local copy on confirm; src/lib/qubdi/__tests__/get-latest.test.ts::drops this browser copy, then opens the server diagram again |
| QBS-028 | covered | src/components/qubdi/__tests__/p8-qbs-lint.test.tsx::shows the finding count on the button / Fix adds the index through the editor, ... Undo brings the finding back; lint-control.test.tsx::opens the table in the left panel and zooms to it |
| QBS-029 | covered | src/components/qubdi/__tests__/drift-control.test.tsx::checks once for an open diagram / skips the minute poll while the tab is hidden; src/components/qubdi/__tests__/p8-qbs-resync-event.test.tsx::an editor gets the re-sync dialog |
| QBS-030 | covered | src/components/qubdi/__tests__/publish-control.test.tsx::is a badge inside the Publish button / PublishControl saving the auto-publish setting / shows nothing for a viewer, an editor who lost the lock; p8-qbs-publish.test.tsx::sends the trimmed note |
| QBS-031 | covered | src/workspace/__tests__/providers.test.tsx::opens the QBase project dialogs inside a project workspace |
| QBS-032 | covered | src/components/qubdi/__tests__/p8-qbs-publish.test.tsx::sends the trimmed note and says "Published v<n>" / a failure shows the server message in a destructive toast; publish-control.test.tsx::lets the autosaver send its edits first, then saves and publishes |
| QBS-033 | covered | src/components/qubdi/__tests__/p8-qbs-share.test.tsx::puts the diagram on the server before listing or creating links / a new link shows an address that opens /s/<token> / access, live updates and end date (5 tests) |
| QBS-034 | covered | src/pages/admin-page/__tests__/diagram-links-dialog.test.tsx::revoking asks a second time first, and says what it will do / ends that link, shows it as revoked |
| QBS-035 | covered | src/context/qubdi-context/__tests__/p8-qbs-sync.test.tsx::QBS-035 updates a bound diagram with the real ids, the conflict base and this tab / re-creates a diagram missing on the server only when a project is known (4 tests) |
| QBS-036 | covered | src/components/qubdi/__tests__/p8-qbs-autosave.test.tsx::QBS-036 waits ten seconds, then sends once / a viewer (no lock) never sends |
| QBS-037 | covered | src/components/qubdi/__tests__/p8-qbs-autosave.test.tsx::QBS-037 pagehide sends the held edit asking for keepalive; src/components/qubdi/__tests__/server-autosave.test.tsx::closing the tab asks first while an edit is unsent |
| QBS-038 | covered | src/components/qubdi/__tests__/p8-qbs-autosave.test.tsx::QBS-038 the server holds the base version but other content: the copy counts as unsaved (3 tests) |
| QBS-039 | covered | src/components/qubdi/__tests__/p8-qbs-autosave.test.tsx::QBS-039 offers Overwrite; choosing it takes the server version as the base and saves again / when the server holds exactly what was sent, no conflict; server-save-status.test.tsx::says when someone else saved first and offers to overwrite |
| QBS-040 | covered | src/components/qubdi/__tests__/use-edit-lock.test.tsx::renews it on a heartbeat / lets go when the editor closes / lets go when the tab closes / says who is editing when the lock is taken; server/test/locks.test.ts |
| QBS-041 | covered | src/components/qubdi/__tests__/server-autosave.test.tsx::when the lock goes to someone else reports it and drops the unsent edit; use-edit-lock.test.tsx::goes read-only when a save is refused because the lock is lost |
| QBS-042 | covered | src/lib/qubdi/__tests__/open-remote.test.ts::ensureLocalCopy (7 tests incl. refuses a viewer's copy that was never published, replaces a viewer's copy once the server has a newer version); open-failure.test.ts |
| QBS-043 | covered | src/components/qubdi/__tests__/import-from-database-dialog.test.tsx (connect, choose schemas and tables, create, upload, roll back); src/lib/qubdi/__tests__/import-from-db.test.ts::summarizes a selection by tables, views and schemas |
| QBS-044 | covered | src/components/qubdi/__tests__/p8-qbs-resync.test.tsx (grouped checkboxes, renames not ticked, one undo step, source keys, server copy); src/lib/qubdi/__tests__/resync.test.ts |
| QBS-045 | covered | src/components/qubdi/__tests__/p8-qbs-drift-resync.test.tsx::Update diagram from database closes the dialog and raises qubdi:open-resync; drift-control.test.tsx; src/lib/qubdi/__tests__/auto-drift.test.ts |
| QBS-046 | covered | src/components/qubdi/__tests__/p8-qbs-lint-stale.test.tsx::no edit is made and the notice is destructive; lint-control-sync.test.tsx::says so and puts the old settings back when the server refuses them; src/lib/qubdi/__tests__/lint-fix.test.ts::refuses when the diagram changed since the finding |
| QBS-047 | covered | src/lib/qubdi/__tests__/get-latest.test.ts::drops this browser copy, then opens the server diagram again / hands the database source on to the copy that will be downloaded; get-latest-control.test.tsx |
| QBS-048 | covered | src/context/qubdi-context/__tests__/p8-qbs-sync.test.tsx::removes QBase and QubdiDB, the qbase keys, then leaves the page / a different person signing in clears the earlier copies and reloads; src/lib/qubdi/__tests__/local-data.test.ts |
| QBS-049 | covered | src/qbase/p8-qbs-contract.test.tsx::QBS-049 editing and saving writes the table names to the storage adapter only, not to local or session storage |
| QBS-050 | covered | src/__tests__/p8-qbs-boundaries.test.ts::QBS-050 the admin page and share viewer use no editor module (import-graph walk; home page checked too) |
| QBS-051 | covered | src/__tests__/p8-qbs-boundaries.test.ts::QBS-051 the server needs only the metadata type file and shared/ (3 tests, incl. Dockerfile COPY lines) |
| QBS-052 | covered | run once: src/lib/qubdi, src/components/qubdi, src/pages/admin-page diagram-links-dialog, last-saved, stored settings, src/i18n all pass unchanged (108 files, 1604 tests green) |
