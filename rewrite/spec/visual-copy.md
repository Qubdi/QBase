# Visible English text of the old editor, with the new editor's current wording

Status: captured from the running old editor (local-only mode) in light theme at 1280 x 800 and, for the
phone-only screens, at 390 x 844, by reading the visible text, aria labels, placeholders, titles and image
alt text of 134 scenes (`tools/e2e/visual/shell-scenes.mjs`). Dark theme scenes carry the same wording.
Capitalisation is exactly as shown. Nothing was read from the old source code.

How to read the tables: "Element" is the role or tag that carries the text (or the kind of attribute: aria-label,
placeholder, title tooltip, image alt, screen-reader text). "Old text" is what the old editor shows. The last
column compares with the new editor's current English in `src/i18n/editor/*.ts`, `src/i18n/canvas-strings.ts`,
`src/i18n/qubdi/*.ts` and `src/i18n/locales/en.ts`: "same" means the exact string (same capitals) exists
there; "differs" gives the closest new string by similarity when there is one. A "same" does not prove the new
editor shows it in the same place; it only shows that the string exists. A text is listed once, in the first
screen where it appears (the screen order is the scene order of the harness).

## A. Systematic differences

| Area | Old | New editor today |
|---|---|---|
| Capitalisation of control labels | Title Case: "Add Table", "Add Field", "Add Index", "Filter Tables", "Zoom In", "Auto Arrange Diagram", "Create Relationship", "Export SQL", "Delete Table" | sentence case: "Add table", "Filter tables", "Zoom in", "Auto arrange diagram", "Create relationship" |
| Rail labels | New, Open, Tables, DBML, Refs, Custom Types, Visuals | New, Open, Tables, DBML, Links, Types, Extras |
| Top menu items | Actions: Import, Export SQL, Export as, Delete. Edit: Undo, Redo, Clear. View: Hide Sidebar, Hide Cardinality, Hide Field Attributes, Compact Tables, Hide Mini Map, Zoom on Scroll, Database Views, Theme. Backup: Export Diagram, Restore Diagram | descriptive phrases such as "Import from", "Save as", "Delete this diagram", "Empty the diagram", "Side panel", "Relationship cardinality", "Minimap", "Mouse wheel", "Color theme", "Export diagram", "Restore diagram" |
| Shortcut hints | "Ctrl+B", "Ctrl+M", "Ctrl+Z", "Ctrl+Shift+Z" shown at the right of the item | described in words ("Show or hide the side panel", "Undo") in a shortcuts list |
| Toggle wording | "Hide X" / "Show X", "Compact Tables" / "Standard Tables" | state names ("Compact tables") without the Hide / Show pairs |
| Default diagram name | "Diagram 1" | "Diagram {{number}}" in the editor strings (same pattern) and "Untitled diagram" in the older qubdi strings |
| Saved mark | accessible name "Saved just now", browser tooltip adds date and time | "Everything is saved" toast text, different labels |
| Table form sections | Fields, Indexes, Check Constraints, Description | see side-panel strings |
| Empty states | "No tables / Create a table to get started"; "No relationships / Create a relationship to get started"; "No custom types / Custom types will appear here when they are available in your database"; "No areas / Create an area to get started"; "No Notes / Create a note to add text annotations" | different sentences, "No Notes" capital N is an old inconsistency |
| Dialog wording | "What is your Database?", "Open Database", "Clear Diagram", "Delete Diagram", "Import Diagram", "Export Diagram", "Export Image", "Create Relationship", "Change Schema" | different titles |
| Copy failure toast | "Copy failed" with "Something went wrong. Please try again." | same text (match) |

## B. Screen by screen inventory

The first block is the editor frame (navbar, rail, empty Tables panel, canvas chrome, footer), shown once.

### editor-empty

| Element | Old text | New editor today |
|---|---|---|
| menuitem | Actions | same |
| menuitem | Edit | same |
| menuitem | View | same |
| menuitem | Backup | same |
| image alt | database | differs; nearest new text: "Database" |
| h1 | Diagram 1 | differs; nearest new text: "Diagram" |
| aria-label (img) | Saved just now | differs; nearest new text: "just now" |
| title (tooltip) | Saved just now (browser tooltip adds the date and time on a second line) | differs; no equivalent found |
| button | Lint | same |
| screen-reader text | Change language | same |
| div | New | same |
| div | Open | same |
| div | Tables | same |
| div | DBML | same |
| div | Refs | differs; nearest new text: "Refresh" |
| div | Custom | same |
| div | Types | same |
| div | Visuals | differs; no equivalent found |
| placeholder | Filter | same |
| button | Add Table | differs; nearest new text: "Add table" |
| aria-label (img) | Empty state | differs; nearest new text: "Empty note" |
| div | No tables | same |
| div | Create a table to get started | same |
| aria-label (div) | Control Panel | differs; no equivalent found |
| aria-label (button) | Snap to Grid (Hold Shift) | differs; no equivalent found |
| aria-label (button) | Highlight Overlapping Tables | differs; nearest new text: "Highlight overlapping tables" |
| aria-label (button) | Filter Tables | differs; nearest new text: "Filter tables" |
| aria-label (button) | Show All | differs; nearest new text: "Show all" |
| aria-label (button) | Zoom Out | differs; nearest new text: "Zoom out" |
| aria-label (button) | Zoom In | differs; nearest new text: "Zoom in" |
| aria-label (button) | Auto Arrange Diagram | differs; nearest new text: "Auto arrange diagram" |
| aria-label (button) | Undo | same |
| aria-label (button) | Redo | same |
| button | Type colours | same |
| span | Powered by | same |
| aria-label (span) | Qubdi | differs; no equivalent found |

