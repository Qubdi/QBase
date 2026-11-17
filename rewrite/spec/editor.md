# Behaviour spec: the editor surface

Scope: everything a person sees and does inside the diagram editor once a diagram is open:
the canvas, tables, fields, indexes, check constraints, relationships, dependencies, custom
types, areas, notes, visibility filters, undo and redo, copy and paste, the diff view,
keyboard shortcuts, the mobile layout, and empty and error states.

Out of scope (other spec files): the diagram list and the new-diagram wizard, SQL/DBML/JSON
import and export formats, accounts, projects, sharing, drift and lint, the saved file format.
Where the editor touches them (menu entries, buttons) the entry is named but the behaviour
is not described here.

How to read this: it describes what the existing editor does today, written from using it.
Where a behaviour looks like a mistake it is marked **Suspect** and repeated in the open
questions at the end, so the owner can decide to keep or change it. "The editor" means the
page with the top bar, the left icon rail, the side panel and the canvas.

Words used: a **table** is a box with columns; a **field** is one column of a table; a
**view** is a table marked as a view (it has no indexes and cannot take relationships);
a **relationship** is a foreign-key line between two fields; a **dependency** is a line from
a view to a table it reads; an **area** is a coloured background rectangle that groups
tables; a **note** is a coloured sticky text box; a **schema** is a namespace inside a
database (only some databases have them).

---

## 1. Page layout

### 1.1 Desktop (a window at least 768 px wide)

- A **top bar** across the page: logo, the diagram name, the menu bar (Actions, Edit, View,
  Backup), the last-saved indicator, language picker, account menu. Server-only widgets
  (publish, lint, drift, share) sit here when a server is configured; they are specified
  elsewhere.
- A thin **icon rail** on the left edge with these entries, top to bottom: **New** (opens the
  new-diagram wizard), **Open** (opens the diagram list), a divider, then the panel
  sections: **Tables**, **DBML**, **Refs**, **Custom Types** (only for databases that
  support custom types, see 14.1), **Visuals**. The entry for the current section is
  highlighted. Clicking a section entry opens the side panel (if it was hidden) and shows
  that section.
- A resizable **side panel** to the right of the rail, showing one section at a time. It
  starts at about a quarter of the width, has a minimum width of 350 px, and can be dragged
  wider by a handle between it and the canvas (up to nearly the whole window). Hiding the
  panel collapses it to zero width and disables the handle.
- The **canvas** fills the rest.
- The panel is visible when the editor first opens on desktop.

### 1.2 Mobile (narrower than 768 px)

- The top bar is replaced by a compact one: a menu button (toggles the icon rail, which
  slides in over the canvas), the product name, account menu and language picker, the menu
  bar on a second line, and the diagram name on a third line.
- The side panel is **not** shown beside the canvas. It opens as a bottom **drawer** titled
  "Manage Diagram" (subtitle "Manage your diagram objects"), dragged down or tapped outside
  to close. Inside it, instead of the icon rail, a drop-down at the top lets the person pick
  the section: Tables, Refs, Areas, Visuals, Custom Types (last one only where supported).
  The drop-down shows the hint "View all Options..." on its right. (DBML is only reachable
  from the icon rail.)
- A round teal **pencil button** sits at the bottom-left of the canvas (editable diagrams
  only). It opens the drawer.
- The bottom toolbar (see 2.8) moves to the **top-centre** of the canvas so the drawer
  button and the browser bars do not cover it.
- The minimap, when shown, is 60x60 instead of 100x100.
- The type-colour legend (2.9) is not shown.
- Right-click context menus on the canvas, on tables and on areas are **not** available.
  Everything they offer is reachable from the drawer, or by whatever double-tap the
  browser turns into a double click.
- Focusing a table or area from the panel (the "focus" button) closes the drawer so the
  canvas is visible; on desktop the panel stays open.

### 1.3 Loading

- While the diagram data loads, a placeholder top bar and a centred spinner show. After
  that, a small teal badge "Loading diagram..." appears at the top-centre of the canvas
  until tables have been drawn.
- After the first load the view is fitted so every table is visible (see 2.4), capped so
  that a single small table is not zoomed past 80%.
- The browser tab title is "QBase - <diagram name>", or "QBase - Database schema diagrams"
  when no name is available yet.

### 1.4 Read-only mode

Whenever the diagram cannot be edited (a viewer role, a locked diagram, a shared read-only
link), the same editor shows, with these changes: no right-click menus, no "add" buttons,
no drag-to-connect handles, no resize handles, no delete by keyboard, no rename on double
click, no pencil button on mobile, text inputs in the panel are read-only, toggles are
disabled, and the "Auto Arrange" and "snap" buttons are hidden. Panning, zooming, selecting,
the filter, focusing and copying still work. Banners explaining why are specified with the
server features.

---

## 2. Canvas

### 2.1 Background and objects

- A dotted background grid, dot spacing 16 px.
- Four kinds of object sit on the canvas: tables (including views), areas, notes, and the
  lines between them (relationships and dependencies).
- Areas are drawn behind tables; moving an area never covers a table.
- Dark and light themes both apply to the canvas (see section 15).
- Only objects near the visible region need to be drawn (performance); this is not visible
  to the person but diagrams of several hundred tables must stay usable.

### 2.2 Pan

- Dragging the empty background pans.
- Mouse-wheel or two-finger trackpad scroll **pans** by default.
- View menu > **Zoom on Scroll** has two choices, **On** and **Off**. With On, the wheel
  zooms around the pointer. With Off (the default), the wheel pans and zooming needs
  Ctrl or Cmd plus the wheel, a pinch, or the toolbar. The choice is remembered per browser.

### 2.3 Zoom

- Range: 10% to 500%.
- Ways to zoom: toolbar plus and minus buttons (200 ms animation), the percentage button
  (click to reset to exactly 100%), Ctrl or Cmd plus wheel, pinch, wheel when Zoom on Scroll
  is On.
- The toolbar shows the current zoom as a rounded percentage, updating live.
- Zoom changes are not part of undo.

### 2.4 Fit to screen ("Show All")

- Toolbar button "Show All" (a frame icon) and the shortcut Mod+0 fit all visible tables in
  the view with 10% padding and a maximum zoom of 80%, animated over half a second.
- If the person has panned so that no table is on screen, a **"Show All" pill button** pops
  up just above the toolbar (desktop) or below it (mobile) so they can get back.
- A fit is also done automatically: on first load, after a filter change (2.12), and after
  Auto Arrange.

### 2.5 Selection

- Click a table, area or note to select it (outline in the accent colour). Click empty
  background to clear the selection. Clicking a line selects the line (it turns teal).
- **Multi-select:** hold Shift, Ctrl or Cmd while clicking to add or remove from the
  selection. Dragging on empty background with Shift held draws a rubber-band rectangle;
  everything **fully inside** the rectangle is selected (partial overlap does not count).
  While Shift is held the cursor changes to the multi-select cursor.
- Dragging any selected object moves every selected object together.
- **Delete or Backspace** removes everything selected (tables with their relationships and
  dependencies, areas, notes, a selected line). The key is ignored while typing in a text
  box. Disabled in read-only mode.
- Selecting a table **fades the others**: tables that are neither selected nor directly
  linked by a relationship or dependency to a selected table drop to 40% opacity and grey,
  so the neighbourhood stands out. Clearing the selection restores them.
