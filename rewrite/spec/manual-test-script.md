# Manual test script

This is the checklist a person follows on the **new** editor to confirm the parity rows that
cannot be fully checked by automated tests. Every step cites the rows of
`rewrite/parity-checklist.md` it confirms. Rows marked **drop** in `owner-decisions.md` are not
tested. Rows marked **change** are tested against the new behaviour written in the Decision
text of `owner-decisions.md`, not against the old one. Rows left to automated tests only are
listed in the coverage table at the end.

Notation: `->` separates the action from the expected result. "Mod" is Ctrl on Windows and
Linux and Cmd on macOS. A step passes only when everything in its expected result is true.

## 0. Before you start

### 0.1 How to start the app

1. Local-only build: serve the editor with no backend URL (empty `/config.js`, no dev
   variable). No account controls must be visible. Use this build for sections 1 to 16 and 20.
2. Server build: run the Docker image (editor and API on one origin, port 3001) or the dev
   server with the backend URL set. Use this build for sections 17 to 19 and for the
   server-mode steps elsewhere.
3. Use a clean browser profile for each run (no site data). Use a second profile or a private
   window where a step says "second tab" or "second browser".
4. Run the whole script once on a desktop window (at least 1280 px wide), then sections 15
   and 16 on a phone or a 390 px wide window.

### 0.2 Accounts and data needed

- Local mode: nothing. Keep the sample files of the appendix at hand (they are plain text; save
  them as files where a step asks for a file).
- Server mode: one **admin**, one **project admin**, one **editor** and one **viewer** account in
  a project called "Test"; a second project "Other" with its own diagram; a third account with
  no project. A password for each.
- One reachable PostgreSQL database and one SQL Server database holding a small schema of
  your own (at least 3 tables, 1 foreign key, 1 view) for the import-from-database steps. Write
  down the host, port, user and password.
- A diagram file saved by the **previous** editor (a `ChartDB(...)` JSON file) and, if you can
  get one, a browser profile that still holds the old `QubdiDB` database and diagrams of the old
  database versions. Ask the owner for them.
- Model **S1** (customers and orders): create it once by importing the DBML sample of
  appendix A.6. Several steps start from "S1".

### 0.3 What to record when a step fails

Step id (for example MT-042), the build (local or server), browser and version, window size,
operating system, what you did, what you expected, what happened. Attach a screenshot, and the
browser console text if there is any error. If a diagram file is involved, attach it (remove
secrets first). Then continue with the next step; do not stop the run.

Tick the box when the step passes. Write F next to it and the note when it fails.

---

## 1. Diagrams: first start, list, new, open

