# Visual spec: the canvas of the old editor

Measured from outside, with a headless browser, on the old editor in local-only mode (no backend, no
sign-in) at 1280 x 800 (desktop) and 390 x 844 (phone), in light and dark theme. Nothing here comes from
source code: every value is a computed style, a box, an SVG attribute, a class name, a screenshot or a
timing sample of the running page. The scenes that produced the numbers are in
`tools/e2e/visual/canvas-scenes.mjs` (103 scenes); the reference screenshots and the raw numbers per scene
are in `/home/qubdi/ui-reference/old/` (not in the repository). Navbar, rail, side panel, dialogs, tokens
and wording belong to the shell spec, not to this file.

Conventions. Sizes are CSS pixels at 100 % zoom (canvas units), not screen pixels at the zoom the page
happened to be at. Colours are given as computed (rgb, or oklch where the browser reports it that way); a
short colour name is added where it helps. "Primary" is the brand teal, rgb(13, 135, 120) in light and
rgb(40, 195, 174) in dark; "teal-600" is oklch(0.6 0.118 184.704), which is the colour of every selected
canvas thing. The old editor is built from utility classes, so most sizes are multiples of 4 px.

How the demo scene was built (so old and new can be compared): new diagram, PostgreSQL, "SQL Script"
import of a script with five tables (owners, pets with 13 fields, visits with a composite primary key,
vets, one), four foreign keys written as ALTER TABLE statements, three indexes, an enum, then one area and
one note added from the canvas context menu. Note: foreign keys written inline as REFERENCES in a column
definition were not imported as relationships by the old editor; only ALTER TABLE ... FOREIGN KEY was.

## 1. Canvas surface

| Item | Value |
| --- | --- |
| Canvas background | light rgb(252, 253, 253); dark rgb(20, 20, 20) (the minimap uses the same dark value) |
| Background pattern | dots, not lines. Grid gap 16 units, dot radius about 0.6 units (diameter about 1.2); the pattern scales with zoom (at 64 % the gap is 10.27 px). |
| Dot colour | the muted text colour at 35 % opacity: light rgba(90, 106, 114, 0.35), dark rgba(158, 174, 179, 0.35) |
| Canvas area | fills the editor below the 48 px navbar and to the right of the rail and side panel; on phone it is the full width below the navbar and menu row |
| Cursor over empty canvas | open hand (grab); closed hand (grabbing) while panning with the left mouse button |
| Cursor over a table or note | open hand while idle, closed hand while dragging; pointer over a line (the 20 px wide invisible hit path), pointer over an area title |
| Space key held | no visible change of cursor or class was detected |
| Zoom range | 10 % to 500 %. Zoom In steps observed from 64 %: 75, 86, 105, 124, 153, 178, 218, 255, 315, 377, 440, 492, 500. Zoom Out steps down to 10 %: ... 126, 105, 87, 73, 60, 51, 43, 35, 30, 25, 21, 17, 14, 12, 10. The step is a factor of about 1.2 to 1.25 each press. The zoom buttons stay fully visible at the limits (no dimming). |
| Double click on empty canvas | zooms in (one step) |
| Plain mouse wheel | pans the canvas vertically (100 px of wheel moved the canvas 100 px); it does not zoom. This is the "Zoom on Scroll" setting being off, which is the default. |
| Ctrl + wheel | zooms around the pointer |
| Pan | drag on empty canvas with the left button; pointer events on tables do not start a pan |
| Auto-pan while dragging a table | holding a dragged table at the right edge of the canvas scrolled the canvas about 880 px in 1.2 s (about 730 px per second); dragging stops it |
| Initial view after an import | the diagram is framed ("fit") at a zoom of 64 % for the demo scene (80 % for two small tables); tables get default spots on a loose grid starting at (100, 100) with 224 px wide cards |
| Snap to Grid | off by default; on, a dragged card lands on a 20 unit grid (observed jumps of 36 and 40 units for a drag of about 51 and 42 units); the button turns solid teal-600 with white icon; shift also snaps while held |

Phone: the canvas has the same dot pattern and colours (gap 16, the dots shrink with zoom). The side panel is
closed, the zoom toolbar sits at the top (see 5), the minimap is 60 x 60 in the bottom right corner, and a
round teal "edit" action button (44 x 44, rounded 12 px, teal fill, white pencil icon) floats at the bottom
left at 15 px from the edges. "Powered by Qubdi" sits at the bottom right below the minimap.

