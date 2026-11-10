# Spec: the saved-diagram data format

Status: draft for owner review. Source: the old editor on `main` (domain types, the local
storage provider, the export/import helpers, and the server `diagrams` module). This file
stands alone: a clean author needs nothing else to read and write the same data.

Data formats and facts (JSON keys, enum values, store names, index lists) are kept verbatim
on purpose, so a person's existing diagrams, exported files and server copies open in the
new editor. Everything else here is behaviour described in words.

Conventions used below:

- "optional" means the key may be missing. "nullable" means the value may be `null`.
  Almost every optional value in the old data may be missing OR `null`; a reader must accept
  both and treat them the same (as "not set").
- "ms" means milliseconds since 1970-01-01 UTC, as a JSON number.
- A "diagram" is the whole document. It owns its tables, relationships, and so on. Every
  child has an `id` that is unique inside the diagram.

## 1. Overview: where a diagram lives

A diagram exists in up to four places:

1. **Local browser database** (IndexedDB, via Dexie). The editor always works on this copy.
   One row in a `diagrams` store plus child rows in other stores, tied together by
   `diagramId`. See section 2.
2. **Exported file** (`.json`). One self-contained JSON object. See section 5.
3. **Server copy** (PostgreSQL). One JSON document ("content") per diagram plus published
   snapshots. See section 6.
4. **Per-browser side data** in localStorage / sessionStorage (which server diagram a local
   diagram is bound to, last-seen server version, and so on). See section 7.

The JSON shape of a diagram (section 3) is the same in places 1 (once the child rows are
joined back together), 2 and 3, with the differences noted in each section.

## 2. Local browser storage (IndexedDB)

### 2.1 Database name

- Current name: `QBase`.
- Previous name: `QubdiDB`. On every start, if a database called `QubdiDB` exists, its rows
  are merged into `QBase` and `QubdiDB` is deleted (section 2.6).

### 2.2 Stores (tables)

All stores below exist in the current version. Primary key is `id` (auto-increment declared,
but in practice always supplied by the editor as a string) unless stated.

| Store | Primary key | Row content | Indexed fields (besides key) |
| --- | --- | --- | --- |
| `diagrams` | `id` | One diagram row WITHOUT its children: `id`, `name`, `databaseType`, `databaseEdition`, `createdAt`, `updatedAt` | `name`, `databaseType`, `databaseEdition`, `createdAt`, `updatedAt` |
| `db_tables` | `id` | A table (section 3.3) plus `diagramId` | `diagramId`, `name`, `schema`, `x`, `y`, `fields`, `indexes`, `color`, `createdAt`, `width`, `comment`, `isView`, `isMaterializedView`, `order` |
| `db_relationships` | `id` | A relationship (3.6) plus `diagramId` | `diagramId`, `name`, `sourceSchema`, `sourceTableId`, `targetSchema`, `targetTableId`, `sourceFieldId`, `targetFieldId`, `type`, `createdAt` |
| `db_dependencies` | `id` | A dependency (3.8) plus `diagramId` | `diagramId`, `schema`, `tableId`, `dependentSchema`, `dependentTableId`, `createdAt` |
| `areas` | `id` | An area (3.10) plus `diagramId` | `diagramId`, `name`, `x`, `y`, `width`, `height`, `color` |
| `db_custom_types` | `id` | A custom type (3.9) plus `diagramId` | `diagramId`, `schema`, `type`, `kind`, `values`, `fields` |
| `notes` | `id` | A note (3.11) plus `diagramId` | `diagramId`, `content`, `x`, `y`, `width`, `height`, `color` |
| `config` | `id` | One row, `id` = `1`: `defaultDiagramId` (string), optional `exportActions` (array of dates) | `defaultDiagramId` |
| `diagram_filters` | `diagramId` | The saved visibility filter of one diagram (3.12) plus `diagramId` | `tableIds`, `schemasIds` |

Notes that matter for compatibility:

- The IndexedDB indexes are partly accidental. Some index names do not match the real field
  names (`comment` in `db_tables` while the field is `comments`; `type` in
  `db_relationships` which was replaced by the two cardinalities; `type` in
  `db_custom_types` while the field is `name`; `schemasIds` in `diagram_filters` while the
  field is `schemaIds`). A new implementation only needs to keep the store names, key paths
  and the `diagramId` index working, and may add or drop the others. It must not fail to open
  a database that has them.
- Table rows carry a `diagramId` key. When tables are read back into a diagram that key is
  NOT removed, so it can end up inside the JSON sent to the server (section 6). Readers must
  ignore unknown keys. A new writer should not emit it.
- A table's fields, indexes and check constraints live INSIDE the table row (nested
  arrays), not in their own stores.
- Child rows are removed when their diagram is deleted. Renaming a diagram's id (done when a
  diagram is replaced) re-points every child row's `diagramId`.

### 2.3 Versions and upgrade steps

The database is declared with versions 1 to 14. (Dexie stores them as the declared number
times 10 in IndexedDB, so the browser sees version 140 for the current one. A rewrite that
does not use Dexie must open the database at that same browser version, or at a higher one,
never lower.) Each store list only changes where the table says; stores not mentioned are
carried over unchanged.