### New diagram dialog (first visit)

| Element | Old text | New editor today |
|---|---|---|
| h2 | What is your Database? | differs; no equivalent found |
| p | Each database has its own unique features and capabilities. | differs; no equivalent found |
| tab | Transactional | differs; nearest new text: "translation" |
| tab | Analytical | differs; no equivalent found |
| aria-label (radio) | Toggle bold | differs; no equivalent found |
| image alt | MySQL | differs; nearest new text: "MySQL 5.7" |
| image alt | PostgreSQL | differs; no equivalent found |
| image alt | MariaDB | differs; no equivalent found |
| image alt | SQLite | differs; nearest new text: "SQL script" |
| image alt | SQL Server | differs; no equivalent found |
| image alt | Oracle | differs; no equivalent found |
| span | More Databases | differs; nearest new text: "Database" |
| div | Check Examples | differs; nearest new text: "Check failed" |
| button | Import from File | differs; nearest new text: "Import from" |
| button | Empty database | differs; nearest new text: "Import from database" |
| button | Continue | same |

### New diagram dialog, Analytical tab

| Element | Old text | New editor today |
|---|---|---|
| image alt | ClickHouse | differs; nearest new text: "Close" |

### New diagram dialog, More Databases

| Element | Old text | New editor today |
|---|---|---|
| image alt | CockroachDB | differs; no equivalent found |
| span | Primary Databases | differs; nearest new text: "Primary table" |

### New diagram dialog on the phone

| Element | Old text | New editor today |
|---|---|---|
| span | QBase | differs; nearest new text: "QBase home" |
| div | Examples | differs; nearest new text: "Expires" |

### import-database-smart-query

| Element | Old text | New editor today |
|---|---|---|
| h2 | Import your Database | differs; nearest new text: "Import from database" |
| p | Database Edition: | differs; nearest new text: "Database drift" |
| radio | Regular | differs; nearest new text: "Singular" |
| radio | Supabase | same |
| radio | Timescale | same |
| p | How would you like to import? | differs; no equivalent found |
| radio | Smart Query | differs; nearest new text: "Search users" |
| image alt | query | differs; nearest new text: "users" |
| radio | SQL Script | differs; nearest new text: "SQL script" |
| div | Instructions: | differs; nearest new text: "Actions" |
| div | Run this script in your database: | differs; no equivalent found |
| tab | DB Client | differs; no equivalent found |
| tab | PSQL | differs; no equivalent found |
| span | /* PostgreSQL edition */ | differs; no equivalent found |
| span | WITH | differs; no equivalent found |
| span | fk_info | differs; no equivalent found |
| span | SELECT | differs; no equivalent found |
| span | array_to_string | differs; no equivalent found |
| span | array_agg | differs; no equivalent found |
| span | CONCAT | differs; no equivalent found |
| span | '{"schema":"' | differs; no equivalent found |
| span | replace | differs; nearest new text: "Create" |
| span | schema_name | differs; nearest new text: "New schema name" |
| span | '"' | differs; no equivalent found |
| span | ',"table":"' | differs; no equivalent found |
| span | table_name | differs; nearest new text: "Table name" |
| span | text | differs; nearest new text: "Next" |
| span | ',"column":"' | differs; no equivalent found |
| span | fk_column | differs; no equivalent found |
| span | ',"foreign_key_name":"' | differs; no equivalent found |
| span | foreign_key_name | differs; nearest new text: "Foreign key" |
| span | ',"reference_schema":"' | differs; nearest new text: "references" |
| span | COALESCE | differs; no equivalent found |
| span | reference_schema | differs; nearest new text: "references" |
| span | 'public' | differs; no equivalent found |
| span | ',"reference_table":"' | differs; nearest new text: "Referenced table" |
| span | reference_table | differs; nearest new text: "Referenced table" |
| span | ',"reference_column":"' | differs; no equivalent found |
| span | reference_column | differs; nearest new text: "references" |
| span | ',"fk_def":"' | differs; no equivalent found |
| span | fk_def | differs; no equivalent found |
| span | '"}' | differs; no equivalent found |
| span | ',' | differs; no equivalent found |
| span | fk_metadata | differs; no equivalent found |
| p | Paste the script result into this modal → | differs; nearest new text: "Paste the result of the query here" |
| div | Smart Query Output | differs; no equivalent found |
| button | Back | same |
| button | Need help? Watch how | differs; no equivalent found |
| button | Import | same |

### import-database-sql-script

| Element | Old text | New editor today |
|---|---|---|
| div | Install pg_dump. | differs; no equivalent found |
| div | Execute the following command in your terminal (prefix with sudo on Linux if needed): | differs; no equivalent found |
| title (tooltip) | Click to collapse the range. | differs; no equivalent found |
| span | pg_dump | differs; no equivalent found |
| span | <host> | differs; nearest new text: "Host" |
| span | <port> | differs; nearest new text: "Import" |
| span | <database_name> | differs; nearest new text: "Database" |
| span | -U <username> | differs; no equivalent found |
| span | UTF-8 | differs; nearest new text: "en_US.UTF-8" |
| span | -f <output_file_path> | differs; no equivalent found |
| div | Example: | differs; no equivalent found |
| span | localhost | differs; nearest new text: "./locales/*.ts" |
| span | my_db | differs; no equivalent found |
| span | -U postgres | differs; no equivalent found |
| span | -f schema_export.sql | differs; no equivalent found |
| div | Open the exported SQL file, copy its contents, and paste them here. | differs; no equivalent found |