- Selecting a table also makes its left and right edges draggable for resizing (see 3.5).
- The side panel and canvas share the selection in one direction only: clicking "focus" on a
  list row selects that table and centres it; selecting on the canvas does not scroll or
  open the list.

### 2.6 Moving and snapping

- Dragging a table moves it freely. Positions are saved when the drag ends.
- **Snap to grid:** a magnet button at the top-left of the canvas (editable diagrams only)
  toggles snapping to a 20 px grid, shown highlighted in teal when on. Holding Shift
  while dragging snaps temporarily, regardless of the button. Tooltip: "Snap to Grid (Hold
  Shift)" (on Mac the symbol for Shift is shown instead of the word).
- The canvas is unbounded; objects are not constrained to the visible area.
- Moving a table fully inside an area makes it a member of that area (see 10.3). Moving
  it out removes the membership. Membership is recomputed shortly after a drag ends.
- Dragging an **area** moves its member tables with it, as one history step.

### 2.7 Overlap warning

- When two or more tables overlap, a warning-triangle button appears at the top-left next to
  the magnet (fades in). Tooltip: "Highlight Overlapping Tables". Pressing it makes the
  overlapping tables flash with a red outline for 0.6 s. Overlap is detected on the table
  boxes as drawn, updated shortly after drags and resizes.
- Overlapping tables also have a persistent subtle outline.

### 2.8 Toolbar

A floating pill at the bottom-centre (top-centre on mobile). Left to right, with vertical
dividers:

1. **Filter Tables** (magnifier). Tooltip includes the shortcut Mod+F. Highlighted teal
   while any filter hides something. Toggles the filter panel (2.12).
2. **Show All** (frame). Tooltip shows Mod+0.
3. **Zoom Out**, the **zoom percentage** button, **Zoom In**.
4. **Auto Arrange Diagram** (grid icon; editable only). Asks first (see 2.10).
5. **Undo** and **Redo** (arrows). Disabled when there is nothing to undo or redo. Tooltips
   show the shortcuts.

### 2.9 Other canvas chrome

- **Minimap** at the bottom-right showing the whole diagram and the current viewport.
  Toggled from View > Hide Mini Map / Show Mini Map; on by default; remembered per browser.
  A small margin is left under it for a credit line.
- **Type colours legend** at the top-right (desktop only): a button "Type colours" that opens
  a list explaining the tints used on field-type chips: Text / other (teal), Number
  (violet), Date & time (orange), Identifier (blue), Boolean (pink), JSON / XML (lime). The
  chip tint is chosen from the type name: uuid-like and guid-like are Identifier; bool,
  boolean, bit are Boolean; date, time, timestamp, datetime, interval, year are Date & time;
  json, jsonb, xml, hstore are JSON / XML; integer, float, decimal, numeric, money and
  siblings are Number; everything else Text / other.
- A credit mark ("Powered by") at the very bottom-right.
- **Full screen:** the existing editor has no full-screen mode of its own (the browser's own
  F11 works). See open question 1.
- **Highlight from custom type:** while a custom type is highlighted (see 9.5), a yellow
  highlighter button appears at the top-left; tooltip `Highlighting "<name>" - Click to
  clear`. Clicking it clears the highlight.

### 2.10 Auto Arrange

- Toolbar button or right-click background menu "Auto Arrange Diagram". A confirmation
  dialog: title **Auto Arrange Diagram**, text "This action will rearrange all tables in
  the diagram. Do you want to continue?", buttons **Auto Arrange** and **Cancel**.
- Confirming lays out the **visible** tables (respecting the filter, and hiding views when
  views are off) in a relationship-aware arrangement: related tables end up near each other
  and tables with no relationships are placed in a grid beside the rest; tables inside an
  area stay grouped with that area. All positions change in one undoable step, and the view
  then fits to the result.

### 2.11 Right-click menus (desktop only; not in read-only)

**On empty canvas:**
- **New Table** at the pointer.
- **New View** at the pointer, only when "Database Views" is On.
- **New Relationship** (opens the Create Relationship dialog, 7.2).
- **New Area** at the pointer.
- **New Note** at the pointer.
- A separator, then **Auto Arrange Diagram**.
- When tables are selected, a **Move to Area (n)** submenu listing areas by name, plus
  "New Area" to create one and move the selection into it.

Creating a table here puts it in the default schema (14.2) and immediately opens it for
editing on the canvas (3.3).

**On a table:**
- **Edit Table** (opens in-place edit mode, 3.3)
- **Duplicate Table**
- **Add Relationship** (starts drawing a relationship from this table, 7.1B)
- **Move to Area** submenu: "No Area" (disabled when the table has none) and each area. If
  more than one table is selected the label shows the count and the move applies to all.
- **Delete Table**

**On an area:** **Edit Area Name**, **Auto Arrange** (lay out the tables inside this area,
growing the area if they do not fit), **Delete Area**.

**On a note:** none.

### 2.12 Filter panel (visibility of tables and schemas)

- Opened by the toolbar Filter button or Mod+F (works even while typing in a field;
  pressing again closes it). Closed with its X button. It floats over the canvas.
- Title **Filter Tables**. A search box "Search tables..." (auto-focused). A two-way
  toggle **Group by Schema** / **Group by Area**.
- Below, a tree: top-level groups (each schema, or each area, plus a group for tables with
  none) containing tables. Every group and every table has an **eye** control that shows
  or hides it on the canvas. Hiding a group hides all of its tables. Groups also have a
  "zoom to this group" control, and rows for tables have "zoom to table". Clicking a table
  row makes it visible if hidden, selects it, flashes it briefly, and zooms to it.
- Typing in the search box narrows the tree to matching table names (case-insensitive,
  substring). Clearing the box does **not** change which tables are hidden: show/hide
  choices are separate from the search text.
- When nothing matches: "No tables found" with the hint "Try adjusting your search or
  filter" and a **Clear filter** button. If the diagram has no tables at all: "No tables
  found" with "Create a table to get started".
- When the filter hides every table, a message sits in the middle of the canvas: "All
  tables are hidden" with a **Show all** button; the Tables section of the side panel shows
  the same.
- A hidden table's relationships and dependencies are hidden too. Hiding is a view setting:
  it is saved with the diagram (so it survives reload) but is not undoable and does not
  alter any table.
- The visible set is "union logic": a table is visible if its schema is on the list of
  visible schemas **or** its own id is on the list of visible tables. If a person ticks
  every table of a schema the schema itself counts as visible (so tables added later to that
  schema appear). If everything is visible the filter is "off".
- On databases without schemas only tables are filterable.
- After any filter change the canvas refits to the visible tables.
- The toolbar Filter button is teal when a filter is active.

### 2.13 Drag and drop

- Dropping a file onto the canvas is **not** a feature (import is through menus).
- Re-ordering tables in the side panel list by drag (3.8) and re-ordering fields by drag
  (4.9) are the only drag-and-drop lists.

---

## 3. Tables

### 3.1 Look of a table on the canvas