## 2. Table card

### 2.1 Frame and states

| Item | Value |
| --- | --- |
| Width | 224 px default. Resizable by dragging the card edges (four edge strips 8 px wide, corner handles hidden on tables). The edit card is wider (see 2.7). |
| Height | header 48 + 32 per field row + 1 px borders; 402 px for 13 fields before "Show More" (8 rows shown and the "Show More" bar), 498 px after it, 178 px for 4 fields, 114 for 2, 82 for one field |
| Border | 1 px, light rgb(220, 228, 229), dark rgb(39, 48, 53) |
| Radius | 12 px; the last field row has a 6 px bottom radius |
| Background | light white, dark rgb(17, 25, 29) |
| Shadow at rest | tiny: 0 1 2 at 5 % black |
| Overflow | hidden (rounded clipping) |
| Hover | border becomes primary (light rgb(13, 135, 120), dark rgb(40, 195, 174)) and a 2 px outer ring of the same colour at 25 % appears. Header gains two small icon buttons in place of the field count (see 2.2). Transition on opacity and filter, 200 ms. |
| Selected | same as hover (primary border + 25 % ring, 2 px); stays after the pointer leaves; the node is raised (z-index 1000). Selecting a table also selects the lines that touch it. |
| Selection of several | each selected table shows the same ring; there is no joint outline rectangle |
| Dimmed | every table that is not part of the current edit or focus gets opacity 0.4 and a full grayscale filter; the change fades over 200 ms. Seen while one table is open in the edit card and when a table is picked in the side list. A plain click on a table did not dim others in the scene measured, but the card of an unrelated table next to a selected line stays normal. |
| Dragging | cursor closed hand, raised to z-index 1000, ring as selected, no extra ghost or shadow beyond the selected ring |
| Keyboard focus | the card is focusable (tab stop, role group); the focus ring is the same primary ring as selected |
| Overlap highlight | when "Highlight Overlapping Tables" is on, overlapping tables show a red count pill (red-100 background, red-800 text, 10 px / 600) and orange tinted type chips; see 5.6 |

### 2.2 Header

| Item | Value |
| --- | --- |
| Height | 48 px, horizontal padding 12 px, gap 10 px, bottom border 1 px |
| Tint | a diagonal gradient (135 degrees) of the table colour from 20 % opacity at the top left to 6 % at the bottom right; no solid colour bar |
| Colour chip | 28 x 28 square, rounded 8 px, solid table colour, holding a white 16 px table-grid icon (a different icon is used for views: not seen, the old editor offered "Database Views" only as a menu entry) |
| Name | 13.5 px, weight 600, line height 1.25, single line with ellipsis, text colour foreground |
| Schema | under the name, 11 px, weight 400, muted colour (light rgb(90, 106, 114)), 2 px above |
| Field count badge | right side: rounded pill, 11 px, weight 600, tabular figures, muted text on a 70 % background colour, 6 px side padding, line height 16 px; title text "N fields" |
| Hover buttons | on hover the count is replaced by two 24 x 24 icon buttons (16 px icons, slate-500 text, hover: light grey background): a dashed circle-dot icon (focus on this table) and a left-right chevrons icon (expand or collapse the "more fields" area) |
| Comment icon | none seen on tables without a comment |
| Colour variants | see 2.8; only the chip and the gradient change with the colour |

### 2.3 Field rows