| Version | Store changes | Data upgrade step |
| --- | --- | --- |
| 1 | Create `diagrams`, `db_tables`, `db_relationships`, `config` | none |
| 2 | none | For every field of every table: `type` used to be a plain string like `"varchar"` or `"double precision"`. Replace it by an object `{ "id": <string with spaces replaced by "_">, "name": <the original string> }`. |
| 3 | `diagrams` gains index `databaseEdition` | none |
| 4 | `db_tables` gains index `comment` | none |
| 5 | `db_tables` gains index `schema`; `db_relationships` gains `sourceSchema`, `targetSchema` | none |
| 6 | none | For every relationship: remove the old `type` string (`one_to_one`, `one_to_many`, `many_to_one`, `many_to_many`) and set `sourceCardinality` and `targetCardinality` from it (table in section 8). A missing `type` counts as `one_to_one`. `many_to_many` counts as `one_to_many`. |
| 7 | Create `db_dependencies` | none |
| 8 | `db_tables` gains indexes `isView`, `isMaterializedView`, `order` | none |
| 9 | none | For every field: if `nullable` is the string `"true"` or `"false"` (any letter case), turn it into the boolean. |
| 10 | Create `areas` | none |
| 11 | Create `db_custom_types` | none |
| 12 | Create `diagram_filters` | Delete every row of `config` (it is re-created with defaults on the next start). |
| 13 | Create `notes` | none |
| 14 | none | For every relationship that has both cardinalities `many`, set `sourceCardinality` to `one` (many-to-many no longer exists). |

### 2.4 First start and defaults

When the database opens (every time): first merge any legacy `QubdiDB` data (2.6). Then, if
`config` row `1` is missing, create it with `defaultDiagramId` = the `id` of the first diagram
in the `diagrams` store, or the empty string if there is none.

### 2.5 Reading a diagram back

A diagram is read by loading its `diagrams` row and, on request, each child collection by
`diagramId`. Ordering when read:

| Collection | Order returned |
| --- | --- |
| tables | Store order, which is ascending by `id` string. The visual/sidebar order is a separate concern driven by `order` (3.3). |
| relationships | Alphabetical by `name` (locale-aware compare). |
| custom types | Alphabetical by `name` (locale-aware compare). |
| dependencies, areas, notes | Store order (ascending by `id`). |

The editor lists areas, notes and custom types in the side panel by `order` when present:
items with an `order` number come in ascending order; items without one are placed after
those that have one, otherwise in the order read.

Every child collection is optional on a diagram: an absent collection means empty.

### 2.6 Legacy database move (`QubdiDB` to `QBase`)

On every start while `QubdiDB` exists:

1. Open it with the same stores and upgrade steps as above (so an old version is upgraded
   first).
2. Read all rows of every store that also exists in `QBase`.
3. In one transaction, add each row whose primary key is not already in `QBase`. Rows that
   already exist in `QBase` are kept as they are, never overwritten (so the result is a merge).
4. Only after that transaction succeeds, delete `QubdiDB`. On any failure, leave it in place
   and try again at the next start (log a warning, do not stop the editor).

### 2.7 Signing out and local ownership

- Signing out of a server account deletes both databases (`QBase`, `QubdiDB`) and every
  localStorage / sessionStorage key whose name starts with `qbase.`. Interface settings
  without that prefix (theme and view options) stay.
- Ownership marker `qbase.local-owner` holds the id of the user the local copies belong to.
  On sign-in: if the marker holds another user, clear all local data first (and the editor
  reloads); if there is no marker (copies from before it existed), claim them for this user
  without clearing, because they may hold unsynced work.

## 3. The diagram JSON

This is the shape used by the exported file, the server content, and the in-memory model
(where dates are real date objects rather than strings).

### 3.1 Diagram (top level)

| Key | Type | Required | Meaning and allowed values |
| --- | --- | --- | --- |
| `id` | string | yes | Identifier. Local: workspace prefix plus 4 random chars (see 4). Exported file: replaced on import. |
| `name` | string | yes | Display name. A new blank diagram trims it and falls back to the localized default name if empty. |
| `databaseType` | string enum | yes | One of `generic`, `postgresql`, `mysql`, `sql_server`, `mariadb`, `sqlite`, `clickhouse`, `cockroachdb`, `oracle`. |
| `databaseEdition` | string enum | no | One of `supabase`, `timescale` (only with `postgresql`); `mysql_5_7` (only `mysql`); `sql_server_2016_and_below` (only `sql_server`); `cloudflare_d1` (only `sqlite`). Absent for the other types and for "standard". |
| `tables` | array of table | no | 3.3. |
| `relationships` | array of relationship | no | 3.6. |
| `dependencies` | array of dependency | no | 3.8. |
| `areas` | array of area | no | 3.10. |
| `customTypes` | array of custom type | no | 3.9. |
| `notes` | array of note | no | 3.11. |
| `createdAt` | date | yes | In JSON an ISO-8601 string (`2026-10-17T09:30:00.000Z`). On read from the server, an unparsable or missing value is replaced by "now". |
| `updatedAt` | date | yes | Same format. Set to "now" on every change. Ignored when comparing content for changes. |