- A rounded card with a header and a body.
- **Header:** a wash of the table's colour behind a small colour **swatch** (a solid dot for
  tables, a hollow dot outline for views), then the **name** in bold, then a muted
  **subtitle** line made of: the schema (if any), the word "view" or "materialized view"
  for views, and the first line of the table's description, joined by " · ". Hovering the
  subtitle shows the full description as a tooltip. On the right, a muted field-count badge
  (tooltip "<n> fields") which is replaced on hover by buttons: **open in side panel**
  (pencil, editable only) and **widen/narrow** (see 3.5).
- **Body:** one row per field, 32 px each (see 4.1).
- **Footer:** when the table has more than 10 fields, a full-width button "Show More"
  expands it; "Show Less" collapses it again.
- Default width 224 px; range 224 to 450 px.
- Invisible connection handles sit by each field row and over the table, used for drawing
  relationships (7.1). Views additionally have top and bottom handles used for
  dependencies (8).

### 3.2 Create a table

Ways:
1. Right-click the canvas > New Table (position: where clicked).
2. Side panel, Tables section > **Add Table** (position: near the top-left of what is
   currently visible, offset 80 px).
3. Paste (section 17) and **Duplicate Table** (3.10).
4. Import (other spec).

New table defaults: name **table_N** where N is one more than the number of non-view tables
(views: **view_N**, counted separately); one field named **id** of the database's default
key type, primary key, unique, not null; a light blue colour for tables and grey for views;
placed at the click/offset position; added at the end of the list order; schema per 14.2.

If several schemas are currently visible and the person used the side panel button, a
**Select Schema** dialog first asks which schema the new table belongs to ("Multiple
schemas are currently displayed. Select one for the new table." with **Cancel** and
**Confirm**). If exactly one schema is visible it is used without asking.

"Add Table" is a split button: its chevron offers **Add View** when Database Views is On.

### 3.3 Edit a table on the canvas ("edit mode")

- Entered by **double-clicking** a table, by "Edit Table" in the context menu, or
  automatically right after creating a table from the context menu.
- The table's card is replaced by a slightly larger **edit card** floating above the canvas
  (accent border, glow), scaling in over 0.1 s, containing:
  - Header: for databases with schemas, a schema drop-down (with a "Create new schema"
    footer button that turns the box into a text input labelled "Enter schema name (e.g.
    public)"; Enter creates, Escape cancels); the **table name** text box (placeholder
    "Table name", auto-selected); an "open in side panel" button; and a close X.
  - A scrollable list of fields, each row with: name box, type picker, **N** toggle
    (nullable), **PK** key toggle, delete (trash) toggle. Newly added fields are scrolled
    to, focused, and briefly highlighted light blue.
  - Footer: colour picker (tables only, not views), **Add Field** button, and a count
    "<n> Fields".
- The mouse wheel scrolls the field list without panning the canvas, except with Ctrl/Cmd,
  which still zooms the canvas.
- Leave edit mode by clicking the X, clicking empty canvas, pressing Escape, or starting
  to draw a relationship. Only one table is in edit mode at a time. Opening a table in the
  side panel collapses all open rows there first.
- Table name edits are saved 1 second after the last keystroke (empty or unchanged names
  are ignored). Field name edits save after 0.3 s. Toggles after 0.1 s.

### 3.4 Rename a table

- In edit mode (above), or in the side panel: double-click the table name in its list row
  (tooltip "Double-click to edit"), or the pencil on that row; Enter saves, Escape
  cancels, clicking elsewhere saves. Empty names are not accepted.
- The name is not validated for uniqueness or characters; duplicate names are allowed in
  the editor (the SQL export is where a clash matters).

### 3.5 Resize and width

- Select a table, then drag the left or right edge to change the width, between 224 and 450
  px. Height is never set by hand; it follows the field count.
- The hover button on the header toggles between narrowest (224) and widest (450). When the
  current width is below 337 the button widens to 337 first.
- Width is saved and undoable.

### 3.6 Colour

- The edit card's colour picker offers a palette of 12 colours (red, pink, purple, violet,
  indigo, light indigo, sky blue, aqua, mint, lime, yellow, orange) and a custom colour
  option; recently used custom colours are remembered per browser. Views have no colour
  picker (fixed grey; materialized views a darker grey).
- The colour tints the header wash and the swatch; the table body stays neutral.

### 3.7 Description (comment)

- Side panel > open the table > **Description** accordion > a text area, placeholder "No
  description". Saves as you type. Shown as the third part of the table subtitle (first
  line only) with the full text as a tooltip. Used by SQL export as the table comment for
  databases that support comments (14.3). Multi-line.

### 3.8 The Tables list in the side panel

- Header: a filter text box ("Filter") and the **Add Table** split button.
- Each table is one accordion row (only one open at a time): a drag handle, the name with
  its schema in brackets (the schema is only shown when more than one schema is visible),
  a "View" tag for views, a pencil (rename), a "focus on the canvas" button (selects and
  centres the table at 100% zoom), and a "More actions" menu.
- **More actions menu (titled "Table Actions"):** **Change Schema** (offered when the
  database has schemas or the diagram has some), **Add Field**, **Add Index** (not for
  views), **Duplicate Table**, **Delete Table**.
- **Order:** the list is sorted by a stored order number when present, else tables before
  views, then alphabetically by name. **Dragging a row** to a new position re-numbers every
  table (undoable). New tables are added at the end. The order is for the list only; it
  does not affect the canvas.
- Typing in the filter narrows the list to names containing the text; the text clears
  automatically when Add Table is used. "No tables found matching your filter." with a
  Clear Filter button if empty.
- The list respects the visibility filter (2.12) and the "Database Views" switch (views
  appear only when it is On).
- Opening a row expands its details: Fields, Indexes (not for views), Check Constraints
  (not for views), Description. The panel scrolls the opened row into view. When a table
  is opened from the canvas ("open in side panel") the Tables section is selected
  automatically.
- **Change Schema** opens the **Change Schema** dialog ("Update table '<name>' schema")
  with a schema picker and a switch to "Create new schema"; buttons **Cancel** /
  **Change**. Changing the schema of a table also gives any schema-less table the same
  schema (so the diagram does not end up with a mix).

### 3.9 Delete a table

- Via canvas right-click, the panel menu, or the keyboard.
- No confirmation dialog. All relationships and dependencies that touch the table are
  removed with it. The whole operation is **one undo step**, and undo restores the table,
  its relationships and its dependencies.

### 3.10 Duplicate a table

- Creates a new table with a new id, the name suffixed with `_copy`, moved 30 px right and
  50 px down, with all fields and indexes copied (new ids, indexes remapped onto the new
  field ids; the primary-key index name is cleared). Relationships and dependencies are
  **not** copied. The copy is undoable.

### 3.11 Views and materialized views

- A view is a table flagged "view": grey, hollow swatch, subtitle "view" (or "materialized
  view"), no indexes, no check constraints, no relationship handles on its fields (it
  cannot take foreign keys) but it has the dependency handles at its top and bottom.
- Views are **hidden by default**. View > **Database Views** > On/Off toggles all views at
  once everywhere (canvas, list, filter, auto arrange). The setting is remembered per
  browser, default Off. While Off, "Add View" and "New View" are not offered.
- Whether something is a "materialized" view can only come from import; there is no way to
  toggle it by hand.

---

## 4. Fields

### 4.1 Look of a field row on the canvas