| Item | Value |
| --- | --- |
| Row | height 32 px, 12 px side padding, 1 px top border (the border colour of the card), text 14 px, hover background slate-100 (light oklch(0.968 0.007 247.896)) or slate-800 in dark (oklch(0.279 0.041 260.031)); background change eases over 200 ms |
| Key slot | a 16 x 16 box at the left, always reserved; holds the key icon for primary keys (amber, oklch(0.769 0.188 70.08), 14 px key glyph) and a link icon for foreign key fields |
| Name | 14 px; weight 600 for primary key fields, 400 otherwise; foreign key field names are blue (link colour); ellipsis when long |
| Right group | right aligned: optional UQ mark, type chip, nullable marker. On row hover the group is replaced by a 24 x 24 pencil button (teal-600 14 px icon) that opens the edit card. |
| UQ mark | small outlined badge "UQ" before the type chip (about 9 px text) for unique single-column fields |
| Type chip | monospace (JetBrains Mono stack), 11 px, weight 600, line height about 15.7 px, padding 2 px 6 px, radius 10 px, text tinted, background the same hue at 10 %. The text is a short label (see 2.4). |
| Nullable marker | a 6 x 6 circle, 1.5 px border (muted text colour at 60 %): hollow circle means the field may be NULL; a filled dark dot means NOT NULL |
| Indexes | no mark on the card; indexes are only visible in the edit card and the side panel |
| Composite primary key | the fields of a composite key show the link icon only when they are also foreign keys; no extra mark was observed |
| Show More | after 8 rows, a bar of about 24 px with a small chevron and the text "Show More" in 10 px muted text, centred; after clicking it the whole list is shown (the text that replaces it was not captured). The area animates its height over 200 ms (ease in out). |
| Linked rows | when a line of the table is selected, the two linked field rows get a soft teal background (light teal-100 oklch(0.953 0.051 180.801), dark oklch(0.386 0.063 188.416)) and the type chips of the fields of the linked tables are drawn with a green tint |
| Handles | each row has a 12 x 12 white dot with a 1 px border on both the left and right card edges; invisible until the pointer is over the table or a link is being dragged, then fully visible (white fill, teal-600 border); there is also a full-card transparent target handle and a tiny hidden source dot at the top centre |

### 2.4 Type chip tints (light and dark)

The label is a short form of the type: int, bigint and similar numbers keep their name (int, bigint,
numeric, real, serial); varchar and char appear as "char" when no length is shown (the card shows
"varchar(120)" when a size is set); enum types appear as "text"; arrays keep the brackets ("text[]").
The tint depends on the type family, shown in the "Type colours" legend:

| Family | Types (as listed in the legend) | Light text | Dark text | Background (both themes) |
| --- | --- | --- | --- | --- |
| text | varchar, text, char | oklch(0.511 0.096 186.391), teal | oklch(0.855 0.138 181.071) | teal at 10 % |
| number | int, bigint, numeric, float | oklch(0.491 0.27 292.581), violet | oklch(0.811 0.111 293.571) | violet at 10 % |
| time | date, time, timestamp, interval | oklch(0.553 0.195 38.402), orange | oklch(0.837 0.128 66.29) | orange at 10 % |
| id | uuid, guid, objectid | oklch(0.488 0.243 264.376), blue | oklch(0.809 0.105 251.813) | blue at 10 % |
| bool | bool, boolean, bit | oklch(0.525 0.223 3.958), pink | oklch(0.823 0.12 346.018) | pink at 10 % |
| json | json, jsonb, xml | oklch(0.453 0.124 130.933), lime | oklch(0.897 0.196 126.665) | lime at 10 % |

Chip sizes seen: "int" 33 x 20 box (text 21 wide), "timestamp" wide as its text plus 12 px, height always
about 19.7 px.

### 2.5 Display options (View menu)

| Option | Effect on the cards |
| --- | --- |
| Hide Field Attributes | the size inside the type label disappears: "varchar(120)" becomes "varchar", "numeric(10,2)" becomes "numeric"; rows keep their height; array brackets stay |
| Compact Tables | the type chip and the nullable marker disappear; names and UQ mark remain; row height and card size do not change |
| Hide Cardinality | the 1 and N circles at the line ends disappear (lines stay) |
| Hide Mini Map | the minimap is removed |
| Zoom on Scroll | submenu; off by default (wheel pans) |

### 2.6 Field hover card

A small floating card, drawn at the body level (not inside the card), shown as soon as the pointer is over a
row (no delay measured beyond one frame), pointer-events off, anchored to the right of the row and centred
vertically on it. Size 248 x 92 for a plain field, taller with a primary key. Border 1 px, radius 12 px,
padding 12 px, white (dark card colour in dark), shadow large (0 10 15 -3 at 10 % and 0 4 6 -4 at 10 %).
Content as small label and mono value pairs: the field name as a bold title, then rows "type", "null"
(NOT NULL or NULL), and for keys a "key" row (primary key) and a "referenced by" row listing the table.

### 2.7 In-place edit card

Opened by double clicking the header, by the field pencil, or by the table menu entry "Edit Table".