A blank new diagram has all six collections present and empty, `createdAt` = `updatedAt` =
now.

Example (small):

```json
{
  "id": "k3f9a1b2zx0q",
  "name": "Shop",
  "databaseType": "postgresql",
  "tables": [],
  "relationships": [],
  "dependencies": [],
  "areas": [],
  "customTypes": [],
  "notes": [],
  "createdAt": "2026-10-17T09:30:00.000Z",
  "updatedAt": "2026-10-17T09:31:12.000Z"
}
```

The per-diagram filter and the editor config are NOT part of the diagram JSON (3.12, 3.13).

### 3.2 Data type reference (used by fields)

An object `{ "id": string, "name": string }`, both required.

- For a standard type, `id` is the lower-case identifier of the type in that database's type
  list and `name` is the display text; for most types they are equal (`varchar`/`varchar`,
  `bigint`/`bigint`). A few differ (for example `id` `double_precision` with `name`
  `double precision`). Rule used when upgrading old data: `id` = `name` with spaces replaced
  by underscores.
- For a custom type (enum or composite, 3.9) used as a field type, both `id` and `name` are
  the custom type's `name`.
- Any other string pair must be accepted and shown as typed (imports can produce types not in
  the list).
- The per-database catalogue of types (about 23 generic, 73 PostgreSQL, 38 MySQL, 41
  MariaDB, 35 SQL Server, 24 SQLite, 86 ClickHouse, 23 Oracle) and their attributes
  (length, precision, scale ranges) belongs to the type-catalogue spec, not here.
- Default type of a new primary key / new field: `integer` for `sqlite`, `number` for
  `oracle`, `bigint` for every other database type.

### 3.3 Table

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id. |
| `name` | string | yes | Table name. |
| `schema` | string, nullable | no | Schema name; absent or empty means "no schema". Only meaningful for databases with schemas. New tables get the database's default schema (4.4). |
| `x`, `y` | number | yes | Canvas position of the top-left corner, in canvas units. |
| `fields` | array of field | yes | 3.4. Order is display order and column order in exports. |
| `indexes` | array of index | yes | 3.5. Order is display order. |
| `checkConstraints` | array of check constraint, nullable | no | 3.7. |
| `color` | string | yes | CSS hex color like `#8eb7ff`. Default for tables `#8eb7ff`, for views `#b0b0b0`. |
| `isView` | boolean | yes | `true` for a view. |
| `isMaterializedView` | boolean, nullable | no | `true` for a materialized view (also has `isView` true). |
| `createdAt` | number (ms) | yes | Creation time. |
| `width` | number, nullable | no | User-set width on the canvas. When absent the table uses its default width (224). Limits used by the editor: min 224, mid 337, max 450. |
| `comments` | string, nullable | no | Free text comment on the table. |
| `order` | number, nullable | no | Position of the table in the side list. A new table gets the current number of tables. |
| `expanded` | boolean, nullable | no | Whether the table shows all fields (`true`) or is collapsed to a fixed number of fields (10) with a "show more". |
| `parentAreaId` | string, nullable | no | `id` of the area the table sits in. Recomputed from geometry by auto-arrange (a table whose box lies inside an area belongs to it). |

New-table defaults: name `table_N` (or `view_N` for a view), where N is the count of tables
(or of views) of that kind plus one; `x` = `y` = 0 (the editor then places it in a free spot);
one field named `id` (primary key, unique, not nullable, default PK type) and one matching
primary-key index (3.5).

Example:

```json
{
  "id": "t1", "name": "customers", "schema": "public",
  "x": 120, "y": 80, "color": "#8eb7ff", "isView": false, "createdAt": 1760693400000,
  "fields": [
    { "id": "f1", "name": "id", "type": { "id": "bigint", "name": "bigint" },
      "primaryKey": true, "unique": true, "nullable": false, "createdAt": 1760693400000 },
    { "id": "f2", "name": "email", "type": { "id": "varchar", "name": "varchar" },
      "characterMaximumLength": "255", "primaryKey": false, "unique": true,
      "nullable": false, "createdAt": 1760693400001 }
  ],
  "indexes": [
    { "id": "i1", "name": "", "unique": true, "fieldIds": ["f1"],
      "isPrimaryKey": true, "createdAt": 1760693400000 }
  ]
}
```