Left to right: a key icon if the field is a primary key, otherwise a link icon if it is a
foreign key (the field on the "many" side of a relationship, or on the target when both
sides are equal); the **name** (semi-bold if key or unique); a small **UQ** badge if unique
and not a PK; the **type chip** (tinted per 2.9, monospace) showing the type name (first
word only, so "double precision" shows "double") plus its attributes (see 4.5); and a small
**nullability dot**, hollow if the field can be null, solid if not null.

- Hovering a row for a moment shows a floating **detail card** to the side of the table with
  the field's full details and the links "references <table>.<field>" or "referenced by
  <table>.<field>" for each relationship.
- Fields get a small connection dot on their left/right edge for dragging (7.1), only in an
  editable diagram.
- A highlighted custom type (9.5) tints matching fields yellow.
- View > **Hide Field Attributes** / **Show Field Attributes** (default shown): when hidden,
  type chips show just the type name, without sizes (an array still shows `[]`).
- View > **Compact Tables** / **Standard Tables** (default Standard): compact hides the type
  chip and the nullability dot, showing names only. Remembered per browser.

### 4.2 Collapsing long tables

- A table with 10 or fewer fields shows them all. With more than 10 it shows 10 when
  collapsed: primary-key fields and fields that take part in a relationship are always
  kept, then the remaining slots are filled from the top, preserving the original order.
  "Show More" shows all; the expanded state is saved per table and survives reload.
- While a table is in edit mode its height stays stable.

### 4.3 Add a field

- Edit card > **Add Field**; or Tables list > open the table > **Add Field** (in the header
  "+" and below the list); or the table's More actions > Add Field.
- Default: name **field_N** (N = field count + 1), the database's default key type, nullable,
  not primary, not unique, no default; appended at the end. In the edit card it is focused
  and selected for typing.

### 4.4 Rename a field

- Type in the name box (canvas edit card or side-panel row). Saves 0.3 s after the last
  keystroke. Unchanged text is not saved. Names are not validated.

### 4.5 The type picker

- A searchable drop-down. Placeholder "Type"; empty search result shows "No types found".
- The option list depends on the database (14.1). Options are ordered: the most common
  types first (a small curated set per database), then the rest alphabetically. When the
  diagram has custom types, the list is split into two groups: **Standard Types** and
  **Custom Types**; each custom type shows its name (enums also show their values separated
  by " | ").
- The person can also **type a full declaration** and pick the match: for example
  `varchar(255)`, `numeric(10,2)`, `decimal(8)`, `varchar(max)` (where "max" is allowed),
  or `integer[]`, `text[]` for databases that support arrays. The editor recognises the
  size/precision/scale/array and fills the right attributes.
- Each option shows a suffix of its attributes, e.g. `varchar(255)` for the current field.
- Picking a type: size, precision, scale are **kept** only if the new type also has them
  (otherwise cleared); the array flag is kept only if the new type allows arrays; the
  **default value is always cleared**; for the serial family (serial, bigserial,
  smallserial) the field becomes not null and auto-increment is forced on.

### 4.6 The field attributes popover ("Field Attributes")

Opened by the "..." button at the right of a field row in the side panel. A small popover
titled **Field Attributes**; changes apply 0.3 s after the last edit. The yes-or-no settings
are small on/off switches (not boxes). Contents:

- **Allow null** switch, first in the list. It is the same setting as the "N" toggle of
  the row (4.7): switching it on or off turns the toggle on or off, and the other way
  round. Disabled, as the toggle is, for primary-key fields and the serial family.
- **Unique** switch. Disabled when the field is the only primary key (a lone PK is
  implicitly unique). Turning a field into the first primary key sets Unique on.
- **Auto Increment** switch, only for integer-like types (integer, int, bigint, smallint,
  tinyint, mediumint, and the serial family). Disabled while the field is nullable (auto
  increment needs not null) and permanently on for the serial family.
- **Array** switch, only when the database supports arrays (14.1) and the type is not
  serial-like.
- **Max Length** for character types: a choice among **None**, **Max** (only for types
  that accept it, e.g. SQL Server varchar/nvarchar) and **Custom**, where a number box
  appears; the box obeys the type's own maximum where one exists.
- **Precision** and **Scale** number boxes for numeric/decimal-like types, with the
  database's range as min/max and its default shown as the placeholder (e.g. precision 10).
- **Default Value** text box, placeholder "No default". Stored as typed (so `0`,
  `'abc'`, `now()` and `CURRENT_TIMESTAMP` are all accepted verbatim); empty clears it.
- **Description** text area, placeholder "No description". Used as the column comment in SQL
  export where the database supports comments. It is shown as a small comment icon inside the
  right end of the field's name box, so the box is the same width on every row, with or without
  a description (clicking the icon shows only the description, in a small popover; changing it
  is in Field Attributes. In the card on the canvas the icon only
  shows the description as a tooltip).
- **Delete Field** button (hidden in read-only mode).

### 4.7 Nullable (the "N" toggle)

- Toggle on = the field may be null. Disabled (and forced off) for primary-key fields and
  the serial family. Turning on nullable clears Auto Increment. Updates apply 0.1 s later.
- The same setting is the **Allow null** switch in Field Attributes (4.6); either control
  changes it and the other shows the result.

### 4.8 Primary key (the key toggle)

- Setting a field as PK sets not-null on it; if it is the **first** PK in the table it is
  also made unique. Unsetting only clears the PK flag. A table may have several PKs
  (composite key). A field that is PK and nullable (from old data) is silently corrected
  to not-null.
- The table's **primary-key index** (see 5) is kept in sync automatically: it lists every PK
  field in the table's order, appears at the top of the Indexes list, its fields cannot be
  edited by hand, and it has an empty name.

### 4.9 Reorder fields

- Side panel > open a table > drag a field's handle (left of the row) up or down. The new
  order is saved and shown on the canvas. Not available in read-only mode. There is no
  reordering from the canvas edit card.

### 4.10 Delete a field

- Trash toggle in the edit card, or "Delete Field" in the popover. No confirmation. Undoable
  (restores the field with its data). Relationships that use the field are **not** removed
  automatically by the editor (see open question 6).

### 4.11 Per-database differences in fields

See 14. In short: the type list differs; arrays only for PostgreSQL and CockroachDB;
precision/scale only on types that define them; the default key type differs; schemas only on
some databases.

---

## 5. Indexes

- Side panel > open a table > **Indexes** accordion (not shown for views). Header "+" or
  button **Add Index** adds a row.
- A new index is named **index_N**, has no fields, is not unique, and gets the database's
  default type (btree on PostgreSQL/CockroachDB, none elsewhere).
- Each row: a field multi-select ("Select fields"), a **Unique** toggle, and a "..." popover
  **Index Attributes** with: **Name**, **Unique**, **Index Type** (only for databases that
  offer a choice: PostgreSQL and CockroachDB offer btree, hash, gin), a description, and
  **Delete Index**. Unique there is a switch, like those in Field Attributes (4.6).
- **GIN** is only available when the chosen fields can use it (array fields, json, jsonb,
  tsvector, hstore); otherwise the option is disabled, and removing such a field from the
  selection while the type is gin resets the type.