### import-database-dbml

| Element | Old text | New editor today |
|---|---|---|
| div | Paste your DBML (Database Markup Language) schema definition here → | differs; no equivalent found |
| span | Table | same |
| span | users | same |
| span | int | differs; nearest new text: "Lint" |
| span | username | differs; nearest new text: "Rename" |
| span | varchar | differs; no equivalent found |
| span | email | differs; nearest new text: "Email" |
| span | posts | differs; nearest new text: "Host" |
| span | user_id | differs; nearest new text: "users" |
| span | ref: > users.id | differs; no equivalent found |
| span | title | differs; nearest new text: "items" |
| span | content | differs; nearest new text: "Consistent" |
| div | DBML Script | differs; nearest new text: "SQL script" |

### phone-drawer

| Element | Old text | New editor today |
|---|---|---|
| screen-reader text | Close | same |
| h2 | Sidebar | differs; no equivalent found |
| p | Displays the mobile sidebar. | differs; no equivalent found |

### phone-manage-diagram

| Element | Old text | New editor today |
|---|---|---|
| h2 | Manage Diagram | differs; nearest new text: "Diagram" |
| p | Manage your diagram objects | differs; no equivalent found |
| div | View all Options... | differs; no equivalent found |

### phone-manage-diagram-section-list

| Element | Old text | New editor today |
|---|---|---|
| span | Areas | same |
| span | Custom Types | differs; nearest new text: "Custom types" |

### phone-manage-diagram-table

| Element | Old text | New editor today |
|---|---|---|
| label | table_1 | differs; nearest new text: "Table" |
| div | public | differs; no equivalent found |
| title (tooltip) | 1 fields | differs; nearest new text: "No fields" |
| span | bigint | differs; nearest new text: "Sign in" |
| title (tooltip) | Not null | same |
| aria-label (svg) | More actions | same |
| aria-label (svg) | Edit name | same |
| aria-label (svg) | Focus on the canvas | same |
| div | Fields | same |
| placeholder | Name | same |
| button | Add Field | differs; nearest new text: "Add field" |
| div | Indexes | same |
| div | Check Constraints | differs; nearest new text: "Check constraints" |
| div | Description | same |
| aria-label (button) | Change color | same |
| button | Add Index | differs; nearest new text: "Add index" |

### phone-navbar-language

| Element | Old text | New editor today |
|---|---|---|
| div | English | differs; no equivalent found |

### phone-menu-view

| Element | Old text | New editor today |
|---|---|---|
| menuitem | Show Sidebar | differs; nearest new text: "Show all" |
| span | Ctrl+B | differs; nearest new text: "Ctrl" |
| menuitem | Hide Cardinality | differs; nearest new text: "Cardinality" |
| menuitem | Hide Field Attributes | differs; nearest new text: "Field attributes" |
| menuitem | Compact Tables | differs; nearest new text: "Compact tables" |
| menuitem | Hide Mini Map | differs; nearest new text: "Minimap" |
| menuitem | Zoom on Scroll | differs; no equivalent found |
| menuitem | Database Views | differs; nearest new text: "Database views" |
| span | Theme | differs; no equivalent found |
| span | Ctrl+M | differs; nearest new text: "Ctrl" |

### menu-actions

| Element | Old text | New editor today |
|---|---|---|
| menuitem | Export SQL | differs; nearest new text: "Export SQL for" |
| menuitem | Export as | differs; nearest new text: "Exports" |
| menuitem | Delete | same |

### menu-edit

| Element | Old text | New editor today |
|---|---|---|
| span | Ctrl+Z | differs; nearest new text: "Ctrl" |
| span | Ctrl+Shift+Z | differs; no equivalent found |
| menuitem | Clear | differs; nearest new text: "Color" |

### menu-view

| Element | Old text | New editor today |
|---|---|---|
| menuitem | Hide Sidebar | differs; no equivalent found |

### menu-backup

| Element | Old text | New editor today |
|---|---|---|
| menuitem | Export Diagram | differs; nearest new text: "Export diagram" |
| menuitem | Restore Diagram | differs; nearest new text: "Restore diagram" |

### menu-actions-export-as

| Element | Old text | New editor today |
|---|---|---|
| menuitem | PNG | differs; no equivalent found |
| menuitem | JPG | differs; no equivalent found |
| menuitem | SVG | differs; no equivalent found |
| menuitem | JSON | differs; no equivalent found |

### menu-view-theme

| Element | Old text | New editor today |
|---|---|---|
| menuitemcheckbox | System | differs; no equivalent found |
| menuitemcheckbox | Light | same |
| menuitemcheckbox | Dark | same |

### menu-view-zoom-on-scroll

| Element | Old text | New editor today |
|---|---|---|
| menuitemcheckbox | On | differs; nearest new text: "Open" |
| menuitemcheckbox | Off | same |

### language-list