### 3.4 Field (column)

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id (unique across the whole diagram in practice). |
| `name` | string | yes | Column name. |
| `type` | data type object | yes | 3.2. |
| `primaryKey` | boolean | yes | Part of the primary key. |
| `unique` | boolean | yes | Has a unique constraint. A primary-key field of a new table is also unique. |
| `nullable` | boolean | yes | May be NULL. (Very old data stored the strings "true"/"false"; see 2.3 v9 and 8.) |
| `increment` | boolean, nullable | no | Auto-increment / identity column. |
| `isArray` | boolean, nullable | no | Array of the type. Only has effect for databases that support arrays (PostgreSQL, CockroachDB) and types that can be arrays; otherwise ignored. Shown as a `[]` suffix. |
| `createdAt` | number (ms) | yes | Creation time. |
| `characterMaximumLength` | string, nullable | no | Length for char-like types. A STRING, not a number, so it can hold `"max"` (SQL Server) or `"255"`. The text `"null"` appears in old imports and means no length. |
| `precision` | number, nullable | no | Total digits for numeric types, or precision for float-like types. |
| `scale` | number, nullable | no | Digits after the decimal point. |
| `default` | string, nullable | no | Default value expression as raw text, exactly as it would appear after `DEFAULT` in SQL. |
| `collation` | string, nullable | no | Collation name. |
| `comments` | string, nullable | no | Free text comment. |
| `check` | string, nullable | no | Column-level check expression (legacy single check on the field; table-level constraints use 3.7). |

Type suffix text shown next to a type name: if `characterMaximumLength` is set, `(len)`;
else if both `precision` and `scale` are set (non-zero), `(p, s)`; else if only `precision`,
`(p)`; else nothing. When the type's attributes are known (an "extended" display): char-like
types show `(len)` with `n` as placeholder when empty; numeric with precision and scale show
`(p, s)` with placeholders; precision-only types show `(p)`. A `[]` is appended for arrays.

New-field defaults: name `field_N` (N = number of fields in the table plus one), default PK
type, `unique` false, `nullable` true, `primaryKey` false.

### 3.5 Index

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id. |
| `name` | string | yes | Index name. The empty string on an automatic primary-key index means "no named CONSTRAINT; let the database name it". |
| `unique` | boolean | yes | Unique index. |
| `fieldIds` | array of string | yes | `id`s of fields of the SAME table, in index column order. May be empty. |
| `createdAt` | number (ms) | yes | Creation time. |
| `type` | string enum | no | One of `btree`, `hash`, `gist`, `gin`, `spgist`, `brin`, `nonclustered`, `clustered`, `xml`, `fulltext`, `spatial`, `index`. The editor offers only `btree` (default), `hash` and `gin` and only for PostgreSQL and CockroachDB (default `btree`); other databases have no choice. `gin` is only allowed when all indexed fields are arrays or of type `jsonb`, `json`, `tsvector` or `hstore`. Other values come from imports. Not nullable (when absent, omit the key). |
| `isPrimaryKey` | boolean, nullable | no | `true` marks the index that represents the table's primary key. |
| `comments` | string, nullable | no | Free text. |

Primary-key index rule: the primary-key index of a table always lists exactly the fields with
`primaryKey: true`, in field order. If there are no primary-key fields there is no
primary-key index. When one is needed and none exists, a new one is created with `name` "",
`unique` true, `isPrimaryKey` true. The editor keeps it in sync and shows it first. New
(non-PK) index defaults: name `index_N` (N = number of indexes plus one), `fieldIds` empty,
`unique` false.

### 3.6 Relationship (foreign key link)

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id. |
| `name` | string | yes | Constraint name. Default `<sourceTableName>_<sourceFieldName>_fk`. |
| `sourceSchema` | string, nullable | no | Schema of the source table. |
| `sourceTableId` | string | yes | `id` of the source table. |
| `targetSchema` | string, nullable | no | Schema of the target table. |
| `targetTableId` | string | yes | `id` of the target table. |
| `sourceFieldId` | string | yes | `id` of a field of the source table. |
| `targetFieldId` | string | yes | `id` of a field of the target table. |
| `sourceCardinality` | `"one"` or `"many"` | yes | Cardinality at the source end. |
| `targetCardinality` | `"one"` or `"many"` | yes | Cardinality at the target end. |
| `createdAt` | number (ms) | yes | Creation time. |

Direction (as the old editor names and draws it): the editor sets the new link up with the
referenced ("parent") table as SOURCE, and a foreign key is stored as source `one`, target
`many`.

Cardinality combinations (the only ones that exist):

| source | target | Name used in the editor |
| --- | --- | --- |
| one | one | one to one |
| one | many | one to many (the usual foreign key) |
| many | one | many to one |

`many` + `many` does not exist. On read, a relationship with both `many` is changed to source
`one`, target `many`. Reason: a foreign key points at one row; a many-to-many is modelled
with a junction table.

New relationship defaults: cardinalities `one`/`one`, name as above, schemas copied from the
two tables. Only one relationship may join the same two fields, in either direction: asking
for a second returns the existing one.

Example:

```json
{ "id": "r1", "name": "orders_customer_id_fk", "sourceTableId": "t1", "sourceFieldId": "f1",
  "targetTableId": "t2", "targetFieldId": "f9", "sourceSchema": "public",
  "targetSchema": "public", "sourceCardinality": "one", "targetCardinality": "many",
  "createdAt": 1760693500000 }
```

### 3.7 Check constraint (table level)

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id. |
| `expression` | string | yes | The condition text, as inside `CHECK ( ... )`. New ones start empty. |
| `createdAt` | number (ms) | yes | Creation time. |

