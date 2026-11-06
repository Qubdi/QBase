# Parity checklist

The rewritten editor is done when everything we decide to keep in this list works the same
way as the editor on `main`. Phase 1 fills this in by **using the app on `main`**, not by
reading its code. Each line is one observable behaviour that a person can check.

How to use it:

1. Phase 1: write each behaviour as one line. Mark it **keep**, **change** or **drop**.
   Dropping is a decision for the project owner and is recorded here.
2. Phases 3 to 8: a module is finished when its lines are ticked and each tick points at a
   test (automated where it can be) or a manual step in `rewrite/spec/manual-test-script.md`.
3. Phase 9: every **keep** line must be ticked before the release.

Status: `[ ]` open, `[x]` done and tested, `[~]` done, tested by hand only.

## Feature areas to cover

These are the areas the editor on `main` has today. The behaviour rows are in the table
below (drafted 2026-11-07 from `spec/`; the Decision column is a recommendation until the
owner signs off).

- Diagrams: create, open, rename, duplicate, delete, list, search
- Tables: add, rename, move, colour, comment, delete, drag to reorder
- Fields: add, type, size, nullable, primary key, unique, default, comment, reorder
- Indexes and constraints (including check constraints)
- Relationships: create, change cardinality, delete, show or hide
- Dependencies between tables and views
- Custom types (enums and composite types)
- Areas (groups) and notes
- Canvas: pan, zoom, minimap, select, multi-select, snap, fit to screen, full screen
- Filters and visibility of tables and schemas
- Undo and redo
- Copy and paste of tables
- Import: from SQL (each dialect), from DBML, from a script, from a live database
- Export: SQL (each dialect), DBML, JSON, image
- Diff view between two versions of a diagram
- Templates and examples
- Themes, languages, keyboard shortcuts, settings
- Accounts, projects, publishing, share links, admin, lint, drift detection
  (the QBase server features, already original; they must keep working with the new editor)
- Local-only mode with no server (offline editor)
- Import of diagrams saved by the old editor