| Item | Value |
| --- | --- |
| Size | width at least 350 px (max of the card width plus 48 and 300, with min 350), height the card height plus 48 px (min 300): 350 x 450 for the 13 field table; it is centred over the original card |
| Frame | radius 12, border 1 px primary, 2 px primary ring at 25 %, large shadow (0 10 15 -3 at 10 %), background card colour, opacity and scale animate in over 100 ms |
| Header | 48 px, same gradient, cursor move (the card can be dragged by it), a 28 px colour chip (click opens the colour popover), then a schema select (80 x 28, radius 10, 14 px) and a name input (28 high, 14 px, weight 600, radius 10, 2 px primary focus ring); at the right two 24 px icon buttons: focus (dashed circle-dot) and close (x) |
| Field list | scroll area with 6 px side padding; each row 32 px high with a name input (14 px, weight 500, transparent until hover or focus), a type select (14 px, shows the short type name, with a small up-down caret), and three 32 x 32 toggle buttons: nullable "N" (teal fill when nullable allowed, text N), unique, primary key (key icon, orange when on) and a delete (trash, red-700) button; the small icons are 14 px |
| Footer | height 49, top border, background muted at 30 %, padding 8 x 12: left a 32 px rounded colour swatch (opens the colour popover), then an "Add Field" outlined button (small, with an add-file icon), at the right the muted text "N Fields" |
| Type pop-up | 260 wide, up to about 295 high, list rows 32 px, 14 px text, the current type has a light teal background; types are listed alphabetically (boolean, date, int, text, timestamp, timestamptz, ...) with a search box |
| Colour popover | see 2.8 |
| Dimming | while the card is open, tables that are not related are dimmed (opacity 0.4, grayscale) |
| Phone | the card keeps 350 px width and is centred on the table |

### 2.8 Colour palette

The table colour popover (256 wide, radius 10, 16 px padding, medium shadow) shows 12 swatches (32 x 32,
radius 10, 2 px border in the muted colour, selected one has a primary border), six per row, a "Custom color"
label, a swatch with a hex field and a "Use" button. The same twelve colours are used for tables, areas
and notes. Each swatch is labelled "Use #hex".

| Name (ours) | Value |
| --- | --- |
| red | #ff6363, rgb(255, 99, 99) |
| pink | #ff6b8a, rgb(255, 107, 138) |
| magenta | #c05dcf, rgb(192, 93, 207) |
| purple | #b067e9, rgb(176, 103, 233) |
| violet | #8a61f5, rgb(138, 97, 245) |
| indigo | #7175fa, rgb(113, 117, 250) |
| blue (default for imported tables) | #8eb7ff, rgb(142, 183, 255) |
| teal | #42e0c0, rgb(66, 224, 192) |
| green | #4dee8a, rgb(77, 238, 138) |
| lime | #9ef07a, rgb(158, 240, 122) |
| yellow (also the default note colour) | #ffe374, rgb(255, 227, 116) |
| orange | #ff9f74, rgb(255, 159, 116) |

A new table created with "Add Table" starts with the default blue; a new area gets one of the palette colours
(orange and red were seen, it appears random). Choosing a colour changes the chip fill and the header
gradient (for green: chip rgb(77, 238, 138), gradient from 20 % to 6 % of it).

## 3. Relationship lines

| Item | Value |
| --- | --- |
| Shape | orthogonal, "stepped" line with rounded corners; never a curve through the middle |
| Stroke | 2 px, colour slate-400 oklch(0.704 0.04 256.788) in both themes, solid, no animation |
| Leaving the card | the line starts at the card edge of the linked field row (the row handle), leaves horizontally and runs 35 px out before the first turn; the same 35 px stub is on the target side |
| Corners | quarter-circle corners of radius 14 px; when the distance between two turns is too short the radius shrinks (5 px was seen for a 5 px gap); between turns the segments are straight |
| Sides | the line picks the left or right edge of each card by the relative position of the cards: it leaves the source on the side facing the target, and when cards overlap horizontally it goes around on the outer side with a vertical run between the two stubs |
| Self link | not measured (no self-referencing table in the scene) |
| Z-order | lines are drawn below table cards, above areas |
| Hit area | an invisible 20 px wide path follows each line; pointer cursor |
| Hover | no change of colour or width; cursor pointer only |
| Selected | stroke teal-600 oklch(0.6 0.118 184.704), still 2 px, dashed 5 px dash and gap, class "animated" (the dashes march); the two end markers switch to the selected teal fill; a 16 px hollow circle with an ellipsis ("...") appears on the middle of the line and is the handle that opens the popover; the two linked field rows get the soft teal background (see 2.3) |
| Dimmed | a line is dimmed with its tables (opacity follows the 0.4 card dimming) |
| New (while dragging to link) | the preview line is hot pink rgb(236, 72, 153), 2 px, dashed 5 and 5, with 10 px corner radius and a 10 px stub, ending in a small hollow circle at the pointer; the target field row handle lights up under the pointer |
| DBML diff | see 5.9 |