Stored inside the table's `checkConstraints` array. Only the table row holds them.

### 3.8 Dependency (view depends on table)

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id. |
| `schema` | string, nullable | no | Schema of the table that is depended ON. |
| `tableId` | string | yes | `id` of the table (or view) that is depended on. |
| `dependentSchema` | string, nullable | no | Schema of the dependent object. |
| `dependentTableId` | string | yes | `id` of the dependent table or view (the one that uses `tableId`, normally a view). |
| `createdAt` | number (ms) | yes | Creation time. |

### 3.9 Custom type

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id. |
| `schema` | string, nullable | no | Schema the type lives in. |
| `name` | string | yes | Type name. New ones are `type_N` (N = count plus one). Also the name used when a field uses the type (3.2). |
| `kind` | `"enum"` or `"composite"` | yes | Enum or composite type. New types are `enum`. |
| `values` | array of string, nullable | no | For `enum`: the labels in order. |
| `fields` | array of `{ "field": string, "type": string }`, nullable | no | For `composite`: member name and member type text, in order. |
| `order` | number, nullable | no | Position in the side list. |

### 3.10 Area (coloured background region)

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id. |
| `name` | string | yes | Label. New: `Area N` (N = count plus one). |
| `x`, `y` | number | yes | Top-left corner on the canvas. |
| `width`, `height` | number | yes | Size. New areas are 300 by 200. |
| `color` | string | yes | CSS hex color. New areas get a random color. |
| `order` | number | no | Position in the side list; also decides stacking when areas overlap. Not nullable. |

### 3.11 Note (sticky note)

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Unique id. |
| `content` | string | yes | The text. New notes start empty. |
| `x`, `y` | number | yes | Top-left corner. |
| `width`, `height` | number | yes | Size. New notes are 200 by 150. |
| `color` | string | yes | CSS hex color. New notes are `#ffe374`. |
| `order` | number | no | Position in the side list. Not nullable. |

### 3.12 Diagram filter (local only)

One row per diagram in `diagram_filters`, never exported and never sent to the server.

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `diagramId` | string | yes (key) | The diagram. |
| `schemaIds` | array of string | no | Schemas shown. A schema id is the schema name trimmed, lower-cased, with spaces replaced by `_`. |
| `tableIds` | array of string | no | Individual tables shown. |

Meaning (union): if both keys are absent, everything is shown. Otherwise a table is shown if
its `id` is in `tableIds`, or its schema id (or the database's default schema when the table
has none) is in `schemaIds`. An empty `tableIds` array with no `schemaIds` means nothing is
shown. A filter is tidied when saved: tables whose schema is already listed are dropped from
`tableIds`; if all tables of a schema are in `tableIds`, the schema moves to `schemaIds`; if
that makes everything visible, both keys are removed. When no filter is stored and the
diagram has more than one schema, the editor starts with only the first schema shown
(`{ "schemaIds": [<first>] }`); otherwise it starts with an empty filter (everything).

### 3.13 Editor config (local only)

The `config` row (`id` 1): `defaultDiagramId` (the diagram the editor opens by default; may be
empty) and optional `exportActions` (a list of dates of past exports). Never exported.

## 4. Ids, ordering and defaults

### 4.1 Id generation

- Child ids (tables, fields, indexes, relationships, dependencies, areas, notes, custom
  types, check constraints): 25 random characters from `0-9a-z`. Ids are opaque: never parse
  them.
- Local diagram id: an 8-character workspace prefix followed by 4 random characters (same
  alphabet). The prefix is created once per browser and kept in localStorage under key `uuid`
  (no `qbase.` prefix). If storage is blocked, one prefix is kept in memory for the page's
  life.
- Server diagram id: a UUID created by the server (separate from the local id; see 7).
- Imported/exported ids: see 5.

### 4.2 Timestamps

- Diagram `createdAt` / `updatedAt`: date objects in memory, ISO-8601 strings in JSON.
- Everything else with `createdAt`: number of milliseconds.
- `updatedAt` of the diagram is bumped on every edit of any part.

### 4.3 Ordering rules summary

- `fields` and `indexes`: array order is the order shown and exported.
- Tables: the diagram array has no guaranteed order (read from the store by id). The `order`
  number drives the side list; imports sort by it; a missing `order` counts as 0.
- Relationships and custom types: alphabetical by `name` when read locally.
- Areas, notes, custom types: side list by `order` (numbers first ascending, then those
  without).

### 4.4 Default schemas

When a new table is made in a database with schemas, `schema` is filled from: PostgreSQL
`public`, CockroachDB `public`, SQL Server `dbo`, ClickHouse `default`. Other databases get
no schema.

### 4.5 Colours

Table `#8eb7ff`, view `#b0b0b0`, note `#ffe374`, areas random. A custom-colour list (up to 12
user colours, normalised to `#rrggbb`) is kept in localStorage under `qbase.custom-colors`
as a JSON array of strings; invalid entries are ignored on read.

## 5. The exported file