| Element | Old text | New editor today |
|---|---|---|
| placeholder | Search... | differs; nearest new text: "Search tables..." |
| aria-label (listbox) | Suggestions | differs; nearest new text: "Sessions" |
| span | (English) | differs; no equivalent found |
| span | Français | differs; no equivalent found |
| span | (French) | differs; no equivalent found |
| span | Deutsch | differs; no equivalent found |
| span | (German) | differs; no equivalent found |
| span | Español | differs; no equivalent found |
| span | (Spanish) | differs; no equivalent found |
| span | Українська | differs; no equivalent found |
| span | (Ukrainian) | differs; no equivalent found |
| span | Русский | differs; no equivalent found |
| span | (Russian) | differs; no equivalent found |
| span | Türkçe | differs; no equivalent found |
| span | (Turkish) | differs; no equivalent found |
| span | Hrvatski | differs; no equivalent found |
| span | (Croatian) | differs; nearest new text: "Creating…" |
| span | Português | differs; nearest new text: "Port" |
| span | (Portuguese) | differs; no equivalent found |
| span | हिन्दी | differs; no equivalent found |
| span | (Hindi) | differs; no equivalent found |
| span | 日本語 | differs; no equivalent found |
| span | (Japanese) | differs; no equivalent found |
| span | 한국어 | differs; no equivalent found |
| span | (Korean) | differs; no equivalent found |
| span | 简体中文 | differs; no equivalent found |
| span | (Chinese (Simplified)) | differs; no equivalent found |
| span | 繁體中文 | differs; no equivalent found |
| span | (Chinese (Traditional)) | differs; no equivalent found |
| span | नेपाली | differs; no equivalent found |
| span | (Nepali) | differs; no equivalent found |
| span | मराठी | differs; no equivalent found |
| span | (Marathi) | differs; no equivalent found |
| span | Indonesia | differs; nearest new text: "Indexes" |
| span | (Indonesian) | differs; no equivalent found |
| span | తెలుగు | differs; no equivalent found |
| span | (Telugu) | differs; no equivalent found |
| span | বাংলা | differs; no equivalent found |
| span | (Bengali) | differs; no equivalent found |
| span | ગુજરાતી | differs; no equivalent found |
| span | (Gujarati) | differs; no equivalent found |
| span | Tiếng Việt | differs; no equivalent found |
| span | (Vietnamese) | differs; no equivalent found |
| span | العربية | differs; no equivalent found |
| span | (Arabic) | differs; no equivalent found |

### lint-panel

| Element | Old text | New editor today |
|---|---|---|
| h2 | Schema lint (0 errors, 0 warnings, 0 info) | differs; no equivalent found |
| aria-label (button) | Lint settings | same |
| aria-label (button) | Close lint | same |
| p | No problems found. | same |

### tables-type-select-open

| Element | Old text | New editor today |
|---|---|---|
| span | boolean | differs; nearest new text: "Boolean" |
| span | date | differs; nearest new text: "Updated" |
| span | timestamp | differs; no equivalent found |
| span | timestamptz | differs; no equivalent found |
| span | varchar (n) | differs; no equivalent found |
| span | json | differs; no equivalent found |
| span | jsonb | differs; no equivalent found |
| span | numeric (p, s) | differs; no equivalent found |
| span | serial | differs; nearest new text: "User disabled" |
| span | uuid | differs; no equivalent found |
| span | bigserial | differs; no equivalent found |
| span | bit | differs; no equivalent found |
| span | box | differs; no equivalent found |
| span | bytea | differs; no equivalent found |
| span | char (n) | differs; no equivalent found |
| span | cidr | differs; no equivalent found |
| span | circle | differs; no equivalent found |
| span | daterange | differs; no equivalent found |
| span | double precision | differs; nearest new text: "Precision" |
| span | enum | differs; nearest new text: "Enum" |
| span | inet | differs; nearest new text: "Lint" |
| span | int4range | differs; no equivalent found |
| span | int8range | differs; no equivalent found |
| span | interval | differs; no equivalent found |
| span | line | differs; no equivalent found |
| span | lseg | differs; nearest new text: "Close" |
| span | macaddr | differs; no equivalent found |
| span | macaddr8 | differs; no equivalent found |
| span | money | differs; nearest new text: "Someone" |
| span | numrange | differs; nearest new text: "Auto arrange" |
| span | oid | differs; nearest new text: "Copied" |
| span | path | differs; no equivalent found |
| span | point | differs; nearest new text: "Lint" |
| span | polygon | differs; no equivalent found |
| span | real | differs; nearest new text: "Areas" |
| span | regclass | differs; nearest new text: "Areas" |
| span | regconfig | differs; no equivalent found |
| span | regdictionary | differs; nearest new text: "Section" |
| span | regnamespace | differs; nearest new text: "Rename type" |
| span | regoper | differs; no equivalent found |
| span | regoperator | differs; no equivalent found |
| span | regproc | differs; no equivalent found |
| span | regprocedure | differs; no equivalent found |
| span | regrole | differs; no equivalent found |
| span | regtype | differs; nearest new text: "type" |
| span | smallint | differs; no equivalent found |
| span | smallserial | differs; no equivalent found |
| span | time | differs; nearest new text: "Active" |
| span | timetz | differs; no equivalent found |
| span | tsquery | differs; nearest new text: "Database query" |
| span | tsrange | differs; nearest new text: "Auto arrange" |
| span | tstzrange | differs; no equivalent found |
| span | tsvector | differs; no equivalent found |
| span | user-defined | differs; no equivalent found |
| span | varbit | differs; no equivalent found |
| span | xml | differs; no equivalent found |