- [ ] **MT-001** Open the app in a clean profile (local build) -> the New diagram dialog appears and cannot be closed (no Cancel, Escape and outside click do nothing) (rows: SHL-022, SHL-038, SHL-010)
- [ ] **MT-002** Step 1 of the dialog: look at the tabs -> a "Transactional" tab with PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, CockroachDB, and a second tab for other databases; Oracle and ClickHouse are not offered for import; the toggle text between the two groups is translated when the language is not English (rows: SHL-032, SHL-042, IMP-001, IMP-004)
- [ ] **MT-003** Click the PostgreSQL card -> the card is selected and the import step opens at once (rows: SHL-033)
- [ ] **MT-004** Go back, tick nothing: check the footer -> "Empty diagram" and "Continue" are disabled until a card is selected; with no diagram open the footer offers "Import from file" instead of Cancel (rows: SHL-034)
- [ ] **MT-005** Select MySQL and press "Empty diagram" -> a blank MySQL diagram named "Diagram 1" opens, the URL is `/diagrams/<id>`, the browser tab reads "QBase - Diagram 1" (rows: SHL-035, SHL-039, DAT-022, DAT-019, EDT-013, SHL-101)
- [ ] **MT-006** Open the New dialog again from the icon rail (New) -> it starts at step 1 with nothing chosen; it now has a Cancel button; it cannot be closed while a parse is running (rows: SHL-040, SHL-038, SHL-034)
- [ ] **MT-007** Create a second blank diagram, then a third -> they are named "Diagram 2" and "Diagram 3" and each becomes the one that opens by default (rows: SHL-039, DAT-009, SHL-024)
- [ ] **MT-008** Reload the page on `/` -> the remembered diagram opens at `/diagrams/<id>` (rows: SHL-020, DAT-001, DAT-009)
- [ ] **MT-009** Open the diagram list with the Open entry of the rail -> a table with icon, name, created date, last modified, table count and a row menu; the most recently modified diagram is first; on a 390 px window the created column is hidden (rows: SHL-043, SHL-049)
- [ ] **MT-010** In the list: click a row, then press Down and Up, then Enter -> click selects, arrows move the selection, Enter (and double-click, and Space) opens the selected diagram; Open is disabled until a row is selected (rows: SHL-044, SHL-045)
- [ ] **MT-011** Row menu of a diagram -> Open, Duplicate and Delete (in red) are offered (rows: SHL-046)
- [ ] **MT-012** Choose Duplicate on "Diagram 2" -> a diagram "Diagram 2 (Copy)" appears in the list with new ids and the same content; the list refreshes and the copy is not opened (rows: SHL-047)
- [ ] **MT-013** Type in the list's search box and rename a diagram from the list -> the list narrows by name and a diagram can be renamed there (new behaviour: search and rename exist in the Open dialog) (rows: SHL-049)
- [ ] **MT-014** Choose Delete on a diagram that is not open -> a confirmation is asked first; confirming removes it from the list; cancelling keeps it (new behaviour) (rows: SHL-048, SHL-052)
- [ ] **MT-015** Delete the diagram that is currently open, confirm -> the app goes to `/` and opens another diagram or the Open/New dialog; delete the last remaining diagram -> the New dialog appears (rows: SHL-048, SHL-052, SHL-021, SHL-022)
- [ ] **MT-016** Use Actions > Delete diagram on the open diagram -> a "Delete Diagram" confirmation with Delete and Cancel; Cancel keeps it; Delete removes it and goes to `/` (rows: EDT-258, SHL-052)
- [ ] **MT-017** With diagrams present but no remembered default (remove the stored default by hand in the browser's storage) open `/` -> the Open dialog appears and cannot be dismissed (rows: SHL-021)
- [ ] **MT-018** Open `/diagrams/does-not-exist` -> a spinner, then the Open dialog (rows: SHL-023)
- [ ] **MT-019** Open a diagram, make an edit, open a second diagram, press Undo -> nothing is undone (history is cleared when diagrams switch) or the history of the new diagram is empty as the new behaviour says (rows: SHL-023, EDT-222)
- [ ] **MT-020** Reload with a large diagram open -> a spinner, then a "Loading diagram" badge until the tables are drawn, then the view fits all tables (zoom not above 80%) (rows: EDT-011, EDT-012)
- [ ] **MT-021** Make an edit and watch the navbar save icon; hover it -> the text reads "Saved <time ago>" with the exact local date and time on a second line; the words are translated (new behaviour) when the language is not English (rows: SHL-029, SHL-030, EDT-256, SHL-028, DAT-023)
- [ ] **MT-022** Double-click the diagram name in the navbar, change it, press Enter; repeat with click-away; repeat with an empty name and with Escape -> the name changes on Enter and click-away; an empty name is ignored; the tooltip says "Double-click to edit"; the tab title follows the new name; a long name is truncated; clicking the database icon next to the name opens the Open dialog (rows: SHL-050, SHL-051, EDT-255, SHL-101)
- [ ] **MT-023** Rename the diagram, press Undo -> the old name is back; Redo gives the new one (rows: EDT-223)
- [ ] **MT-024** Check there is no tour, welcome page or hint on first start of a new diagram (rows: SHL-025)
- [ ] **MT-025** Open `/nonsense/path` -> a 404 page with "404" and "Something's missing." and the footer mark; its text is translated in other languages (rows: SHL-013, SHL-099)

## 2. Layout, side panel and navigation (desktop)

- [ ] **MT-026** Open a diagram on a 1280 px window -> top bar, a left icon rail, a side panel and the canvas are visible; the panel is already open (rows: EDT-001, EDT-005, SHL-055)
- [ ] **MT-027** Read the icon rail -> New, Open, a separator, Tables, DBML, Refs, Visuals; Custom Types appears only in a PostgreSQL diagram (check with a MySQL diagram: no Custom Types) (rows: EDT-002, SHL-074, SHL-075, EDT-187, EDT-276)
- [ ] **MT-028** Click each rail section -> the panel shows that section and the section is highlighted; with the panel hidden a click opens it (rows: EDT-003)
- [ ] **MT-029** Open Visuals -> it opens on the Areas tab with Notes as the second tab; the rail footer has no external links (rows: EDT-218, SHL-076)
- [ ] **MT-030** Drag the panel's handle to the right and to the left -> the panel grows; it never gets narrower than 350 px; it can reach nearly the full width (rows: EDT-004, SHL-077)
- [ ] **MT-031** Press Mod+B, then use View > Hide Sidebar and Show Sidebar -> the panel hides (with a short animation, no handle) and returns; the menu items show Mod+B in the platform's symbols (rows: EDT-252, EDT-262, SHL-077, EDT-271, SHL-062)
- [ ] **MT-032** Select a table on the canvas and double-click its row's pencil/open-in-panel button; also hide the panel and open a table from the canvas -> the panel opens, the Tables section is selected and the table's row is expanded and scrolled into view (rows: SHL-079, EDT-111)
- [ ] **MT-033** Look at the menu bar -> Actions, Edit, View; there is no Backup menu (rows: EDT-251, SHL-064)
- [ ] **MT-034** Check the top bar order on the right in server mode -> save status, get latest, lint, drift, publish, account menu or Sign in, language button (rows: SHL-056)

## 3. Canvas: pan, zoom, select, move

Start from S1 plus 10 extra tables made with Add Table so that the diagram does not fit in one screen.

- [ ] **MT-035** Drag the empty background -> the canvas pans (rows: EDT-015)
- [ ] **MT-036** Scroll the mouse wheel or use two fingers on a trackpad -> the canvas pans (default) (rows: EDT-016)
- [ ] **MT-037** Hold Mod and scroll; then pinch on a touch screen or trackpad -> the canvas zooms around the pointer, whatever the setting (rows: EDT-018)
- [ ] **MT-038** View > Zoom on Scroll > On, then scroll the wheel -> the wheel zooms around the pointer; set Off -> the wheel pans again; reload -> the choice is remembered; the menu shows On/Off (rows: EDT-017, SHL-063, SHL-081)
- [ ] **MT-039** Zoom out and in as far as possible -> the zoom stops at 10% and at 500% (rows: EDT-019)
- [ ] **MT-040** Use the toolbar plus and minus -> a smooth zoom step each; the percentage between them follows; click the percentage -> the zoom goes to 100% (rows: EDT-020, EDT-021)
- [ ] **MT-041** Press Show All on the toolbar and then Mod+0 -> all visible tables fit with a margin, the zoom is not above 80%, the move animates for about half a second (rows: EDT-022, EDT-263, SHL-065, SHL-066)
- [ ] **MT-042** Pan until no table is on screen -> a "Show All" pill appears above the toolbar (below it on a phone) and brings the tables back (rows: EDT-023)
- [ ] **MT-043** Click a table, then an area, then a note, then the background -> each gets an accent outline when selected; the background click clears the selection (rows: EDT-025)
- [ ] **MT-044** With S1 open and a table selected -> other tables fade to about 40% and grey; tables linked to the selected one stay normal (rows: EDT-032)
- [ ] **MT-045** Click a relationship line -> the line turns teal and shows a dot in the middle (rows: EDT-026, EDT-174)
- [ ] **MT-046** Select a table, then Shift-click (and Ctrl/Cmd-click) another, and again on the first -> objects are added to and removed from the selection (rows: EDT-027)
- [ ] **MT-047** Hold Shift and look at the cursor, then drag a rectangle on the background around three tables and half of a fourth -> the cursor shows a multi-select mark; only objects fully inside are selected (rows: EDT-028, EDT-029)
- [ ] **MT-048** Drag one of the selected tables -> all selected objects move together; the new positions stay after a reload (rows: EDT-030, EDT-034)
- [ ] **MT-049** Select two tables and a line and press Delete, then Undo; then repeat with Backspace -> everything selected is deleted in one go; Undo brings it all back; while typing in a text box Delete does not delete objects (rows: EDT-031, EDT-267, EDT-100)
- [ ] **MT-050** Select a table and drag its left and right edges -> the width changes between 224 and 450 px and not beyond; Undo restores it (rows: EDT-033, EDT-081, EDT-080, DAT-029)
- [ ] **MT-051** Turn on the magnet (tooltip "Snap to Grid (Hold Shift)") and drag a table; turn it off and drag with Shift held -> with snap on, tables land on a 20 px grid; Shift snaps temporarily (rows: EDT-035, EDT-270)
- [ ] **MT-052** Drag two tables so they overlap -> a warning-triangle button fades in at the top-left; press it and the overlapping tables flash red for about 0.6 s; an optional setting controls the outline on overlapping tables (new behaviour) (rows: EDT-038, EDT-039)
- [ ] **MT-053** Look at the bottom-centre toolbar -> Filter, Show All, Zoom out, zoom %, Zoom in, Auto Arrange, Undo, Redo; Undo and Redo are disabled when their stacks are empty (rows: EDT-040, EDT-041)
- [ ] **MT-054** Hide a table with the filter -> the Filter button turns teal; show everything -> it is neutral again (rows: EDT-042)
- [ ] **MT-055** Use View > Hide Mini Map, then Show Mini Map; reload -> the minimap at the bottom-right shows all tables and the viewport; the choice is remembered; clicking in it moves the view (rows: EDT-044, SHL-062)
- [ ] **MT-056** Look at the field type chips -> they are tinted by kind (text, number, date and time, identifier, boolean, JSON or XML) and a tooltip explains a tint; there is no legend box at the top-right (new behaviour: tooltips replace the legend) (rows: EDT-046)
- [ ] **MT-057** Look at the bottom-right corner -> a credit mark only if the owner decided to keep branding; otherwise nothing there (rows: EDT-047)
- [ ] **MT-058** Look for a full-screen button, press it if present -> follows the owner's decision; the page must not break either way (rows: EDT-048)

## 4. Auto arrange and canvas menus

- [ ] **MT-059** Click Auto Arrange on the toolbar -> a dialog titled "Auto Arrange Diagram" with buttons "Auto Arrange" and "Cancel"; Cancel changes nothing (rows: EDT-050)
- [ ] **MT-060** Confirm Auto Arrange on a diagram of 12 tables with 6 relationships -> related tables are near each other, unrelated tables form a grid, nothing overlaps; the view refits; one Undo restores the old layout (rows: EDT-051, EDT-024, EDT-052)
- [ ] **MT-061** Hide two tables with the filter, add an area with two tables, Auto Arrange -> hidden tables do not move; tables in the area stay grouped with their area (rows: EDT-052)
- [ ] **MT-062** Right-click an area with tables, choose Auto Arrange -> only its tables are laid out; the area grows if needed (rows: EDT-053)
- [ ] **MT-063** In a read-only diagram (see section 19.2, viewer account) -> Auto Arrange and snap buttons are not shown (rows: EDT-043)
- [ ] **MT-064** Right-click the empty canvas -> New Table, New View (when views are on), New Relationship, New Area, New Note, Auto Arrange Diagram (rows: EDT-054)
- [ ] **MT-065** Choose New Table from the canvas menu -> a table appears under the pointer, in the default schema, already open for editing (rows: EDT-055, DAT-028)
- [ ] **MT-066** Select two tables and right-click the canvas -> an extra "Move to Area (2)" entry lists the areas and New Area (rows: EDT-056)
- [ ] **MT-067** Right-click a table -> Edit Table, Duplicate Table, Add Relationship, Move to Area, Delete Table (rows: EDT-057)
- [ ] **MT-068** Select three tables, right-click one, Move to Area > an area -> all three move into the area; "No Area" is disabled for a table that is in no area (rows: EDT-058, EDT-059, EDT-204)
- [ ] **MT-069** Right-click an area -> Edit Area Name, Auto Arrange, Delete Area (rows: EDT-060)
- [ ] **MT-070** On a 390 px window long-press a table and the canvas -> the same menus open (new behaviour for touch) (rows: EDT-009)

## 5. Tables

- [ ] **MT-071** In the Tables section press Add Table -> a table named `table_1` appears near the top-left of the visible area, light blue (`#8eb7ff`), with one field `id`, primary key, unique, not null, and a primary-key index; it is added to the end of the list (rows: EDT-074, EDT-075, DAT-026, DAT-027, DAT-035)
- [ ] **MT-072** In a PostgreSQL diagram with two schemas visible, press Add Table -> a Select Schema dialog (Cancel, Confirm) asks the schema; with one schema it does not ask (rows: EDT-076, DAT-028, EDT-277)
- [ ] **MT-073** Create a table in a SQL Server diagram and in a PostgreSQL diagram -> the schema is `dbo` and `public`; in a MySQL or SQLite diagram no schema picker appears anywhere (rows: DAT-028, EDT-275, EDT-277)
- [ ] **MT-074** Turn on View > Database Views and use the Add Table split button -> it offers Add View; the new view is named `view_1`, grey (`#b0b0b0`), has a hollow swatch and no colour picker, no index section and no connection dots (rows: EDT-077, DAT-026, EDT-085, EDT-157, EDT-086)
- [ ] **MT-075** Open a diagram that contains views (import the SQL Server sample with a view added, or the zoo metadata plus a view) -> views are shown by default when the diagram has any (new behaviour); View > Database Views Off hides all of them and their lines everywhere, On shows them, the choice is remembered (rows: EDT-086, EDT-108, SHL-063)
- [ ] **MT-076** Look at a table card -> a colour swatch, a bold name, a subtitle (schema, "view", or the first line of the description) and a field count; hover the header -> the count is replaced by an open-in-panel button and a widen/narrow button (rows: EDT-078, EDT-079, EDT-087)
- [ ] **MT-077** Press the widen button twice -> it toggles between the narrowest and the widest width (two states) (rows: EDT-082)
- [ ] **MT-078** Give a table 14 fields -> only 10 are shown (primary key and relationship fields are always kept) with a Show More button; Show More expands it, Show Less collapses it; the state is still there after a reload (rows: EDT-083, DAT-030)
- [ ] **MT-079** Change a table's colour with the picker: pick a palette colour, then a custom colour -> 12 palette colours plus a custom one; the recent custom colours are offered next time and survive a reload, also after you open another diagram; the list never holds more than 12 (rows: EDT-084, DAT-091)
- [ ] **MT-080** Double-click a table (and use Edit Table in the right-click menu) -> an in-place edit card opens with a schema box (when schemas apply), name, field list, colour picker, Add Field and the field count (rows: EDT-088, EDT-089)
- [ ] **MT-081** In the edit card look at one field row -> a name box, a type picker, an N (nullable) toggle, a PK toggle and a delete toggle (rows: EDT-090)
- [ ] **MT-082** Type a new name in the edit card, wait 1 s, press Undo -> the name was saved once, one Undo reverts it; an empty or unchanged name is ignored (rows: EDT-094, EDT-223)
- [ ] **MT-083** In the edit card of a PostgreSQL table, open the schema box and choose "Create new schema", type `sales`, Enter; repeat and press Escape -> Enter creates the schema and assigns it; Escape cancels (rows: EDT-095)
- [ ] **MT-084** Close the edit card with its X, then reopen and close it with a click on the empty canvas, then with Escape, then by starting a relationship from the menu -> all four ways close it (rows: EDT-093, EDT-268)
- [ ] **MT-085** In the edit card scroll the field list with the wheel -> only the list scrolls, the canvas does not pan; with Mod held the canvas zooms (rows: EDT-092)
- [ ] **MT-086** In the Tables section double-click a table name (tooltip "Double-click to edit"), change it, Enter; then use the pencil and press Escape -> Enter saves, Escape cancels (rows: EDT-096)
- [ ] **MT-087** Rename a second table to the same name as the first -> the editor warns about the duplicate name (new behaviour) (rows: EDT-097)
- [ ] **MT-088** Open the Description accordion of a table, type text -> it saves as you type; the placeholder reads "No description"; the first line shows in the card subtitle and the full text as a tooltip (rows: EDT-098, EDT-087)
- [ ] **MT-089** Right-click a table with fields, indexes and a relationship, choose Duplicate Table -> a table `<name>_copy` appears 30 px right and 50 px down with fields and indexes but no relationship (rows: EDT-099)
- [ ] **MT-090** Delete a table that has relationships from the canvas menu, from the panel More actions and with the Delete key -> no confirmation appears; the table and its relationships go; one Undo restores them all (rows: EDT-100, EDT-181, EDT-146)
- [ ] **MT-091** In the panel use More actions > Change Schema on a PostgreSQL table that has another schema-less table beside it -> a dialog with Cancel and Change; only the chosen table changes schema, the other table is untouched (new behaviour) (rows: EDT-101)
- [ ] **MT-092** Check the Tables section -> a filter box and an Add Table button; each table is an accordion row (only one open at a time) with a drag handle, name, schema in brackets when several schemas are visible, a View tag for views, a pencil, the field count and a More actions menu (rows: EDT-102, EDT-103, EDT-190)
- [ ] **MT-093** Open More actions of a table and of a view -> Change Schema, Add Field, Add Index (not for views), Duplicate Table, Delete Table (rows: EDT-104)
- [ ] **MT-094** Drag a table row to another place in the list, Undo, Redo; add a table -> the order changes and is undoable; new tables go to the end (rows: EDT-105, DAT-032)
- [ ] **MT-095** Open a diagram without a stored order (import the PostgreSQL sample) -> the list shows tables before views, alphabetically (rows: EDT-106)
- [ ] **MT-096** Press a row's focus button -> the table is selected and centred at 100% zoom (rows: EDT-107)
- [ ] **MT-097** Type a name part in the Tables filter box; type something that matches nothing -> the list narrows; the empty text reads "No tables found matching your filter" with a Clear Filter button (rows: EDT-109, EDT-108)
- [ ] **MT-098** Delete every table -> the Tables section reads "No tables" with "Create a table to get started" and an Add Table button (rows: EDT-110)
- [ ] **MT-099** Hover a field row of a table in the panel for a moment -> a detail card shows the full information and the references / referenced by links (rows: EDT-116)
- [ ] **MT-400** Open a table with many fields (taller than the panel) in a diagram of several tables and scroll down inside it until the Indexes, Check Constraints and Description headers are in view; click Indexes, then Check Constraints, then Description -> each header stays where you clicked it and its section opens right under it (Fields folds); the panel does not jump to the tables further down the list. Then scroll back up to the top of the table and press Add Index in the footer -> Indexes is scrolled into view with the new index (rows: EDT-103)

## 6. Fields

Use a PostgreSQL diagram unless said otherwise.

- [ ] **MT-100** In the Tables section open a table and look at a field row -> a key icon for a primary key or a link icon for a foreign key, the name, a UQ badge when unique, the type chip and a nullability dot (hollow means nullable) (rows: EDT-112, DAT-038)
- [ ] **MT-101** Give a field the type varchar(255) and another numeric(10,2) -> chips show the first word of the type plus `(255)` and `(10, 2)`; an array field shows `[]`; View > Hide Field Attributes removes the sizes; Show restores them; reload -> the choice is remembered (new behaviour) (rows: EDT-113, EDT-114, SHL-082, SHL-081, DAT-037)
- [ ] **MT-102** View > Compact Tables -> chips and dots disappear from table cards; Standard brings them back; reload keeps the choice; the menu label is translated (rows: EDT-115, SHL-062, SHL-099)
- [ ] **MT-103** Press Add Field (panel and edit card) -> a field `field_1` appears at the end with the database's default type (bigint; integer in SQLite), nullable, not key, not unique; in the edit card it scrolls into view, takes focus and flashes light blue (rows: EDT-117, EDT-091, DAT-035, DAT-036)
- [ ] **MT-104** Type a field name, wait 0.3 s, Undo; retype the same text -> one change in history; unchanged text does not add a step (rows: EDT-118)
- [ ] **MT-105** Open the type picker -> a searchable list with common types first, then alphabetical; search for "zzz" -> "No types found" (rows: EDT-119, EDT-278)
- [ ] **MT-106** In a PostgreSQL diagram with an enum type, open the type picker -> sections "Standard Types" and "Custom Types"; enums show their values (rows: EDT-120, EDT-197)
- [ ] **MT-107** Type `varchar(255)` into the type search and pick it; then `numeric(10,2)`; then `int[]` -> size, precision and scale or the array flag are filled; each option shows its attribute suffix (rows: EDT-121, EDT-122)
- [ ] **MT-108** Set Max Length 40 on a varchar field, then change the type to integer, then back to varchar -> length is kept only when the new type has a length; the default value is always cleared on a type change (rows: EDT-123, DAT-034)
- [ ] **MT-109** Choose the type `serial` -> the field becomes not null with auto increment on, and both controls are locked (rows: EDT-124, EDT-127, EDT-133)
- [ ] **MT-110** Open the "..." Field Attributes of a field -> Unique, Auto Increment, Array, Max Length, Precision, Scale, Default Value, Description and Delete Field (rows: EDT-125)
- [ ] **MT-111** On a table whose only primary key is `id`, open its attributes -> Unique is disabled (rows: EDT-126)
- [ ] **MT-112** On an integer field, Auto Increment is offered; on a varchar field it is not; on a nullable integer field it is disabled; turning on nullable on an auto-increment field clears auto increment (rows: EDT-127, EDT-133)
- [ ] **MT-113** In a PostgreSQL diagram a text field offers Array; in a MySQL diagram no field offers Array; serial types never offer it (rows: EDT-128, EDT-276, DAT-037)
- [ ] **MT-114** Open Max Length -> None, Max (only on types where it is allowed, such as SQL Server varchar) and Custom with a number box (rows: EDT-129, IMP-038, DAT-034)
- [ ] **MT-115** Open Precision and Scale on a numeric field -> the allowed range and the default are shown as placeholders (rows: EDT-130)
- [ ] **MT-116** Type `'abc'::text` into Default Value, then empty it -> any text is accepted verbatim; empty clears the default (rows: EDT-131)
- [ ] **MT-117** Type a Description for a field -> a comment icon appears beside the name; clicking it shows only the description in a small popover (the "..." button still opens all of Field Attributes); the placeholder reads "No description" (rows: EDT-132)
- [ ] **MT-118** Toggle N (nullable) and PK on several fields; make two fields primary keys -> setting PK makes the field not null and, for the first key, unique; a table may have several primary keys; the N toggle is disabled for primary-key and serial fields (rows: EDT-133, EDT-134, DAT-042)
- [ ] **MT-119** Reorder fields by dragging in the side panel -> the canvas follows; Undo restores; in the canvas edit card drag a field row too -> reordering works there as well (new behaviour) (rows: EDT-136, EDT-137)
- [ ] **MT-120** Delete a field with the Delete Field button, then Undo -> no confirmation; Undo brings it back (rows: EDT-138)
- [ ] **MT-121** Delete a field that is used by a relationship -> the relationship is removed or a warning is shown first; no dangling line stays (new behaviour) (rows: EDT-139)
- [ ] **MT-122** Open the old-format file from the appendix (a field type stored as plain text, nullable stored as the text "true", a primary key that is also nullable) -> types show as normal types, nullable dots are correct, the primary key shows as not null (rows: DAT-003, DAT-004, EDT-135)
- [ ] **MT-123** Type a column-level check into a field, if the editor offers one (see EDT-148) -> the new behaviour decided for DAT-040 applies: either the check lives in the table check list or a field check is shown; it survives export and reload (rows: DAT-040)
- [ ] **MT-399** In the side panel open, one after the other: the field type list, the comment icon of a field with a description, a field's "..." (Field Attributes), an index's "..." (Index Attributes), a check's "..." and the "..." menu of a table, of a custom type and of an area; also the arrow of Add Table and the colour square of a table -> each opens with its left edge on the button that opened it and grows to the right, over the canvas, so the row it was opened from stays in view; the account menu and the language picker, at the right edge of the window, still open toward the left (rows: EDT-104, EDT-125, EDT-132, EDT-142, EDT-195)

## 7. Indexes and check constraints

- [ ] **MT-124** Open a table in the panel -> an Indexes accordion with an Add Index button; views have none (rows: EDT-140)
- [ ] **MT-125** Press Add Index on a PostgreSQL table -> `index_1` with no fields, not unique, type btree; on a MySQL table no type is offered (rows: EDT-141, DAT-043, DAT-044, EDT-143)
- [ ] **MT-126** Select two fields in "Select fields" of an index, toggle Unique, open Index Attributes -> Name, Unique, Index Type, a description and Delete are there; changes show in the row (rows: EDT-142)
- [ ] **MT-127** In a PostgreSQL diagram choose gin for an index on an integer field -> gin is disabled; add a jsonb or array field and gin becomes available; deselect that field and the type resets (rows: EDT-144, EDT-143, DAT-044)
- [ ] **MT-128** Make `id` a primary key and look at the indexes -> a first entry labelled "Primary Key", with no name, listing exactly the key fields; it cannot be edited by hand; change the primary-key fields and it follows (rows: EDT-145, DAT-042)
- [ ] **MT-129** Add, edit and delete an index; Undo each time -> every step is undone and redone (rows: EDT-146)
- [ ] **MT-130** Open a diagram that has stored index types gist, brin and clustered (use the old-format file) -> it loads and shows the indexes without losing the type (rows: DAT-045)
- [ ] **MT-131** Open a table's Check Constraints accordion and press Add Check -> a new check with an empty Expression text area (placeholder like `price > 0`) and a popover with Delete Check Constraint; views have no checks (rows: EDT-147, EDT-148, DAT-051)
- [ ] **MT-132** Type `price > 0` and nonsense such as `((` as the expression -> the editor does not validate in the check box and accepts both (rows: EDT-149)
- [ ] **MT-133** Open a MySQL 5.7 or SQLite diagram's table -> the check area is hidden or shows a warning that export ignores checks there (new behaviour) (rows: EDT-150)
- [ ] **MT-134** Add, edit and delete a check; Undo each time -> all undoable (rows: EDT-151)

## 8. Relationships

Use S1 plus two more tables.

- [ ] **MT-135** Hover a field of a table in the canvas -> connection dots show at its left and right (rows: EDT-152)
- [ ] **MT-136** Drag from a field's dot to a field dot in another table -> a relationship is created with the first field as the source; its default name is `<table>_<field>_fk` and its cardinality is One to One (rows: EDT-153, EDT-167, DAT-049)
- [ ] **MT-137** Drag from an integer field to a varchar field -> a red toast "Field types are not compatible"; nothing is created (rows: EDT-154, EDT-169)
- [ ] **MT-138** Drag again between two fields that already have a relationship, in the opposite direction too -> a red toast "Already connected"; nothing new (rows: EDT-155, EDT-168, DAT-050)
- [ ] **MT-139** Start a drag and release it on the empty canvas -> nothing is created (rows: EDT-156)
- [ ] **MT-140** Look at a view in the canvas -> no field dots (rows: EDT-157)
- [ ] **MT-141** Right-click a table > Add Relationship -> a line follows the pointer from the table centre; click another table -> a card opens with the first compatible target field already selected, or a suggested new field name (rows: EDT-158, EDT-159)
- [ ] **MT-142** In that card type a new field name and choose Create "<name>" -> the field is created, the relationship made, selected and opened in the panel (rows: EDT-160)
- [ ] **MT-143** Provoke the card's inline errors by confirming without a target field -> "Please select a target field" appears; the other two messages ("Failed to create new field", "Failed to create relationship") are covered by the automated tests (rows: EDT-161)
- [ ] **MT-144** Start the line and press Escape; again and click the background; again and click outside the card -> the line and the card close each time (rows: EDT-162, EDT-268)
- [ ] **MT-145** Use the canvas menu > New Relationship and Refs > Add Relationship -> a Create Relationship dialog with Primary Table, Primary Field, Referenced Table and Referenced Field pickers; choosing a table opens its field picker; empty pickers say "No tables found" or "No fields found"; the same incompatibility and already-connected messages appear (rows: EDT-163, EDT-164, EDT-165, EDT-166)
- [ ] **MT-146** In PostgreSQL connect serial to integer, in MySQL connect int to integer and tinyint to boolean -> these are accepted as compatible (rows: EDT-169)
- [ ] **MT-147** Look at relationship lines -> a smooth line between the field rows on the nearer table edges; a self-relationship loops out of one side; parallel lines are offset; crow's-foot markers show; View > Hide Cardinality hides them, Show restores, reload keeps it (rows: EDT-171, EDT-172, EDT-173, SHL-062, SHL-081)
- [ ] **MT-148** Double-click a line -> a popover with 1:1, 1:N, Switch tables, Open in sidebar and Delete relationship; there is no many-to-many choice anywhere (rows: EDT-175, EDT-170, DAT-048)
- [ ] **MT-149** Choose 1:N on a one-to-one line, then Switch tables -> the many side is always the target; switching a line that ends N:1 shows 1:N (rows: EDT-176, EDT-177, DAT-047)
- [ ] **MT-150** Open the Refs section -> a filter, Add Relationship and Collapse All; there is no Dependencies group (rows: EDT-178, EDT-180)
- [ ] **MT-151** Open a relationship row -> Primary Table and field, Related Table and field and a Cardinality drop-down offering One to One and One to Many (rows: EDT-179)
- [ ] **MT-152** Type a table name in the Refs filter; hide one of the two tables with the filter -> the list matches relationship and table names; the relationship disappears when one table is hidden (rows: EDT-180, EDT-070)
- [ ] **MT-153** Delete a relationship with the Delete key on the selected line, from the popover and from the Refs row; Undo each time -> all three ways work and are undoable (rows: EDT-181)
- [ ] **MT-154** Delete every relationship -> Refs reads "No relationships" and "Create a relationship to get started" (rows: EDT-182)
- [ ] **MT-155** Open the old-format file with relationships stored as one_to_one, one_to_many, many_to_one and many_to_many -> all open as source/target cardinalities and the many-to-many one opens as one to many (rows: DAT-005, DAT-006)

## 9. Custom types (PostgreSQL diagrams)

- [ ] **MT-156** Open Custom Types in a PostgreSQL diagram with none -> a filter box, a New Type button, and the texts "No custom types" with an explanation (rows: EDT-188, EDT-187)
- [ ] **MT-157** Press New Type -> `type_1` of kind Enum with no values appears; double-click or pencil renames it (Enter saves, Escape cancels); the schema shows when several schemas are visible (rows: EDT-189, EDT-190, DAT-054)
- [ ] **MT-158** Set the kind to Enum and type `calm` Enter, `busy` Enter in "Add enum value..." -> two removable chips; an empty list says "No enum values defined" (rows: EDT-191, EDT-192, DAT-053)
- [ ] **MT-159** Switch the kind to Composite and add two members with "Field name" and "Select type" -> they are listed with remove buttons; an empty list says "No fields defined" (rows: EDT-193)
- [ ] **MT-160** Switch back to Enum -> the old values are gone (cleared) (new behaviour) (rows: EDT-194)
- [ ] **MT-161** Open More actions of a type -> Delete is offered; Highlight Fields is not (rows: EDT-195)
- [ ] **MT-162** Use the enum as a field's type, then delete the enum -> the field keeps the type name as plain text (rows: EDT-197, EDT-198, DAT-039)
- [ ] **MT-163** Add, edit and delete custom types; Undo each time -> undoable (rows: EDT-199)
- [ ] **MT-164** Reload after adding several custom types and relationships -> relationships and custom types are listed alphabetically (rows: DAT-012, DAT-057)
- [ ] **MT-165** Open a MySQL diagram and a SQL Server diagram -> there is no Custom Types section in either (rows: EDT-187, EDT-276)

## 10. Areas and notes

- [ ] **MT-166** Canvas menu > New Area, and Visuals > Areas > Add Area -> an area named "Area 1", then "Area 2", about 300 x 200, with a random palette colour, a border and a name strip (rows: EDT-200, EDT-201, DAT-055)
- [ ] **MT-167** Select an area and drag its edges and corners -> it resizes; Undo restores (rows: EDT-201, EDT-210)
- [ ] **MT-168** Drag a table fully inside an area, then partly out, then fully out -> it joins the area when completely inside and leaves it when moved out; with two nested areas the top-most wins (rows: EDT-036, EDT-202, EDT-203, DAT-031)
- [ ] **MT-169** Drag an area that holds two tables, then Undo once -> the tables move with it and one Undo puts everything back (rows: EDT-037, EDT-224)
- [ ] **MT-170** Use Move to Area on three tables for a small area -> the tables sit in a tidy grid inside the area and the area grows to fit; "No Area" moves them out of it (rows: EDT-204, EDT-205)
- [ ] **MT-171** Rename an area by double-click on its name (Enter, then click-away, then Escape, then an empty name) and by Edit Area Name -> Enter and click-away save, Escape cancels, an empty name is ignored (rows: EDT-206)
- [ ] **MT-172** Delete an area holding tables -> the tables stay and are no longer members (rows: EDT-207)
- [ ] **MT-173** Open the Areas list -> filter, Add Area, rows with colour picker, focus and More actions (Edit Name, Delete Area); empty text "No areas" / "Create an area to get started"; a filter with no hit says "No areas found matching your filter" (rows: EDT-208, EDT-209)
- [ ] **MT-174** Canvas menu > New Note, and Visuals > Notes > Add Note -> an empty 200 x 150 yellow (`#ffe374`) note appears (rows: EDT-211, DAT-056)
- [ ] **MT-175** Look at a note in light and in dark theme; change its colour; resize it -> a coloured header with a colour picker, a pale body that differs by theme, resizable (rows: EDT-212)
- [ ] **MT-176** Double-click a note body, type, click away; edit again and press Escape -> click-away saves, Escape abandons the edit (rows: EDT-213)
- [ ] **MT-177** Open the Notes list -> filter, Add Note, rows showing the first line, colour picker, focus and More actions (Delete Note); an empty note shows "Empty note"; empty states read "No Notes" / "Create a note to add text annotations on the canvas" and "No notes found" (rows: EDT-214, EDT-215, EDT-216)
- [ ] **MT-178** Add, edit, move, resize and delete a note; Undo each step -> all undoable (rows: EDT-217)
- [ ] **MT-179** Add three notes and areas, reorder them in the lists if the lists allow it, reload -> they stay in the same order (rows: DAT-057)

## 11. Filters and visibility

- [ ] **MT-180** Press Mod+F, then the toolbar Filter button -> a floating "Filter Tables" panel opens and closes on each press; Mod+F works while typing in a text box too (rows: EDT-061, EDT-265)
- [ ] **MT-181** Look at the panel -> a focused box "Search tables..." and a toggle "Group by Schema" / "Group by Area" (rows: EDT-062)
- [ ] **MT-182** Use the eye of a table and of a group; use zoom-to on both -> the table or all tables of the group hide and show; zoom-to moves the view; after every filter change the canvas refits (rows: EDT-063, EDT-064, EDT-073, EDT-024)
- [ ] **MT-183** Hide a table, then click its row in the panel -> it becomes visible, is selected, flashes and the canvas zooms to it (rows: EDT-065)
- [ ] **MT-184** Type part of a table name in uppercase in the panel search -> the tree narrows by a case-insensitive substring and the hidden state of tables does not change (rows: EDT-066)
- [ ] **MT-185** Search for a word that exists nowhere -> "No tables found", "Try adjusting your search or filter" and a Clear filter button; in an empty diagram "No tables found" and "Create a table to get started" (rows: EDT-067, EDT-068)
- [ ] **MT-186** Hide every table -> a centred message "All tables are hidden" with a Show all button on the canvas and in the Tables section; the button shows everything (rows: EDT-069)
- [ ] **MT-187** Hide a table with relationships -> its lines disappear too (rows: EDT-070)
- [ ] **MT-188** Change the filter, then press Undo, then reload -> Undo does not undo the filter; the choice survives a reload and is kept per diagram (rows: EDT-071, DAT-010, EDT-225)
- [ ] **MT-189** In a diagram with three schemas, tick every table of one schema, then add a table to that schema -> ticking all tables counts as the schema, so the new table is visible (rows: EDT-072, DAT-058)
- [ ] **MT-190** Import the SQL Server or PostgreSQL sample with two schemas into a fresh browser and open it -> with no saved filter only the first schema is shown (rows: DAT-011)

## 12. Undo, redo, clear

- [ ] **MT-191** Create a table, add a field, press Mod+Z twice, then Mod+Shift+Z once -> two steps back and one forward; the toolbar buttons and Edit > Undo/Redo do the same and show the shortcut labels (rows: EDT-219, EDT-259, SHL-061, SHL-065)
- [ ] **MT-192** Undo twice, then make a new change, then look at Redo -> Redo is disabled (the redo stack is cleared) (rows: EDT-220, EDT-041)
- [ ] **MT-193** Click in a field-name text box, type, press Mod+Z -> undo works here too or hands off clearly to the text box (new behaviour) (rows: EDT-221)
- [ ] **MT-194** Make more steps than the new cap (see owner decision) or reload -> the history follows the new rule (capped or persisted) (rows: EDT-222)
- [ ] **MT-195** Check each of these is one undo step or not undoable as stated: move several selected tables in one drag, an area drag with members (one step); zoom, pan, selection, filter change, a View setting, theme change and copy (not steps) (rows: EDT-223, EDT-224, EDT-225)
- [ ] **MT-196** Edit > Clear -> a dialog "Clear Diagram" with Clear and Cancel; Clear empties the diagram but keeps it, and Undo is empty afterwards; Cancel changes nothing (rows: EDT-226, SHL-054, SHL-061)

## 13. Copy and paste

- [ ] **MT-197** Select one table, press Mod+C -> a toast "Table copied" and a hint naming the right key for the platform (Ctrl+V on Windows and Linux, Cmd+V on macOS) (rows: EDT-227, EDT-228)
- [ ] **MT-198** Select three tables and press Mod+C -> "3 tables copied" (rows: EDT-227)
- [ ] **MT-199** Select some text in the page (for example in a panel) and press Mod+C -> no table is copied (rows: EDT-229)
- [ ] **MT-200** Press Mod+V -> new copies of the tables with new ids appear to the right of the copied group; "Table pasted" or "3 tables pasted" appears; press Mod+V again -> the next paste is one slot further right (rows: EDT-230, EDT-232, EDT-235)
- [ ] **MT-201** Paste a table named `orders` into a diagram that already has `orders` -> it is named `orders_copy`, then `orders_copy2`, `orders_copy3`; a table with the same name in another schema keeps its name (rows: EDT-231)
- [ ] **MT-202** Copy a table that has fields, indexes, a relationship and an area, then paste -> the copy has fields and indexes but no relationship; the area is kept only if it exists; copy from a PostgreSQL diagram, switch to a MySQL diagram in the same tab and paste -> no schema is kept (rows: EDT-233, EDT-234)
- [ ] **MT-203** Copy in one diagram, open another diagram in the same tab and paste -> it pastes; reload and paste -> follows the new clipboard rule (works across tabs through the system clipboard or says nothing is copied) (rows: EDT-236)
- [ ] **MT-204** Copy in a browser that refuses clipboard access (block the permission) -> a "Copy failed" toast with "Clipboard not supported" or "Something went wrong. Please try again." (rows: EDT-272)
- [ ] **MT-205** Open a read-only diagram and press Mod+V -> nothing is pasted (rows: EDT-237, EDT-014)

## 14. Keyboard shortcuts, menus, themes, languages

- [ ] **MT-206** Press each shortcut once and note the result: Mod+O (list), Mod+S (saves), Mod+B (panel), Mod+0 (fit), Mod+M (theme), Mod+F (filter), Mod+C/Mod+V, Delete/Backspace, Escape, Enter in a rename, Shift while dragging -> each does what the rows say (rows: EDT-260, EDT-261, EDT-262, EDT-263, EDT-264, EDT-265, EDT-266, EDT-267, EDT-268, EDT-269, EDT-270, SHL-065)
- [ ] **MT-207** Press Mod+S -> a visible confirmation (toast) shows that the diagram is saved, or the shortcut is documented as automatic save; the "last saved" time moves (new behaviour) (rows: EDT-257, SHL-031, EDT-261)
- [ ] **MT-208** Open the menus and tooltips on macOS and on Windows -> shortcuts show in the platform's symbols (rows: EDT-271)
- [ ] **MT-209** Press Mod+M with the focus in a text box; then use View > Theme > Light, Dark, System -> the theme switches even while typing; the whole app follows; "System" follows the operating system live (change the OS theme while the app is open) (rows: EDT-253, EDT-264, SHL-085, SHL-086, SHL-063)
- [ ] **MT-210** With the theme set to System and the OS light, press Mod+M -> it flips to dark (the opposite of what System resolves to) (rows: SHL-086)
- [ ] **MT-211** Reload with a dark theme chosen -> no flash of the light theme before the page appears (rows: SHL-004)
- [ ] **MT-212** Change the theme, zoom setting, minimap, cardinality and field attribute settings, then open another diagram and export one -> the settings stay the same everywhere and are not part of the diagram file (rows: EDT-254, DAT-065, SHL-080, SHL-084)
- [ ] **MT-213** Block site storage in the browser (or use a profile that refuses it) and open the app -> it opens with defaults and does not crash (rows: DAT-018, SHL-083, QBS-012)
- [ ] **MT-214** Click the globe button (tooltip "Change language") -> a searchable list of 22 languages, English first, each with its native and English name (rows: SHL-093, SHL-096)
- [ ] **MT-215** Choose German, then Arabic, then English -> the text changes at once with no reload; the page language attribute follows; Arabic switches the page to right-to-left; every text of the editor is translated (compact tables label, drawer title, "Saved" tooltip, more-databases toggle, 404 page too) (rows: SHL-096, SHL-097, SHL-099, SHL-030, SHL-042, SHL-073)
- [ ] **MT-216** In a clean profile set the browser language to French -> the app starts in French; the choice made in the language button is remembered after a reload; an unknown code such as `xx` falls back to English (rows: SHL-094, SHL-095, SHL-019)
- [ ] **MT-217** Switch to a language that has only partial QBase texts (project picker, admin panel, publish dialog) -> missing QBase texts show in English; all editor texts (menus, dialogs, panels, toasts) are translated (rows: SHL-098, SHL-099)
- [ ] **MT-218** Look at the browser tab title on `/`, in a diagram, after renaming, on `/admin` and on a share link -> "QBase - Database schema diagrams" by default, "QBase - <name>" in the editor, translated own titles on the other pages (rows: SHL-100, SHL-101, SHL-102, EDT-013)
- [ ] **MT-219** Open the page source and the network list on the first load -> no request to another host (fonts and scripts are local), the page is marked noindex, `robots.txt` disallows all (rows: SHL-005, SHL-006, SHL-007)
- [ ] **MT-220** On Safari 15.3 or older (if a device is available) open the app, copy a table and paste it -> the app starts, copy and paste work (the stand-ins for old browsers are in place) (rows: SHL-103)
- [ ] **MT-221** Provoke an error (for example import a broken file) and watch the console -> the diagram is left unchanged and the page does not crash (rows: EDT-274)
- [ ] **MT-222** Trigger two toasts quickly -> only one is shown at a time and the new one replaces the old; it has a close button and goes away by itself after about 5 s; toasts also show on the home and project pages (new behaviour: the toaster is available everywhere) (rows: SHL-087, SHL-088, SHL-089)
- [ ] **MT-223** Trigger a failing delete (block storage after opening the list, then delete a diagram) -> a toast "Could not delete the diagram" (rows: EDT-273)
- [ ] **MT-224** Open any confirmation dialog and press Escape, then the Cancel button, then the confirm button -> Escape and Cancel close without action; confirm runs the action and closes (rows: SHL-090)

## 15. Mobile width

Use a window of 390 px or a phone.

- [ ] **MT-225** Open a diagram -> the navbar shows "QBase", the account menu, the language button and the theme switch; a hamburger button opens the icon rail as an overlay; the side panel starts hidden (rows: SHL-068, SHL-070)
- [ ] **MT-226** Look at the bottom-left of the canvas -> a round pencil button; press it -> a bottom drawer "Manage Diagram" opens (the title and description are translated) (rows: EDT-006, SHL-070, SHL-073)
- [ ] **MT-227** In the drawer open the section drop-down -> Tables, Refs, DBML, Areas (showing areas, not custom types), Visuals and Custom Types where supported (new behaviour) (rows: EDT-007, SHL-071)
- [ ] **MT-228** Check the canvas -> the toolbar sits at the top-centre, the minimap is smaller (about 60 px) and nothing overlaps the drawer button (rows: EDT-008)
- [ ] **MT-229** In the drawer press a table's focus button -> the drawer closes and the table is centred (rows: EDT-010)
- [ ] **MT-230** In server mode on the phone look at the navbar -> save status, get latest, lint, drift and publish are available (new behaviour) (rows: SHL-069, SHL-056)
- [ ] **MT-231** Scroll the page with the browser's address bar showing and hiding -> the editor is not cut off at the bottom (rows: SHL-072)
- [ ] **MT-232** Use two fingers to pinch the canvas and one finger to pan -> zoom and pan work (rows: EDT-018, EDT-015)
- [ ] **MT-233** Turn the phone sideways and back -> the layout switches between mobile and desktop at 768 px (rows: EDT-001, EDT-006)
- [ ] **MT-234** Open the diagram list on the phone -> the created column is hidden (rows: SHL-043)

## 16. Local-only mode and the browser database

- [ ] **MT-235** Start the local build -> no Sign in button, no account menu, no publish, lint or drift controls; Mod+O opens the Open dialog (rows: SHL-001, SHL-010, SHL-067, SHL-114)
- [ ] **MT-236** In the local build open `/admin`, `/s/abc`, `/examples` and `/templates` -> `/admin` and `/s/abc` are not available in local mode (404 or not offered); the examples and templates pages do not exist (rows: SHL-011, SHL-012, SHL-013, SHL-009)
- [ ] **MT-237** Create a diagram, reload, close the browser, open it again -> the diagram is still there (rows: DAT-001, SHL-028)
- [ ] **MT-238** Create several local diagrams and look at their ids in the address bar and in IndexedDB -> every diagram has a different id of the form chosen by the architecture (not a shared prefix plus 4 characters); open two diagrams created in two browser profiles and check that ids do not clash (new behaviour) (rows: DAT-060, DAT-059)
- [ ] **MT-239** Delete a diagram that has tables, relationships, areas, custom types and notes, then check the browser's IndexedDB `QBase` -> no rows of that diagram remain (rows: DAT-013, DAT-014)
- [ ] **MT-240** Put a diagram into the old `QubdiDB` database (use the profile from section 0.2), start the app -> the diagram appears after the first start and the old database is gone; a diagram of the same id in `QBase` is not overwritten (rows: DAT-007, SHL-027, QBS-009)
- [ ] **MT-241** Make the move from `QubdiDB` fail (open the old database in a second tab with a blocking transaction, or block storage midway) and start the app -> the old database is untouched; on the next start the move is tried again (rows: DAT-008)
- [ ] **MT-242** Open a profile holding diagrams of old browser database versions (1 to 13) -> each opens and is upgraded without loss of tables, fields, relationships, areas, notes and custom types (rows: DAT-002, DAT-024, DAT-069)
- [ ] **MT-243** Create diagrams of every kept database type and edition (generic, PostgreSQL with Supabase and Timescale, MySQL 5.7, SQL Server 2016, SQLite with Cloudflare D1, MariaDB, CockroachDB) -> each is created with the right type, edition and a default name when the name is blank (rows: DAT-019, DAT-020, DAT-021, DAT-022, IMP-001, IMP-002, IMP-003)
- [ ] **MT-244** Open an old saved diagram whose database type is Oracle or ClickHouse -> it opens without loss (read-only, as generic, or as the architecture says) and shows no import or export for those types (rows: DAT-020, QBS-005, QBS-006)

## 17. Import: SQL and DBML

Samples are in the appendix. Use a fresh blank diagram for each import unless a step says otherwise, and the New dialog with "Import" for the chosen dialect.

- [ ] **MT-245** Open step 2 with Generic and look at the box -> three tabs: Smart Query (default), DDL and DBML (rows: IMP-005, IMP-004)
- [ ] **MT-246** Paste the PostgreSQL sample A.1 on the DDL tab with type PostgreSQL -> after about half a second a "Found 3 tables ..." style count line shows tables and relationships and no warning; Import is enabled (rows: IMP-009, IMP-011, IMP-007)
- [ ] **MT-247** Press Import for A.1 -> the diagram has an enum `mood` (calm, busy; schema public); `pets` with `id` (primary key, not null), `name` varchar(40) not null, `mood` of type mood nullable with default `'calm'::public.mood`; `vets` with `id` serial primary key and `pet_id` integer nullable; one relationship pets.id (one) to vets.pet_id (many); the index `idx_pets_name` btree on pets.name; primary-key indexes on both tables; tables sorted pets, vets (rows: IMP-018, IMP-019, IMP-020, IMP-021, IMP-022, IMP-025, IMP-027, IMP-030, IMP-034, IMP-036, IMP-037, IMP-040, IMP-041, IMP-042, IMP-044, IMP-052)
- [ ] **MT-248** Check the layout of the imported tables -> related tables are close, there are no overlaps; import a script with two schema groups -> the groups do not overlap each other (new behaviour) (rows: IMP-043, IMP-040)
- [ ] **MT-249** Check the types of A.1 after import -> the source type names are kept (no type was replaced by text) and `character varying` shows as varchar (rows: IMP-035, IMP-036)
- [ ] **MT-250** Paste the MySQL sample A.2 with type MySQL, import -> `pets` id int primary key with increment, name varchar(40) not null, kind enum nullable default 'cat' (and the enum values are kept as decided), index `idx_pets_name`; `vets` with the relationship `fk_vets_pet` pets.id (one) to vets.pet_id (many); `DEFAULT NULL` stores no default; ENGINE and CHARSET ignored; no warning (rows: IMP-018, IMP-020, IMP-021, IMP-025, IMP-031, IMP-034, IMP-039, IMP-022)
- [ ] **MT-251** Paste the MySQL error script A.2b -> a blocking red error naming the line with an "inline REFERENCES" message and a corrected example; Import is disabled (rows: IMP-023, IMP-007, IMP-009)
- [ ] **MT-252** Paste the SQL Server sample A.3 with type SQL Server, import -> `Pets` in schema dbo with Id int primary key increment and Name nvarchar(40) not null; `Vets`; relationship `FK_Vets_Pets` Pets.Id (one) to Vets.PetId (many); no warning although there are no semicolons; `GO`, brackets and CLUSTERED are handled (rows: IMP-032, IMP-020, IMP-021, IMP-038, IMP-041)
- [ ] **MT-253** Paste the SQLite sample A.4 with type SQLite, import -> `pets` integer primary key not null increment, name text not null; `vets` with a relationship (generated name) from pets.id (one) to vets.pet_id (many); ON DELETE CASCADE is not stored; unique index `uq_pets_name` (rows: IMP-018, IMP-020, IMP-021, IMP-025)
- [ ] **MT-254** Paste a SQLite script whose foreign key points at a table that is not in the script -> no placeholder table is invented; the key is dropped and a warning says so (new behaviour) (rows: IMP-024)
- [ ] **MT-255** Paste `CREATE SCHEMA x;` with type SQLite -> a blocking error (rows: IMP-012, IMP-009)
- [ ] **MT-256** Paste the empty text, then `hello`, then `CREATE TABLE a (id int` and `CREATE TABLE a (x text DEFAULT 'abc);` -> each shows a blocking error with a line number: empty text, no SQL keyword, unbalanced parentheses and unterminated string; click an error -> the cursor jumps to the line (rows: IMP-012, IMP-009, IMP-007)
- [ ] **MT-257** Paste a script with five different errors -> only 3 errors are listed, then "N more errors" (rows: IMP-010)
- [ ] **MT-258** Paste a PostgreSQL script with `: :` in a cast and a split `DECIMAL (10, 2)` -> an error with an Auto-fix button; pressing it rewrites the text and the error goes (rows: IMP-013)
- [ ] **MT-259** Paste `SERIAL` into a MySQL import, `AUTO_INCREMENT` into SQL Server and `ENUM(...)` into SQLite -> blue warnings with line numbers (rows: IMP-014)
- [ ] **MT-260** Paste a PostgreSQL script with CREATE EXTENSION, FUNCTION, TRIGGER, POLICY and a composite CREATE TYPE -> they are skipped with a warning; the tables still import (rows: IMP-016)
- [ ] **MT-261** Paste a MySQL script with a statement the importer does not support -> one summary warning per kind of skipped statement (new behaviour) (rows: IMP-017)
- [ ] **MT-262** Paste a script holding CHECK constraints (column and table level) and COMMENT ON TABLE/COLUMN (and a MySQL COMMENT clause) -> checks appear in the table's Check Constraints; comments appear as table and field descriptions (new behaviour) (rows: IMP-026, IMP-033)
- [ ] **MT-263** Paste a script with a view over two tables and a `SELECT *` view -> a view table with the columns of its select list; the `SELECT *` view has no columns and a warning says so; a materialized view is darker grey (`#7d7d7d`) (rows: IMP-028, IMP-040)
- [ ] **MT-264** Paste a PostgreSQL script with ALTER TABLE ADD COLUMN and ALTER COLUMN TYPE after the table -> they are applied to the earlier table (rows: IMP-029)
- [ ] **MT-265** Paste a table with a composite primary key and a multi-column UNIQUE -> both are read (key as primary-key fields, unique as a unique index) (rows: IMP-019, IMP-041)
- [ ] **MT-266** Paste a script with a unique key on the referencing column, and one without -> the cardinality follows uniqueness; many-to-many is never created (rows: IMP-022)
- [ ] **MT-267** Paste a MySQL table with UNSIGNED and a display width and an enum -> the decision on unsigned, display width and enum values holds (kept, or dropped with a warning, as the owner decided) (rows: IMP-039)
- [ ] **MT-268** Paste a script with a statement that produces nothing (for example only `SET x = 1;` plus a comment) -> the editor says "Nothing to import" instead of closing silently (new behaviour) (rows: IMP-015)
- [ ] **MT-269** Choose type Generic and paste each of A.1, A.2, A.3, A.4 -> the dialect is detected (PostgreSQL for the dump with SET, MySQL for ENGINE, SQL Server for GO and brackets, SQLite for AUTOINCREMENT) and PostgreSQL is used when nothing fits; a diagram of type Generic takes the imported type (rows: IMP-008, IMP-075)
- [ ] **MT-270** Paste DBML on the DDL tab, then a `[ ... ]` JSON, then a SQL script on the DBML tab -> the box switches to the tab that fits; JSON under 2 MB is pretty-printed (rows: IMP-006)
- [ ] **MT-271** Import A.1 into a MariaDB diagram and into a CockroachDB diagram -> MariaDB reads MySQL scripts, CockroachDB reads PostgreSQL scripts, arrays are accepted only for PostgreSQL and CockroachDB (rows: IMP-002, IMP-037)
- [ ] **MT-272** Check the edition choice for Supabase, Timescale, MySQL 5.7, SQL Server 2016 and Cloudflare D1 -> each offers its own metadata script (rows: IMP-003, IMP-056)
- [ ] **MT-273** Paste the DBML sample A.6 on the DBML tab -> live validation; make a syntax error on line 3 -> a message with line and column and the line is highlighted (rows: IMP-045, IMP-005)
- [ ] **MT-274** Import A.6 -> tables `customers` and `orders` with the described fields, one index and one relationship customers.id (one) to orders.customer_id (many); the diagram is named "Diagram N" (rows: IMP-050, IMP-051, IMP-052, IMP-044)
- [ ] **MT-275** Import DBML that has accented letters in names, quoted defaults such as 'abc', and a TableGroup, a Note block and a table header colour -> accents are kept, defaults keep their quotes, TableGroup/Note/header colour are ignored; tables get the same layout as a SQL import (new behaviour) (rows: IMP-046, IMP-053, IMP-054, IMP-055)
- [ ] **MT-276** Import DBML with `check:` and `checks { }`, with a wrong check, with an array type in a MySQL diagram and with a `<>` reference -> checks become table checks; a wrong check is refused with a position; an array in MySQL gives a clear error; `<>` is an error asking for a junction table (rows: IMP-048, IMP-047, IMP-049, EXP-049)
- [ ] **MT-277** Import DBML with an enum in the public schema in a PostgreSQL diagram and in a MySQL diagram -> an enum custom type in PostgreSQL; the schema `public` or empty becomes the default schema of the dialect (rows: IMP-052)

### 17.1 Metadata JSON (Smart Query)

- [ ] **MT-278** Open the Smart Query tab of PostgreSQL -> a script for the dialect and edition to run in your own client, then a box to paste one JSON cell (rows: IMP-056, IMP-005)
- [ ] **MT-279** Paste the zoo JSON of A.5 and import -> the diagram is named `zoo`, type PostgreSQL; tables animals and keepers (sorted) in schema public, `#8eb7ff`; keepers has the comment "People", id integer primary key not null increment, name varchar(60) not null; animals has keeper_id nullable and weight numeric(6, 2); the index `animals_keeper_idx` btree; relationship `animals_keeper_fk` keepers.id (one) to animals.keeper_id (many); primary-key indexes present (rows: IMP-059, IMP-060, IMP-061, IMP-063, IMP-065, IMP-072, IMP-040)
- [ ] **MT-280** Wrap the same JSON as `[{"metadata_json_to_import": "..."}]`, then add terminal decoration, doubled CSV quotes and escaped quotes, press Check JSON -> the text is repaired and gives the same diagram (rows: IMP-057)
- [ ] **MT-281** Run the SQL Server script in SSMS on a very large schema so that the result is cut at 65 535 characters, paste it -> an information dialog explains the truncation (rows: IMP-058)
- [ ] **MT-282** Import metadata for a database with more than 50 tables plus views (generate with a loop in your test database) -> a table picker opens with search, filters, select page and a limit of 500; the chosen tables only are imported; in a smaller one no picker appears (rows: IMP-064, SHL-037)
- [ ] **MT-283** Import metadata that holds a view whose definition says materialized, a check constraint, an enum type and a composite type -> the view is a materialized view table, the checks and custom types are imported (rows: IMP-062, IMP-063)
- [ ] **MT-284** In the wizard use Back, "Create empty diagram" and Import -> Back returns to step 1; Create empty diagram creates a blank diagram; Import runs (rows: SHL-036, IMP-004)

### 17.2 Import into the open diagram, re-sync and DBML apply

- [ ] **MT-285** With S1 open choose Actions > Import > SQL, paste A.1 -> the dialog is limited to the diagram's database type; it lists the counts of new tables, new relationships and overwritten tables (rows: EDT-248, SHL-057, IMP-076)
- [ ] **MT-286** Confirm that import -> the new tables are placed 150 px to the right of the right-most existing table, history is cleared, a Generic diagram takes the imported type (rows: EDT-249, IMP-075)
- [ ] **MT-287** Import a table whose name already exists -> a warning about duplicates is shown and custom types of the script are added too (new behaviour) (rows: IMP-076)
- [ ] **MT-288** Open the DBML section -> the diagram as read-only DBML with Show Standard / Inline Refs, Edit and copy buttons; switch the form and the Ref lines change to inline form (rows: EDT-238, EXP-050)
- [ ] **MT-289** Press Edit, add a table in the DBML and wait 1 s -> the DBML is parsed; the canvas shows a summary diff and the diagram is unchanged; a new table has a green + badge and name (rows: EDT-239, EDT-241, EDT-242)
- [ ] **MT-290** In edit mode remove a table, change a field type, rename a table, add and remove a Ref -> removed tables are red, changed tables blue, a rename shows old then new, new and removed lines are green and red and thicker (rows: EDT-242, EDT-243)
- [ ] **MT-291** Make a DBML syntax error -> the line is marked and the text "Failed to parse DBML..." with "1 error found - in line N" shows (rows: EDT-240)
- [ ] **MT-292** With a pending diff, look at the buttons -> "Accept Changes" (green) and "Undo Changes" (red); with no diff the button is "View" (rows: EDT-244)
- [ ] **MT-293** Press Accept Changes -> the diagram takes the new tables, relationships and custom types; areas and notes stay; matched tables keep their ids, positions and colours; removed tables disappear; a new table is not placed on top of an existing one (new behaviour); one Undo reverts it all (rows: EDT-245, IMP-081, IMP-082, IMP-083)
- [ ] **MT-294** Make a diff and press Undo Changes -> the preview is dropped and the editor leaves edit mode; make another diff and open the Tables section without accepting -> the preview is discarded (rows: EDT-246, EDT-247)

## 18. Export

Use S1 (PostgreSQL), then the dialect samples. The expected text of each export is in `import-export.md` section 10; compare by reading, not by byte.

- [ ] **MT-295** Open Actions > Export SQL in a PostgreSQL diagram -> the own type first, then MySQL, SQL Server, MariaDB and SQLite (the own type is not repeated); no Oracle or ClickHouse (rows: EXP-001, SHL-058)
- [ ] **MT-296** Choose the PostgreSQL export of S1 -> a spinner, then a read-only code box with a copy button; the SQL has CREATE TABLE for customers and orders, the foreign key after all tables, the index `orders_idx_orders_customer`-style name `"orders_idx_orders_customer"`, defaults now() as CURRENT_TIMESTAMP and PRIMARY KEY as a table constraint (rows: EXP-004, EXP-005, EXP-010, EXP-011, EXP-015, EXP-017, EXP-019, EXP-014)
- [ ] **MT-297** Press the copy button and paste into a text editor -> the whole export is on the clipboard (rows: EXP-004)
- [ ] **MT-298** Export an empty diagram as SQL -> the dialog shows the error state (rows: EXP-003)
- [ ] **MT-299** Hide a table with the filter and export SQL -> the hidden table and its relationships are not in the output (rows: EXP-002)
- [ ] **MT-300** Export a PostgreSQL diagram with a schema, an enum, a composite type, a sequence default, comments and a view -> CREATE SCHEMA IF NOT EXISTS, CREATE TYPE (enums before composites), CREATE SEQUENCE; comments as `--` lines plus COMMENT ON TABLE/COLUMN/INDEX; foreign keys grouped by schema with `-- Schema:` headers; views are not written as tables; a relationship whose field is missing is left out (rows: EXP-009, EXP-012, EXP-013, EXP-016, EXP-018)
- [ ] **MT-301** Export a MySQL diagram (S1 imported with MySQL) -> header `-- MySQL database export`, START TRANSACTION and COMMIT, boolean as TINYINT(1), uuid as CHAR(36), varchar without length as (255), indexes `idx_<table>_<cols>`, foreign keys `fk_<table>_<cols>`, comments inline; blank lines between tables as decided (rows: EXP-020, EXP-021, EXP-022, EXP-023, EXP-024, EXP-025, EXP-005)
- [ ] **MT-302** Export a MariaDB diagram to MariaDB -> it uses the MySQL output (rows: EXP-005, IMP-002)
- [ ] **MT-303** Export a SQL Server diagram -> `EXEC('CREATE SCHEMA ...')` guarded by IF NOT EXISTS, names in brackets, IDENTITY(1,1), `MAX` lengths, no NULL written, defaults unwrapped from extra parentheses, N'...' for text, index names `[<schema>_<name>]` (rows: EXP-026, EXP-027, EXP-028, EXP-029)
- [ ] **MT-304** Export a SQLite diagram with relationships -> a header, `PRAGMA foreign_keys = ON`, BEGIN TRANSACTION ... COMMIT, a single integer primary key inline with AUTOINCREMENT, foreign keys inside CREATE TABLE, SQLite affinities, the table comment as a `/** */` block, a schema written as an "Original schema" comment (rows: EXP-030, EXP-031, EXP-032, EXP-033, EXP-034, EXP-035, EXP-036)
- [ ] **MT-305** Export S1 from PostgreSQL to MySQL, SQL Server and SQLite -> a header lists conversion notes in sections (Type conversions, Default values, Auto numbering, Constraints, Indexes and the others that apply); approximated columns get `-- Was: <type>`; keys the target would refuse are listed as comments; views and empty tables are left out with a note (rows: EXP-006, EXP-039, EXP-042, EXP-047, EXP-048)
- [ ] **MT-306** Convert a diagram with hash, gin, fulltext and spatial indexes, an unsigned integer, a decimal beyond the target's limit, a uuid default and a check with a function call -> indexes become regular ones with a note; unsigned moves up one size; decimals clamp; the default is converted or dropped with a note; the unsafe check is listed as "not created"; foreign key columns take the integer size of the referenced column (rows: EXP-038, EXP-040, EXP-041, EXP-043, EXP-044, EXP-045)
- [ ] **MT-307** Convert to SQLite and to MySQL a diagram with schemas -> SQLite prefixes table names with the schema; MySQL writes schemas as databases (rows: EXP-046)
- [ ] **MT-308** Export from a CockroachDB or Generic diagram -> the output follows the decision for types with no own generator (PostgreSQL output with a notice, or a clear message); an Oracle or ClickHouse diagram says the export is not supported (rows: EXP-007, EXP-008)
- [ ] **MT-309** Re-import the PostgreSQL export of S1 into a new diagram and export it again -> the model is the same and the second export equals the first, for PostgreSQL, MySQL, SQL Server and SQLite (rows: EXP-068, EXP-037)
- [ ] **MT-310** Open the DBML section for S1 -> the output equals A.6 up to whitespace: Ref line, `increment` on the keys, `default: ` with backticks for `now()`, the Indexes block (rows: EXP-050, EXP-052, EXP-053, EXP-055)
- [ ] **MT-311** Build a diagram with an enum, an array column, a composite primary key, a table comment and a check, duplicate relationships, a table without fields and an unnamed field -> enums first, `type[]`, an Indexes block for the composite key, a Note for the comment, a checks block; duplicate relationships appear once; tables with no fields, duplicates and unnamed fields are left out and the panel says which; relationship names are fixed, never random (reload and compare) (rows: EXP-051, EXP-053, EXP-054, EXP-055, EXP-056)
- [ ] **MT-312** Make the DBML export fail on purpose (a field type the writer cannot write, if you know one) -> `// Error generating DBML: ...` and a toast (rows: EXP-057)
- [ ] **MT-313** Use Actions > Export as > JSON -> a file `QBase(<name>).json`, pretty-printed with 2-space indentation, whole diagram regardless of the filter; open it in a text editor: ids are small numeric strings, a version key is present, no filter, no config, no sync state (rows: DAT-061, DAT-062, DAT-064, DAT-065, EXP-058, EXP-059)
- [ ] **MT-314** Export the same diagram twice and compare the files -> they are identical (fixed id order) (rows: EXP-058, DAT-062)
- [ ] **MT-315** Delete a field that a relationship uses, in a diagram you edited by hand (or use a file with a dangling relationship), export -> dangling relationships are not in the file (rows: DAT-063)
- [ ] **MT-316** Import the JSON file just exported with Actions > Import > .json -> a new diagram with new ids, fresh dates and consistent references; the old diagram remains; the S1 export gives 2 tables, 7 fields, 1 index, 1 relationship (rows: DAT-066, IMP-073)
- [ ] **MT-317** Import a file with extra unknown keys; a file with the previous editor's `ChartDB(...)` name; a file without the version key -> all three open; the version-less file is treated as version 1 (rows: DAT-068, DAT-069, DAT-064)
- [ ] **MT-318** Import a file that is not JSON, one that is a JSON missing the tables list, and one with a different extension -> one error and the dialog stays open; no diagram is added (rows: DAT-067, IMP-074, IMP-073)
- [ ] **MT-319** Export as PNG -> an options dialog with scale 1x, 2x, 4x (default 4x), "Dot pattern background" (default on) and "Transparent background" (default off); the file is named `<diagram name>.png` (rows: EXP-060, EXP-061, EXP-062, SHL-059)
- [ ] **MT-320** Export PNG in the light theme and in the dark theme -> the whole diagram fits in the picture even when part of it is off screen (new behaviour); the background is white or near-black with dots; selection outlines are not in the picture; a loading overlay shows while exporting (rows: EXP-063, EXP-064, EXP-067)
- [ ] **MT-321** Export JPEG with "Transparent background" on -> the background is the theme's colour, not black (new behaviour) (rows: EXP-065, EXP-060)
- [ ] **MT-322** Look at the PNG and JPEG -> a logo at the bottom-left; the SVG has no logo (rows: EXP-066)
- [ ] **MT-323** Export as SVG -> it is saved at once with no dialog, with a transparent background and no dots at scale 1; open it in a browser and in a vector program (rows: SHL-059, EXP-060)

## 19. QBase server features

Use the server build. Sign in as the accounts of section 0.2 as the steps say.

### 19.1 Routing, sign-in and the project picker

- [ ] **MT-324** Open `/` signed out -> a sign-in prompt; sign in as the editor -> the project picker with heading, description, a search box (only shown once projects exist), a card grid, empty and no-match states (rows: SHL-002, SHL-009, SHL-105, SHL-106)
- [ ] **MT-325** Open `/config.js` in the browser -> it returns the value `/api`; after sign-in the editor and the API are on one origin (rows: SHL-003, SHL-115)
- [ ] **MT-326** Sign in as the admin and open `/` for the first time in a browser session, then open `/` again -> the first time goes to the admin panel, the second time the project picker; admin with no projects is pointed to the admin panel (rows: SHL-108, SHL-106)
- [ ] **MT-327** Check the page frame -> a 48 px bar with the logo, an Admin button (admins) and the email menu with Change password and Sign out; footer "Powered by Qubdi..." (rows: SHL-107, SHL-114)
- [ ] **MT-328** Open `/admin`, then each of `/admin/overview`, projects, users, diagrams, activity -> `/admin` redirects to overview; every page opens and a reload on it works (rows: SHL-011, SHL-014)
- [ ] **MT-329** Open `/TEST/diagrams` (upper case slug) and a slug with a space or a special character -> the slug is case-insensitive and URL-encoded in links (rows: SHL-015)
- [ ] **MT-330** Copy a diagram URL of project "Other" and swap the slug to "Test" -> "not found" is shown and never the diagram (rows: SHL-016)
- [ ] **MT-331** Open a project URL as an account that is not a member -> project not found or sign-in screen with a Back link (rows: SHL-111)
- [ ] **MT-332** Mark an account as "must change password" in the admin panel and sign in with it -> a dialog blocks the whole app until the password is changed (rows: SHL-026)
- [ ] **MT-333** Open `/s/<token>` of a share link (see 19.5) -> the shared-diagram viewer (rows: SHL-012)
- [ ] **MT-334** Reload the editor at a deep link such as `/test/diagrams/<id>` -> it opens the same diagram (rows: SHL-014)
- [ ] **MT-335** Open the Network tab on first load of `/` and then of the editor -> the admin, viewer and DBML code are loaded only when needed (rows: SHL-017, SHL-078)
- [ ] **MT-336** Sign in as the editor and open the project's Open dialog -> the list shows the project's diagrams with a filter, a role badge, created by, and a row menu (Open, Get latest only where that applies) (rows: SHL-109)
- [ ] **MT-337** In a project press New diagram -> a small form with an optional name (up to 200 characters), database type (default PostgreSQL) and Create; Mod+O goes to `/` instead of opening a dialog; the editor's New and Open requests use the project dialogs (rows: SHL-110, SHL-067, QBS-031, EDT-260)
- [ ] **MT-338** Create a diagram in the project -> it opens at the project URL and has a working copy on the server; the diagram list shows type, edition, table count, relationship count and created date (rows: DAT-071, DAT-080, SHL-110)
- [ ] **MT-339** As project admin and as editor open Actions -> Delete diagram is shown to the project admin only; delete it as project admin -> the server copy goes first; make the delete fail (stop the server) -> a red toast (rows: SHL-053, SHL-060, EDT-258)
- [ ] **MT-340** Open a local diagram URL `/diagrams/<id>` that is already bound to a project -> it redirects to the project URL; an unbound local diagram opens read-only with a banner offering to move it (rows: SHL-113)
- [ ] **MT-341** Open the signed-in editor -> the email dropdown lists the items described in the app-shell spec; sign out -> a sign-in button appears (rows: SHL-114)

### 19.2 Autosave, conflict and lock

- [ ] **MT-342** Edit a diagram in a project and wait 10 s without further edits -> the navbar cloud icon goes from "unsaved" to "saving" to "saved"; the "last saved" time updates (rows: DAT-086, QBS-036, QBS-026, EDT-256)
- [ ] **MT-343** Make several edits within a few seconds -> one save is sent after you stop; a failed save (stop the server) shows "not saved" with a Retry, and a retry after the server is back saves it (rows: DAT-086, QBS-026)
- [ ] **MT-344** Edit and close the tab at once -> a leave-page prompt appears while edits are unsent; after confirming, the final save was still sent; reopen -> the edit is there (rows: QBS-037)
- [ ] **MT-345** Edit, then reload the page before 10 s have passed (accept the prompt) -> after reload the unsent difference from the server is found and sent (rows: QBS-038)
- [ ] **MT-346** Open the same diagram in two browsers as the editor; edit in the first -> the second shows who is editing and opens read-only; the first holds the lock and renews it (rows: DAT-074, QBS-040, SHL-112)
- [ ] **MT-347** In browser 2 (read-only) look at the banner under the navbar -> it explains why (lock taken) and offers Get latest, Retry and similar actions (rows: SHL-112, QBS-025)
- [ ] **MT-348** Close the editor in browser 1 and press Retry in browser 2 -> the lock is released after the final save and browser 2 can edit (rows: QBS-040)
- [ ] **MT-349** Let browser 1 lose its lock (use the admin panel or let the lock expire by pausing the tab for a minute and let browser 2 take it) and edit in browser 1 -> the save is refused, the editor becomes read-only with the "taken" banner and unsent edits are dropped (rows: QBS-041, DAT-074)
- [ ] **MT-350** Create a conflict: save in browser 1, then in browser 2 (without reloading, after taking the lock) edit from an old copy -> a conflict text with an Overwrite button; "Overwrite" saves over the other version; no change is made before you choose (rows: DAT-073, QBS-039, QBS-035)
- [ ] **MT-351** Save, then cut the network just after the request left (browser dev tools: offline after send) and restore it -> the save that landed without its reply is recognised and not shown as someone else's change (rows: DAT-085, QBS-039)
- [ ] **MT-352** Delete the diagram on the server in the admin panel while it is open, then edit and save -> the editor re-creates the missing diagram or says so clearly (rows: QBS-035)
- [ ] **MT-353** Look at a request body of a save in the dev tools -> the entities keep their real ids (not renumbered) and the request has the conflict base time and the tab's editor id (rows: DAT-082, QBS-035)
- [ ] **MT-354** Try to save a diagram that is over the body limit (change the server limit to a few kilobytes in a test setup) -> a clear refusal; the editor stays open (rows: DAT-075)
- [ ] **MT-355** As the viewer open a project diagram -> the diagram is read-only: add buttons, menus, drag handles, resize, delete and renames do not work but pan, zoom, select, filter and focus do (rows: EDT-014, DAT-079, DAT-090)
- [ ] **MT-356** As the editor open a diagram, then sign out in another tab, then edit -> a clear message about sign-in; nothing is lost silently (rows: QBS-041)

### 19.3 Publish, history, versions

- [ ] **MT-357** As the editor press Publish -> a dialog takes an optional note (up to 500 characters) and an auto-publish switch; only the editor holding the lock sees it; the viewer and a read-only copy do not (rows: QBS-030, DAT-076)
- [ ] **MT-358** Publish with a note -> pending autosave is sent first, a toast "Published v1" appears, the button shows the status; publish again after a change -> "Published v2" (rows: QBS-032, DAT-071, DAT-076)
- [ ] **MT-359** Change the diagram after publishing -> "Unpublished changes" is shown; change it back to the same content -> it goes away (the update time is ignored) (rows: DAT-078)
- [ ] **MT-360** Switch auto-publish on and change the diagram several times quickly -> a snapshot is saved on each changed save, and rapid ones are merged into one; check the version list (rows: DAT-077)
- [ ] **MT-361** Open the version history as the editor -> up to 500 versions are listed and any can be opened and read; publish more than the keep limit if you can set it to a small number -> only the newest are kept (rows: DAT-081, DAT-076)
- [ ] **MT-362** As the viewer open the project diagram list -> only diagrams with a published version are visible; open one -> it shows the published content, title and time; the unpublished diagram is not listed and its URL says "not found" (rows: DAT-079, SHL-111)
- [ ] **MT-363** Open a viewer copy of a published diagram that has tables without names, without coordinates, with no colour and a dangling relationship (from a prepared file published by an admin) -> the viewer shows it without a crash (rows: DAT-090)
- [ ] **MT-364** Publish a diagram of 50 tables, then check the diagram list -> the table and relationship counts are right without opening the diagram (rows: DAT-080)
- [ ] **MT-365** Create a project diagram whose saved file lacks a collection or has unknown extra keys -> the server accepts it, keeps the extra keys and the editor treats the missing lists as empty (rows: DAT-072, DAT-024, QBS-005)
- [ ] **MT-366** Send a diagram with a field name or id that is too long and a content body with a non-array collection (use the dev tools or curl) -> the server refuses with a clear message and changes nothing (rows: DAT-072)

### 19.4 Opening a project diagram, get latest, sign-out

- [ ] **MT-367** Open a project diagram for the first time in a browser -> a local copy under a new local id is created (check IndexedDB); an unreadable server content (corrupt it in the database) shows a clear error (rows: DAT-083, QBS-042)
- [ ] **MT-368** Edit the diagram in browser 1 and let it save; open it in browser 2 -> the local copy in browser 2 is refreshed because the server is newer and the copy has no unsent edits; if browser 2 had unsent edits, they stay and the copy is not overwritten (rows: DAT-084, QBS-042)
- [ ] **MT-369** Click the "get latest" icon in the navbar of a project diagram -> a confirmation; confirming deletes the local copy, hands its sync state to the new copy, reloads the project URL and downloads the server version; the icon is only shown for a signed-in person who has both copies (rows: QBS-027, QBS-047, DAT-088)
- [ ] **MT-370** Use "Get latest" from a diagram row in the project's Open dialog -> same outcome (rows: SHL-109, QBS-027)
- [ ] **MT-371** Sign out while local diagrams exist -> the diagrams and the server-linked data are gone from the browser (check IndexedDB `QBase`, `QubdiDB` and all `qbase.*` keys) but theme, language and view settings remain (rows: DAT-015, QBS-048, QBS-049, SHL-084)
- [ ] **MT-372** Sign in as a different person than the one who left local copies -> the old copies are removed first and the new person starts clean (rows: DAT-016, QBS-048)
- [ ] **MT-373** Create local diagrams in the local-only way (before any sign-in, build with a backend but not signed in or an old profile with no recorded owner) and then sign in -> the diagrams are kept and now belong to the signed-in person (rows: DAT-017)
- [ ] **MT-374** Import a JSON file inside a project -> the diagram is created on the server and opened there; a failed server create (stop the server) removes the local copy so a retry does not leave an orphan (rows: DAT-070, IMP-074, IMP-071)

### 19.5 Share links

- [ ] **MT-375** Press Share in a project diagram -> if the diagram is not on the server yet it is put there first; then the dialog creates a link for "anyone", "signed-in only" or "off", with an optional expiry (rows: QBS-033)
- [ ] **MT-376** Open the "anyone" link in a private window -> the viewer shows the published diagram read-only without sign-in; the "signed-in only" link asks for sign-in; an "off" or expired link says it is not available (rows: QBS-033, SHL-012, QBS-050)
- [ ] **MT-377** In the admin panel open the diagram's share links and revoke one -> a second confirmation is asked; after revoking the link stops working (rows: QBS-034)

### 19.6 Lint

- [ ] **MT-378** Open a diagram with known problems (a table without a primary key, duplicate names, a field with no type) -> the lint button shows a count badge; press it and a floating panel lists the findings (rows: QBS-028, QBS-046)
- [ ] **MT-379** Press "show table" in a finding -> the side panel opens at the right section, the item is expanded and the canvas zooms to it; run a fix from a finding -> the diagram changes and the finding goes (rows: QBS-028, SHL-079)
- [ ] **MT-380** Change lint settings for the diagram, reload and open it in a second browser -> the settings are the same (mirrored to the server); lint also runs with the network off (rows: QBS-046)
- [ ] **MT-381** Run a fix on a finding whose table you deleted in another browser meanwhile -> a red toast says the fix is stale and nothing changes (rows: QBS-046)

### 19.7 Import from database, re-sync and drift

- [ ] **MT-382** In a project press New diagram > Import from database -> choose a saved connection or enter a new one for PostgreSQL; the wizard lists schemas and tables, lets you choose, shows a preview with counts and creates the diagram; SQL Server works too; other types are not offered (rows: QBS-043, IMP-066)
- [ ] **MT-383** Save the connection for the project, reload the browser, reopen the wizard -> the connection is offered; the password is never shown or kept in the browser (check IndexedDB and the network responses); on the server it is stored encrypted (rows: IMP-067)
- [ ] **MT-384** Try a database host that is private and not on the allow-list -> a refusal naming the setting to change; a public host or an allow-listed one works (rows: IMP-069)
- [ ] **MT-385** Run a query containing a write keyword through the connect step (if the wizard allows custom text) or watch the setup -> the server reads in a read-only transaction and refuses writes; a query running over 20 s times out with a message (rows: IMP-068)
- [ ] **MT-386** Import a database whose metadata is very large (over 64 MB, from a generated schema) -> the import aborts with a message (rows: IMP-070)
- [ ] **MT-387** Check the imported diagram -> it is named after the database, has the edition and the source and database names remembered, tables, fields, indexes, relationships, views, ids and a layout (rows: IMP-065, IMP-072, QBS-017, DAT-087)
- [ ] **MT-388** Make a failing create (stop the server right after the preview) -> the local copy is removed (rows: IMP-071)
- [ ] **MT-389** Change the database (add a column, drop an index, add a table, rename a table) and press Re-sync on the diagram -> the changes are listed grouped by kind with checkboxes; renames are suggested only and unchecked; comments are ignored (rows: IMP-077, IMP-078, QBS-044, EDT-250)
- [ ] **MT-390** Rename a column in the database from `name` to `full_name` -> a possible rename is offered (similarity at least 0.6) and when accepted the stored names keep the renamed object matched later (rows: IMP-079)
- [ ] **MT-391** Apply a few selected changes -> "Apply n selected" applies only those; positions, colours, areas, notes and comments stay; new tables are placed in free space near related tables; one Undo reverts the whole apply (rows: IMP-080, EDT-250, QBS-044)
- [ ] **MT-392** Check the connection details after a re-sync, then use Get latest on that diagram -> the new local copy remembers the connection (without password) (rows: DAT-087, DAT-088, IMP-072)
- [ ] **MT-393** Publish the diagram, then change the live database -> the drift badge appears after the check on open (and again within about a minute while the tab is visible); hide the tab for two minutes -> no polling while hidden (rows: QBS-029, QBS-045)
- [ ] **MT-394** Open the drift report -> it compares the database with the last published diagram and offers to start a re-sync (rows: QBS-045, QBS-029)

### 19.8 Server limits and admin

- [ ] **MT-395** Check that the editor works with the server's content security policy: open the editor with the browser console open -> no policy violation, no inline script, no request to another host (rows: SHL-005, SHL-006)
- [ ] **MT-396** Request a static file twice (hashed JS asset) and look at the headers -> a long cache time and a compressed response (rows: SHL-115)
- [ ] **MT-397** Open the admin panel, the share viewer and the home page and look at the loaded files -> the admin panel and viewer do not load the editor, canvas or storage code (rows: QBS-050, QBS-051)
- [ ] **MT-398** Run the existing QBase tests and the rewritten editor against the server build, then walk sections 19.1 to 19.5 again -> everything still works with the new editor (rows: QBS-052, QBS-022, QBS-023, QBS-024)

---

## Appendix A. Sample data

All schemas are invented for this script. Copy each block as it is.

### A.1 PostgreSQL (dump style)

```sql
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

### A.2 MySQL

```sql
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

### A.2b MySQL error case

```sql
CREATE TABLE a (id INT PRIMARY KEY);
CREATE TABLE b (a_id INT REFERENCES a(id));
```

### A.3 SQL Server

```sql
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

### A.4 SQLite

```sql
CREATE TABLE pets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
CREATE TABLE vets (id INTEGER PRIMARY KEY, pet_id INTEGER REFERENCES pets(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX uq_pets_name ON pets(name);
```

### A.5 Metadata JSON (PostgreSQL, "zoo")

```json
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

### A.6 DBML (model S1, customers and orders)

```text
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

In the inline form the Ref line is replaced by `ref: > "customers"."id"` on the `customer_id` field.

---

## Coverage: rows left to automated tests only

Every other **keep** or **change** row of the parity checklist is cited by at least one step above. The rows
below are deliberately not walked by hand, because a person cannot see them or a test checks them better.

| Rows | Why they are left to automated tests |
| --- | --- |
| DAT-025, DAT-033, DAT-041, DAT-046, DAT-052 | Shape of the saved diagram (keys of tables, fields, indexes, relationships, stored dependencies). Checked by schema tests and by the old-file fixtures; the visible effects are covered in sections 5 to 8 and 16 |
| EDT-049 | Belongs to the highlight feature that was dropped (EDT-196); nothing to test by hand |
| QBS-001 to QBS-004, QBS-007, QBS-008, QBS-010, QBS-011, QBS-013 to QBS-016, QBS-018 to QBS-021 | Code-level contracts the server and the existing QBase modules rely on (hooks, providers, module paths, type and schema locations, import path of the metadata type, sibling test files). Verified by type checks, unit tests and by the Docker build; a person cannot observe them. Their visible effects are walked in section 19 |
| Rows that appear in steps only as part of a larger flow, with the detail checked by tests | Exact SQL text, type mapping tables, converter rules and parser details (EXP-013 to EXP-047, IMP-018 to IMP-041) are checked byte for byte by the automated sample tests of `import-export.md` section 10; the manual steps in sections 17 and 18 only confirm that the visible result is right |
| Dropped rows (the 15 rows of the drop list in `owner-decisions.md`) | Not tested: DAT-089, EDT-045, EDT-183 to EDT-186, EDT-196, EXP-008 (replaced by a clear message, tested in section 18), SHL-008, SHL-018, SHL-041, SHL-064, SHL-091, SHL-092, SHL-104 |