- File name: `QBase(<diagram name>).json`, MIME `application/json`.
- Content: the diagram JSON of section 3, pretty-printed with 2-space indent, with these
  changes made at export time:
  - Every id (diagram, tables, fields, indexes, relationships, dependencies, areas, notes,
    custom types) is replaced by a decimal counter rendered as a string (`"0"`, `"1"`, ...).
    The exact numbers are not meaningful (numbers are skipped), only that they are unique
    strings. All references (`fieldIds`, `sourceTableId`, `tableId`, and so on) are rewritten
    consistently.
  - Check-constraint ids are NOT replaced (kept as they are). They only need to be unique
    inside their table.
  - A relationship or dependency whose referenced table or field does not exist is dropped.
    An index field reference that does not resolve is dropped from `fieldIds`.
  - The `name` of a primary-key index is set to the empty string.
  - Missing collections become empty arrays.
  - `createdAt` / `updatedAt` become ISO strings.
  - The diagram filter, config, and `diagramId` row keys are not included (the last only if
    the writer does not leak it; see 2.2).
- No format or version marker is written. There is no envelope.

Importing a file:

1. Parse the text as JSON (invalid JSON is an error).
2. Replace `createdAt` and `updatedAt` by "now", then validate against the diagram shape of
   section 3. Validation is strict about required keys and value types and about enum values;
   unknown keys are silently dropped. Any failure refuses the whole file (the person sees an
   error; nothing is imported).
3. Give every entity new fresh random ids (4.1) and a fresh diagram id (workspace prefix +
   4 chars); relationships/dependencies with dangling references are dropped as in export.
   The primary-key index name is cleared.
4. Add it to the local store as a new diagram.
5. Inside a server project, also create it on the server right away and open it there
   (section 6); if that fails the local copy stays.

Old exports made by the ChartDB-derived editor have the same shape (their file name began
with `ChartDB(`); see 8 for shapes that must still load. The new editor writes `QBase(`.

## 6. The QBase server

### 6.1 What it stores

PostgreSQL tables relevant to diagrams (server-side ids are UUIDs, times are timestamps
with time zone):

| Table | Purpose |
| --- | --- |
| `diagrams` | The working copy. Columns: `id`, `owner_id` (user, cascade), `project_id` (required; a diagram always lives in exactly one project), `title` (text, required), `content` (JSON document, required), `content_hash` (text, nullable), derived list columns (below), `auto_publish` (boolean, default false), `lint_config` (JSON object, default `{}`), `updated_at`. Indexed by project and by owner. |
| `snapshots` | Published versions. `id`, `diagram_id` (cascade), `version` (integer, 1, 2, ...; unique per diagram), `title`, `content`, `content_hash`, `published_by` (user or null), `published_at`, `note` (nullable text), `auto` (boolean: made by auto-publish). |
| `diagram_locks` | One row per diagram open for editing: `diagram_id`, `user_id`, `editor_id` (one browser tab), `expires_at`. |

Derived list columns on `diagrams` (computed by the database from `content`, never written
by the app): database type, database edition, table count (length of `tables` array, 0 if not
an array), relationship count (same for `relationships`), created-at text (`createdAt` as
stored). An empty string in the source counts as null. The same numbers are computed for a
viewer from the latest snapshot.

The server migrations are the 26 numbered SQL files of the Drizzle migrator in
`server/src/db/migrations`; they are server-owned and outside this rewrite.

### 6.2 What the server accepts

`content` is "the editor's own JSON" (section 3.1 as serialised: dates as ISO strings, ids
unchanged) with minimal checks so unknown keys pass through untouched:

- `id` string up to 200 chars; `name` up to 500; `databaseType` up to 50; `databaseEdition`
  up to 50 (all optional strings).
- `tables`, `relationships`, `dependencies`, `areas`, `customTypes`, `notes`: each, if
  present, must be an array (items not inspected).
- Request body limit: 25 MB by default (setting `DIAGRAM_BODY_LIMIT_MB`).
- Title (separate from `content.name`): trimmed, 1 to 200 chars.

The editor sends content using the diagram's real ids, never the renumbered export ids,
because re-sync and drift detection rely on stable ids. It sends the diagram with dates
turned to ISO strings and `undefined` values removed. Only these parts count as saved
content: `name`, `databaseType`, `databaseEdition`, `tables`, `relationships`,
`dependencies`, `areas`, `customTypes`, `notes`. (`updatedAt` is not considered a change.)

Server API for diagrams (all need sign-in; role is looked up per project: `owner`,
`editor`, `viewer`; owner and editor can write):