### tables-field-attributes

| Element | Old text | New editor today |
|---|---|---|
| div | Field Attributes | differs; nearest new text: "Field attributes" |
| label | Unique | same |
| label | Auto Increment | differs; nearest new text: "Auto increment" |
| label | Array | same |
| label | Default Value | differs; nearest new text: "Default value" |
| placeholder | No default | same |
| placeholder | No description | same |
| button | Delete Field | differs; nearest new text: "Delete field" |

### tables-checks-open

| Element | Old text | New editor today |
|---|---|---|
| button | Add Check | differs; nearest new text: "Add check" |

### tables-color-picker

| Element | Old text | New editor today |
|---|---|---|
| aria-label (button) | Use #ff6363 | differs; no equivalent found |
| title (tooltip) | #ff6363 | differs; no equivalent found |
| aria-label (button) | Use #ff6b8a | differs; no equivalent found |
| title (tooltip) | #ff6b8a | differs; no equivalent found |
| aria-label (button) | Use #c05dcf | differs; no equivalent found |
| title (tooltip) | #c05dcf | differs; no equivalent found |
| aria-label (button) | Use #b067e9 | differs; no equivalent found |
| title (tooltip) | #b067e9 | differs; no equivalent found |
| aria-label (button) | Use #8a61f5 | differs; no equivalent found |
| title (tooltip) | #8a61f5 | differs; no equivalent found |
| aria-label (button) | Use #7175fa | differs; no equivalent found |
| title (tooltip) | #7175fa | differs; no equivalent found |
| aria-label (button) | Use #8eb7ff | differs; no equivalent found |
| title (tooltip) | #8eb7ff | differs; no equivalent found |
| aria-label (button) | Use #42e0c0 | differs; no equivalent found |
| title (tooltip) | #42e0c0 | differs; no equivalent found |
| aria-label (button) | Use #4dee8a | differs; nearest new text: "User deleted" |
| title (tooltip) | #4dee8a | differs; no equivalent found |
| aria-label (button) | Use #9ef07a | differs; no equivalent found |
| title (tooltip) | #9ef07a | differs; no equivalent found |
| aria-label (button) | Use #ffe374 | differs; no equivalent found |
| title (tooltip) | #ffe374 | differs; no equivalent found |
| aria-label (button) | Use #ff9f74 | differs; no equivalent found |
| title (tooltip) | #ff9f74 | differs; no equivalent found |
| p | Custom color | differs; nearest new text: "Pick a custom color" |
| aria-label (input) | Pick a custom color | same |
| aria-label (input) | Hex color | same |
| button | Use | same |

### tables-table-menu

| Element | Old text | New editor today |
|---|---|---|
| div | Table Actions | differs; nearest new text: "Table actions" |
| menuitem | Change Schema | differs; nearest new text: "Change schema" |
| menuitem | Duplicate Table | differs; nearest new text: "Duplicate table" |
| menuitem | Delete Table | differs; nearest new text: "Delete table" |

### tables-two-tables-collapsed

| Element | Old text | New editor today |
|---|---|---|
| div | table_2 | differs; nearest new text: "Table" |

### tables-filter-no-match

| Element | Old text | New editor today |
|---|---|---|
| div | No tables found matching your filter. | same |
| button | Clear Filter | differs; nearest new text: "Clear filter" |

### refs-panel-empty

| Element | Old text | New editor today |
|---|---|---|
| aria-label (button) | Collapse All | differs; nearest new text: "Collapse all" |
| button | Add Relationship | differs; nearest new text: "Add relationship" |
| div | No relationships | same |
| div | Create a relationship to get started | same |

### custom-types-panel-empty

| Element | Old text | New editor today |
|---|---|---|
| button | New Type | differs; nearest new text: "New type" |
| div | No custom types | same |
| div | Custom types will appear here when they are available in your database | same |

### visuals-panel

| Element | Old text | New editor today |
|---|---|---|
| tab | Notes | same |
| button | Add Area | differs; nearest new text: "Add area" |
| div | No areas | same |
| div | Create an area to get started | same |

### dbml-panel

| Element | Old text | New editor today |
|---|---|---|
| span | "public" | differs; no equivalent found |
| span | "table_1" | differs; no equivalent found |
| span | "id" | differs; no equivalent found |
| span | pk, not null | differs; nearest new text: "Not null" |

### dialog-open-diagram

| Element | Old text | New editor today |
|---|---|---|
| h2 | Open Database | differs; nearest new text: "Database" |
| p | Select a diagram to open from the list below. | differs; no equivalent found |
| th | Created at | differs; nearest new text: "Create" |
| th | Last modified | differs; no equivalent found |
| button | Cancel | same |
| button | New Database | differs; nearest new text: "Database" |

### menu-actions-import

| Element | Old text | New editor today |
|---|---|---|
| menuitem | .json | differs; no equivalent found |
| menuitem | SQL | differs; no equivalent found |

### dialog-import-SQL

| Element | Old text | New editor today |
|---|---|---|
| h2 | Import to Current Diagram | differs; nearest new text: "import into this diagram" |

### dialog-import-json

| Element | Old text | New editor today |
|---|---|---|
| h2 | Import Diagram | differs; nearest new text: "Export diagram" |
| p | Import a diagram from a JSON file. | differs; no equivalent found |
| p | Drag and drop a file here or click to select | differs; nearest new text: "Drop a file here, or click to choose one" |
| p | Supported types: .json | differs; no equivalent found |