- **Unique** (the key toggle and the switch in the popover) is greyed out and cannot be
  switched on while the index has a field whose type the database cannot put in a unique
  index: PostgreSQL
  json, xml and the geometric types; MySQL and MariaDB text, blob, json and spatial types;
  SQL Server text, ntext, image, xml, json, geometry, geography and varchar, nvarchar or
  varbinary with a `max` length; Oracle clob, nclob, blob, bfile, long raw and xmltype.
  SQLite has none. The key toggle's tooltip and a line under the switch name the fields
  and their types. An index that is already unique stays switchable, so it can be turned
  off. Choosing such a field for an index that is already unique does not change the flag.
  (`columnsBlockingUnique` in `src/core/model/index-methods.ts`.)
- **Unique** is also greyed out, with its own reason, while the index is of a type that can
  never be unique: PostgreSQL hash, gist, gin, spgist and brin (only btree can be unique);
  MySQL and MariaDB fulltext and spatial; SQL Server columnstore and xml; Oracle bitmap. The
  reason says to change the index type first, and names the database's first type. Unique
  does not change the type any more: it stays what it was, and Unique opens as soon as the
  type is changed to one that can be unique. With Unique on, the types that cannot be
  unique are greyed in the Index type list and are not named one by one under it; the other
  kinds of line there (gin needs json fields, hash takes one field...) stay.
  (`methodCannotBeUnique`; the command level is unchanged: `planUpdateKey` still resets
  such a type when the flag is set another way, EDT-144.)
- The primary-key index (4.8) is listed first, shows a lit PK toggle and the label "Primary
  Key". Its Unique and description can be changed; its fields cannot.
- Other indexes sort after it. Index names are not validated.
- All index changes (add, edit, delete) are undoable.

---

## 6. Check constraints

- Side panel > open a table > **Check Constraints** accordion (not shown for views), "+" or
  **Add Check**.
- A new constraint has an empty **Expression** (text area, placeholder "e.g., price > 0").
  Edits save as you type. A "..." popover titled **Check Constraint** offers the
  expression box and **Delete Check Constraint**.
- The editor does not validate the expression. SQL export decides what to write for each
  dialect. The section is shown for every database (see open question 15).
- Add, edit, delete are undoable.

---

## 7. Relationships

### 7.1 Create by dragging (two ways)

**A. Field to field.** In an editable diagram, hovering a field row shows connection dots on
its left and right edges. Pressing on a dot and dragging to a dot on a field of another table
draws a line; releasing on a valid target creates a relationship with the first field as
**source** and the second as **target**. Behaviour on release:
- If the two fields' types are not compatible (see 7.5) a red toast appears: title "Field
  types are not compatible", text "Relationships can only be created between compatible
  field types", and nothing is created.
- If a relationship already joins those two fields (in either direction) a red toast
  "Already connected" / "These two fields already have a relationship between them" appears
  and nothing is created.
- Views have no field dots, so they cannot take part.
- Releasing on empty canvas creates nothing.