### 3.1 Cardinality markers

Markers are filled circles with a letter, drawn at the line ends, not crow's feet.

| Item | Value |
| --- | --- |
| Shape | circle of radius 5 inside a 16 x 16 marker box, with a 0.5 stroke in the background colour (a thin halo); the label is centred: "1" or "N", 6 px, weight 600, in the muted (card-light) colour so it reads white on the grey |
| Fill (not selected) | muted text colour: light rgb(90, 106, 114) (dark: lighter grey) |
| Fill (selected) | teal-600 |
| Placement | the circle touches the card edge: the reference point is the line end, 1 px (right side) or 15 px (left side) into the box, so the circle sits just outside the card on the line |
| Cardinalities | one-to-many shows "1" at the referenced table and "N" at the referencing table; one-to-one shows "1" at both ends; many-to-one is the mirror of one-to-many; many-to-many is not offered in the popover |
| Toggle | the View menu entry "Hide Cardinality" hides all markers |

### 3.2 Link popover and quick link

The popover opens by clicking the middle handle of a selected line: a fixed card 219 x 46, radius 10, 1 px
border, 8 px padding, white (dark card colour), medium shadow, placed just below the middle handle. It holds
two toggle buttons "1:1" and "1:N" (44 x 28, radius 10, 12 px text, weight 500; the active one is solid
primary with white text and a small shadow, the inactive one is white with a border), a thin separator, then
three 28 px icon buttons: swap direction (two opposing arrows), focus (dashed circle) and delete (red trash).
The context menu entry "Add Relationship" on a table does not open a card: it puts the table into link mode
(the table gets the primary ring, all row handles show) and the next click on a field of another table makes
the link.

### 3.3 Drag to link

Pressing on a row handle (12 px) and dragging draws the pink dashed preview described above; the pointer
snaps to a row handle of another table when within the 12 px handle plus a small tolerance, and that handle
becomes visible while the pointer is over a possible target. Dropping on empty canvas makes no link.

## 4. Areas and notes

### 4.1 Area

| Item | Value |
| --- | --- |
| Default size | 300 x 200; created at the position of the context menu click |
| Fill | the area colour at 8.2 % opacity (for example rgba(255, 159, 116, 0.082)) |
| Border | 2 px solid in the area colour; radius 10 px; tiny shadow like tables |
| Stacking | z-index -10: below tables and lines |
| Header | 32 px high strip at the top inside the border, 8 px side padding, radius 10 at the top; a 14 px grip icon (opacity 0.6) at the left, then the title, then at the far right a 20 x 20 pencil button that fades in on hover |
| Title | 16 px, weight 600, slate-700 (light oklch(0.372 0.044 257.287)) and slate-300 in dark (oklch(0.869 0.022 252.894)); padding 2 x 4; pointer cursor; double click edits it in place |
| Selected | border becomes teal-600 (2 px); eight resize controls appear: four 8 px wide edge strips with a 4 px transparent border and four 10 x 10 corner squares filled teal-600 with a 1 px white border |
| Resize | drag a corner or edge; the content follows live; a drag of 80 x 60 screen pixels at zoom 0.64 grew the area from 300 x 200 to 426 x 294 |
| Menu | right click on an area: "Edit Area Name", "Auto Arrange", "Delete Area" |
| Moving a table into an area | the table menu has "Move to Area" with a submenu listing "New Area", each area, and "No Area" |
| Colour | the area colour is changed from the side panel list (same palette) |

### 4.2 Note