### dialog-export-sql

| Element | Old text | New editor today |
|---|---|---|
| p | Export your diagram schema to PostgreSQL script | differs; no equivalent found |
| span | CREATE | differs; no equivalent found |
| span | SCHEMA | differs; no equivalent found |
| span | NOT | differs; no equivalent found |
| span | EXISTS | differs; no equivalent found |
| span | "public"; | differs; no equivalent found |
| span | TABLE | differs; no equivalent found |
| span | "public"."table_1" | differs; no equivalent found |
| span | "id" bigint | differs; no equivalent found |
| span | NULL | differs; nearest new text: "NOT NULL" |
| span | PRIMARY | differs; no equivalent found |
| span | KEY | differs; no equivalent found |

### dialog-export-sql-empty-error

| Element | Old text | New editor today |
|---|---|---|
| label | Error generating SQL script. Please try again later or . | differs; no equivalent found |
| a | contact us | differs; nearest new text: "status" |

### dialog-clear

| Element | Old text | New editor today |
|---|---|---|
| h2 | Clear Diagram | differs; nearest new text: "Create diagram" |
| p | This action cannot be undone. This will permanently delete all the data in the diagram. | differs; no equivalent found |

### dialog-delete

| Element | Old text | New editor today |
|---|---|---|
| h2 | Delete Diagram | differs; nearest new text: "Delete area" |
| p | This action cannot be undone. This will permanently delete the diagram. | differs; no equivalent found |

### type-colours-popover

| Element | Old text | New editor today |
|---|---|---|
| span | Text / other | same |
| span | varchar, text, char | differs; no equivalent found |
| span | number | differs; nearest new text: "A number" |
| span | Number | same |
| span | int, bigint, numeric, float | differs; no equivalent found |
| span | Date & time | same |
| span | date, time, timestamp, interval | differs; no equivalent found |
| span | Identifier | same |
| span | uuid, guid, objectid | differs; no equivalent found |
| span | bool | differs; no equivalent found |
| span | Boolean | same |
| span | bool, boolean, bit | differs; no equivalent found |
| span | JSON / XML | same |
| span | json, jsonb, xml | differs; no equivalent found |

### page-examples

| Element | Old text | New editor today |
|---|---|---|
| h2 | A collection of examples to help you get started with QBase. | differs; no equivalent found |
| h2 | Click on one 😀 | differs; no equivalent found |
| label | Employees schema | differs; nearest new text: "No schema" |
| div | A schema for database of employees, departments, and salaries. | differs; no equivalent found |
| label | Bike stores schema | differs; no equivalent found |
| div | A schema for database of bike stores, brands, categories, and customers. | differs; no equivalent found |
| label | DVD Rental schema | differs; nearest new text: "Select schema" |
| div | A schema for database of a DVD rental store, including customers, films, actors, staff, and stores. | differs; no equivalent found |

### page-templates