**B. Table to table (quick).** Right-click a table > **Add Relationship**. A line follows the
pointer starting at the table's centre. Hovering another table snaps the end to it; clicking
that table opens a small floating **create-relationship card** next to the pointer:
- It pre-selects the first compatible field of the target table (a field whose type matches
  the source table's primary-key field). If none is compatible, it suggests a new field name
  derived from the source table name plus its key name, offered as a choice labelled
  `Create "<name>"`.
- The person may change the target field in a searchable list (typing a new name offers
  `Create "<typed name>"`), then confirms. Confirming creates the field (same type as the
  source key, nullable) if needed, creates the relationship, selects its line, and opens it
  in the Refs section of the side panel.
- Errors shown inside the card: "Please select a target field", "Failed to create new
  field", "Failed to create relationship".
- Escape, a click on the empty background, or clicking outside cancels the line and closes
  the card.
- The source of this kind of relationship is the source table's **primary-key field**; the
  card does nothing useful if the source table has none.

### 7.2 Create by dialog

- Canvas right-click > **New Relationship**, or Refs section > **Add Relationship**. A dialog
  **Create Relationship** with four pickers in order: **Primary Table**, **Primary Field**,
  **Referenced Table**, **Referenced Field** (placeholders "Select table" / "Select
  field"; empty lists say "No tables found" / "No fields found"). Choosing a table enables
  its field picker and opens it. Buttons **Create** and **Cancel**. Create is disabled until
  all four are chosen.
- Same two checks as 7.1A (type compatibility, already connected) apply and show the same
  messages.

### 7.3 What a new relationship is

- Name `<source table>_<source field>_fk`; source and target as chosen; **cardinality**
  one-to-one by default; the schemas of both tables are remembered.
- There is exactly one relationship per pair of fields. Asking for an existing pair returns
  the existing one rather than adding another.
- The model has two cardinality choices only: **One to One** (1:1) and **One to Many**
  (1:N). There is no many-to-many (it is modelled with a junction table). The "many" side
  is always the **target**; the target holds the foreign key.

### 7.4 How a relationship is drawn

- A smooth line between the two fields' rows on the table edges (left or right edge,
  whichever faces the other table). A relationship between a table and itself loops out of
  one side. Parallel lines between the same two tables are offset so they do not overlap.
- Line ends carry crow's-foot style markers: a single bar for "one", a three-pronged foot
  for "many". Markers are hidden when View > **Hide Cardinality** is chosen; default shown;
  remembered per browser.
- Grey by default; teal when selected; green or red during a diff (see 16).
- A wide invisible stroke around the line makes it easy to click.
- When selected, a small indicator dot sits mid-line; clicking it opens the popover.

### 7.5 Compatible types

Two fields can be joined when their types are the same, or are on a short list of known
equivalents: in PostgreSQL serial and integer, smallserial and smallint, bigserial and
bigint; in MySQL int and integer, tinyint and boolean. Anything else is incompatible.

### 7.6 Edit a relationship

- **Double-click** the line (or click its selected indicator) opens a small popover under the
  pointer with: two cardinality buttons **1:1** and **1:N** (current one filled), **Switch
  tables** (arrows icon), **Open in sidebar**, **Delete relationship**. Clicking outside or
  pressing Escape closes it.
- **Cardinality change:** choosing 1:N keeps source and target. The editor never keeps "many
  on the source" so asking for N:1 swaps the two tables, fields and schemas and stores 1:N.
- **Switch tables:** if both cardinalities are the same, source and target (tables, fields,
  schemas) swap. If it was N:1 (from old data), it flips to 1:N. If it was 1:N, the tables
  swap and it stays 1:N.
- All edits are undoable.

### 7.7 The Refs section of the side panel

- A filter box, **Add Relationship** (opens the dialog 7.2), a "Collapse All" control, two
  groups: **Relationships** and **Dependencies**. Empty state: "No relationships" /
  "Create a relationship to get started".
- Each relationship row: its name; opened it shows **Primary Table**, its field,
  **Related Table**, its field, a **Cardinality** drop-down (One to One / One to Many),
  **Switch Tables**, **Delete**.
- The filter box matches on the relationship name and both table names, case-insensitive.
  The list honours the visibility filter: a relationship appears only when both its tables
  are visible.

### 7.8 Delete a relationship

- Select the line and press Delete or Backspace; or popover > delete; or Refs row > Delete.
  Undoable. Deleting a relationship never deletes fields.

---

## 8. Dependencies (view to table)

- A dependency says "this view reads this table". It is drawn as a line (distinct from a
  relationship's style) between the view and the table.
- **Create:** drag from a view's top or bottom dot onto another table (the whole table is
  the drop target while dragging). Only views have these dots. Which end is "the view" is
  fixed by where the drag started.
- **List:** Refs section > Dependencies group; each row shows the table, the "Dependent
  View", and a **Delete** action. Filter and visibility rules match relationships.
- **Delete:** select the line and press Delete or Backspace, or Refs row action. Undoable.
- Removing a table removes its dependencies (one undo step with the table).
- There is no dialog for creating dependencies; dragging is the only way besides import.

---

## 9. Custom types (enums and composites)

### 9.1 Availability

Only for databases that support custom types (today: PostgreSQL). For others the **Custom
Types** section and its rail entry do not exist.

### 9.2 The section

- Filter box ("Filter"), button **New Type**. Empty state: "No custom types" / "Custom types
  will appear here when they are available in your database". A non-empty filter with no
  match: "No custom types found matching your filter." with Clear Filter.

### 9.3 Creating and editing

- **New Type** adds a row named **type_N**, of kind **Enum**, with no values.
- Row header: the name (double-click or pencil to rename; Enter saves, Escape cancels), the
  schema in brackets when more than one schema is visible, and a "More actions" menu
  (titled "Actions"): **Highlight Fields** / **Clear Highlight**, **Delete**.
- Row body: **Kind** (Enum or Composite).
  - **Enum:** a list of values shown as removable chips with a text box "Add enum value..."
    and an add button; Enter in the box adds. Empty list: "No enum values defined".
  - **Composite:** a list of fields, each a **name** box ("Field name") and a **type**
    picker ("Select type"), with a remove control, plus **Add Field**. Empty list: "No
    fields defined".
- Changing the kind keeps the other kind's data hidden (see open question 14).
- All add, edit, delete operations are undoable.

### 9.4 Use

- Once defined, a custom type appears in the field type picker (4.5) under **Custom Types**.
  Enum types show their values as a description in the picker.
- Deleting a type does not change fields that used it; they keep the type name as plain text.

### 9.5 Highlight fields

- "Highlight Fields" on a custom type tints every field on the canvas that uses it yellow
  and shows the highlighter button at the top-left (2.9). Only one type is highlighted at a
  time. "Clear Highlight" or the toolbar button clears it. Not undoable and not saved.

---

## 10. Areas

### 10.1 Create

- Canvas right-click > **New Area**, or Visuals section > Areas tab > **Add Area**, or the
  area entry in the Move-to-Area submenu.
- New area: name **Area N** (N = count + 1), 300 x 200, a random colour from the palette,
  placed at the click point.

### 10.2 Look

- A rectangle with a 15%-opacity fill of the colour and a border in the colour (a
  highlighted border when selected), the **name** on a header strip at the top-left.
  Minimum height 100 px; resized by dragging its edges when selected (editable only).

### 10.3 Membership of tables

- A table belongs to an area when the table box is **completely inside** the area rectangle.
  If areas nest or overlap, the **top-most** (highest order) wins. Membership is recomputed
  automatically after any move or resize, and is shown in filter grouping and in the
  Move-to-Area menus. It is not an undo step of its own.
- **Move to Area** from a table menu places the table(s) inside the chosen area, laid out in
  a tidy grid in the free space, growing the area if needed. "No Area" moves a table out
  (to just outside the rectangle).

### 10.4 Edit

- Rename: double-click the name strip (or "Edit Area Name" in its right-click menu); Enter
  or click-away saves, Escape cancels; an empty name is not saved.
- Colour: changeable (colour picker in the Areas list row).
- Delete: Delete key, right-click > Delete Area, or the panel. Tables inside are kept,
  their membership cleared. Undoable.

### 10.5 Areas list

- Visuals section > **Areas** tab: a filter box, **Add Area**; each row has the name, a
  colour picker, "focus on canvas", and a More actions menu (titled "Area Actions":
  **Edit Name**, **Delete Area**). Empty: "No areas" / "Create an area to get started".
  Filtered empty: "No areas found matching your filter."

---

## 11. Notes

- Canvas right-click > **New Note**, or Visuals > **Notes** tab > **Add Note**.
- A new note: empty text, 200 x 150, warm yellow, at the click point.
- Look: a card with a full-colour header strip (holding the colour picker and the drag
  handle) and a pale body of the same hue (lighter in light theme, darker in dark theme).
  Resizable.
- **Edit text:** double-click the body; type; click away saves; Escape abandons the edit.
  Empty notes show the faint placeholder "Empty note" in the list.
- Colour: via the header picker. Delete: Delete key when selected, or the Notes list. All
  add, edit, delete, move and resize actions are undoable.
- Notes list (Visuals > Notes): filter box, **Add Note**, rows showing the first line of the
  text, a colour picker, focus, and More actions (titled "Note Actions": **Delete Note**).
  Empty: "No Notes" / "Create a note to add text annotations on the canvas". Filtered
  empty: "No notes found".
- The Visuals section shows two tabs, **Areas** and **Notes**; choosing Visuals from the
  rail starts on Areas.

---

## 12. Focus and the side panel in general

- The "focus" button on a list row (and clicking a table in the filter) selects the object
  and animates the view to centre it at 100% zoom.
- Every list section (Tables, Refs, Custom Types, Areas, Notes) has a filter text box; the
  text is lost when the section is switched away.
- Each section's list remembers which row is open while the panel stays on that section.
- Panel sections are: Tables, DBML, Refs, Custom Types, Visuals (Areas and Notes tabs).

---

## 13. Undo and redo

### 13.1 How it works

- Two stacks: undo and redo. Every undoable action pushes an inverse onto the undo stack and
  clears the redo stack. Undo applies the inverse and moves it onto redo; Redo re-applies.
- **Undo:** Edit > Undo, the toolbar Undo, Mod+Z. **Redo:** Edit > Redo, the toolbar Redo,
  Mod+Shift+Z. Both are disabled in the UI when empty. The shortcuts do **not** fire while a
  text box has focus (the text box's own undo applies).
- Each stack is unlimited in depth. It lives in memory only: **reloading the page, opening
  another diagram, or switching diagram clears both stacks**.
- Edits made by typing are grouped by the debounce: a rename that saves once after typing
  stops is one step.

### 13.2 Undoable

Diagram rename; add, delete and edit of tables (name, colour, comment, width, schema,
expanded, order, field order); table moves (a whole drag, or an area drag with its
members, is one step); resize; add, delete, edit of fields, indexes and check constraints;
add, delete, edit of relationships (cardinality, switch); add, delete and edit of
dependencies; add, delete, edit of areas, notes and custom types; Auto Arrange (one step);
Accept Changes in the DBML editor (one step); applying a re-sync from a live database (one
step).

### 13.3 Not undoable

Zoom and pan; selection; the visibility filter; View menu settings; membership bookkeeping
that follows moves; highlight of a custom type; copy; theme; **Clear** (Edit > Clear wipes
everything and empties the history); **Import into the current diagram** (the history is
cleared after); deleting the whole diagram.

### 13.4 Clear

- Edit > **Clear** shows a dialog: **Clear Diagram**, "This action cannot be undone. This
  will permanently delete all the data in the diagram." with **Clear** and **Cancel**.

---

## 14. Per-database differences

### 14.1 Database types

The diagram has one database type chosen when it was created: Generic, PostgreSQL, MySQL,
SQL Server, MariaDB, SQLite, ClickHouse, CockroachDB, Oracle. It affects:

| Database | Schemas | Arrays | Custom types | Comments in export | Index type choice | Default schema |
|---|---|---|---|---|---|---|
| PostgreSQL | yes | yes | yes | yes | btree/hash/gin | public |
| CockroachDB | yes | yes | no | yes | btree/hash/gin | public |
| SQL Server | yes | no | no | no | no | dbo |
| ClickHouse | yes | no | no | no | no | default |
| MySQL | no | no | no | no | no | none |
| MariaDB | no | no | no | no | no | none |
| SQLite | no | no | no | no | no | none |
| Oracle | yes | no | no | yes | no | none |
| Generic | no | no | no | no | no | none |

(PostgreSQL, CockroachDB, SQL Server, ClickHouse and Oracle show schema pickers; the MySQL
family, SQLite and Generic do not. Oracle has no default schema name, so a new Oracle table
starts with no schema until one is chosen.)

The type catalogue per database is data and is listed in the data-model spec. Type names the
editor offers include for PostgreSQL: integer, varchar, text, boolean, timestamp,
timestamptz, date, bigint, serial, json, jsonb, uuid, numeric, real, double precision,
bigserial, smallserial, money, smallint, char, time, interval, bytea, point and the other
geometric types, inet, cidr, macaddr, bit, tsvector, tsquery, xml, ranges, enum and
"user-defined". MySQL and MariaDB offer the usual integer, text, blob, spatial, enum and set
families; SQL Server offers bit, nvarchar, uniqueidentifier, datetime2, money, hierarchyid,
sql_variant, geography and others; Oracle offers VARCHAR2, NUMBER, CLOB, RAW, ROWID,
TIMESTAMP WITH TIME ZONE, INTERVAL types and others; ClickHouse offers UInt8 to UInt256,
Int8 to Int256, Float32/64, String, FixedString, LowCardinality, Map, Tuple, Nested, IPv4,
IPv6 and others; SQLite offers integer, text, real, blob, numeric and the common affinities.

The default type given to a new key or field is the database's integer-like type (serial-like
is **not** used by default).

### 14.2 Default schema

When creating a table: if there are visible schemas, the new table takes the database's
default schema if it is among them, else the first visible; with no visible schemas it takes
the database's default schema (or none, for databases without schemas).

### 14.3 Comments

Table and field descriptions are always editable in the editor. They are carried to SQL
export only for databases with comment support.

### 14.4 Check constraints

Always editable; export decides.

### 14.5 Auto increment, arrays, character lengths, precision

See 4.5 and 4.6; the lists of which types accept which attributes are data.

---

## 15. Menus, themes, settings that touch the editor

- **Actions:** Import (submenu: from a saved diagram JSON, plus the SQL/DBML/script entries
  that open the import dialogs), Export SQL (submenu, one entry per database dialect),
  Export as (PNG, JPG, SVG, then JSON), Delete (diagram; asks "Delete Diagram / This action
  cannot be undone. This will permanently delete the diagram."; hidden unless the person
  owns the diagram). Behaviour of these dialogs is in the import/export spec.
- **Edit:** Undo (shortcut shown), Redo (shortcut shown), separator, Clear.
- **View:** Hide/Show Sidebar (Mod+B), Hide/Show Cardinality, Hide/Show Field Attributes,
  Compact Tables / Standard Tables, Hide/Show Mini Map, Zoom on Scroll (On/Off), Database
  Views (On/Off), Theme (System, Light, Dark; shortcut shown).
- **Backup:** Export Diagram (JSON) and Restore Diagram (import JSON).
- A **Save** entry exists in the strings but is not present in the menu bar; the editor saves
  by itself after every change (the person sees "last saved" in the top bar).
- **Theme:** System follows the operating system. Light and Dark are explicit. The shortcut
  Mod+M flips between light and dark (from System it flips to the opposite of the current
  look) and works even while typing in a text box.
- Local preferences (theme, scroll action, show cardinality, field attributes, compact
  tables, minimap, database views) are remembered in the browser, not in the diagram.
- **Diagram name:** shown in the top bar; double-click to edit in place; Enter or click-away
  saves; an empty name is ignored.

---

## 16. The diff view

The editor can overlay "what would change" on the canvas without changing the diagram.

### 16.1 DBML editing preview

- Side panel > **DBML** section shows the diagram as DBML text (read-only). Buttons on the
  text: **Show Standard Refs** / **Show Inline Refs** (switches the style of references),
  **Edit** (editable diagrams only), and a copy button.
- **Edit** makes the text editable. After the person stops typing for 1 second, the editor
  parses the DBML:
  - On a syntax error the offending line is marked in the text and a red message reads
    "Failed to parse DBML. Please check the syntax. (1 error found - in line N)".
  - On success the canvas shows a **summary diff** between the current diagram and the
    parsed result (the diagram itself is not changed): new tables get a green "+" badge and
    green highlighted name ("New Table" tooltip), removed tables a red badge and red name
    ("Table Removed"), changed tables a blue badge and name ("Table Changed"; a renamed
    table shows the old name struck through, an arrow, then the new). In summary mode
    changed fields are not individually marked; new and removed relationships turn green or
    red and thicker.
  - While a diff exists, two buttons appear on the text: **Accept Changes** (green) and
    **Undo Changes** (red). Accept replaces the diagram's tables, relationships and custom
    types with the parsed ones (areas and notes are kept; matching tables keep position,
    colour, area; one undo step) with a loading overlay while it runs. Undo Changes drops the
    preview and leaves edit mode. With no diff the button reads **View** and leaves edit
    mode.
  - Leaving the DBML section (switching section or closing the panel) while a preview is
    showing **discards** the preview.
- Detailed diffs (per-field marks: new fields green, removed red, changed blue with old to
  new type, nullability, key, size) exist for the re-sync flow and show the same marks field
  by field.

### 16.2 After a re-import

- **Import into the current diagram** (from a script or live database result): the dialog
  titled **Import to Current Diagram** counts "<n> new tables will be added.", "<n> new
  relationships will be created.", "<n> tables will be overwritten.". New tables land
  150 px to the right of the right-most existing table. The history is reset afterwards.
- **Re-sync from database** (server feature): a list of detected changes (added, removed,
  changed, possible renames) each with a checkbox, all ticked except renames; **Apply n
  selected**; layout, colours, areas, notes and descriptions are kept; one undo step. The
  dialog's own strings are specified with the server features; the canvas marks are those
  of 16.1.

---

## 17. Copy and paste of tables

- **Copy:** with one or more tables selected on the canvas, Mod+C remembers them. A toast
  "Table copied" or "<n> tables copied" is shown, with the hint "Press Ctrl+V to paste it."
  (wording says Ctrl even on Mac; **Suspect**). If text is selected in the page (for example
  in an input) the browser's own copy is used and nothing is remembered. If no table is
  selected nothing happens.
- **Paste:** Mod+V adds the remembered tables, in an editable diagram. Each pasted table is
  a new copy with new ids:
  - Name: unchanged if unique, else `<name>_copy`, then `<name>_copy2`, `_copy3`, and so on
    (uniqueness is checked case-insensitively within the same schema).
  - Position: shifted right by the width of the copied group plus 40 px; **each further
    paste of the same copy goes one slot further right**, so copies never overlap.
  - Schema: kept for databases with schemas, dropped otherwise.
  - Area: kept only if that area exists in the diagram being pasted into.
  - Fields and indexes copied (new ids). **No relationships or dependencies** are copied.
  - Toast "Table pasted" or "<n> tables pasted".
- The clipboard is inside the page (not the operating-system clipboard) and lasts until
  the browser tab is closed; so it works across diagrams opened in the same tab. It is
  not shared between tabs and does not survive a reload.
- Paste is not offered in read-only mode.
- **Duplicate Table** (3.10) is the one-table shortcut with a smaller offset and a fixed
  `_copy` suffix.

---

## 18. Keyboard shortcuts (complete list)

"Mod" is Ctrl on Windows and Linux and Cmd on Mac.

| Keys | Action |
| --- | --- |
| Mod+Z | Undo (not while typing in a text box) |
| Mod+Shift+Z | Redo (not while typing in a text box) |
| Mod+O | Open a diagram (the list, or the project list when a server is used) |
| Mod+S | "Save": marks the diagram as saved now (changes were already saved); nothing else |
| Mod+B | Hide or show the side panel |
| Mod+0 | Fit all tables in view ("Show All") |
| Mod+M | Toggle light / dark theme (works in text boxes) |
| Mod+F | Toggle the table filter panel (works in text boxes) |
| Mod+C | Copy selected tables |
| Mod+V | Paste copied tables |
| Delete or Backspace | Delete the selected tables, notes, areas, lines |
| Escape | Cancel drawing a relationship; close the create-relationship card, the edit-relationship popover and table edit mode; cancel an in-place rename |
| Enter | Confirm an in-place rename (table, area, custom type, diagram name, schema name) and add an enum value |
| Shift (held) | Snap dragging to the 20 px grid; with a click, add to selection; with a background drag, rubber-band select |
| Mod (held) with click | Add to selection |
| Mod + wheel | Zoom |
| Double-click table | Edit the table in place |
| Double-click relationship line | Open the relationship popover |
| Double-click area name, note body, list name | Rename or edit text in place |

Mod+O, Mod+S, Mod+B, Mod+0 prevent the browser's own action. Shortcut labels are shown in
menu items and toolbar tooltips with the symbols matching the operating system (for example
the command and shift symbols on Mac).

---

## 19. Empty and error states

| Situation | What is shown |
| --- | --- |
| New diagram with no tables | The canvas is blank and the Tables section shows "No tables" / "Create a table to get started" with an **Add Table** button |
| No relationships yet | Refs section: "No relationships" / "Create a relationship to get started" |
| No areas / no notes / no custom types | The empty messages in sections 10, 11 and 9 |
| Filter hides everything | Canvas message "All tables are hidden" + **Show all**; same in Tables section |
| Text filter matches nothing | The "no ... found matching your filter" messages with a clear button |
| Scrolled away from content | The "Show All" pill (2.4) |
| Diagram data loading | Spinner, then "Loading diagram..." badge |
| Incompatible field types on connect | Red toast "Field types are not compatible" |
| Already connected | Red toast "Already connected" |
| Cannot create the relationship from the card | Inline message in the card (7.1) |
| DBML parse failure | Red message with line number (16.1) |
| Copy fails (no clipboard support in the browser) | Toast "Copy failed" with "Clipboard not supported." or "Something went wrong. Please try again." |
| Delete diagram fails | Toast "Could not delete the diagram" |
| Diagram or project not found, no access | Full-page messages "Diagram not found" / "Project not found" with a back link (server feature) |
| Read-only | See 1.4 |

Errors never throw the person out of the editor; the canvas stays and the diagram is
unchanged.

---

## 20. Saving behaviour the person can notice

- Every change is written as it happens: there is no Save button and nothing is lost on
  closing the tab. The top bar shows "last saved <time ago>" (localised relative time).
- When a server is configured, the changes are also sent to it automatically; its status
  and conflicts are specified with the server features.
- The database type cannot be changed from the editor; it is chosen once when the diagram
  is created.

---

## Open questions for the owner

1. **Full screen.** The old editor has no full-screen button. Do you want one (a toolbar
   button using the browser's full-screen mode), or keep relying on the browser?
2. **"Save" shortcut and menu.** Mod+S does nothing visible, and the Save menu item does not
   exist. Keep as a silent no-op, hide the shortcut, or show a short "All changes saved"
   toast?
3. **Mac copy hint.** The copy toast says "Press Ctrl+V" on Mac too. Fix it to show the right
   key (recommended)?
4. **Delete without confirmation.** Deleting a table (and its relationships) has no confirm
   dialog but is undoable. Keep, or confirm when the table has relationships?
5. **Undo depth and persistence.** Undo history is unlimited and lost on reload. Keep, cap
   (for example 200 steps), or persist across reload?
6. **Deleting a field used in a relationship.** The relationship is silently left dangling
   (not drawn). Should deleting such a field remove its relationships, or warn?
7. **Duplicate names.** Tables and fields may be given duplicate names without warning. Add
   a visible warning (for example an amber outline) or keep silent?
8. **Many-to-many.** Only 1:1 and 1:N exist. Keep the junction-table approach, or add a
   nominal "N:N" display type?
9. **Views off by default.** Views are hidden until "Database Views" is switched on, which
   surprises people who import a schema with views. Show views by default for diagrams that
   contain them?
10. **Dependency creation.** Only dragging from a view's edge dot creates dependencies; there
    is no dialog. Add a dialog, or drop the feature (it is niche)?
11. **Background drag.** Plain background drag pans and Shift-drag selects. Many tools do the
    opposite on desktop. Keep?
12. **Table ordering quirk.** The panel order treats a stored order of 0 as "no order" in one
    comparison, so the first table can sort oddly. Treat as a bug and define a clean rule
    (order number, then name)?
13. **Mobile gestures.** Touch behaviour relies on the browser turning taps into double
    clicks, and context menus are missing on mobile. Define explicit touch gestures
    (long-press for context menu, double-tap to edit)?
14. **Enum / composite kind switch.** Switching kind retains hidden data of the other kind.
    Keep, or clear it?
15. **Check constraints for databases without support.** They can be entered for every
    database but export may ignore them. Hide the section for such databases, or warn?
16. **Materialized views.** Cannot be created by hand. Add a "Materialized" switch for
    views, or leave import-only?
17. **Default colours.** Tables take a fixed default blue and areas a random colour. Keep,
    or rotate table colours to help tell tables apart?
18. **Untranslated labels.** "Compact Tables", "Standard Tables", several tooltips ("Switch
    tables", "Open in sidebar", "Delete relationship"), "Create new schema", "Accept
    Changes", "Undo Changes", and the DBML buttons are fixed English text in the old editor.
    Confirm they should be translated like the rest.
19. **Oracle default schema.** Oracle supports schemas but has no default schema name, so new
    tables start schema-less. Keep, or offer a default?
20. **Undo shortcuts in text boxes.** Mod+Z does not undo diagram changes while a text box
    has focus. Keep, or make it work everywhere?