| Call | Behaviour |
| --- | --- |
| `GET /` | List of diagrams the caller may see, newest first, with title, updatedAt, owner, project, role and the list numbers. Not paged for one project; otherwise default page of 100, max 500, offset up to 10,000. Viewers only see diagrams that have a published snapshot and see the published title/time/numbers. |
| `GET /:id/summary` | One list row. 404 with `not_found` or `not_published`. |
| `POST /` | Create from `{ title, content, projectId }`. Needs write access in the project. Answers 201 with the diagram. |
| `GET /:id` | Writers get the working copy (`title`, `content`, `updatedAt`, `autoPublish`, `publishedVersion`, `publishedAt`, `unpublishedChanges`). Viewers get only the latest published snapshot's title and content (404 `not_published` when none). |
| `PUT /:id` | Update `title`, `content` and/or `autoPublish`. Saving `content` requires `baseUpdatedAt` (the `updatedAt` the edit is based on). The compare and write are one statement, to the millisecond; if someone else saved since, answer 409 `conflict` with the current `updatedAt` and change nothing. Needs the edit lock (423 `locked` with the holder if another editor has it). Answers without the content. |
| `POST /:id/lock`, `DELETE /:id/lock?editorId=` | Take/renew or release the edit lock for one browser tab (`editorId` 1 to 100 chars). |
| `DELETE /:id` | Owner only. |
| `POST /:id/publish` | Make the next snapshot (optional `note` up to 500 chars). The retention default keeps the newest 200 snapshots (`SNAPSHOT_KEEP`; 0 keeps all). |
| `GET /:id/versions`, `GET /:id/versions/:version` | List (newest first, up to 500) and read a snapshot (title, content, note, publishedAt). |

Auto-publish: when enabled on a diagram, each content save also publishes a snapshot if the
content changed, marked `auto`; a new auto snapshot by the same person within a short window
rewrites the previous auto one instead of adding another.

Content hash: SHA-256 (hex) of the canonical JSON of `{ title, content }` where object keys
are sorted recursively and the top-level `updatedAt` of the content is left out. Used to say
whether the working copy differs from the latest snapshot ("unpublished changes").

Other server features read the same content: drift detection and lint take `tables[].fields`
(id, name, `type.name`, primaryKey, unique, nullable, increment, isArray,
characterMaximumLength, precision, scale, default, comments), `tables[].indexes` (id, name,
unique, fieldIds), `relationships` (ids, name, sourceTableId, targetTableId, sourceFieldId,
targetFieldId), plus table `schema`, `isView`, `comments`. Share links and the read-only
viewer use the published snapshot content; the viewer is tolerant: it skips tables without a
string `id`, uses defaults for missing names (a localized "unnamed table"), places tables
without coordinates on a grid (4 per row, steps 320 by 360), default colour `#8eb7ff`, and
skips relationships pointing at unknown tables.

### 6.3 Binding a local diagram to a server diagram

Local id and server id differ. The browser remembers the mapping (section 7). Opening a
server diagram makes a local copy with a fresh local id:

1. Revive `createdAt`/`updatedAt` (an unparsable value becomes "now"), set `id` to the local
   id and `name` to the server title.
2. Validate with the strict diagram shape (section 3). If it fails, the server copy "could
   not be read" and nothing is created.
3. Store locally and record mapping, project and the server `updatedAt` as the base for later
   saves.

A later open refreshes the local copy only when the server is newer AND the local copy holds
nothing the server lacks (a viewer's copy never does; an editor's copy qualifies when it
still equals the last content known to match the server).

## 7. Per-browser side data (localStorage / sessionStorage)

All keys start with `qbase.` (except `uuid`) and all values are JSON. Every read and write
must tolerate storage being blocked or the value being malformed (treat as empty).

| Key | Storage | Value | Purpose |
| --- | --- | --- | --- |
| `uuid` | local | string (8 chars) | Workspace prefix for local diagram ids (4.1). |
| `qbase.remote-map` | local | object `{ localDiagramId: serverDiagramId }` | Which server diagram a local diagram is bound to. |
| `qbase.remote-project` | local | object `{ localDiagramId: projectId }` | Project a bound diagram lives in. |
| `qbase.remote-version` | local | object `{ localDiagramId: updatedAt ISO string }` | Server `updatedAt` the local copy was last in sync with; sent as `baseUpdatedAt` on every save. |
| `qbase.synced-content` | local | object `{ localDiagramId: fingerprint string }` | Fingerprint of the last content known to equal the server's. |
| `qbase.sent-content` | session | object `{ localDiagramId: [fingerprint, ...] }` (at most 5) | Contents sent whose reply may have been lost, to avoid a false "someone else saved" conflict. |
| `qbase.sync-state` | local | object `{ localDiagramId: SyncState }` | What re-sync from a live database needs: `dialect` (`postgresql` or `sqlserver`), `source` (a saved connection id, or inline connection details WITHOUT the password), the selected `tables` and `schemas`, `sourceKeys` (maps from diagram table ids / column ids to names at the source), `lastSyncedAt`. |
| `qbase.sync-state-handoff` | local | object `{ serverDiagramId: SyncState }` | Holds a SyncState while "Get latest" replaces a local copy. |
| `qbase.lint-config` | local | object | Lint rule settings. |
| `qbase.custom-colors` | local | array of `#rrggbb` | 4.5. |
| `qbase.admin-landed` | local | marker | Admin landing page seen. |
| `qbase.local-owner` | local | user id string | 2.7. |