| Element | Old text | New editor today |
|---|---|---|
| h1 | Database schema templates | differs; nearest new text: "QBase - Database schema diagrams" |
| h2 | Discover a collection of real-world database schema diagrams , featuring example applications and popular open-source projects. | differs; no equivalent found |
| span | Featured | differs; nearest new text: "Required" |
| span | All Templates | differs; nearest new text: "All schemas" |
| h4 | Tags | differs; nearest new text: "Tables" |
| span | Pokemon | differs; no equivalent found |
| span | Example Apps | differs; no equivalent found |
| span | Postgres | differs; nearest new text: "Notes" |
| span | Open Source | differs; nearest new text: "Open workspace" |
| span | WordPress | differs; no equivalent found |
| span | PHP | differs; no equivalent found |
| span | Django | differs; no equivalent found |
| span | Python | differs; no equivalent found |
| span | Laravel | differs; no equivalent found |
| span | Visual Novel Database | differs; no equivalent found |
| span | Node.js | differs; nearest new text: "Notes" |
| span | SaaS | differs; no equivalent found |
| span | Rails | differs; nearest new text: "Rules" |
| span | CMS | differs; no equivalent found |
| span | Symfony | differs; no equivalent found |
| image alt | Employees | differs; no equivalent found |
| div | Employees, departments, and salaries | differs; no equivalent found |
| div | Pokemon information | differs; no equivalent found |
| image alt | Airbnb | differs; no equivalent found |
| div | Short-term Vacation Rentals | differs; no equivalent found |
| div | An open-source PHP Content Management System | differs; no equivalent found |
| div | High-level Python web framework | differs; no equivalent found |
| div | PHP web framework | differs; no equivalent found |
| image alt | Twitter Database | differs; nearest new text: "Database" |
| div | Social media platform clone application | differs; no equivalent found |
| image alt | Adonis Acl Database | differs; no equivalent found |
| div | Role based permissions | differs; no equivalent found |
| image alt | Akaunting | differs; nearest new text: "Warning" |
| div | Online Accounting Software | differs; no equivalent found |
| image alt | Laravel Spark | differs; no equivalent found |
| div | Recurring billing solution for Laravel | differs; no equivalent found |
| image alt | Voyager | differs; no equivalent found |
| div | The Missing Admin for Laravel | differs; no equivalent found |
| image alt | Koel \| koel.dev | differs; no equivalent found |
| div | Music streaming server | differs; no equivalent found |
| image alt | Laravel Permission | differs; nearest new text: "Live sessions" |
| div | Roles and Permission For Laravel | differs; no equivalent found |
| image alt | Gravity | differs; no equivalent found |
| div | Node.js SaaS Boilerplate | differs; no equivalent found |
| image alt | Ticketit | differs; no equivalent found |
| div | A simple helpdesk tickets system for Laravel | differs; no equivalent found |
| image alt | Lobsters | differs; nearest new text: "users" |
| div | Computing-focused community centered | differs; no equivalent found |
| image alt | Refinerycms | differs; no equivalent found |
| div | Ruby on Rails - Content management system | differs; no equivalent found |
| image alt | BuddyPress | differs; no equivalent found |
| div | Social networking plugin for WordPress | differs; no equivalent found |
| image alt | Snipe-It | differs; no equivalent found |
| div | Free open source IT asset management | differs; no equivalent found |
| image alt | Comfortable Mexican Sofa | differs; no equivalent found |
| div | Rails CMS - ComfortableMexicanSofa | differs; no equivalent found |
| image alt | Sylius | differs; no equivalent found |
| div | eCommerce framework | differs; no equivalent found |
| image alt | Monica | differs; nearest new text: "Minimap" |
| image alt | Attendize | differs; no equivalent found |
| div | Ticketing platform | differs; no equivalent found |
| image alt | SaaS Pegasus | differs; no equivalent found |
| div | Django-based SaaS template | differs; no equivalent found |
| image alt | BookStack | differs; nearest new text: "Back" |
| div | Simple & Free Wiki Software | differs; no equivalent found |
| image alt | Bouncer | differs; no equivalent found |
| div | Laravel Eloquent roles and abilities | differs; no equivalent found |
| image alt | Cabot | differs; nearest new text: "Chart" |
| div | Monitoring and alerts service | differs; no equivalent found |
| image alt | Feedbin | differs; no equivalent found |
| div | Simple RSS reader | differs; no equivalent found |
| image alt | Freescout | differs; no equivalent found |
| div | Self-Hosted Zendesk | differs; no equivalent found |
| image alt | Pythonic News | differs; no equivalent found |
| div | A Hacker News lookalike | differs; no equivalent found |
| image alt | Flarum | differs; nearest new text: "From" |
| div | Discussion platform | differs; no equivalent found |
| image alt | Canvas | differs; nearest new text: "Canvas tools" |
| div | Publishing on your own terms | differs; no equivalent found |
| image alt | Taggit | differs; no equivalent found |
| div | Simple tagging for django | differs; no equivalent found |
| image alt | Doorkeeper | differs; no equivalent found |
| div | Rails OAuth 2 provider | differs; no equivalent found |
| image alt | Orchid | differs; no equivalent found |
| div | Back-Office platform | differs; no equivalent found |
| image alt | Flipper | differs; nearest new text: "Filter" |
| div | Feature flags for Ruby | differs; no equivalent found |
| image alt | Cachet | differs; nearest new text: "Cancel" |
| div | Status page for your website | differs; no equivalent found |
| image alt | Reversion | differs; no equivalent found |
| div | Version control for model instances | differs; no equivalent found |
| image alt | Screeenly | differs; no equivalent found |
| div | Capturing high-quality website screenshots | differs; no equivalent found |
| image alt | Staytus | differs; nearest new text: "Status" |
| div | Service status publishing solution | differs; no equivalent found |
| image alt | Deployer | differs; no equivalent found |
| div | PHP application deployment tool | differs; no equivalent found |
| image alt | Devise | differs; nearest new text: "Disable" |
| div | Flexible Auth for Rails applications | differs; no equivalent found |
| image alt | Talk | differs; nearest new text: "Table" |
| div | Real-time messaging system for Laravel apps | differs; no equivalent found |
| image alt | Octobox | differs; no equivalent found |
| div | GitHub notifications Manager | differs; no equivalent found |
| image alt | Pay-Rails | differs; no equivalent found |
| div | Payments for Ruby on Rails apps | differs; no equivalent found |
| image alt | Laravel Activitylog | differs; nearest new text: "Latest activity" |
| div | Log activity inside your Laravel app | differs; no equivalent found |
| image alt | Pixelfed | differs; no equivalent found |
| div | Photo Sharing. For Everyone. | differs; no equivalent found |
| image alt | Polr | differs; nearest new text: "Port" |
| div | PHP URL shortener | differs; no equivalent found |
| image alt | Django-Axes | differs; no equivalent found |
| div | Keep track of failed login attempts | differs; no equivalent found |

### page-templates-featured

| Element | Old text | New editor today |
|---|---|---|
| h1 | Featured database schema templates | differs; nearest new text: "QBase - Database schema diagrams" |

### page-templates-tag-mysql

| Element | Old text | New editor today |
|---|---|---|
| h1 | Database schema templates for MySQL | differs; no equivalent found |
| h2 | Discover a collection of real-world database schema diagrams for , featuring example applications and popular open-source projects. | differs; no equivalent found |

### page-template-detail