| Item | Value |
| --- | --- |
| Default size | 200 x 150 |
| Colour | default yellow #ffe374; body is a pale version of the colour (light rgb(255, 247, 213)); in dark theme the body is a dark olive (rgb(77, 68, 35)) and the top bar keeps the full colour |
| Frame | radius 6, 1 px border slate-500 (light) or slate-600 (dark), no shadow, overflow hidden |
| Top bar | 8 px high strip in the full note colour |
| Body | 8 px padding; text 14 px / line height 22.75 px, colour gray-700 (dark gray-300); placeholder "Double-click to write (Markdown format)" in italic gray-500 |
| Corner fold | bottom right 30 x 30 triangle in black at 10 % (white at 10 % in dark), half transparent |
| Hover toolbar | top right, a pill with 4 px padding, white at 90 % (dark slate-800 at 90 %), radius 4, medium shadow, fades in on hover; holds three buttons: edit (28 x 28 pencil), colour swatch (32 x 24, 2 px muted border, shows the note colour; opens the palette popover) and delete (28 x 28 red trash, red-500) |
| Editing | double click or the pencil switches the body to a text area; leaving it renders the markdown |
| Markdown | heading level 1 is 16 px bold (700); bold is weight 600; inline code is 12 px mono on black at 10 %, padding 2 x 4, radius 4; list items 14 px with 2 px left padding; quote has an 8 px left padding with a lighter border; links are blue (oklch(0.546 0.245 262.881)), weight 500, pointer; tables are drawn at 12 px; body paragraphs 14 px |
| Stacking | z-index 50: above tables |

## 5. Chrome on the canvas

### 5.1 Minimap

100 x 100 box at the bottom right, 32 px above the bottom ("Powered by Qubdi" text under it); 60 x 60 on phone.
Background white (dark rgb(20, 20, 20)); no visible border. Every node (tables, areas and notes alike) is a
rounded rectangle with 5 unit radius in light grey rgb(226, 226, 226) (dark rgb(43, 43, 43)), no stroke. The
viewport mask is a darkening layer: light mask rgba(240, 240, 240, 0.6) outside the view, dark
rgba(60, 60, 60, 0.6). It is not draggable in a way that was tested.

### 5.2 Zoom toolbar (bottom centre)

A rounded bar 326 x 44, centred 15 px from the bottom, radius 12, 1 px border, muted background
(light rgb(236, 243, 243)), no shadow, 4 px inner padding. Items from the left: Filter Tables (magnifier,
36 x 36, with a vertical 1 px separator after it), Show All (frame corners icon, 36 x 36), Zoom Out, the zoom
percentage as a 60 x 36 button (it shows "64%" and is not a button that does anything we saw), Zoom In,
separator, Auto Arrange Diagram (four squares), separator, Undo and Redo (arrows, disabled ones are faded).
Icon buttons are 36 x 36, 16 px icons, hover background light grey (the "primary foreground"). Phone: the
same bar is at the top, 326 px wide, 32 px from the left, 132 px from the top, under the menu row.

### 5.3 Corner tools

Top left of the canvas, right of the side panel: two 32 x 32 buttons (radius 10, secondary background):
Snap to Grid (Hold Shift) at 15 px past the panel edge and Highlight Overlapping Tables 8 px to its right on
desktop (at x 375 and 415 with the panel open); on phone they are stacked, 40 px apart, below the menu row.
Each turns solid when on: snap becomes teal-600 (oklch(0.6 0.118 184.704)), highlight becomes primary at
90 %; the icon turns white. The Filter button is part of the zoom toolbar (see 5.2) and opens the panel of
5.5. Tooltips were not captured as DOM elements; the accessible names are the labels above.

### 5.4 Type colours legend

A button at the top right ("Type colours", 119 x 32, outlined, small palette icon, 14 px text). It opens a
card under it: 256 x 274, radius 10, padding 12, shadow medium, with six rows: a coloured sample chip
(80 x 18.7, 11 px, text "text", "number", "time", "id", "bool", "json" in the tint of 2.4) next to a title
("Text / other", "Number", "Date & time", "Identifier", "Boolean", "JSON / XML") and a grey line with the member
types.

### 5.5 Filter panel

Opened by the Filter Tables button. A panel anchored over the top right of the canvas, about 320 wide and
almost the full height (64 to 783), radius 12, white with a slight blur, a title "Filter Tables (Ctrl+F)" with
a close x, a search field "Search tables...", two toggle buttons "Group by Schema" and "Group by Area" (the
active one has a pale teal background), then a tree: a schema row with a count ("public 5/5") and each table
with an eye icon at the right to hide it from the canvas.