## Behaviours

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
| EDT-001 | Layout | On a wide window the page shows a top bar, a left icon rail, a resizable side panel and the canvas | keep: core layout | [ ] | |
| EDT-002 | Layout | The icon rail lists New, Open, Tables, DBML, Refs, Custom Types (only where supported) and Visuals; the current section is highlighted | keep: core navigation | [ ] | |
| EDT-003 | Layout | Clicking a rail section opens the side panel if hidden and shows that section | keep: core navigation | [ ] | |
| EDT-004 | Layout | The side panel is at least 350 px wide and can be dragged wider with a handle; hiding it removes the handle | keep: usability | [ ] | |
| EDT-005 | Layout | The panel is visible when the editor first opens on desktop | keep: discoverability | [ ] | |
| EDT-006 | Layout | On a narrow window the side panel becomes a bottom drawer titled Manage Diagram, opened by a round pencil button at the bottom-left of the canvas | keep: needed for phones | [ ] | |
| EDT-007 | Layout | In the drawer a drop-down picks the section (Tables, Refs, Areas, Visuals, Custom Types where supported) | keep: needed for phones | [ ] | |
| EDT-008 | Layout | On a narrow window the toolbar moves to the top-centre and the minimap shrinks to 60 px | keep: avoids overlap with the drawer button | [ ] | |
| EDT-009 | Layout | On a narrow window right-click menus are not available | change: offer long-press menus on touch | [ ] | |
| EDT-010 | Layout | Focusing an item from the panel on mobile closes the drawer | keep: otherwise the item is hidden | [ ] | |
| EDT-011 | Layout | While loading, a spinner shows and then a Loading diagram badge until tables are drawn | keep: feedback | [ ] | |
| EDT-012 | Layout | After first load the view fits all tables with a zoom cap of 80% | keep: good first view | [ ] | |
| EDT-013 | Layout | The browser tab title reads QBase - <diagram name> | keep: orientation | [ ] | |
| EDT-014 | Layout | In read-only mode add buttons, menus, drag handles, resize, delete and renames are unavailable but pan, zoom, select, filter and focus work | keep: viewer roles need it | [ ] | |
| EDT-015 | Canvas: pan and zoom | Dragging empty background pans the canvas | keep: universal | [ ] | |
| EDT-016 | Canvas: pan and zoom | Mouse wheel or two-finger scroll pans by default | keep: current default | [ ] | |
| EDT-017 | Canvas: pan and zoom | View > Zoom on Scroll On makes the wheel zoom around the pointer; Off restores panning; the choice is remembered in the browser | keep: user preference | [ ] | |
| EDT-018 | Canvas: pan and zoom | Ctrl/Cmd + wheel and pinch zoom regardless of the setting | keep: universal | [ ] | |
| EDT-019 | Canvas: pan and zoom | Zoom range is 10% to 500% | keep: sensible limits | [ ] | |
| EDT-020 | Canvas: pan and zoom | Toolbar plus and minus zoom in 200 ms steps | keep: core | [ ] | |
| EDT-021 | Canvas: pan and zoom | The toolbar shows the live zoom percentage; clicking it resets to 100% | keep: handy | [ ] | |
| EDT-022 | Canvas: pan and zoom | Show All (toolbar or Mod+0) fits all visible tables with 10% padding, max zoom 80%, half-second animation | keep: core | [ ] | |
| EDT-023 | Canvas: pan and zoom | When no table is on screen a Show All pill appears above the toolbar (below it on mobile) | keep: prevents getting lost | [ ] | |
| EDT-024 | Canvas: pan and zoom | The view refits automatically after a filter change and after Auto Arrange | keep: expected | [ ] | |
| EDT-025 | Canvas: selection | Clicking a table, area or note selects it with an accent outline; clicking the background clears the selection | keep: core | [ ] | |
| EDT-026 | Canvas: selection | Clicking a line selects it and turns it teal | keep: core | [ ] | |
| EDT-027 | Canvas: selection | Shift, Ctrl or Cmd with a click adds or removes an object from the selection | keep: core | [ ] | |
| EDT-028 | Canvas: selection | Shift + drag on the background draws a rubber-band; only objects fully inside are selected | keep: core | [ ] | |
| EDT-029 | Canvas: selection | While Shift is held the cursor changes to the multi-select cursor | keep: feedback | [ ] | |
| EDT-030 | Canvas: selection | Dragging one selected object moves all selected objects | keep: core | [ ] | |
| EDT-031 | Canvas: selection | Delete or Backspace removes all selected tables, areas, notes and lines (not while typing) | keep: core | [ ] | |
| EDT-032 | Canvas: selection | Selecting a table fades unrelated tables to 40% opacity and grey so linked tables stand out | keep: helps big diagrams | [ ] | |
| EDT-033 | Canvas: selection | Selecting a table makes its left and right edges draggable for resizing | keep: core | [ ] | |
| EDT-034 | Canvas: moving | Dragging a table moves it; the position is saved when the drag ends | keep: core | [ ] | |
| EDT-035 | Canvas: moving | A magnet button toggles snap to a 20 px grid; holding Shift snaps temporarily; tooltip Snap to Grid (Hold Shift) | keep: core | [ ] | |
| EDT-036 | Canvas: moving | Moving a table fully inside an area makes it a member of the area; moving it out removes membership | keep: core for areas | [ ] | |
| EDT-037 | Canvas: moving | Dragging an area moves its member tables with it as one history step | keep: core for areas | [ ] | |
| EDT-038 | Canvas: moving | When tables overlap a warning-triangle button fades in at the top-left; pressing it flashes overlapping tables red for 0.6 s | keep: useful but could be simpler | [ ] | |
| EDT-039 | Canvas: moving | Overlapping tables carry a persistent subtle outline | change: make the outline optional to cut noise | [ ] | |
| EDT-040 | Canvas: toolbar and chrome | A floating toolbar at bottom-centre holds Filter, Show All, Zoom out, zoom %, Zoom in, Auto Arrange, Undo, Redo | keep: core | [ ] | |
| EDT-041 | Canvas: toolbar and chrome | Undo and Redo buttons are disabled when their stack is empty | keep: feedback | [ ] | |
| EDT-042 | Canvas: toolbar and chrome | The Filter button is teal when a filter is hiding something | keep: feedback | [ ] | |
| EDT-043 | Canvas: toolbar and chrome | Auto Arrange and snap buttons are hidden in read-only mode | keep: consistency | [ ] | |
| EDT-044 | Canvas: toolbar and chrome | A minimap at the bottom-right shows all tables and the viewport; View > Hide/Show Mini Map toggles it (default on, remembered) | keep: helps navigation | [ ] | |
| EDT-045 | Canvas: toolbar and chrome | A Type colours legend at the top-right (desktop only) explains the six field-type tints | drop: low value; replace by tooltips | [ ] | |
| EDT-046 | Canvas: toolbar and chrome | Field-type chips are tinted by kind: text, number, date and time, identifier, boolean, JSON/XML | keep: quick scanning | [ ] | |
| EDT-047 | Canvas: toolbar and chrome | A credit mark sits at the bottom-right | change: keep only if the product owner wants branding | [ ] | |
| EDT-048 | Canvas: toolbar and chrome | There is no full-screen mode; the browser's own works | change: owner to decide (open question 1) | [ ] | |
| EDT-049 | Canvas: toolbar and chrome | A yellow highlighter button appears while a custom type is highlighted; clicking clears it | keep: needed to clear highlight | [ ] | |
| EDT-050 | Auto Arrange | Auto Arrange asks for confirmation with title Auto Arrange Diagram and buttons Auto Arrange and Cancel | keep: destructive layout change | [ ] | |
| EDT-051 | Auto Arrange | Confirming lays out the visible tables so related ones are near each other and unrelated ones form a grid | keep: core | [ ] | |
| EDT-052 | Auto Arrange | Auto Arrange respects the filter, hidden views and area grouping and is a single undo step | keep: expected | [ ] | |
| EDT-053 | Auto Arrange | Right-click an area > Auto Arrange lays out only its tables and grows the area if needed | keep: handy | [ ] | |
| EDT-054 | Context menus | Right-click empty canvas offers New Table, New View (when views are on), New Relationship, New Area, New Note, Auto Arrange Diagram | keep: core | [ ] | |
| EDT-055 | Context menus | Creating a table from the menu places it at the pointer in the default schema and opens it for editing | keep: core | [ ] | |
| EDT-056 | Context menus | With tables selected the canvas menu adds Move to Area (n) with the areas and New Area | keep: handy | [ ] | |
| EDT-057 | Context menus | Right-click a table offers Edit Table, Duplicate Table, Add Relationship, Move to Area, Delete Table | keep: core | [ ] | |
| EDT-058 | Context menus | Move to Area on a table applies to all selected tables when several are selected | keep: consistent | [ ] | |
| EDT-059 | Context menus | Move to Area > No Area is disabled when the table has no area | keep: consistent | [ ] | |
| EDT-060 | Context menus | Right-click an area offers Edit Area Name, Auto Arrange, Delete Area | keep: core | [ ] | |
| EDT-061 | Filter panel | Mod+F or the toolbar Filter button opens a floating Filter Tables panel; pressing again closes it; it works while typing | keep: core | [ ] | |
| EDT-062 | Filter panel | The panel has a focused search box Search tables... and a Group by Schema / Group by Area toggle | keep: core | [ ] | |
| EDT-063 | Filter panel | A tree lists groups and tables; each has an eye control to show or hide it on the canvas | keep: core | [ ] | |
| EDT-064 | Filter panel | Hiding a group hides all its tables; groups and tables have zoom-to controls | keep: handy | [ ] | |
| EDT-065 | Filter panel | Clicking a table row shows it if hidden, selects it, flashes it and zooms to it | keep: handy | [ ] | |
| EDT-066 | Filter panel | Search narrows the tree by table name (case-insensitive substring) without changing which tables are hidden | keep: clear model | [ ] | |
| EDT-067 | Filter panel | With no match the panel shows No tables found, Try adjusting your search or filter and a Clear filter button | keep: empty state | [ ] | |
| EDT-068 | Filter panel | With no tables at all the panel shows No tables found and Create a table to get started | keep: empty state | [ ] | |
| EDT-069 | Filter panel | If the filter hides every table a centred message All tables are hidden with a Show all button appears on the canvas and in the Tables section | keep: recovery | [ ] | |
| EDT-070 | Filter panel | A hidden table hides its relationships and dependencies too | keep: consistent | [ ] | |
| EDT-071 | Filter panel | Visibility choices are saved with the diagram, not undoable | keep: persistent view state | [ ] | |
| EDT-072 | Filter panel | A table is visible if its schema or its own id is on the visible lists; ticking every table of a schema counts as the schema | keep: keeps new tables visible | [ ] | |
| EDT-073 | Filter panel | After any filter change the canvas refits to the visible tables | keep: expected | [ ] | |
| EDT-074 | Tables: create and look | Add Table in the side panel creates a table near the top-left of the visible area | keep: core | [ ] | |
| EDT-075 | Tables: create and look | A new table is named table_N (view_N for views), has one id field (PK, unique, not null), light blue colour, appended to the list | keep: core | [ ] | |
| EDT-076 | Tables: create and look | With more than one schema visible Add Table first asks which schema in a Select Schema dialog (Cancel, Confirm) | keep: core for schema databases | [ ] | |
| EDT-077 | Tables: create and look | The Add Table split button offers Add View when Database Views is On | keep: core | [ ] | |
| EDT-078 | Tables: create and look | A table card shows a colour swatch, bold name, subtitle (schema, view kind, first line of description) and a field count | keep: core | [ ] | |
| EDT-079 | Tables: create and look | Hovering the header replaces the count with open-in-panel and widen/narrow buttons | keep: handy | [ ] | |
| EDT-080 | Tables: create and look | Default width 224 px, range 224 to 450 px; height follows the fields | keep: core | [ ] | |
| EDT-081 | Tables: create and look | Select a table and drag its left or right edge to resize; width is saved and undoable | keep: core | [ ] | |
| EDT-082 | Tables: create and look | The widen button toggles between narrowest and widest (first press below 337 widens to 337) | change: simplify to a two-state toggle | [ ] | |
| EDT-083 | Tables: create and look | A table with more than 10 fields collapses to 10 (always keeping PK and relationship fields) with Show More / Show Less; the state is saved | keep: keeps big tables readable | [ ] | |
| EDT-084 | Tables: create and look | Tables are tinted by a 12-colour palette plus a custom colour; recent custom colours are remembered per browser | keep: core | [ ] | |
| EDT-085 | Tables: create and look | Views have a fixed grey colour, a hollow swatch and no colour picker | keep: clear distinction | [ ] | |
| EDT-086 | Tables: create and look | Views are hidden by default and View > Database Views On/Off shows or hides all views everywhere | change: show views by default when the diagram has any (open question 9) | [ ] | |
| EDT-087 | Tables: create and look | A table description shows in the subtitle (first line) with the full text as a tooltip | keep: core | [ ] | |
| EDT-088 | Tables: edit and manage | Double-clicking a table opens an in-place edit card with schema, name, field list, colour picker, Add Field and field count | keep: core | [ ] | |
| EDT-089 | Tables: edit and manage | Edit Table in the right-click menu opens the same edit card | keep: core | [ ] | |
| EDT-090 | Tables: edit and manage | In the edit card each field row has a name box, type picker, N (nullable) toggle, PK toggle and delete toggle | keep: core | [ ] | |
| EDT-091 | Tables: edit and manage | A newly added field in the edit card scrolls into view, takes focus and flashes light blue | keep: feedback | [ ] | |
| EDT-092 | Tables: edit and manage | The wheel scrolls the edit card's field list without panning the canvas; Ctrl/Cmd still zooms | keep: core | [ ] | |
| EDT-093 | Tables: edit and manage | The edit card closes with its X, a click on empty canvas, Escape or starting a relationship | keep: core | [ ] | |
| EDT-094 | Tables: edit and manage | Table name edits save 1 s after typing stops; empty or unchanged names are ignored | keep: avoids noisy history | [ ] | |
| EDT-095 | Tables: edit and manage | In the schema box of the edit card, Create new schema turns it into a text box; Enter creates and Escape cancels | keep: core for schema databases | [ ] | |
| EDT-096 | Tables: edit and manage | A table is renamed in the panel by double-click (tooltip Double-click to edit) or the pencil; Enter saves, Escape cancels | keep: core | [ ] | |
| EDT-097 | Tables: edit and manage | Duplicate table names are allowed without warning | change: warn on duplicates (open question 7) | [ ] | |
| EDT-098 | Tables: edit and manage | Table description is edited in the Description accordion (placeholder No description) and saves as you type | keep: core | [ ] | |
| EDT-099 | Tables: edit and manage | Duplicate Table creates a copy named <name>_copy offset 30 px right and 50 px down with fields and indexes but no relationships | keep: handy | [ ] | |
| EDT-100 | Tables: edit and manage | Deleting a table (canvas, panel, keyboard) removes it and its relationships and dependencies in one undo step, with no confirmation | keep: undoable; confirm optional (open question 4) | [ ] | |
| EDT-101 | Tables: edit and manage | Change Schema opens a dialog (Cancel, Change) and also assigns the schema to any schema-less table | change: only change the one table; the side effect surprises | [ ] | |
| EDT-102 | Tables: side panel list | The Tables section has a filter box and Add Table button | keep: core | [ ] | |
| EDT-103 | Tables: side panel list | Each table is an accordion row (one open at a time) with drag handle, name, schema in brackets when several schemas are visible, View tag, pencil, focus and More actions | keep: core | [ ] | |
| EDT-104 | Tables: side panel list | More actions (Table Actions) offers Change Schema, Add Field, Add Index (not for views), Duplicate Table, Delete Table | keep: core | [ ] | |
| EDT-105 | Tables: side panel list | Dragging a row re-orders the list and is undoable; new tables go to the end | keep: core | [ ] | |
| EDT-106 | Tables: side panel list | Without a stored order the list shows tables before views, alphabetically | keep: stable fallback | [ ] | |
| EDT-107 | Tables: side panel list | The focus button selects the table and centres it at 100% zoom | keep: core | [ ] | |
| EDT-108 | Tables: side panel list | The list honours the visibility filter and the Database Views switch | keep: consistent | [ ] | |
| EDT-109 | Tables: side panel list | The filter box narrows the list by name; no matches shows No tables found matching your filter with Clear Filter | keep: core | [ ] | |
| EDT-110 | Tables: side panel list | An empty diagram shows No tables, Create a table to get started and an Add Table button | keep: onboarding | [ ] | |
| EDT-111 | Tables: side panel list | Opening a row scrolls it into view and the open row also opens when a table is opened from the canvas | keep: core | [ ] | |
| EDT-112 | Fields | A field row shows key icon (PK) or link icon (FK), name, UQ badge, type chip and a nullability dot (hollow = nullable) | keep: core | [ ] | |
| EDT-113 | Fields | The type chip shows the first word of the type plus size, precision, scale or [] unless Field Attributes are hidden | keep: core | [ ] | |
| EDT-114 | Fields | View > Hide Field Attributes hides sizes in chips; Show restores (default shown, remembered) | keep: compactness | [ ] | |
| EDT-115 | Fields | View > Compact Tables hides the type chip and nullability dot (default Standard, remembered) | keep: density option | [ ] | |
| EDT-116 | Fields | Hovering a field row shows a detail card with its full info and references / referenced by links | keep: handy | [ ] | |
| EDT-117 | Fields | Add Field creates field_N with the database's default type, nullable, not PK, not unique, at the end | keep: core | [ ] | |
| EDT-118 | Fields | A field name saves 0.3 s after typing stops; unchanged text is not saved | keep: avoids noisy history | [ ] | |
| EDT-119 | Fields | The type picker is a searchable drop-down with common types first, then alphabetical; empty results show No types found | keep: core | [ ] | |
| EDT-120 | Fields | With custom types the picker splits into Standard Types and Custom Types; enums show their values | keep: core | [ ] | |
| EDT-121 | Fields | Typing a full declaration such as varchar(255), numeric(10,2) or int[] and picking it fills size, precision, scale and array | keep: power-user speed | [ ] | |
| EDT-122 | Fields | Each type option shows its attribute suffix | keep: clarity | [ ] | |
| EDT-123 | Fields | Changing type keeps size/precision/scale only if the new type has them and always clears the default | keep: prevents invalid data | [ ] | |
| EDT-124 | Fields | Choosing serial-family types forces not null and auto increment | keep: database rule | [ ] | |
| EDT-125 | Fields | The ... button opens Field Attributes with Unique, Auto Increment, Array, Max Length, Precision, Scale, Default Value, Description, Delete Field | keep: core | [ ] | |
| EDT-126 | Fields | Unique is disabled when the field is the only primary key | keep: consistent | [ ] | |
| EDT-127 | Fields | Auto Increment appears only for integer-like types, is disabled while nullable and always on for serial types | keep: database rule | [ ] | |
| EDT-128 | Fields | Array appears only for databases that support arrays and non-serial types | keep: database rule | [ ] | |
| EDT-129 | Fields | Max Length offers None, Max (only where allowed) and Custom with a number box | keep: core | [ ] | |
| EDT-130 | Fields | Precision and Scale show the type's range and default placeholder | keep: core | [ ] | |
| EDT-131 | Fields | Default Value accepts any text verbatim; empty clears it | keep: flexible | [ ] | |
| EDT-132 | Fields | Field Description (placeholder No description) shows a comment icon beside the name; clicking it reopens the popover | keep: core | [ ] | |
| EDT-133 | Fields | The N toggle sets nullable; it is disabled for PK and serial fields and turning it on clears auto increment | keep: consistent | [ ] | |
| EDT-134 | Fields | Setting a field as PK makes it not null and, if first PK, unique; a table may have several PKs | keep: composite keys | [ ] | |
| EDT-135 | Fields | A PK that is also nullable in old data is silently corrected to not null | keep: data repair | [ ] | |
| EDT-136 | Fields | Fields are re-ordered by dragging in the side panel and the canvas follows | keep: core | [ ] | |
| EDT-137 | Fields | Fields cannot be re-ordered from the canvas edit card | change: add reordering to the edit card | [ ] | |
| EDT-138 | Fields | Deleting a field has no confirmation and is undoable | keep: undoable | [ ] | |
| EDT-139 | Fields | Deleting a field used in a relationship leaves the relationship dangling | change: remove or warn (open question 6) | [ ] | |
| EDT-140 | Indexes | Indexes are listed in an accordion under the table (not for views) with an Add Index button | keep: core | [ ] | |
| EDT-141 | Indexes | A new index is index_N with no fields, not unique, default type (btree on PostgreSQL/CockroachDB) | keep: core | [ ] | |
| EDT-142 | Indexes | Each index row has a field multi-select (Select fields), a Unique toggle and an Index Attributes popover (Name, Unique, Index Type, description, Delete Index) | keep: core | [ ] | |
| EDT-143 | Indexes | Index Type is offered only where the database has a choice (btree, hash, gin on PostgreSQL/CockroachDB) | keep: database rule | [ ] | |
| EDT-144 | Indexes | GIN is disabled unless the chosen fields are arrays, json, jsonb, tsvector or hstore; deselecting such a field resets the type | keep: prevents invalid indexes | [ ] | |
| EDT-145 | Indexes | The primary-key index is listed first, labelled Primary Key, kept in sync with PK fields and not editable by hand | keep: core | [ ] | |
| EDT-146 | Indexes | Index add, edit and delete are undoable | keep: consistent | [ ] | |
| EDT-147 | Check constraints | Check Constraints accordion appears under a table (not for views) with an Add Check button | keep: core | [ ] | |
| EDT-148 | Check constraints | A new check has an empty Expression text area (placeholder e.g., price > 0) and a popover with Delete Check Constraint | keep: core | [ ] | |
| EDT-149 | Check constraints | Check expressions are not validated by the editor | keep: SQL rules differ by dialect | [ ] | |
| EDT-150 | Check constraints | Check constraints are shown for every database even where export ignores them | change: hide or warn where unsupported (open question 15) | [ ] | |
| EDT-151 | Check constraints | Check add, edit and delete are undoable | keep: consistent | [ ] | |
| EDT-152 | Relationships: create | Hovering a field shows connection dots at its left and right in an editable diagram | keep: core | [ ] | |
| EDT-153 | Relationships: create | Dragging from one field's dot to another table's field dot creates a relationship, first field as source | keep: core | [ ] | |
| EDT-154 | Relationships: create | Connecting incompatible types shows a red toast Field types are not compatible and creates nothing | keep: prevents bad keys | [ ] | |
| EDT-155 | Relationships: create | Connecting two fields that already have a relationship shows a red toast Already connected | keep: prevents duplicates | [ ] | |
| EDT-156 | Relationships: create | Releasing the drag on empty canvas creates nothing | keep: safe | [ ] | |
| EDT-157 | Relationships: create | Views have no field dots and cannot take relationships | keep: model rule | [ ] | |
| EDT-158 | Relationships: create | Right-click a table > Add Relationship draws a line from the table centre that follows the pointer | keep: quick path | [ ] | |
| EDT-159 | Relationships: create | Clicking a target table opens a card with the target field pre-selected (first compatible) or a suggested new field name | keep: core | [ ] | |
| EDT-160 | Relationships: create | In the card typing a new name offers Create "<name>"; confirming creates the field, the relationship, selects it and opens it in Refs | keep: core | [ ] | |
| EDT-161 | Relationships: create | The card shows inline errors: Please select a target field, Failed to create new field, Failed to create relationship | keep: feedback | [ ] | |
| EDT-162 | Relationships: create | Escape, clicking the background or clicking outside cancels the line and closes the card | keep: core | [ ] | |
| EDT-163 | Relationships: create | Canvas right-click > New Relationship or Refs > Add Relationship opens a Create Relationship dialog | keep: accessible path | [ ] | |
| EDT-164 | Relationships: create | The dialog has Primary Table, Primary Field, Referenced Table, Referenced Field pickers; choosing a table opens its field picker; Create is disabled until all four are set | keep: core | [ ] | |
| EDT-165 | Relationships: create | The dialog shows No tables found / No fields found in empty pickers | keep: empty state | [ ] | |
| EDT-166 | Relationships: create | The dialog applies the same compatibility and already-connected checks | keep: consistent | [ ] | |
| EDT-167 | Relationships: create | A new relationship is named <table>_<field>_fk and is one-to-one by default | keep: core | [ ] | |
| EDT-168 | Relationships: create | Only one relationship can exist between a pair of fields | keep: consistent | [ ] | |
| EDT-169 | Relationships: create | Compatible types are equal types or a short list (serial/integer family in PostgreSQL, int/integer and tinyint/boolean in MySQL) | keep: core | [ ] | |
| EDT-170 | Relationships: edit and draw | Only One to One and One to Many exist; the many side is always the target | keep: matches SQL foreign keys | [ ] | |
| EDT-171 | Relationships: edit and draw | A relationship is drawn as a smooth line between the two field rows on the nearer table edges | keep: core | [ ] | |
| EDT-172 | Relationships: edit and draw | A self-relationship loops out of one side and parallel lines are offset | keep: readability | [ ] | |
| EDT-173 | Relationships: edit and draw | Line ends carry crow's-foot markers; View > Hide Cardinality hides them (default shown, remembered) | keep: core | [ ] | |
| EDT-174 | Relationships: edit and draw | A selected line turns teal and shows an indicator dot mid-line | keep: feedback | [ ] | |
| EDT-175 | Relationships: edit and draw | Double-clicking a line opens a popover with 1:1, 1:N, Switch tables, Open in sidebar, Delete relationship | keep: core | [ ] | |
| EDT-176 | Relationships: edit and draw | Choosing N:1 swaps the tables and stores 1:N | keep: model rule | [ ] | |
| EDT-177 | Relationships: edit and draw | Switch tables swaps source and target; a N:1 flips to 1:N | keep: core | [ ] | |
| EDT-178 | Relationships: edit and draw | Refs section lists relationships with a filter, Add Relationship and Collapse All | keep: core | [ ] | |
| EDT-179 | Relationships: edit and draw | A relationship row opens to show Primary Table and field, Related Table and field, a Cardinality drop-down (One to One, One to Many), Switch Tables and Delete | keep: core | [ ] | |
| EDT-180 | Relationships: edit and draw | The Refs filter matches relationship and table names; relationships show only when both tables are visible | keep: consistent | [ ] | |
| EDT-181 | Relationships: edit and draw | A relationship is deleted by Delete/Backspace on the line, popover or Refs row; undoable | keep: core | [ ] | |
| EDT-182 | Relationships: edit and draw | An empty Refs list shows No relationships and Create a relationship to get started | keep: empty state | [ ] | |
| EDT-183 | Dependencies | Dragging from a view's top or bottom dot onto a table creates a dependency | drop: niche; no dialog; import covers it | [ ] | |
| EDT-184 | Dependencies | A dependency is drawn as a distinct line and listed under Dependencies in Refs with a Delete action | drop: niche | [ ] | |
| EDT-185 | Dependencies | Dependencies are deleted with Delete on the line or the Refs action and are undoable | drop: niche | [ ] | |
| EDT-186 | Dependencies | Deleting a table removes its dependencies in the same undo step | drop: follows the dependency feature | [ ] | |
| EDT-187 | Custom types | The Custom Types section and rail entry exist only for databases that support them (PostgreSQL) | keep: database rule | [ ] | |
| EDT-188 | Custom types | The section has a filter box and a New Type button; empty states show No custom types and the explanation text | keep: core | [ ] | |
| EDT-189 | Custom types | New Type adds type_N of kind Enum with no values | keep: core | [ ] | |
| EDT-190 | Custom types | A custom type is renamed by double-click or pencil; Enter saves, Escape cancels; the schema shows when several are visible | keep: core | [ ] | |
| EDT-191 | Custom types | Kind selects Enum or Composite | keep: core | [ ] | |
| EDT-192 | Custom types | Enum values appear as removable chips; Enter in Add enum value... adds one; empty list says No enum values defined | keep: core | [ ] | |
| EDT-193 | Custom types | Composite types list fields with Field name and Select type pickers, Add Field and remove; empty says No fields defined | keep: core | [ ] | |
| EDT-194 | Custom types | Switching kind keeps the other kind's hidden data | change: clear it (open question 14) | [ ] | |
| EDT-195 | Custom types | More actions offers Highlight Fields / Clear Highlight and Delete | keep: core | [ ] | |
| EDT-196 | Custom types | Highlight Fields tints every field using the type yellow; only one type at a time; not saved or undoable | drop: niche | [ ] | |
| EDT-197 | Custom types | Custom types appear in the field type picker under Custom Types | keep: core | [ ] | |
| EDT-198 | Custom types | Deleting a custom type leaves fields using it with the type name as text | keep: simple | [ ] | |
| EDT-199 | Custom types | Custom type add, edit and delete are undoable | keep: consistent | [ ] | |
| EDT-200 | Areas | New Area from the canvas menu or Visuals > Areas > Add Area creates Area N, 300 x 200, random palette colour | keep: core | [ ] | |
| EDT-201 | Areas | An area is a tinted rectangle with a border and a name strip, resizable when selected | keep: core | [ ] | |
| EDT-202 | Areas | A table is a member of an area when completely inside it; the top-most area wins | keep: core | [ ] | |
| EDT-203 | Areas | Membership recomputes after moves and resizes | keep: core | [ ] | |
| EDT-204 | Areas | Move to Area places tables in a tidy grid inside the area, growing it if needed | keep: handy | [ ] | |
| EDT-205 | Areas | Move to Area > No Area moves a table outside the area | keep: handy | [ ] | |
| EDT-206 | Areas | An area is renamed by double-click on its name or Edit Area Name; Enter or click-away saves, Escape cancels, empty is ignored | keep: core | [ ] | |
| EDT-207 | Areas | Deleting an area keeps its tables and clears their membership | keep: safe | [ ] | |
| EDT-208 | Areas | The Areas list has filter, Add Area, rows with colour picker, focus and More actions (Edit Name, Delete Area) | keep: core | [ ] | |
| EDT-209 | Areas | Empty and filtered-empty states read No areas / Create an area to get started and No areas found matching your filter | keep: empty state | [ ] | |
| EDT-210 | Areas | Area add, edit, move, resize and delete are undoable | keep: consistent | [ ] | |
| EDT-211 | Notes | New Note from the canvas menu or Visuals > Notes > Add Note creates an empty 200 x 150 yellow note | keep: core | [ ] | |
| EDT-212 | Notes | A note has a coloured header (colour picker) and a pale body, light or dark by theme, and is resizable | keep: core | [ ] | |
| EDT-213 | Notes | Double-click a note body to edit; clicking away saves; Escape abandons | keep: core | [ ] | |
| EDT-214 | Notes | The Notes list has filter, Add Note, rows with the first line, colour picker, focus and More actions (Delete Note) | keep: core | [ ] | |
| EDT-215 | Notes | Empty and filtered-empty notes states read No Notes / Create a note to add text annotations on the canvas and No notes found | keep: empty state | [ ] | |
| EDT-216 | Notes | Empty notes show Empty note in the list | keep: clarity | [ ] | |
| EDT-217 | Notes | Note add, edit, move, resize and delete are undoable | keep: consistent | [ ] | |
| EDT-218 | Notes | The Visuals section has Areas and Notes tabs and opens on Areas | keep: core | [ ] | |
| EDT-219 | Undo and redo | Undo is Mod+Z, Edit > Undo or the toolbar; Redo is Mod+Shift+Z, Edit > Redo or the toolbar | keep: core | [ ] | |
| EDT-220 | Undo and redo | A new action clears the redo stack | keep: standard | [ ] | |
| EDT-221 | Undo and redo | Undo and redo shortcuts do not act while a text box has focus | change: make them work everywhere or hand off clearly (open question 20) | [ ] | |
| EDT-222 | Undo and redo | Undo history is unlimited and cleared on reload or when switching diagrams | change: cap or persist (open question 5) | [ ] | |
| EDT-223 | Undo and redo | Undoable: diagram rename, table add/delete/edit/move/resize/order, field, index and check changes, relationship, area, note and custom type changes, dependency changes, Auto Arrange, DBML Accept Changes, re-sync apply | keep: broad coverage | [ ] | |
| EDT-224 | Undo and redo | A whole drag, or an area drag with its members, is one undo step | keep: expected | [ ] | |
| EDT-225 | Undo and redo | Not undoable: zoom, pan, selection, filter, View settings, highlight, copy, theme, Clear, import into current diagram, delete diagram | keep: consistent | [ ] | |
| EDT-226 | Undo and redo | Edit > Clear asks Clear Diagram with Clear and Cancel and empties the history | keep: destructive | [ ] | |
| EDT-227 | Copy and paste | Mod+C with tables selected remembers them and shows Table copied / <n> tables copied | keep: core | [ ] | |
| EDT-228 | Copy and paste | The copy toast says Press Ctrl+V on every platform | change: show the platform's key | [ ] | |
| EDT-229 | Copy and paste | Copy is ignored when page text is selected | keep: keeps text copy working | [ ] | |
| EDT-230 | Copy and paste | Mod+V pastes the remembered tables as new copies with new ids | keep: core | [ ] | |
| EDT-231 | Copy and paste | A pasted table keeps its name if unique, else _copy, _copy2, _copy3 (case-insensitive per schema) | keep: core | [ ] | |
| EDT-232 | Copy and paste | A paste lands to the right of the copied group, each further paste one slot further right | keep: avoids overlap | [ ] | |
| EDT-233 | Copy and paste | Paste keeps schema only for schema databases and keeps area only if it exists | keep: correct targets | [ ] | |
| EDT-234 | Copy and paste | Paste copies fields and indexes but no relationships or dependencies | keep: avoids cross links | [ ] | |
| EDT-235 | Copy and paste | Paste shows Table pasted / <n> tables pasted | keep: feedback | [ ] | |
| EDT-236 | Copy and paste | The clipboard lives in the page (works between diagrams in the same tab) and is lost on reload | change: consider the OS clipboard for cross-tab paste | [ ] | |
| EDT-237 | Copy and paste | Paste is unavailable in read-only mode | keep: consistent | [ ] | |
| EDT-238 | DBML preview and diff | The DBML section shows the diagram as read-only DBML with Show Standard/Inline Refs, Edit and copy buttons | keep: core | [ ] | |
| EDT-239 | DBML preview and diff | Edit makes the DBML editable; after 1 s of no typing the DBML is parsed | keep: core | [ ] | |
| EDT-240 | DBML preview and diff | A DBML syntax error marks the line and shows Failed to parse DBML... (1 error found - in line N) | keep: core | [ ] | |
| EDT-241 | DBML preview and diff | A valid edit shows a summary diff on the canvas without changing the diagram | keep: core | [ ] | |
| EDT-242 | DBML preview and diff | New tables get a green + badge and name; removed tables red; changed tables blue; renames show old then new | keep: core | [ ] | |
| EDT-243 | DBML preview and diff | New and removed relationships are drawn green or red and thicker in a diff | keep: core | [ ] | |
| EDT-244 | DBML preview and diff | While a diff exists Accept Changes (green) and Undo Changes (red) appear; with no diff the button is View | keep: core | [ ] | |
| EDT-245 | DBML preview and diff | Accept Changes replaces tables, relationships and custom types, keeps areas and notes, and is one undo step | keep: core | [ ] | |
| EDT-246 | DBML preview and diff | Undo Changes discards the preview and leaves edit mode | keep: core | [ ] | |
| EDT-247 | DBML preview and diff | Leaving the DBML section discards an unaccepted preview | keep: safe | [ ] | |
| EDT-248 | DBML preview and diff | Import into the current diagram lists counts of new tables, new relationships and overwritten tables | keep: core | [ ] | |
| EDT-249 | DBML preview and diff | Imported tables land 150 px right of the right-most existing table and history is reset | keep: avoids overlap | [ ] | |
| EDT-250 | DBML preview and diff | Re-sync from database lists changes with checkboxes (renames unchecked), Apply n selected, one undo step | keep: server feature; kept | [ ] | |
| EDT-251 | Menus, themes and settings | The menu bar has Actions, Edit, View and Backup | keep: core | [ ] | |
| EDT-252 | Menus, themes and settings | View > Hide/Show Sidebar toggles the panel and shows Mod+B | keep: core | [ ] | |
| EDT-253 | Menus, themes and settings | View > Theme offers System, Light, Dark; Mod+M toggles light and dark even while typing | keep: core | [ ] | |
| EDT-254 | Menus, themes and settings | Display preferences are remembered in the browser, not in the diagram | keep: expected | [ ] | |
| EDT-255 | Menus, themes and settings | The diagram name in the top bar is edited by double-click; Enter or click-away saves; empty is ignored | keep: core | [ ] | |
| EDT-256 | Menus, themes and settings | Every change is saved automatically and the top bar shows last saved time | keep: core | [ ] | |
| EDT-257 | Menus, themes and settings | Mod+S marks the diagram saved but does nothing visible | change: confirm with a toast or remove (open question 2) | [ ] | |
| EDT-258 | Menus, themes and settings | Delete diagram asks Delete Diagram with Delete and Cancel and is hidden for non-owners | keep: destructive | [ ] | |
| EDT-259 | Keyboard shortcuts | Mod+Z undo, Mod+Shift+Z redo | keep: standard | [ ] | |
| EDT-260 | Keyboard shortcuts | Mod+O opens the diagram list (or project list with a server) | keep: convenience | [ ] | |
| EDT-261 | Keyboard shortcuts | Mod+S saves | keep: see above | [ ] | |
| EDT-262 | Keyboard shortcuts | Mod+B toggles the side panel | keep: convenience | [ ] | |
| EDT-263 | Keyboard shortcuts | Mod+0 fits everything | keep: convenience | [ ] | |
| EDT-264 | Keyboard shortcuts | Mod+M toggles theme | keep: convenience | [ ] | |
| EDT-265 | Keyboard shortcuts | Mod+F toggles the table filter | keep: convenience | [ ] | |
| EDT-266 | Keyboard shortcuts | Mod+C and Mod+V copy and paste tables | keep: core | [ ] | |
| EDT-267 | Keyboard shortcuts | Delete or Backspace deletes the selection | keep: core | [ ] | |
| EDT-268 | Keyboard shortcuts | Escape cancels relationship drawing and closes cards, popovers, edit mode and in-place renames | keep: core | [ ] | |
| EDT-269 | Keyboard shortcuts | Enter confirms in-place renames and adds an enum value | keep: core | [ ] | |
| EDT-270 | Keyboard shortcuts | Shift while dragging snaps to grid | keep: core | [ ] | |
| EDT-271 | Keyboard shortcuts | Menu items and tooltips show shortcuts in the platform's symbols | keep: discoverability | [ ] | |
| EDT-272 | Errors and empty states | Copy failure shows a Copy failed toast with Clipboard not supported or Something went wrong. Please try again. | keep: feedback | [ ] | |
| EDT-273 | Errors and empty states | Failed diagram delete shows Could not delete the diagram | keep: feedback | [ ] | |
| EDT-274 | Errors and empty states | Errors never leave the editor and leave the diagram unchanged | keep: robustness | [ ] | |
| EDT-275 | Errors and empty states | Per-database: schema pickers appear for PostgreSQL, CockroachDB, SQL Server, ClickHouse and Oracle only | keep: database rule | [ ] | |
| EDT-276 | Errors and empty states | Per-database: arrays only on PostgreSQL and CockroachDB; custom types only on PostgreSQL; index types only on PostgreSQL/CockroachDB | keep: database rule | [ ] | |
| EDT-277 | Errors and empty states | Per-database: new tables take the default schema (public, dbo, default) when schemas are used | keep: database rule | [ ] | |
| EDT-278 | Errors and empty states | Per-database: each database offers its own type list with common types first | keep: core | [ ] | |
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
| SHL-001 | Config | With no backend URL configured (empty `/config.js`, no dev variable) the app runs in local mode with no account UI [A1] | keep | [ ] | |
| SHL-002 | Config | With a backend URL (runtime `/config.js` value, trailing slash removed, or the dev variable) the app runs in server mode [A1] | keep | [ ] | |
| SHL-003 | Config | The shipped server answers `/config.js` with the value `/api`, so the editor and API share one origin [A1] | keep | [ ] | |
| SHL-004 | Config | Theme is applied before first paint by a separate script file, so no flash of the wrong theme and no inline script [A1] | keep | [ ] | |
| SHL-005 | Config | The app works under the server's content security policy: same-origin scripts, fonts, requests; no CDN or inline script [A1] | keep | [ ] | |
| SHL-006 | Config | Fonts (Inter, JetBrains Mono, Manrope) are bundled; nothing is requested from third parties [A1] | keep | [ ] | |
| SHL-007 | Config | Page is noindex (meta tag and robots.txt disallow all); favicon is empty; viewport is device width [A1] | keep | [ ] | |
| SHL-008 | Config | `VITE_HOST_URL` and `VITE_APP_URL` build variables exist but change nothing visible [A1] | drop | [ ] | |
| SHL-009 | Routes | Server mode: `/` is the project picker; `/<slug>/diagrams` and `/<slug>/diagrams/<id>` are the editor; `/diagrams/<local-id>` is the old bookmark form [A2] | keep | [ ] | |
| SHL-010 | Routes | Local mode: `/` and `/diagrams/<id>` are the editor [A2] | keep | [ ] | |
| SHL-011 | Routes | `/admin` redirects to `/admin/overview`; sections `/admin/{overview,projects,users,diagrams,activity}` are fixed paths [A2] | keep | [ ] | |
| SHL-012 | Routes | `/s/<token>` shows the shared-diagram viewer [A2, A13] | keep | [ ] | |
| SHL-013 | Routes | Unknown path shows a 404 page with "404", "Something's missing." and the footer mark [A2] | keep | [ ] | |
| SHL-014 | Routes | The server returns the app for any extension-less non-API path, so deep links and reloads work [A2] | keep | [ ] | |
| SHL-015 | Routes | Project slug in the URL is case-insensitive and URL-encoded in links [A2] | keep | [ ] | |
| SHL-016 | Routes | A diagram of another project opened through a project URL shows "not found", never the diagram [A2, A8] | keep | [ ] | |
| SHL-017 | Routes | All pages load lazily (first load does not include admin, viewer, DBML parser) [A2] | keep | [ ] | |
| SHL-018 | Routes | `/examples` and `/templates*` pages exist in local mode only [A2, A12] | drop | [ ] | |
| SHL-019 | Start-up | First screen waits briefly for the person's language; a failed language load falls back to English [A3] | keep | [ ] | |
| SHL-020 | Start-up | Local mode, `/` with a remembered default diagram: goes to `/diagrams/<id>` [A3] | keep | [ ] | |
| SHL-021 | Start-up | Local mode, no default but diagrams exist: Open dialog appears and cannot be dismissed [A3] | keep | [ ] | |
| SHL-022 | Start-up | Local mode, no diagrams at all: New diagram dialog appears and cannot be dismissed [A3] | keep | [ ] | |
| SHL-023 | Start-up | Opening `/diagrams/<id>` shows a full-screen spinner, clears undo/redo history, and falls back to the Open dialog if the diagram does not exist [A3] | keep | [ ] | |
| SHL-024 | Start-up | Opening any diagram makes it the remembered default [A3] | keep | [ ] | |
| SHL-025 | Start-up | There is no tutorial, tour, welcome screen or onboarding hint [A3] | keep | [ ] | |
| SHL-026 | Start-up | A forced-password-change dialog blocks the app when the server flags the account [A3, B2 P11] | keep | [ ] | |
| SHL-027 | Local data | Diagrams live in browser IndexedDB `QBase`; the old `QubdiDB` is merged in without overwriting, then deleted, retried each start [A4] | keep | [ ] | |
| SHL-028 | Local data | Every edit is saved immediately in local mode; no save button needed [A4] | keep | [ ] | |
| SHL-029 | Local data | Save icon in the navbar: hover text "Saved <time ago>" plus the exact local date and time on a second line [A4] | keep | [ ] | |
| SHL-030 | Local data | "Time ago" wording is translated for 12 languages, English for the rest; the word "Saved" is English only [A4] | change | [ ] | |
| SHL-031 | Local data | Ctrl/Cmd+S only updates the last-modified time [A4, A6] | change | [ ] | |
| SHL-032 | New dialog | Step 1 shows "Transactional" tab (MySQL, PostgreSQL, MariaDB, SQLite, SQL Server, Oracle, CockroachDB) and "Analytical" tab (ClickHouse) as option cards, 3 per row, 2 rows, with a more/fewer toggle [A5] | keep | [ ] | |
| SHL-033 | New dialog | Picking a database card selects it and goes straight to the import step [A5] | keep | [ ] | |
| SHL-034 | New dialog | Footer: Cancel when a diagram is open, "Import from file" when none is; "Empty diagram" and "Continue" disabled until a type is chosen [A5] | keep | [ ] | |
| SHL-035 | New dialog | "Empty diagram" creates a blank diagram of the chosen type at once [A5] | keep | [ ] | |
| SHL-036 | New dialog | Step 2 offers the import wizard (script, SQL, DBML, edition choice) with Back, "Create empty diagram" and Import [A5] | keep | [ ] | |
| SHL-037 | New dialog | A metadata script with more than 50 tables and views opens a table-selection step before import [A5] | keep | [ ] | |
| SHL-038 | New dialog | Dialog cannot be closed while parsing, and cannot be closed at all when no diagram is open [A5] | keep | [ ] | |
| SHL-039 | New dialog | New diagrams are named "Diagram N" (N = number of diagrams + 1), become the default, and the URL becomes `/diagrams/<id>` [A5] | keep | [ ] | |
| SHL-040 | New dialog | Dialog resets to step 1 with nothing chosen each time it opens [A5] | keep | [ ] | |
| SHL-041 | New dialog | A card links to the examples page [A5, A12] | drop | [ ] | |
| SHL-042 | New dialog | The "More Databases" / "Primary Databases" toggle is English only [A14] | change | [ ] | |
| SHL-043 | Open dialog | Table of diagrams: icon, name, created (hidden on phones), last modified, table count, row menu; newest modified first [A5] | keep | [ ] | |
| SHL-044 | Open dialog | Click selects, double-click opens, Enter/Space opens, Up/Down move between rows [A5] | keep | [ ] | |
| SHL-045 | Open dialog | Footer: Cancel (hidden when not closable), "New database", "Open" (disabled until selection) [A5] | keep | [ ] | |
| SHL-046 | Open dialog | Row menu has Open, Duplicate, Delete (red) [A5] | keep | [ ] | |
| SHL-047 | Open dialog | Duplicate makes a copy with new ids named "<name> (Copy)" and refreshes the list without opening it [A5] | keep | [ ] | |
| SHL-048 | Open dialog | Delete happens with no confirmation; deleting the open or last diagram reloads to `/` [A5] | change | [ ] | |
| SHL-049 | Open dialog | There is no search box and no rename in the local Open dialog [A5] | change | [ ] | |
| SHL-050 | Rename | Double-click the diagram name (or the hover pencil) to edit; Enter, check button or click-away saves; empty name is ignored [A5] | keep | [ ] | |
| SHL-051 | Rename | Tooltip "Double-click to edit"; name truncates at about 300 px; clicking the database icon opens the Open dialog [A5] | keep | [ ] | |
| SHL-052 | Delete | Actions > Delete diagram asks for confirmation; local mode then goes to `/` [A5, A11] | keep | [ ] | |
| SHL-053 | Delete | In a project, Delete diagram is shown to project admins only; the server copy goes first, failure shows a red toast and loses nothing [A5] | keep | [ ] | |
| SHL-054 | Clear | Edit > Clear asks for confirmation then empties the diagram but keeps it [A5] | keep | [ ] | |
| SHL-055 | Navbar | Desktop navbar: logo (links to `/`), menubar, centred diagram icon and name, right-hand controls; right controls hidden under 640 px [A6] | keep | [ ] | |
| SHL-056 | Navbar | Right-hand order: save status, get latest, lint, drift, publish, account menu or Sign in, language button [A6] | keep | [ ] | |
| SHL-057 | Menu Actions | Import submenu: .json, SQL, DBML; SQL and DBML open the import dialog limited to the diagram's database type [A6] | keep | [ ] | |
| SHL-058 | Menu Actions | Export SQL submenu: own type first, then PostgreSQL, MySQL, SQL Server, MariaDB, SQLite, without repeating the own type [A6] | keep | [ ] | |
| SHL-059 | Menu Actions | Export as: PNG and JPG open an options dialog; SVG exports at once (transparent, no dotted background, scale 1); JSON opens the export dialog [A6] | keep | [ ] | |
| SHL-060 | Menu Actions | Delete diagram item at the bottom (server mode: admins only) [A6] | keep | [ ] | |
| SHL-061 | Menu Edit | Undo and Redo with shortcut labels, disabled when empty; Clear with confirmation [A6] | keep | [ ] | |
| SHL-062 | Menu View | Show/Hide sidebar (Ctrl/Cmd+B), cardinality, field attributes, minimap; Compact/Standard tables (English only) [A6] | keep | [ ] | |
| SHL-063 | Menu View | Zoom on scroll submenu On/Off; Show views submenu On/Off; Theme submenu System/Light/Dark with Ctrl/Cmd+M label [A6] | keep | [ ] | |
| SHL-064 | Menu Backup | Backup menu: Export diagram and Restore diagram, same dialogs as the JSON items under Actions [A6] | drop | [ ] | |
| SHL-065 | Shortcuts | Undo Ctrl/Cmd+Z, Redo Ctrl/Cmd+Shift+Z, Open Ctrl/Cmd+O, Save Ctrl/Cmd+S, side panel Ctrl/Cmd+B, fit all Ctrl/Cmd+0, theme Ctrl/Cmd+M, filter Ctrl/Cmd+F; Mac uses Cmd; browser default prevented [A6] | keep | [ ] | |
| SHL-066 | Shortcuts | Fit-all animates 0.5 s with 10% padding and max zoom 0.8; theme shortcut works inside inputs [A6] | keep | [ ] | |
| SHL-067 | Shortcuts | In server mode Ctrl/Cmd+O goes to `/` instead of the Open dialog [A6, A8] | keep | [ ] | |
| SHL-068 | Mobile | Under 768 px: hamburger opens the icon rail as an overlay; navbar shows "QBase", account menu, language button, then menubar and diagram name [A6] | keep | [ ] | |
| SHL-069 | Mobile | Save status, get-latest, lint, drift and publish controls are not shown on phones [A6] | change | [ ] | |
| SHL-070 | Mobile | Side panel is a full-height drawer titled "Manage Diagram" with a section dropdown; starts hidden [A7] | keep | [ ] | |
| SHL-071 | Mobile | The mobile section dropdown lacks DBML and its "Areas" entry shows Custom types [A7] | change | [ ] | |
| SHL-072 | Mobile | Editor uses dynamic viewport units on phones so browser bars do not cut it off [A7, A16] | keep | [ ] | |
| SHL-073 | Mobile | Drawer title and description are English only [A7, A14] | change | [ ] | |
| SHL-074 | Sidebar | Icon rail: New diagram and Browse on top; separator; Tables, DBML, Refs, Custom types (only where supported), Visuals; active item tinted [A7] | keep | [ ] | |
| SHL-075 | Sidebar | Custom types entry appears only for database types that support them (PostgreSQL) [A7] | keep | [ ] | |
| SHL-076 | Sidebar | Visuals opens on the Areas tab; no external links in the rail footer [A7] | keep | [ ] | |
| SHL-077 | Side panel | Resizable: default 25%, minimum 25% and 350 px, up to 99%; hides to zero with a 200 ms animation and no drag handle when hidden [A7] | keep | [ ] | |
| SHL-078 | Side panel | DBML section loads its parser only when first opened [A7] | keep | [ ] | |
| SHL-079 | Side panel | Opening an item from elsewhere (canvas, lint finding) shows the panel, picks the section/tab and expands the item [A7] | keep | [ ] | |
| SHL-080 | Settings | No settings page; View-menu toggles, theme and language are the settings [A10] | keep | [ ] | |
| SHL-081 | Settings | Settings persist in localStorage under `theme`, `scroll_action`, `show_db_views`, `show_cardinality`, `show_field_attributes`, `compact_tables`, `show_minimap_on_canvas` with the defaults listed in A10 [A10] | keep | [ ] | |
| SHL-082 | Settings | Show field attributes is not persisted on main (resets on reload) [A10] | change | [ ] | |
| SHL-083 | Settings | A browser that refuses storage still opens the app with defaults [A10] | keep | [ ] | |
| SHL-084 | Settings | Settings survive sign-out; no diagram data is stored in them [A10] | keep | [ ] | |
| SHL-085 | Theme | Light, Dark and System; System follows the OS live; dark is a class on the root element; whole app follows [A10] | keep | [ ] | |
| SHL-086 | Theme | Toggle by menu or Ctrl/Cmd+M; with System it flips to the opposite of what System resolves to [A6, A10] | keep | [ ] | |
| SHL-087 | Toasts | One toast at a time (new replaces old), title, description, optional action, close button, default and destructive variants [A11] | keep | [ ] | |
| SHL-088 | Toasts | Toasts auto-dismiss after the library default (about 5 s, unverified) [A11] | keep | [ ] | |
| SHL-089 | Toasts | Toaster is mounted only in the editor page on main; mount it at the app root [A11] | change | [ ] | |
| SHL-090 | Alerts | Confirm dialog with title, description, confirm and cancel labels; confirm runs the action then closes; cancel/Escape closes [A11] | keep | [ ] | |
| SHL-091 | Templates | Examples page with 3 shipped example diagrams [A12] | drop | [ ] | |
| SHL-092 | Templates | 50 templates (36 PostgreSQL, 14 MySQL, 22 featured, 16 tags) with list, featured, by-tag, detail and clone pages, 100 thumbnails [A12] | drop | [ ] | |
| SHL-093 | Languages | 22 languages offered, English first, each with native and English name [A14] | keep | [ ] | |
| SHL-094 | Languages | Language chosen by the browser language detector (URL parameter, cookie, localStorage, browser list), remembered in localStorage `i18nextLng` [A14] | keep | [ ] | |
| SHL-095 | Languages | Only English is bundled; other languages load on first use; a regional code uses its base file; unknown codes and missing keys fall back to English [A14] | keep | [ ] | |
| SHL-096 | Languages | Language button (globe, tooltip "Change language") opens a searchable dropdown; change applies at once without reload [A14] | keep | [ ] | |
| SHL-097 | Languages | Document `lang` follows the language; Arabic switches the document to right-to-left [A14] | keep | [ ] | |
| SHL-098 | Languages | Editor texts must be complete per language; QBase texts (`qubdi.*`) may be partial and fall back to English [A14] | keep | [ ] | |
| SHL-099 | Languages | Texts that are English only on main (compact tables label, drawer title, "Saved", more-databases toggle, 404 page) get translated [A14] | change | [ ] | |
| SHL-100 | Title | Default title and og:title "QBase - Database schema diagrams"; description and og:description as in A15 [A15] | keep | [ ] | |
| SHL-101 | Title | In the editor the title is "QBase - <diagram name>" and updates on rename; default while loading [A15] | keep | [ ] | |
| SHL-102 | Title | Home, admin and viewer pages set their own translated titles [A15] | keep | [ ] | |
| SHL-103 | Browser fixes | Safari 15.3 and older: stand-ins for structured copy, `at()` and `Object.hasOwn` installed before anything runs [A16] | change | [ ] | |
| SHL-104 | Browser fixes | Old-Safari workaround that disables extra markdown table features in the templates preview [A16] | drop | [ ] | |
| SHL-105 | Home | Project picker: heading, description, search (shown only when projects exist or a search is active), card grid (3/2/1 columns, 9 per page) with name, role badge, description, diagram count, pager [A9] | keep | [ ] | |
| SHL-106 | Home | Empty and no-match states; admin with no projects is pointed to the admin panel; signed-out shows a sign-in prompt and a "session ended" notice when applicable [A9] | keep | [ ] | |
| SHL-107 | Home | Page frame: 48 px bar with logo, Admin button and email menu (Change password, Sign out); footer "Powered by Qubdi" [A9] | keep | [ ] | |
| SHL-108 | Home | Admins are sent to the admin panel once per browser session when they open `/` [A9, A2] | keep | [ ] | |
| SHL-109 | Project dialogs | In a project, Open lists the project's diagrams with filter, role badge, created by, row menu (Open, Get latest only with a local copy, Delete for admins with confirmation) [A8] | keep | [ ] | |
| SHL-110 | Project dialogs | In a project, New diagram is a small form (optional name up to 200 chars, database type default PostgreSQL, Create, optional Import from database) and cleans up the local copy if the server step fails [A8] | keep | [ ] | |
| SHL-111 | Access | Editor in a project requires sign-in; shows project-not-found, diagram-not-found, open-failed screens with a Back to projects button [A8] | keep | [ ] | |
| SHL-112 | Access | Read-only banner under the navbar explains why (viewer, unbound, lost, error, lock taken) and offers Get latest, Retry or Move to project [A8] | keep | [ ] | |
| SHL-113 | Access | Old `/diagrams/<id>` link redirects to the project URL if bound, otherwise opens read-only with the move banner [A2, A8] | keep | [ ] | |
| SHL-114 | Account menu | Signed-out shows Sign in; signed-in shows Admin button (admins) and an email dropdown with the items listed in A8 [A8] | keep | [ ] | |
| SHL-115 | Build | One image serves the editor and the API under `/api` on port 3001 with long cache for hashed assets and pre-compressed files [A17] | keep | [ ] | |
| QBS-001 | Contract | The editor exposes `useDiagram()` with `currentDiagram`, `tables`, `databaseType`, `readonly`, `addIndex`, `removeIndex`, `updateField`, `updateTable`, `updateDiagramData` [B1 C1] | keep | [ ] | |
| QBS-002 | Contract | Each edit replaces the changed top-level array of the diagram by a new reference; untouched parts keep theirs; `updatedAt` moves on every edit [B1 C1] | keep | [ ] | |
| QBS-003 | Contract | While another diagram loads, `currentDiagram` is an empty placeholder with a different id [B1 C1] | keep | [ ] | |
| QBS-004 | Contract | `DiagramProvider` accepts `readonly`; read-only means nothing is changed or stored and edit controls are inactive [B1 C2] | keep | [ ] | |
| QBS-005 | Contract | `Diagram` type and `diagramSchema` keep the saved shape and stay backward compatible with data already on servers [B1 C3] | keep | [ ] | |
| QBS-006 | Contract | `DatabaseType` and `DatabaseEdition` string values and `DBTable/DBField/DBIndex/DBRelationship/DBCustomType` shapes are not renamed [B1 C4] | keep | [ ] | |
| QBS-007 | Contract | `databaseTypeToLabelMap`, `databasesWithSchemas` and `dataTypeMap` are provided at their paths [B1 C5, C6] | keep | [ ] | |
| QBS-008 | Contract | `useStorage()` offers `addDiagram`, `deleteDiagram`, `listDiagrams`, `getDiagram`; `StorageProvider` also works on the home page [B1 C7] | keep | [ ] | |
| QBS-009 | Contract | The storage provider migrates the legacy `QubdiDB` through `adoptLegacyLocalData` and uses the shared database names [B1 C7] | keep | [ ] | |
| QBS-010 | Contract | History supports a whole-diagram replace as one undo step (`updateDiagramData` with before and after diagrams) and `resetRedoStack` [B1 C8] | keep | [ ] | |
| QBS-011 | Contract | `useLayout()` gives `isSidePanelShowed` and `openTableFromSidebar`; `useFocusOn()` gives `focusOnTable` [B1 C9, C10] | keep | [ ] | |
| QBS-012 | Contract | `LocalConfigProvider`, `LocalConfigContext` and `ThemeProvider` exist at their paths and open with defaults when storage throws [B1 C11, C12] | keep | [ ] | |
| QBS-013 | Contract | `useToast().toast({...})` and `Toaster` keep today's call shape [B1 C13] | keep | [ ] | |
| QBS-014 | Contract | UI primitives used by QBase files (button, input, dialog, alert-dialog, dropdown-menu, popover, table, tabs, checkbox, label, badge, spinner) exist at their paths with compatible props [B1 C14] | keep | [ ] | |
| QBS-015 | Contract | Removed QBase modules are recreated and pass the existing tests: GetLatestControl/Dialog, ProjectDiagrams, emptyDiagram/defaultDiagramName, DiagramLinksDialog, LastSaved [B1 C15] | keep | [ ] | |
| QBS-016 | Contract | `database-metadata` type and zod schema stay at their fixed path; the server and the Docker build depend on it [B1 C16, A17] | keep | [ ] | |
| QBS-017 | Contract | `loadFromDatabaseMetadata` builds a full diagram (tables, fields, indexes, relationships, views, ids, layout) from PostgreSQL and SQL Server metadata [B1 C17] | keep | [ ] | |
| QBS-018 | Contract | `createRelationshipsFromMetadata` returns relationships from foreign key rows and the diagram's tables [B1 C18] | keep | [ ] | |
| QBS-019 | Contract | Sibling modules for the kept SQL import/export files and canvas tests exist under the same names (`exportBaseSQL`, `validateWithRules`, `canvas-utils`, and others) [B1 C19, C20] | keep | [ ] | |
| QBS-020 | Contract | `i18n`, `i18nReady`, `languages` exports work outside React; locale files follow the one-object-per-code shape; English merges the six `qubdi` files [B1 C21] | keep | [ ] | |
| QBS-021 | Contract | `cn`, `generateId` and `area-utils` exist at `@/lib/utils` [B1 C22] | keep | [ ] | |
| QBS-022 | Contract | `EditorPage` provider order: local config, theme, storage, access gate, then editor providers; autosave and toaster rendered once [B1 C23] | keep | [ ] | |
| QBS-023 | Contract | `buildRoutes(backendEnabled)` and `App` composition (QBase provider, forced password change, admin route) are kept [B1 C24] | keep | [ ] | |
| QBS-024 | Plug-in | The access gate wraps the diagram provider and sits inside storage [B2 P1] | keep | [ ] | |
| QBS-025 | Plug-in | A full-width banner row exists between the navbar and content on desktop and mobile [B2 P2] | keep | [ ] | |
| QBS-026 | Plug-in | Navbar save slot shows cloud states in server mode (saved, unsaved with retry, saving, not saved, conflict with Overwrite) and the plain save icon otherwise [B2 P3] | keep | [ ] | |
| QBS-027 | Plug-in | Get latest icon appears only for a signed-in user with a local and a server copy; confirm, replace copy, reload project URL [B2 P4] | keep | [ ] | |
| QBS-028 | Plug-in | Lint button with count badge opens a floating findings panel; show-table opens the side panel and zooms; fixes run through undoable editor operations [B2 P5] | keep | [ ] | |
| QBS-029 | Plug-in | Drift badge polls every 60 s while the tab is visible, checks once on open, and its report can ask for a re-sync through the `qubdi:open-resync` window event [B2 P6, P10] | keep | [ ] | |
| QBS-030 | Plug-in | Publish button shows sync/publish status, dialog takes a note and an auto-publish switch, only for the editor holding the lock [B2 P7] | keep | [ ] | |
| QBS-031 | Plug-in | In a project, the editor's new and open diagram requests open the project dialogs, not the local ones [B2 P9] | keep | [ ] | |
| QBS-032 | Publish | Publish flushes pending autosave, uploads, publishes with an optional note, toasts "Published v<n>" or a red failure with the server message [B3] | keep | [ ] | |
| QBS-033 | Share | Share dialog ensures the diagram is on the server first, then creates links (anyone, signed-in only, off; optional end date; optional live) that open `/s/<token>` [B3] | keep | [ ] | |
| QBS-034 | Share | Admins can list and revoke a diagram's share links from the admin panel, with a second confirmation [B3] | keep | [ ] | |
| QBS-035 | Upload | Upload keeps all ids as they are, sends a conflict base version and the tab's editor id, and re-creates a missing server diagram only when a project is known [B3] | keep | [ ] | |
| QBS-036 | Autosave | Autosave sends 10 seconds after the last change, only for an editor holding the lock [B3] | keep | [ ] | |
| QBS-037 | Autosave | Closing or hiding the page sends the final save with keep-alive; unsent edits trigger the browser's leave-page prompt [B3] | keep | [ ] | |
| QBS-038 | Autosave | After a reload or re-login, an unsent difference from the server version is detected and sent [B3] | keep | [ ] | |
| QBS-039 | Conflict | A 409 shows the conflict text with Overwrite; a save that landed without its reply is not treated as a conflict [B3] | keep | [ ] | |
| QBS-040 | Lock | The editor takes the per-diagram lock on open, renews it every 20 s, releases it after the final save and on page hide; without it the tab opens read-only [A8, B3] | keep | [ ] | |
| QBS-041 | Lock lost | A 423 on save makes the editor read-only with the "taken" banner and drops unsent edits [B3] | keep | [ ] | |
| QBS-042 | Open remote | Opening a project diagram downloads, validates and stores a local copy, refreshes an out-of-date clean copy, and refuses an unpublished diagram for viewers [A8, B3] | keep | [ ] | |
| QBS-043 | Import from DB | "Import from database" in a project's New diagram lists schemas and tables from a saved connection, previews counts, then creates and uploads the diagram [B3] | keep | [ ] | |
| QBS-044 | Re-sync | Re-sync compares the live database with the diagram, shows grouped changes with checkboxes (renames only suggested), applies the chosen ones as one undo step, updates source keys and the server copy [B3] | keep | [ ] | |
| QBS-045 | Drift | Drift detection compares the database with the last published diagram and shows a badge; the dialog can start a re-sync [B3] | keep | [ ] | |
| QBS-046 | Lint | Lint runs offline on the diagram with per-diagram settings mirrored to the server; stale fixes show a red toast and do nothing [B3] | keep | [ ] | |
| QBS-047 | Get latest | Get latest deletes the local copy, hands its sync state to the new copy, and reloads the project URL to download the server version [B3] | keep | [ ] | |
| QBS-048 | Sign-out | Sign-out or a change of account deletes the `QBase` and `QubdiDB` databases and all `qbase.*` storage keys, then reloads; interface settings stay [B3] | keep | [ ] | |
| QBS-049 | Sign-out | The editor stores diagram data nowhere else, so nothing survives a sign-out [B3] | keep | [ ] | |
| QBS-050 | Standalone | The admin page and share viewer use no editor module (no diagram, canvas or storage provider; home uses storage) [A13, B3] | keep | [ ] | |
| QBS-051 | Server | The server needs only the metadata type file and `shared/` from the editor side [B3] | keep | [ ] | |
| QBS-052 | Tests | Existing QBase tests on this branch pass unchanged: server-autosave, get-latest-control, project-diagrams, share-link-list, diagram-links-dialog, last-saved, lib/qubdi tests, stored settings, i18n [B3] | keep | [ ] | |
