# Parity checklist rows: saved-diagram data format

Source spec: `rewrite/spec/data-format.md`. Decision is a recommendation for the owner.

| ID | Area | Behaviour (what a person sees) | Decision | Status | Test |
| --- | --- | --- | --- | --- | --- |
| DAT-001 | Local storage | Diagrams are kept in the browser (IndexedDB database `QBase`) and survive reloads | keep | [ ] | |
| DAT-002 | Local storage | Diagrams made in older versions of the browser database (versions 1 to 13) open and are upgraded without loss | keep | [ ] | |
| DAT-003 | Local storage | Old field types stored as plain text open as `{id, name}` types | keep | [ ] | |
| DAT-004 | Local storage | Old nullable values stored as the text "true"/"false" open as real booleans | keep | [ ] | |
| DAT-005 | Local storage | Old relationship types (`one_to_one`, `one_to_many`, `many_to_one`, `many_to_many`) open as source/target cardinalities | keep | [ ] | |
| DAT-006 | Local storage | A relationship that is many to many opens as one to many | keep | [ ] | |
| DAT-007 | Local storage | Diagrams from the earlier database name `QubdiDB` appear after the first start and the old database is removed; existing rows are not overwritten | keep | [ ] | |
| DAT-008 | Local storage | A failed move from `QubdiDB` leaves it untouched and retries next start | keep | [ ] | |
| DAT-009 | Local storage | The editor remembers which diagram opens by default | keep | [ ] | |
| DAT-010 | Local storage | Per-diagram table/schema visibility filter is remembered between visits | keep | [ ] | |
| DAT-011 | Local storage | With no saved filter and several schemas, only the first schema is shown at first | keep | [ ] | |
| DAT-012 | Local storage | Relationships and custom types are listed alphabetically after load | change | [ ] | |
| DAT-013 | Local storage | Deleting a diagram removes all its tables, relationships, dependencies, areas, custom types and notes | keep | [ ] | |
| DAT-014 | Local storage | The one-row-per-entity layout with many stores and accidental indexes | change | [ ] | |
| DAT-015 | Local storage | Signing out removes local diagrams and server-linked data from this browser, but keeps theme/view settings | keep | [ ] | |
| DAT-016 | Local storage | Signing in as a different person than the one who left local copies clears them first | keep | [ ] | |
| DAT-017 | Local storage | Local copies with no recorded owner are claimed by the next signed-in person, not deleted | keep | [ ] | |
| DAT-018 | Local storage | App still opens with defaults when the browser blocks storage | keep | [ ] | |
| DAT-019 | Diagram | A diagram has an id, name, database type, optional edition, created and updated dates | keep | [ ] | |
| DAT-020 | Diagram | Allowed database types: generic, postgresql, mysql, sql_server, mariadb, sqlite, clickhouse, cockroachdb, oracle | keep | [ ] | |
| DAT-021 | Diagram | Editions: supabase, timescale (PostgreSQL); mysql_5_7; sql_server_2016_and_below; cloudflare_d1 | keep | [ ] | |
| DAT-022 | Diagram | A new blank diagram has empty tables, relationships, dependencies, areas, custom types and notes, and a localized default name when the name is blank | keep | [ ] | |
| DAT-023 | Diagram | Updated date moves on every edit | keep | [ ] | |
| DAT-024 | Diagram | Missing child lists are treated as empty | keep | [ ] | |
| DAT-025 | Table | Table fields: id, name, optional schema, position, fields, indexes, optional check constraints, colour, view flags, created time, width, comments, order, expanded, parent area | keep | [ ] | |
| DAT-026 | Table | New table is named table_N or view_N and starts with an `id` primary-key field and its primary-key index | keep | [ ] | |
| DAT-027 | Table | Default colours: table `#8eb7ff`, view `#b0b0b0` | keep | [ ] | |
| DAT-028 | Table | New table gets the database's default schema (public, dbo, default) where schemas exist | keep | [ ] | |
| DAT-029 | Table | Table width is user-adjustable within 224 to 450; default 224 | keep | [ ] | |
| DAT-030 | Table | Collapsed tables show 10 fields and can expand (`expanded`) | keep | [ ] | |
| DAT-031 | Table | A table inside an area records that area as its parent | keep | [ ] | |
| DAT-032 | Table | Array order of tables in the saved diagram is undefined; only `order` hints list order | change | [ ] | |
| DAT-033 | Field | Field keys: id, name, type object, primaryKey, unique, nullable, increment, isArray, created time, length, precision, scale, default, collation, comments, check | keep | [ ] | |
| DAT-034 | Field | Length is stored as text so values like `max` work; text `"null"` means none | change | [ ] | |
| DAT-035 | Field | New field is field_N, default primary-key type, nullable, not unique, not key | keep | [ ] | |
| DAT-036 | Field | Default new-field type: integer (SQLite), number (Oracle), bigint (all others) | keep | [ ] | |
| DAT-037 | Field | Array flag only applies for databases/types that support arrays and shows a `[]` suffix | keep | [ ] | |
| DAT-038 | Field | Type suffix `(len)`, `(p, s)`, `(p)` shown next to the type | keep | [ ] | |
| DAT-039 | Field | Custom type used as a field type stores its name as both id and name | keep | [ ] | |
| DAT-040 | Field | A column-level `check` text on the field | change | [ ] | |
| DAT-041 | Index | Index keys: id, name, unique, fieldIds, created time, optional type, isPrimaryKey, comments | keep | [ ] | |
| DAT-042 | Index | The primary-key index always lists exactly the primary-key fields, first in the list, with empty name | keep | [ ] | |
| DAT-043 | Index | New index is index_N, empty fields, not unique | keep | [ ] | |
| DAT-044 | Index | Index type choice (btree, hash, gin) offered only for PostgreSQL/CockroachDB; gin only for array/json/jsonb/tsvector/hstore fields | keep | [ ] | |
| DAT-045 | Index | Other stored index types (gist, spgist, brin, clustered, nonclustered, xml, fulltext, spatial, index) still load | keep | [ ] | |
| DAT-046 | Relationship | Relationship keys: id, name, source/target schema, table, field, source/target cardinality, created time | keep | [ ] | |
| DAT-047 | Relationship | Source is the referenced side; the usual foreign key is source one, target many | keep | [ ] | |
| DAT-048 | Relationship | Only one-to-one, one-to-many, many-to-one exist | keep | [ ] | |
| DAT-049 | Relationship | Default name `<table>_<field>_fk`; default cardinality one-to-one | keep | [ ] | |
| DAT-050 | Relationship | Only one relationship may join the same two fields (either direction) | keep | [ ] | |
| DAT-051 | Check constraint | Table-level check constraints with id, expression, created time; new ones are empty | keep | [ ] | |
| DAT-052 | Dependency | A dependency links a depended-on table to a dependent table/view, with optional schemas | keep | [ ] | |
| DAT-053 | Custom type | Enum (labels list) and composite (member name and type list) types with optional schema and order | keep | [ ] | |
| DAT-054 | Custom type | New custom type is enum named type_N | keep | [ ] | |
| DAT-055 | Area | Areas have name, position, size, colour and optional order; new ones are `Area N`, 300x200, random colour | keep | [ ] | |
| DAT-056 | Note | Notes have text, position, size, colour and optional order; new ones are empty, 200x150, `#ffe374` | keep | [ ] | |
| DAT-057 | Side lists | Areas, notes and custom types are listed by `order`, then those without | keep | [ ] | |
| DAT-058 | Filter | Visibility filter by schemas and tables uses union logic and is tidied when saved | keep | [ ] | |
| DAT-059 | Ids | Entity ids are 25-character lower-case alphanumeric and opaque | keep | [ ] | |
| DAT-060 | Ids | Local diagram ids are a per-browser prefix plus 4 characters | change | [ ] | |
| DAT-061 | Export | Export downloads `QBase(<name>).json`, pretty-printed with 2 spaces | keep | [ ] | |
| DAT-062 | Export | Exported ids are renumbered to small numeric strings and all references follow | keep | [ ] | |
| DAT-063 | Export | Dangling relationships and dependencies are left out of the file | keep | [ ] | |
| DAT-064 | Export | Export has no version marker | change | [ ] | |
| DAT-065 | Export | Filter and editor config are not in the exported file | keep | [ ] | |
| DAT-066 | Import | Importing a JSON file adds a new diagram with new ids and fresh dates | keep | [ ] | |
| DAT-067 | Import | An invalid or incomplete file is refused with an error and nothing is added | keep | [ ] | |
| DAT-068 | Import | Unknown keys in a file are ignored | keep | [ ] | |
| DAT-069 | Import | Files from the previous editor (`ChartDB(...)` names) open with the same shape | keep | [ ] | |
| DAT-070 | Import | Importing inside a server project also creates the diagram on the server and opens it there | keep | [ ] | |
| DAT-071 | Server | Server keeps one working copy per diagram (title + JSON content) in a project, plus numbered published snapshots | keep | [ ] | |
| DAT-072 | Server | Server accepts any content object with arrays for the six collections and short strings for id, name, type, edition; keeps unknown keys | keep | [ ] | |
| DAT-073 | Server | Save needs the last known `updatedAt`; a stale base gives a conflict message and changes nothing | keep | [ ] | |
| DAT-074 | Server | Only one editor tab may save at a time; others see who is editing and open read-only | keep | [ ] | |
| DAT-075 | Server | Content body limit is 50 MB by default | keep | [ ] | |
| DAT-076 | Server | Publish creates the next snapshot, optional note up to 500 characters; newest 200 kept by default | keep | [ ] | |
| DAT-077 | Server | Auto-publish saves a snapshot on every changed save and merges rapid ones | keep | [ ] | |
| DAT-078 | Server | "Unpublished changes" is shown when working copy differs (ignoring updatedAt) from latest snapshot | keep | [ ] | |
| DAT-079 | Server | Viewers only see published content, title and time; unpublished diagrams are hidden from them | keep | [ ] | |
| DAT-080 | Server | Diagram list shows type, edition, table count, relationship count and created date without loading content | keep | [ ] | |
| DAT-081 | Server | Version history lists up to 500 versions, any can be read | keep | [ ] | |
| DAT-082 | Server sync | Content sent to the server keeps real ids (not renumbered) | keep | [ ] | |
| DAT-083 | Server sync | Opening a server diagram makes a local copy under a new local id; unreadable content gives a clear error | keep | [ ] | |
| DAT-084 | Server sync | A reopened copy is refreshed only when the server is newer and the local copy has no unsent edits | keep | [ ] | |
| DAT-085 | Server sync | A save whose reply was lost is recognised and not reported as someone else's change | keep | [ ] | |
| DAT-086 | Server sync | Editor saves 10 seconds after the last change, one save at a time, retries after failure | keep | [ ] | |
| DAT-087 | Server sync | Re-sync from a live database remembers connection details (without password) per diagram | keep | [ ] | |
| DAT-088 | Server sync | "Get latest" keeps the diagram's remembered database connection for its new local copy | keep | [ ] | |
| DAT-089 | Server sync | Stray `diagramId` key on table rows leaks into server content | drop | [ ] | |
| DAT-090 | Viewer | Read-only viewer copes with missing names, coordinates, colours and dangling relationships | keep | [ ] | |
| DAT-091 | Settings | User colour list (max 12, normalised hex) is kept per browser | keep | [ ] | |
