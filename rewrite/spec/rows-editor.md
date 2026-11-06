# Parity checklist rows: the editor surface (EDT)

One observable behaviour per row, taken from `rewrite/spec/editor.md`. Decision is a
recommendation to the owner: keep, change or drop, with a one-line reason. Status `[ ]` open.

| ID | Area | Behaviour (what a person sees) | Decision | Status | Test |
| --- | --- | --- | --- | --- | --- |
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