Fingerprint: the content serialised with object keys sorted, without the top-level
`updatedAt`, reduced to `<length>:<hex FNV-1a 32-bit hash>`. It is only ever compared with
another fingerprint, never read back, so any stable scheme is acceptable in a rewrite (old
stored values will simply count as "unknown", which is safe).

Autosave to the server: after the last edit the editor waits 10 seconds, then sends; never
two sends at once; a change made while sending is sent right after; after a failure the
change stays pending and is retried on the next edit or flush.

## 8. Legacy and older shapes the editor accepts or migrates

| Older shape | Where it can appear | How it is handled |
| --- | --- | --- |
| Field `type` is a plain string | Local DB before version 2 | Upgrade v2: `{ id: string with spaces replaced by "_", name: string }`. Exported files/server content never had this. |
| Field `nullable` as string `"true"`/`"false"` | Local DB before version 9 | Upgrade v9: convert to boolean (case-insensitive compare to `"true"`). |
| Relationship `type` string | Local DB before version 6 | Upgrade v6: `one_to_one` -> one/one; `one_to_many` -> one/many; `many_to_one` -> many/one; `many_to_many` -> one/many; missing -> one/one. `type` removed. |
| Relationship cardinalities both `many` | Local DB, exported files, server content, older editor | Normalised to source `one`, target `many` at upgrade v14 and again whenever a relationship is read through the diagram shape (import, server open). |
| Table `comment` (index name only) | Local DB | The real field is `comments`; no data rename ever happened. |
| `config` row contents | Local DB before version 12 | Wiped at v12; recreated empty-defaulted. |
| Database name `QubdiDB` | Old browsers | Merged into `QBase` (2.6). |
| Diagram without `tables`/`relationships`/`dependencies`/`areas`/`customTypes`/`notes` | Old exports, server content | Treated as empty. |
| Missing optional values or `null` | Everywhere | Treated as not set. |
| Export file name `ChartDB(...)` | Files from the pre-QBase editor | Same JSON shape; opens with the normal import. |
| Table row has extra `diagramId` | Server content saved by the old editor | Ignored on read. |

No "format version" key exists anywhere, so the new editor must keep detecting by shape.
Any new field it adds must be optional and ignorable by the old rules (old editors would drop
it on import since unknown keys are stripped).

## 9. Compatibility rules for the rewrite (summary)

1. Open the existing IndexedDB `QBase` (and merge `QubdiDB`) at version 140 or higher without
   data loss; run the upgrade steps of 2.3 for older versions.
2. Read and write the diagram JSON of section 3 exactly (keys, enum values, string vs number
   types, ISO dates for the diagram, ms numbers for the rest).
3. Accept optional-or-null everywhere; reject files that miss a required key or have a wrong
   type or an unknown enum value.
4. Keep ids stable when talking to the server; renumber only in exported files.
5. Send `baseUpdatedAt` on every content save and handle 409 and 423.
6. Do not rely on array order of `tables`; do rely on `fields` and `indexes` order.

## 10. Open questions for the owner

1. Do you want to keep the file name `QBase(<name>).json` and also accept files whose name
   starts with `ChartDB(`? (The shape is identical; this is only about naming.)
2. Should exported files get a `format` / `version` key from now on (for example
   `"qbaseFormat": 1`)? Today there is none; adding one is safe for the new editor but older
   editors would drop it. This decides how we can evolve the format later.
3. Strict import: today one bad key makes the whole file fail with a generic error. Keep, or
   make the new editor repair what it can (and say what it repaired)?
4. Table order: the array order of `tables` is not defined and the `order` number is only
   partly used. Should the new editor define one rule (sort by `order`, then name) and write
   `order` for every table?
5. Should the stray `diagramId` key that leaks into server content from table rows be
   removed on the next save (cleaner) or left alone (no change in server data)?
6. Many-to-many: the old editor silently turns it into one-to-many. Keep this silent
   conversion, or warn the person when an import changes a relationship?
7. Filter and config are local only; should the diagram filter move into the diagram (so it
   travels with the file and the server copy)?
8. `characterMaximumLength` is a string and `"null"` can appear: should the new format store
   a number (or null) and convert on read, or keep the string for compatibility with
   existing data and drift detection?
9. Keep the legacy `field.check` (single column-level check) in the model, or only table-level
   check constraints?
10. Should a new database use the same Dexie-compatible layout (one store per child type), or
    may the new editor store one document per diagram and convert on first start? A single
    document is simpler and faster to save, but needs a one-time migration and a plan for
    rollback.
11. The index `type` list contains SQL Server and other values the editor never offers; keep
    accepting them all (needed to open imports) and keep the UI limited to PostgreSQL/
    CockroachDB `btree`, `hash`, `gin`?
12. Local diagram ids embed a per-browser prefix; is that still wanted (it avoids collisions
    between browsers sharing one account), or should the new editor use plain UUIDs for new
    diagrams while still opening the old ones?
13. Direction of a relationship: I could not confirm from the stored types alone which side
    the canvas draws the arrowhead on; the manual test script should check source/target on
    the running `main` before the new editor fixes the meaning.