### 5.6 Highlight Overlapping Tables

When on, tables that overlap another table get a red count pill (red-100 background, red-800 text,
10 px / 600, fully rounded) and their type chips are tinted orange. Dropping a table on top of another did
not leave them overlapping in the scene tested: the dragged card ended just below the other (the editor may
push apart on drop; not confirmed).

### 5.7 Context menus and pop-ups

| Item | Value |
| --- | --- |
| Look | white (dark card colour) card, 1 px border, radius 10, padding 4, medium shadow (0 4 6 -1 and 0 2 4 -2 at 10 %), z-index 50, fades and zooms in at about 150 ms |
| Rows | 32 px high, 8 px side padding, 14 px text; icon at the right end (pencil, copy, link, external-link, red trash); separators are 1 px lines in the border colour inside 4 px margins |
| Canvas menu (203 x 229) | New Table, New Relationship, separator, New Area, New Note, separator, Import SQL/DBML, separator, Auto Arrange Diagram |
| Table menu (169 x 188) | Edit Table, Duplicate Table, Add Relationship, separator, Move to Area (with a chevron; the submenu is 128 x 124 and lists New Area, each area, No Area), separator, Delete Table (red) |
| Area menu | Edit Area Name, Auto Arrange, Delete Area |
| Phone | the canvas menu opens at the long-press position; it has the same rows |

### 5.8 Auto Arrange confirm dialog

A modal dialog 512 x 178, radius 12, 24 px padding, near white (rgb(252, 253, 253)), border 1 px, large shadow
over a black overlay at 60 %. Title "Auto Arrange Diagram", text "This action will rearrange all tables in the
diagram. Do you want to continue?", two buttons at the bottom right: "Cancel" (80 x 36, outlined) and
"Auto Arrange" (120 x 36, solid primary, white text). After confirming, the tables are laid out in rows
and the view re-fits.

### 5.9 DBML diff marks

Editing the DBML text in the side panel to add a table did not draw any badge, coloured name or coloured line
in the canvas in the old editor (no marks were found by class names containing green, emerald or red on
tables). Diff marks of the old editor could therefore not be measured; the new editor's diff marks have no old
reference.

## 6. Timing and motion

| Thing | Value |
| --- | --- |
| Fit view (Show All) | animated by the canvas library, 31 frames, from about 70 ms to about 560 ms: roughly 500 ms, eased, covering both pan and zoom |
| Table card hover, selection | border and ring switch with a 200 ms opacity and filter transition (the colour change itself looks immediate) |
| Dimming | 200 ms |
| Field row hover | 200 ms ease in out on all properties |
| "Show More" area | height animates 200 ms ease in out |
| Edit card | opens with an opacity and scale transition of 100 ms ease out |
| Menus and pop-ups | fade and zoom, about 150 ms |
| Dialog | fade and zoom in 200 ms |
| Header hover buttons, note toolbar, area pencil | fade 150 to 200 ms |
| Selected line | dashes march continuously (the animated class) |
| Zoom buttons | each press animates about 200 ms |

## 7. Mouse and touch behaviour that shows

| Behaviour | Value |
| --- | --- |
| Shift + drag on empty canvas | draws no visible selection rectangle in the scene measured (the floating rectangle was not found); shift + click adds tables to the selection |
| Multi-select outline | each card keeps the primary ring; there is no joint box |
| Drag ghost | none: the real card moves |
| Resize handle sizes | table: 8 px edge strips; area: 8 px edge strips, 10 px corner squares |
| Hit areas | line 20 px; row handles 12 px; area and table edges 8 px |
| Touch | pinch and one-finger pan were attempted on the phone viewport; no change of the viewport was recorded (the test events may not have reached the canvas), so touch gestures could not be confirmed |
| Space or middle mouse pan | not confirmed (no cursor or class change when space is held) |

## 8. What could not be measured

Self-link route, many-to-many, view tables, comment icon on table headers, the minimap drag and its click
to move, tooltips of the toolbar buttons (they did not appear as DOM elements), touch gestures, the exact
snap rule, the overlap behaviour on drop, the colour of a table after a custom hex, the selection rectangle,
DBML diff marks, and auto layout rules beyond the observed result (a loose grid).