| Element | Old text | New editor today |
|---|---|---|
| h2 | Unexpected Application Error! | differs; no equivalent found |
| h3 | useDiff must be used within an DiffProvider | differs; no equivalent found |
| pre | Error: useDiff must be used within an DiffProvider at Wt (http://127.0.0.1:18090/assets/diagram-provider-DCYnwY77.js:2:24255) at hn (http://127.0.0.1:18090/assets/diagram-provider-DCYnwY77.js:2:32167) at os (http://127.0.0.1:18090/assets/react-DdsHXhZu.js:8:49198) at Xc (http://127.0.0.1:18090/assets/react-DdsHXhZu.js:8:71835) at _l (http://127.0.0.1:18090/assets/react-DdsHXhZu.js:8:82728) at Zd (http://127.0.0.1:18090/assets/react-DdsHXhZu.js:8:127840) at Jd (http://127.0.0.1:18090/assets/react-DdsHXhZu.js:8:126923) at qd (http://127.0.0.1:18090/assets/react-DdsHXhZu.js:8:126762) at Fd (http://127.0.0.1:18090/assets/react-DdsHXhZu.js:8:123498) at jf (http://127.0.0.1:18090/assets/react-DdsHXhZu.js:8:135773) | differs; no equivalent found |
| p | 💿 Hey developer 👋 | differs; no equivalent found |
| p | You can provide a way better UX than this when your app throws errors by providing your own or prop on your route. | differs; no equivalent found |

### page-not-found

| Element | Old text | New editor today |
|---|---|---|
| p | Something's missing. | same |
| p | Sorry, we can't find that page. You'll find lots to explore on the home page. | differs; no equivalent found |

### dialog-create-relationship

| Element | Old text | New editor today |
|---|---|---|
| h2 | Create Relationship | differs; nearest new text: "Create relationship" |
| div | Primary Table | differs; nearest new text: "Primary table" |
| span | Select table | same |
| div | Primary Field | differs; nearest new text: "Primary field" |
| span | Select field | same |
| div | Referenced Table | differs; nearest new text: "Referenced table" |
| div | Referenced Field | differs; nearest new text: "Referenced field" |
| button | Create | same |

### custom-types-new-type

| Element | Old text | New editor today |
|---|---|---|
| div | type_1 | differs; nearest new text: "type" |
| div | Enum | same |

### custom-types-type-expanded

| Element | Old text | New editor today |
|---|---|---|
| div | Kind | same |
| div | Enum Values | differs; no equivalent found |
| div | No enum values defined | same |
| placeholder | Add enum value... | same |
| button | Highlight Fields | differs; nearest new text: "Highlight fields" |
| div | Delete Type | differs; nearest new text: "Select type" |

### visuals-areas-one

| Element | Old text | New editor today |
|---|---|---|
| div | Area 1 | differs; nearest new text: "Areas" |

### visuals-notes-empty

| Element | Old text | New editor today |
|---|---|---|
| button | Add Note | differs; nearest new text: "Add note" |
| div | No Notes | differs; nearest new text: "No notes" |
| div | Create a note to add text annotations on the canvas | same |

### visuals-notes-one

| Element | Old text | New editor today |
|---|---|---|
| span | Empty note | same |
| div | Double-click to write (Markdown format) | differs; nearest new text: "Double-click to rename" |

### filter-panel

| Element | Old text | New editor today |
|---|---|---|
| span | ( Ctrl+F ) | differs; no equivalent found |
| placeholder | Search tables... | same |
| radio | Group by Schema | differs; nearest new text: "Group by schema" |
| radio | Group by Area | differs; nearest new text: "Group by area" |

### filter-panel-group-by-area

| Element | Old text | New editor today |
|---|---|---|
| span | Ungrouped | differs; no equivalent found |

### dialog-export-image

| Element | Old text | New editor today |
|---|---|---|
| h2 | Export Image | differs; nearest new text: "Export diagram" |
| p | Choose the scale factor for export: | differs; nearest new text: "Choose the schemas and tables to import." |
| div | 4x (Best Quality) | differs; no equivalent found |
| button | Advanced Options | differs; nearest new text: "Actions" |
| button | Export | differs; nearest new text: "Exports" |

### dialog-export-image-advanced

| Element | Old text | New editor today |
|---|---|---|
| label | Include background pattern | differs; no equivalent found |
| span | Add subtle grid pattern to background. | differs; no equivalent found |
| label | Transparent background | same |
| span | Remove background color from image. | differs; no equivalent found |

### dialog-export-json

| Element | Old text | New editor today |
|---|---|---|
| p | Choose the format for export: | differs; no equivalent found |

### dbml-copy-toast

| Element | Old text | New editor today |
|---|---|---|
| div | Copy failed | same |
| div | Something went wrong. Please try again. | same |
| status | Notification Copy failed Something went wrong. Please try again. | differs; nearest new text: "Something went wrong. Please try again." |

### lint-panel-with-issues

| Element | Old text | New editor today |
|---|---|---|
| h2 | Schema lint (0 errors, 0 warnings, 2 info) | differs; no equivalent found |
| aria-label (section) | Info | same |
| h3 | Info ( 2 ) | differs; no equivalent found |
| title (tooltip) | Show on the canvas | same |
| button | Table table_1 has no relationships. | differs; nearest new text: "Delete relationship" |
| span | orphan-table | differs; nearest new text: "Compact tables" |
| button | Table table_2 has no relationships. | differs; nearest new text: "Delete relationship" |

### dialog-change-schema

| Element | Old text | New editor today |
|---|---|---|
| p | Update table "table_1" schema | differs; no equivalent found |
| button | Create new schema | same |
| button | Change | same |
