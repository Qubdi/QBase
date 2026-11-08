# Visual shell spec (old editor, measured from outside)

Status: measured on the running old editor (local-only mode, no sign-in) with a headless browser at
1280 x 800 (desktop) and 390 x 844 (phone), light and dark theme, reduced motion on unless stated. Only
computed styles, boxes, DOM roles, attribute values and screenshots were read. No source, bundles or
source maps were read. Colours are written as the browser reports them (rgb) with the design-token
value in brackets where the old page exposes one. "px" values are CSS pixels at 100% zoom. The harness
that reproduces every number is in `tools/e2e/visual/` (scene names are given in the last column of the
section tables so a number can be re-measured with `node run.mjs <scene>`); reference captures live
outside the repo in `/home/qubdi/ui-reference/old`.

Scope: everything outside the canvas surface (the canvas, tables on it, links, areas, notes, minimap,
canvas toolbar and canvas menus are covered by another spec). Text wording is in `visual-copy.md`.

Reading rule: where this spec says "same as X" the value is identical to X in that theme.

## 1. Global design tokens

### 1.1 Colour tokens (the page publishes them as HSL triples on the root element)

| Token | Light | Dark | Used for |
|---|---|---|---|
| background | 180 25% 99% = rgb(252, 253, 253) | 200 28% 7% = rgb(13, 20, 23) | page, dialog, side panel, inputs on top of it |
| foreground | 200 30% 10% = rgb(18, 28, 33) | 180 20% 96% = rgb(243, 247, 247) | body text, headings |
| card | 0 0% 100% = white | 200 26% 9% = rgb(17, 25, 29) | cards, popovers, menus (menus measured rgb(255,255,255) light, rgb(17,25,29) dark) |
| card-foreground | 200 30% 10% | 180 20% 96% | text on cards |
| popover | 0 0% 100% | 200 26% 9% | menus, select lists, popovers |
| popover-foreground | 200 30% 10% | 180 20% 96% | text in them |
| primary | 173 82% 29% = rgb(13, 135, 120) | 172 66% 46% = rgb(40, 195, 174) | primary button fill, selected rail item text, links, focus ring colour |
| primary-foreground | 0 0% 100% | 200 40% 6% = rgb(9, 17, 21) | text on primary |
| secondary | 185 22% 94% = rgb(236, 243, 243) | 200 18% 15% = rgb(31, 41, 45) | secondary buttons, tab list tint, separators inside menus |
| secondary-foreground | 200 30% 14% = rgb(25, 39, 46) | 180 20% 96% | text on secondary |
| muted | 185 22% 94% | 200 18% 15% | quiet backgrounds, separators in menus |
| muted-foreground | 200 12% 40% = rgb(90, 106, 114) | 195 12% 66% = rgb(158, 174, 179) | descriptions, shortcut hints, placeholders, "Powered by" |
| accent | 174 40% 93% = rgb(230, 244, 243) | 190 30% 16% = rgb(29, 49, 53) | hover and open background of menu items, buttons, rail items |
| accent-foreground | 173 80% 20% = rgb(10, 92, 82) | 172 60% 80% = rgb(173, 235, 226) | text on accent |
| destructive | 0 84.2% 60.2% = rgb(239, 68, 68) | 0 72% 51% = rgb(220, 40, 40) | destructive button fill, error text |
| destructive-foreground | 210 40% 98% | 210 40% 98% | text on destructive |
| border | 190 16% 88% = rgb(220, 228, 229) | 200 15% 18% = rgb(39, 48, 53) | every 1 px divider and card border |
| input | 190 16% 86% = rgb(214, 223, 225) | 200 15% 20% = rgb(43, 54, 59) | border of inputs, selects, outline buttons |
| ring | 173 82% 29% | 172 66% 46% | keyboard focus ring |
| subtitle | 215.3 19.3% 34.5% = rgb(71, 85, 105) | 212.7 26.8% 83.9% = rgb(203, 213, 225) | sub-heading text on the Examples and Templates pages |
| chart-1 .. chart-5 (light) | 12 76% 61%, 173 58% 39%, 197 37% 24%, 43 74% 66%, 27 87% 67% | n/a | not seen in use outside charts |
| chart-1 .. chart-5 (dark) | n/a | 220 70% 50%, 160 60% 45%, 30 80% 55%, 280 65% 60%, 340 75% 55% | not seen in use |
| sidebar-background | 0 0% 98% | 200 26% 8% = rgb(15, 22, 26) | declared, the rail itself paints the page background |
| sidebar-foreground | 240 5.3% 26.1% = rgb(63, 63, 70) | 240 4.8% 95.9% | rail item text and icon when not selected (measured rgb(63,63,70) light) |
| sidebar-accent | 240 4.8% 95.9% | 240 3.7% 15.9% | selected rail item background (measured oklch gray-100 light) |
| sidebar-accent-foreground | 240 5.9% 10% | 240 4.8% 95.9% | declared |
| sidebar-primary | 173 82% 29% | 172 66% 46% | declared |
| sidebar-border | 220 13% 91% | 240 3.7% 15.9% | declared |
| sidebar-ring | 217.2 91.2% 59.8% | 217.2 91.2% 59.8% | declared |

Other tokens the page declares: radius .75rem (12 px); extra-small radius .125rem (2 px); default
transition 150 ms with the ease-in-out curve cubic-bezier(.4, 0, .2, 1); spacing unit .25rem (4 px).
The utility palette used by the page is the Tailwind palette (sky, teal, slate, gray, red, amber, green,
orange, blue, violet, pink, lime, yellow, emerald families). Colours the page uses straight from that palette
and not through a token:

| Where | Light | Dark |
|---|---|---|
| Active tab fill in the New diagram dialog (Transactional / Analytical) | sky-600 oklch(58.8% .158 242) | sky-500 oklch(68.5% .169 237) |
| Rail label and icon of the selected item | teal-600 oklch(60% .118 185) on gray-100 | teal-400 oklch(77.7% .152 182) on gray-900 oklch(21% .034 265) |
| Section header text inside a table form (Fields, Indexes, Check Constraints, Description) | slate-600 rgb(71, 85, 105) | slate-300 rgb(203, 213, 225) |
| Nullable "N" and "more" icon buttons in a field row | slate-500 oklch(55.4% .046 257) | slate-400 oklch(70.4% .04 257) |
| Primary-key key icon button in a field row | orange-600 oklch(64.6% .222 41) on rgb(230, 244, 243) | orange-400 oklch(75% .183 56) on rgb(29, 49, 53) |
| Data type word in a field row on the canvas | violet-700 oklch(49.1% .27 293) | violet-300 oklch(81.1% .111 294) |
| Primary-key / selected table accent bar | the table colour (default rgb(142, 183, 255), #8eb7ff) | same |

Canvas area background in dark theme: rgb(20, 20, 20) (light: transparent over the page colour with a faint dot grid). Dialog overlay: black at 60 % opacity (rgb 0 0 0 / .6) with a 2 px backdrop blur, z-index 50, both themes.

### 1.2 Radii

| Name | Value | Used for |
|---|---|---|
| radius (lg) | 12 px | dialogs, tab list, tab triggers, cards on the Examples and Templates pages |
| md | 10 px | buttons, inputs, selects, rail items, menu bar container, menu panels, popover panels |
| sm | 2 px | menu items in menus and in the top menu bar, open-state highlights |
| full | pill | counter badges (such as the "1" badge on a canvas table, the "2" count in the Lint pill) |

### 1.3 Shadows (box-shadow, as measured)

| Surface | Shadow |
|---|---|
| Dialog (New diagram, Import wizard) | 0 25px 50px -12px rgba(0,0,0,.25) (2xl) |
| Confirm dialog (Clear, Delete) | 0 10px 15px -3px rgba(0,0,0,.1), 0 4px 6px -4px rgba(0,0,0,.1) (lg) |
| Menus, select lists | 0 4px 6px -1px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.1) (md) |
| Buttons (outline, default, secondary) | none at rest (the shadow slot is declared but transparent) |
| Inputs | none at rest |

### 1.4 Fonts

| Use | Family | Notes |
|---|---|---|
| Body, UI, headings in the editor | Inter, then the system stack (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif, emoji faces) | 16 px base, line-height 24 px |
| Code (DBML panel, import script boxes, export SQL box, type chips in the legend and on the canvas) | a monospace face (the browser default monospace in the capture) | 11 to 14 px, line height about 19 px in editors |
| Examples and Templates pages | see section 6 | headings use a second family |

Brand text "QBase" in the navbar: 18 px, weight 700, letter spacing -0.45 px, line height 18 px, the letter
"Q" is painted primary (rgb(13,135,120)), the rest is foreground. Next to the logo glyph (24 x 24 px at x 16).
"Powered by" footer (bottom right of the canvas): "Powered by" 12/16 px weight 400 muted-foreground, then
the word Qubdi (the last letter is a dotless i with a dot glyph drawn by a separate span) 14/14 px weight 700,
letter spacing -0.14 px, foreground colour.

### 1.5 Text styles in use (size / line height / weight / letter spacing, colour) and where

| Style | Where used | Colour (light) |
|---|---|---|
| 18/18, 700, -0.45 px | brand "QBase" in the navbar | foreground, "Q" primary |
| 18/18, 600, -0.45 px | dialog titles (h2) | foreground |
| 18/28, 500, -0.45 px | empty-state heading ("No tables") | foreground |
| 14/20, 400, normal | dialog descriptions, body text, side panel inputs, menu items, empty-state description (22.75 px line height) | muted-foreground for descriptions |
| 14/20, 500 | top menu bar items (Actions, Edit, View, Backup), tab triggers, large buttons (Continue, Cancel, Empty database), canvas bottom toolbar buttons | foreground |
| 14/14, 500 | diagram name in the navbar (h1) | foreground |
| 12/16, 500 | small buttons (Add Table in the panel, Add Field, Add Index, Lint pill, Type colours), section headers inside a table form, More Databases label | foreground / slate-600 |
| 12/16, 400, letter spacing 1.2 px | shortcut hints in menus (Ctrl+B, Ctrl+M, Ctrl+Z, Ctrl+Shift+Z) | muted-foreground |
| 10/12.5, 400 (500 when selected) | rail item labels (New, Open, Tables, DBML, Refs, Custom Types, Visuals) | sidebar-foreground / teal-600 (dark: zinc-100 rgb(244,244,245) / teal-400) |
| 11/13.75, 400 | schema line under a table name on the canvas | muted-foreground |
| 13.5/16.9, 600 | table name on the canvas | foreground |
| 14/20, 600 | field name on the canvas | foreground |
| 11/15.7, 600 (mono) | data type on the canvas | violet-700 |

## 2. Shared primitives in every state

All sizes are at 100 % zoom. "Hover" values were taken with the mouse over the element, "active" with the
mouse button held, "focus" after keyboard focus. Transitions are the browser default 150 ms ease-in-out
colour fade on the controls that declare one (buttons, rail items, menu items); the page declares
"all" transitions on buttons. With the operating-system reduced-motion preference on, the capture shows
0 ms, so reduced motion switches transitions and the open/close animations off. Scenes:
primitives-export-dialog, primitives-import-wizard, primitives-inputs, menu-item-hover, rail-hover-selected,
navbar-hover-focus, tables-filter-focus.

### 2.1 Buttons

All buttons: inline flex, centred content, 8 px gap between icon and label, icon 16 x 16 px, never wrap,
radius 10 px, weight 500, font Inter. Keyboard focus shows a 2 px ring in the ring colour with a 1 px
offset in the background colour (the ring appears only for keyboard focus). Active (pressed) scales the
button to 98 % (a 75 px wide button measures 73.5 px). Disabled: opacity 0.5 and the pointer does not react.

| Variant | Size | Rest | Hover | Where |
|---|---|---|---|---|
| Primary (default) | 36 px high, padding 8 px 16 px, 14/20 text | background primary rgb(13,135,120) (dark rgb(40,195,174)), text white (dark rgb(9,17,21)), shadow 0 1px 3px rgba(0,0,0,.1) + 0 1px 2px -1px | primary at 90 % opacity | Continue, Import, Open, Export, Create, Clear, Delete, Use |
| Secondary | 36 px high, padding 8 px 16 px | background secondary rgb(236,243,243) (dark rgb(31,41,45)), text secondary-foreground rgb(25,39,46), shadow 0 1px 2px rgba(0,0,0,.05) | secondary at 80 % opacity | Cancel, Back, New Database |
| Outline | 36 px high, padding 8 px 16 px (empty-state "Add Table" 32 px high) | background = page background rgb(252,253,253), 1 px border input rgb(214,223,225), text foreground, shadow 0 1px 2px rgba(0,0,0,.05) | background accent rgb(230,244,243), text accent-foreground rgb(10,92,82) | Empty database, Add Table in the empty state, Add Index, Add Field (bottom bar of a table form), Delete Field (text destructive red), Type colours pill |
| Ghost | 36 px high, padding 8 px 16 px | transparent, text foreground | accent background | Import from File, More Databases, Highlight Fields, Delete Type |
| Small (panel header actions) | 32 px high, padding 8 px, 12/16 text | secondary at rest (rgb(236,243,243)); transparent in some headers | secondary at 80 % | Add Table, Add Area, Add Note, New Type, Add Relationship next to the Filter box |
| Icon button | 32 x 32 or 36 x 36 px, no label, radius 10 px | transparent, icon foreground or slate-500 | accent background | canvas bottom toolbar (36 x 36), field row "more" (32 x 32), table menu (32 x 32), dialog close (16 x 16, radius 2 px) |
| Toggle icon button (pressed state) | 32 x 32 px | pressed = secondary fill (Snap to Grid) or primary fill with white icon (Highlight Overlapping Tables measured pressed in the empty editor) | n/a | canvas top-left tools |
| Pill (Lint) | 67 x 32 px, padding 0 12 px, 12/16 text, 1 px border input | outline look; pressed (panel open) = accent background rgb(230,244,243) and accent-foreground text | accent | navbar |

### 2.2 Inputs, textareas, selects

| Control | Measured |
|---|---|
| Text input (Filter, Name, Hex colour, search boxes) | 32 px high (36 px in dialogs and the field default box), padding 4 px 12 px, 14/20 text, radius 10 px, 1 px border input rgb(214,223,225) (dark rgb(43,54,59)), transparent background, shadow 0 1px 2px rgba(0,0,0,.05) |
| Input focus | border becomes primary rgb(13,135,120); no thick ring; the shadow stays |
| Placeholder | muted-foreground colour (rgb(90,106,114) light) |
| Disabled-looking boxes (Default Value / Description in the field popover) | background secondary rgb(236,243,243) |
| Textarea | same as input, padding 8 px 12 px, min height 60 px, resize handle bottom right |
| Select trigger | 32 to 36 px high, padding 8 px 12 px, radius 10 px, 1 px border input, 14/20 text, a small up/down chevron icon at the right, shadow 0 1px 2px rgba(0,0,0,.05) |
| Select list (popover) | opens below the trigger, same width as the trigger, white (card) background, 1 px border, radius 10 px, padding 4 px, shadow md, option rows 32 px high with 8 px side padding and the selected option marked with a check at the right; option text 14/20; rows highlight with the accent colours; the list scrolls with a thin scrollbar |
| Compact "chip" select in a field row (data type) | 88 px wide name input then a 88 px type box with the chevron; same border and radius as inputs |

### 2.3 Checkbox, switch, radio

| Control | Measured |
|---|---|
| Checkbox | 16 x 16 px, radius 4 px, 1 px border; checked = primary fill with white check; unchecked = page background with a border at 70 % opacity of the input colour; label to the right, 14/14 weight 500 slate-600 (dark slate-300) |
| Switch | not present in the reachable old screens (no role "switch" found) |
| Radio buttons for the database pick | the logo tiles are radio buttons (128 x 128 px, no border) |
| Radio pills (Import wizard: Regular / Supabase / Timescale, Smart Query / SQL Script / DBML) | 24 px high, radius 10 px, 1 px border input, padding 0 8 px, 14/20 weight 500, icon 16 px; selected = background slate-200 oklch(92.9% .013 255.5) with accent-foreground text and primary-tinted icon |

### 2.4 Tabs

| Tabs | Measured |
|---|---|
| Large segmented tabs (Transactional / Analytical in New diagram; Areas / Notes in Visuals) | tab list 38 px high, 1 px border, radius 12 px, padding 4 px, background page background; each tab trigger 28 px high, fills half the list, 14/20 weight 500, radius 12 px; active = fill sky-600 oklch(58.8% .158 242) (dark sky-500) with white text and shadow 0 1px 2px rgba(0,0,0,.05); inactive = transparent with muted-foreground text |
| Small segmented tabs (DB Client / PSQL in the import wizard) | list 32 px high, radius 8 px, padding 4 px, background secondary; trigger 24 px high, padding 4 px 12 px, radius 10 px; active = page background, foreground text, shadow 0 1px 3px rgba(0,0,0,.1); inactive = muted-foreground |

### 2.5 Dialogs

| Item | Measured |
|---|---|
| Overlay | black at 60 % opacity with a 2 px backdrop blur, z-index 50, covers the whole window |
| Open animation | 150 ms ease, fade in with a zoom from 95 % and a slide of about 2 % (animation name enter, 150 ms, ease); close is the same reversed over 150 ms |
| Surface | background = page background (rgb(252,253,253); dark rgb(13,20,23)), 1 px border, radius 12 px, padding 24 px, shadow 0 25px 50px -12px rgba(0,0,0,.25) |
| Position | centred in the window both ways; on the phone the dialog is full width (390 px, square corners) and spans y 116 to 728 of the 844 px window |
| Title | h2, 18/18 weight 600, letter spacing -0.45 px |
| Description | 14/20 weight 400 muted-foreground, 4 px under the title |
| Close button | "x" icon at the top right (16 x 16 px hit area, radius 2 px, 17 px from the top and 17 px from the right edge of the dialog); the confirm dialogs (Clear, Delete) have no close button |
| Footer | buttons 36 px high; in Export / Import / Open dialogs Cancel (secondary) is at the left edge and the primary action at the right edge; in New diagram and the Import wizard the first group (Import from File or Back, then "Need help? Watch how" link) is at the left and the secondary and primary buttons are grouped at the right with a 16 px gap; on the phone the buttons stack full width in the order Continue, Empty database, Import from File |
| Widths | New diagram 900 px (phone: full width); Import database wizard 900 x 642 px; Open diagram 704 x 480 px; Export / Import diagram file dialogs 512 px wide (334 to 378 px high); confirm dialogs (Clear, Delete) 512 px wide, text-only, buttons right aligned; Create Relationship 512 x 300 px |
| Confirm dialog surface | same colours, shadow lg (0 10px 15px -3px + 0 4px 6px -4px at .1), title 18/28 weight 600, description 14/20, buttons Cancel (outline, 80 px) and the action (primary, right) |

### 2.6 Popovers and menus

| Item | Measured |
|---|---|
| Menu panel (top menus, language, Export as, Theme) | white (dark rgb(17,25,29)), 1 px border, radius 10 px (language list 12 px), padding 4 px (language 6 px), shadow md, min width 192 px, opens under the trigger with a 4 px gap, z-index 50, open animation fade + zoom 95 % over 150 ms |
| Menu item | 32 px high, padding 6 px 8 px, radius 2 px, 14/20 weight 400, shortcut hint right aligned 12/16 letter spacing 1.2 px muted-foreground; highlight = accent background rgb(230,244,243) with accent-foreground text; disabled = 50 % opacity (Undo / Redo when empty); items with a submenu show a right chevron |
| Menu separator | 1 px line in the secondary colour rgb(236,243,243) (dark rgb(31,41,45)), 4 px vertical margin, spans the panel |
| Checkable items (Theme: System / Light / Dark; Zoom on Scroll: On / Off; Database Views: On / Off) | menu item with a check mark on the selected one |
| Popover (colour picker, field attributes, Type colours) | white, 1 px border, radius 10 px, padding 16 px (Type colours 12 px), shadow md, opens next to its trigger |
| Tooltips | no tooltips appear on the canvas toolbar or navbar buttons (hover only changes the fill). The table name in the panel is a tooltip trigger (no tooltip text appeared within 1.4 s in the capture); the saved mark uses the browser title tooltip ("Saved just now" plus the exact date and time on a second line). |

### 2.7 Toasts

| Item | Measured |
|---|---|
| Region | fixed at the bottom right of the window, 16 px from the right edge and 16 px from the bottom edge; announced as "Notifications (F8)" |
| Size | 388 x 74 px for a title and one line of description; padding 16 px |
| Destructive variant (copy failure) | background destructive rgb(239,68,68), text slate-50 rgb(248,250,252), title 14/20 weight 600, description 12/16 weight 400, radius 10 px |
| Animation | not captured (the toast was measured at rest) |
| Seen toasts | "Copy failed" with "Something went wrong. Please try again." when copy to clipboard is not allowed |

### 2.8 Scrollbars, badges, separators

| Item | Measured |
|---|---|
| Scrollbars | thin (scrollbar-width thin) on the page and lists; dialogs use a scroll area whose native bar is hidden (a thin overlay thumb is drawn by the scroll-area component) |
| Badges | pill, 11/16 weight 600, padding 0 6 px, background card at 70 % opacity, text muted-foreground (the field count on a canvas table; the finding count in the Lint pill) |
| Separators | 1 px lines in the border colour: the vertical divider between the side panel and the canvas (x 360, full height), the horizontal rule in the rail between Open and Tables (36 px wide), the rules inside the canvas toolbar |

## 3. Top navbar and its menus

Navbar: height 48 px, full width, background = page background, 1 px bottom border in the border
colour, flex row. Left block starts at x 16.

| Element | Position and size | Style |
|---|---|---|
| Logo glyph | 24 x 24 px at x 16, y 12 | line icon in primary |
| Brand "QBase" link | x 48, 53 px wide, text 18/18 weight 700 letter spacing -0.45 px | "Q" painted primary, "Base" foreground; the whole thing is a link to the home page |
| Menu bar | x 113, y 6, 275 x 36 px, radius 10 px | four triggers: Actions (75 px wide), Edit (50), View (58), Backup (74), each 28 px high, padding 4 px 12 px, 14/20 weight 500, radius 2 px, 6 px gap; hover shows no change; open or keyboard-focused item = accent background rgb(230,244,243) and accent-foreground text |
| Database logo | 19 x 20 px, centred group at x 593 | the engine logo of the diagram (PostgreSQL elephant), clicking it opens the database-type choice |
| Diagram name | h1, 66 px wide, 14/14 weight 500 | centred in the bar; click to edit; while editing a small "confirm" icon button (20 x 20) appears right of the text |
| Saved mark | 32 x 32 px icon button area at x 1117, floppy-disk icon 16 px, muted-foreground | accessible name "Saved just now"; native title shows the timestamp |
| Lint pill | x 1157, 67 x 32 px | see 2.1; the label "Lint" with a list-check icon; a count chip (11/16) is added after the label when there are findings (example "Lint 2") |
| Language button | globe icon 16 px in a 32 x 32 circle button at x 1240 | the accessible name is "Change language" (screen-reader only text) |
| Right margin | 16 px | |

Phone (390 px wide): the navbar splits into rows. Row 1 (height 44 px): hamburger button 36 x 36 px at x 12,
y 8 (opens the left drawer), brand "QBase" text at x 56 (the logo glyph is hidden), globe button at x 358.
Row 2: the menu bar at x 12, y 44, 366 x 32 px with the same four items. Row 3: database logo and diagram
name centred (y 84 to 104). The canvas starts at y 117. The Lint pill and saved mark are not shown on the phone.
A round primary floating button (44 x 44 px, pencil icon, at x 15, y 785) sits bottom left of the canvas.

### 3.1 Menu contents (order, text, shortcuts)

| Menu | Items in order (exact text) | Shortcut text shown |
|---|---|---|
| Actions | Import (submenu: .json, then a separator, SQL, DBML); separator; Export SQL (submenu: PostgreSQL, MySQL, SQL Server, MariaDB, SQLite); Export as (submenu: PNG, JPG, SVG, separator, JSON); separator; Delete | none |
| Edit | Undo; Redo; separator; Clear | Undo "Ctrl+Z", Redo "Ctrl+Shift+Z" (Undo and Redo are disabled when there is nothing to undo or redo) |
| View | Hide Sidebar; separator; Hide Cardinality; Hide Field Attributes; Compact Tables; Hide Mini Map; separator; Zoom on Scroll (submenu: On, Off); separator; Database Views (submenu: On, Off); separator; Theme (submenu: System, Light, Dark) | Hide Sidebar "Ctrl+B", Theme "Ctrl+M" |
| Backup | Export Diagram; Restore Diagram | none |

Menu items have no leading icons. The labels toggle with the state (all observed): "Hide Sidebar" / "Show Sidebar", "Hide Cardinality" / "Show Cardinality", "Hide Field Attributes" / "Show Field Attributes", "Compact Tables" / "Standard Tables", "Hide Mini Map" / "Show Mini Map".

Language list: the language button opens a small panel (224 x 62 px at x 1056, y 44, radius 12 px, padding 6 px) holding one
select box showing the current language "English"; opening it lists the languages. Theme switch: View > Theme or
Ctrl+M; no separate theme button in the navbar.

Lint panel (opened by the pill): a right-docked panel, 383 x 732 px at x 884, y 56 (16 px from the right edge and the
bottom), white card surface with 1 px border and radius 10 px, padding 12 px; header text "Schema lint (0 errors, 0 warnings, 0 info)" 14/20 weight 600
wrapping on two lines, two 36 x 36 icon buttons at the right ("Lint settings", "Close lint"); empty state text "No problems found." 14/20 muted-foreground; with
findings: a group heading "Info (2)" 14/20 weight 500 and one bordered row per finding (radius 10 px, 1 px border,
padding 8 px, a small monospace rule chip such as ORPHAN-TABLE in primary text then the message "Table table_1 has no relationships.").

## 4. Left rail and side panel

### 4.1 Rail

| Item | Measured |
|---|---|
| Rail | 52 px wide column at x 0, from y 48 to the bottom, 1 px right border; items are 36 px wide buttons at x 8 |
| Item | 36 x 50.5 px (Custom Types 63 px because its label wraps to two lines), padding 8 px 0, radius 10 px, icon 16 px above a 10/12.5 label |
| Order | New, Open, (rule), Tables, DBML, Refs, Custom Types, Visuals; "New" and "Open" are actions (dialogs); the rest switch the panel section |
| Item colours | rest: sidebar-foreground rgb(63,63,70) (dark rgb(244,244,245)); hover: background gray-200 oklch(92.8% .006 265), text rgb(24,24,27), weight 400; selected: background gray-100 oklch(96.7% .003 265), text and icon teal-600 oklch(60% .118 185) (dark: background gray-900, text teal-400 oklch(77.7% .152 182)), label weight 500 |
| Phone | the rail becomes a left drawer 91 px wide (background rgb(250,250,250), shadow lg, accessible title "Sidebar" with description "Displays the mobile sidebar."): brand "QBase" 16/24 weight 600 at the top, then the same items as 74 x 32 px rows with a 16 px icon and a 14/20 label on one line |

### 4.2 Side panel container

| Item | Measured |
|---|---|
| Position | x 52 to 360 (width 308 px = 25 % of the window, minimum 25 %, maximum 99 % of the window), from y 48 to the bottom |
| Resize handle | a 1 px separator at x 359.5 (the border between panel and canvas), full height, focusable (role separator, vertical, value 25, minimum 25, maximum 99); dragging it moves the width (dragged to x 700 the panel became 648 px wide; dragging back to the left stops at 25 %); the cursor is the default arrow |
| Collapse | View > Hide Sidebar or Ctrl+B hides the whole panel; the canvas then starts at x 52 and its toolbar moves left; View then says "Show Sidebar" |
| Padding | 8 px around; the header row (Filter box and action button) is at y 52 |
| Overflow | the panel content is 334 px wide in a 308 px panel, so the right end of the header action button ("Add Table" label) is clipped by the divider and the canvas tool buttons overlap it at x 376 to 408 (visible quirk of the old editor) |

### 4.3 Tables section

| Part | Measured |
|---|---|
| Header row | Filter input 221 x 32 px (placeholder "Filter") at x 61; "Add Table" small secondary button 97 x 32 px at x 298 (icon table + label 12/16 weight 500) |
| Empty state | illustration 128 x 96 px centred at y 216, title "No tables" 18/28 weight 500 letter spacing -0.45 px, description "Create a table to get started" 14/22.75 muted-foreground, outline button "Add Table" 102 x 32 px; all centred in the panel |
| Table row (collapsed) | 44 px high card, 334 px wide, left accent bar 4 px wide in the table colour (default rgb(142,183,255)), chevron 16 px at x 75, drag grip (six dots) at x 99, name (14/20 weight 500, inside a rounded 24 px tag with padding 2 px 8 px) at x 123, at the right: "more" button 32 x 32 (three dots), and on hover two extra icons appear to its left: "Focus on the canvas" (target icon) and "Edit name" (pencil); hover also tints the row with the accent colour |
| Table form (expanded) | content region 334 x 257 px; sections are accordion headers 24 px high (icon 16 px + label 12/16 weight 500 slate-600 + chevron at x 367) in this order: Fields, Indexes, Check Constraints, Description; Fields is open by default |
| Field row | 40 px high at x 71: drag grip (14 px), name input 88 x 32 (placeholder "Name"), type box 88 x 32 showing the type name with a chevron, then a 32 x 32 "N" toggle (nullable; slate-500 text, no fill when off), a 32 x 32 key toggle (primary key; on = orange-600 key icon on accent background rgb(230,244,243)), and a 32 x 32 "more" button (three dots, opens Field Attributes) |
| "Add Field" row | ghost button 89 x 28 with a plus icon and 12/16 text at x 75 |
| Footer bar of a table form | at the bottom, a 1 px top rule, the colour swatch button (32 x 24 px, radius 10 px, 2 px light border, fill = table colour, accessible name "Change color") at x 71, then outline buttons "Add Index" (99 x 32) and "Add Field" (95 x 32) at the right |
| Table menu (three dots, opens from the keyboard Enter on that button) | items in order: "Table Actions" (a muted heading), Change Schema, Add Field, Add Index, Duplicate Table, Delete Table |
| Type picker | opens an in-panel list 348 px wide with 32 px rows (text, bigint with a check when chosen, etc.); first rows are the common types boolean, date, int, text, timestamp, timestamptz, varchar(n), bigint, json, jsonb, numeric(p, s), serial, uuid, then the rest alphabetically (bigserial, bit, box, bytea, char(n), cidr, circle, daterange, double precision, enum, inet, int4range, int8range, interval, line, lseg, macaddr, macaddr8, money, numrange, oid, path, point, polygon, real, regclass ...) |
| Field Attributes popover | 208 x 360 px, padding 16, opens right of the "more" button; title "Field Attributes" 14/20 weight 600 with a rule below; rows (label 14/14 weight 500 slate-600, checkbox at the right): Unique, Auto Increment, Array; then "Default Value" label and input (placeholder "No default"), "Description" label and textarea (placeholder "No description", 60 px high); a rule; outline button "Delete Field" (174 x 36, red text with a trash icon) |
| Indexes editor | opening the section adds a row: a multi-select box 236 x 32 showing the chosen fields as small chips with an x (for example "id x") and a chevron, a key-style toggle button 32 x 32 (not named; assumed unique flag), then ghost button "Add Index"; the header gets a "+" action at the right |
| Check Constraints editor | opening shows only the ghost button "Add Check" (plus icon) and the header "+" action |
| Description editor | opening the section shows a text area under the header (not measured separately) |
| Colour picker popover | 256 x 172 px, padding 16; a 6 x 2 grid of 32 x 32 swatches (radius 10 px, 2 px light border, the chosen one has a dark 2 px border) with 6 px gaps; swatch colours in order: #ff6363, #ff6b8a, #c05dcf, #b067e9, #8a61f5, #7175fa; #8eb7ff, #42e0c0, #4dee8a, #9ef07a, #ffe374, #ff9f74; below a label "Custom color" 12/16 weight 500 muted, then a native colour well 32 x 32, a hex input 128 x 32 (placeholder "#8eb7ff" style) and a primary "Use" button 46 x 32 |
| Schema box | the "Change Schema" item of the table menu opens a dialog titled "Change Schema" with the line "Update table "table_1" schema", a select showing the current schema ("public"), the word "or", a link-style action "Create new schema", then Cancel and the primary "Change" button; the schema is shown as small muted text under the table name on the canvas |
| Filtering | typing in Filter filters rows live; with no match the list is simply empty |

### 4.4 Refs section

| Part | Measured |
|---|---|
| Header row | "Collapse All" icon button 32 x 32 at x 61, Filter input (135 px wide, placeholder "Filter") at x 109, "Add Relationship" small button 135 x 32 at x 260 |
| Empty state | illustration, title "No relationships", description "Create a relationship to get started", outline button "Add Relationship" 145 x 32 px |
| Dialog "Create Relationship" | see section 5 |

### 4.5 Custom Types section

| Part | Measured |
|---|---|
| Header row | Filter input 217 x 32, "New Type" small button 101 x 32 with a plus icon |
| Empty state | title "No custom types", description "Custom types will appear here when they are available in your database" (two lines, 238 px wide) and outline button "New Type" |
| Type row | collapsed 44 px card: chevron, grip, name tag, a kind badge ("Enum") 11/16 in a bordered 24 px pill, three-dots button |
| Expanded type | region 334 x 268: label "Kind" (12/16 weight 700 slate-600), kind select 316 x 32 (value "Enum"), label "Enum Values", empty hint "No enum values defined" (12/16 muted), an input "Add enum value..." 278 x 32 with a 34 x 32 icon button (add), then ghost buttons "Highlight Fields" and "Delete Type" (red text) |

### 4.6 Visuals section

| Part | Measured |
|---|---|
| Tabs | large segmented tabs "Areas" and "Notes" 334 x 38 at y 56 (see 2.4), header row below at y 111: Filter input 224 x 32 and a small button "Add Area" (94 x 32) or "Add Note" (93 x 32) |
| Areas empty state | title "No areas", description "Create an area to get started", outline button "Add Area" |
| Notes empty state | title "No Notes" (capital N), description "Create a note to add text annotations" (two lines), outline button "Add Note" |
| Area row | 46 px card with 1 px border and radius 10: grip, name tag ("Area 1", 14/20 weight 500), colour swatch button 32 x 24 ("Change color", fill = area colour, default rgb(66,224,192)), three-dots button 32 x 32 |
| Note row | 50 px card: grip, italic muted text "Empty note" when blank (14/20), colour swatch button (default rgb(255,227,116)), three-dots button |

### 4.7 DBML section

| Part | Measured |
|---|---|
| Layout | no header row: a code editor fills the whole panel (62 to 394 wide, from y 50) with line numbers in a gutter (muted colour), 14 px monospace text; keywords blue, strings dark red, types teal, settings grey |
| Buttons | three 30 x 30 icon buttons stacked at the panel's right edge (x 360, y 55, 89, 123), no accessible names and no tooltips: copy, show differences, edit (pencil); copying in the capture produced the destructive toast "Copy failed" because the clipboard was not allowed |
| Error line | an invalid DBML line in edit mode is marked with a red wave and a red gutter number (not reachable without text entry in the capture) |

### 4.8 Filter panel (canvas side popover)

Opened by the first icon of the bottom toolbar ("Filter Tables", Ctrl+F). A panel docked to the right (x 944 to 1264, y 64 to 784, white card, 1 px border, radius 10 px, padding 12), header "Filter Tables" 14/20 weight 600 with the hint "(Ctrl+F)" muted and a close x at the right; a search input "Search tables..." with a magnifier (36 px high, focused with a primary border); two toggle buttons "Group by Schema" (selected = accent fill) and "Group by Area"; then a tree: schema row (database icon, name, chip "2/2", chevron, eye icon at the right) and table rows (table icon, name, eye icon).

## 5. Dialogs and wizards

Common surface and footer rules are in 2.5. This section gives per-dialog layout. Coordinates are for the
1280 x 800 window (dialogs are centred); "x, y" is the top left of the dialog.

### 5.1 New diagram ("What is your Database?")

Opens on first visit (nothing saved), from the rail item "New" and from the "New Database" button of the Open dialog. Scene: tokens-first-visit, new-diagram-*.

| Part | Measured |
|---|---|
| Dialog | 900 x 594 px at x 190, y 103; padding 24 px; closing x at the top right (x 1057, y 120) |
| Title and description | "What is your Database?" 18/18 weight 600; "Each database has its own unique features and capabilities." 14/20 muted |
| Tab list | 416 x 38 px centred at y 188: "Transactional" and "Analytical"; the active one is blue (sky) with white text and shows a 2 px primary focus ring (offset 1 px) while it has keyboard focus |
| Logo grid | 3 columns by 2 rows of radio tiles, each 128 x 128 px, 16 px gaps (x 432 / 576 / 720, y 234 / 378), tile radius 10 px, no border, transparent; logo image inside is 104 px wide (height follows the picture: MySQL 104 x 65, PostgreSQL 104 x 104, MariaDB 104 x 85, SQLite 104 x 58, SQL Server 104 x 85, Oracle 104 x 72); tile hover: background secondary rgb(236,243,243) (dark rgb(31,41,45)) and the tile text colour muted-foreground |
| Names as shown (image alt text) | Transactional page 1: MySQL, PostgreSQL, MariaDB, SQLite, SQL Server, Oracle; "More Databases" page: SQLite, SQL Server, Oracle, CockroachDB; Analytical: ClickHouse |
| More Databases toggle | full-width ghost button 416 x 32 at y 536 with a down chevron and the label "More Databases" 12/16 weight 500; pressed it swaps the grid to the second set (see above) and becomes "Primary Databases" with an up chevron and the accent fill rgb(230,244,243), accent-foreground text |
| Check Examples card | link 416 x 32 at y 572, radius 10 px, 1 px input border, a grid icon plus "Check Examples" 14/20 in primary colour (phone label: "Examples", 12/16); goes to the Examples page |
| Footer | left: ghost "Import from File" 137 x 36 at x 215; right: outline "Empty database" 143 x 36 at x 815 and primary "Continue" 91 x 36 at x 974 (gap 16); both are disabled (opacity 0.5) until a database is chosen |
| Choosing a logo | selects the engine and opens the Import step of the wizard (5.2) |
| Phone | dialog 390 x 612 px at y 116 (full width, square corners, padding 24); tab list 272 px wide; tiles 80 x 80 with 56 px logos and 16 px gaps (columns at x 59 / 155 / 251); footer buttons stack full width 340 x 36: Continue (y 579), Empty database (y 623), Import from File (y 667) |

### 5.2 Import your Database (wizard)

| Part | Measured |
|---|---|
| Dialog | 900 x 642 px at x 190, y 79, no top-right close button (footer Back instead) |
| Title | "Import your Database" |
| Left column (350 px wide, tinted panel, x 215 to 565) | label "Database Edition:" (14/24 primary) with three radio pills Regular, Supabase, Timescale (each 24 px high, icon 16 px); label "How would you like to import?" with pills Smart Query, SQL Script, DBML; "Instructions:" 14/20 weight 600; numbered steps in primary text ("1. Run this script in your database:"); small tabs "DB Client" / "PSQL" (see 2.4); a read-only code box 332 x 198 with line numbers, syntax colours, and a 30 x 30 outline copy button at its top right; "2. Paste the script result into this modal" followed by an arrow |
| Right column | an output box (bordered, radius 10) headed "Smart Query Output" with a spinner while empty; for SQL Script and DBML it is a code editor with a line-number gutter |
| Divider | a draggable vertical grip between the columns (six-dot handle at x 428) |
| Footer | left: secondary "Back" 65 x 36 and a link-style "Need help? Watch how" in primary text 14/20 weight 500; right: outline "Empty database" and primary "Import" (disabled until text is pasted) |

### 5.3 Open diagram ("Open Database")

Dialog 704 x 480 px at x 288, y 160. Title "Open Database", description "Select a diagram to open from the list below.". A table: header cells 14/20 weight 500 muted (Name, Created at, Last modified, Tables), row 36.5 px high, cell padding 8 px, 14/20; the Name cell has the engine icon (19 x 20) then the diagram name; dates are shown in the browser locale (example "11/8/2026, 8:48:21 AM"); the last column of each row holds a 32 x 32 icon button; the selected row is highlighted. Footer: secondary "Cancel" (left), secondary "New Database" and primary "Open" (right). Close x at the top right.

### 5.4 Import and Export dialogs

| Dialog | Size (px) | Content |
|---|---|---|
| Import Diagram (Actions > Import > .json and Backup > Restore Diagram) | 512 x 334 | title "Import Diagram", description "Import a diagram from a JSON file.", a drop zone label 380 x 96 with an upload icon, text "Drag and drop a file here or click to select" (14/20 slate-600) and "Supported types: .json" (12/16 slate-500); Cancel (secondary, left), Import (primary, right) |
| Import to Current Diagram (Actions > Import > SQL or DBML) | 900 x 642 at x 190, y 79 | title "Import to Current Diagram"; pills "SQL Script" and "DBML" under "How would you like to import?"; "Instructions:" with the steps for the chosen format (SQL: "1. Install pg_dump.", "2. Execute the following command in your terminal (prefix with sudo on Linux if needed):" with a code box, "Example:" with a second code box, "3. Open the exported SQL file, copy its content ..."; DBML: "Paste your DBML (Database Markup Language) schema definition here" followed by an arrow, "Example:" with a sample); right side an editor titled "DBML Script" or the SQL editor; footer link "Need help? Watch how", buttons "Import" and "Close" |
| Export SQL (Actions > Export SQL > engine) | 960 x 546 at x 160, y 127 | title "Export SQL", description "Export your diagram schema to PostgreSQL script" (engine name follows the choice), a code box 910 x 384 with line numbers and a copy button at its top right, secondary "Close" at the bottom right; with an empty diagram the box shows the red message "Error generating SQL script. Please try again later or contact us." |
| Export Image (Actions > Export as > PNG, JPG, SVG) | 512 x 378 (with options open) | title "Export Image", description "Choose the scale factor for export:", select "4x (Best Quality)" (other scales in the list), accordion row "Advanced Options" with a chevron; open: checkbox "Include background pattern" with help "Add subtle grid pattern to background." (checked), checkbox "Transparent background" with help "Remove background color from image." (unchecked); Cancel (secondary), Export (primary) |
| Export Diagram (Actions > Export as > JSON, Backup > Export Diagram) | 512 x 206 at x 384, y 297 | title "Export Diagram", description "Choose the format for export:", select showing "JSON", Cancel, Export |

### 5.5 Create Relationship

Opened by "Add Relationship" in the Refs section. Dialog 512 x 300 at x 384, y 250. Title "Create Relationship". Two columns by two rows of selects, each with a small icon and a label 12/16 weight 600 above: "Primary Table" and "Primary Field", "Referenced Table" and "Referenced Field"; the table selects show "Select table", the field selects "Select field" (the field selects are disabled, secondary fill, until their table is chosen). Select trigger 227 x 32 px. Footer: Cancel (secondary), Create (primary, disabled until all four are chosen). Close x at the top right.

### 5.6 Confirm dialogs (alert dialogs)

| Dialog | Title | Description | Buttons |
|---|---|---|---|
| Edit > Clear | "Clear Diagram" | "This action cannot be undone. This will permanently delete all the data in the diagram." | Cancel (outline), Clear (primary) |
| Actions > Delete | "Delete Diagram" | "This action cannot be undone. This will permanently delete the diagram." | Cancel (outline), Delete (primary) |

Both are 512 px wide, 24 px padding, centred, title 18/28 weight 600, text 14/20 muted, the buttons right aligned (outline "Cancel" 80 x 36 then primary action) with 8 px gap; no close x; overlay as in 2.5.

### 5.7 Change Schema

Table menu > Change Schema: dialog titled "Change Schema" with the line "Update table "table_1" schema", a select showing "public", the word "or", an action "Create new schema", footer Cancel, Change (primary), Close x.

### 5.8 Settings, empty states

No Settings dialog is reachable from the navbar, rail or menus of the old editor (View holds the toggles instead). The only settings-like surface is the "Lint settings" icon button inside the lint panel (not opened in this capture). Empty states (centred illustration 128 x 96 px, 18/28 weight 500 title, 14/22.75 muted description, outline button) exist for Tables, Refs, Custom Types, Areas, Notes (texts in section 4 and in the copy file).

## 6. Examples and Templates pages (layout only)

Both pages share a header strip: 48 px high, 1 px bottom border, the brand link "QBase" (glyph + text, 85 x 30 px) at x 16, y 9; content container 1056 px wide, centred (x 112 to 1168 at 1280 px), starting 12 px below the strip (page title at y 60); a footer line "Powered by Qubdi" centred at the bottom (y 776). Fonts: page titles use Manrope (700, 24/32) with the system stack fallback; body text is Inter. Scenes: page-examples*, page-templates*, page-not-found.

### 6.1 Examples (/examples)

| Part | Measured |
|---|---|
| Title | "Examples" 24/32 weight 700 Manrope, foreground |
| Subtitle | "A collection of examples to help you get started with QBase." 16/24 400 muted-foreground (in an h2 element) |
| Lead-in | "Click on one" plus a smiling emoji, 16/24 weight 600 |
| Card grid | 3 columns of 336 x 384 px cards with 24 px gaps (x 112, 472, 832), first row at y 172 |
| Card | radius 12 px, 2 px border slate-500 oklch(55.4% .046 257), fill slate-50 oklch(98.4% .003 248); a 16 px coloured bar across the top (purple, teal, yellow in turn); a header strip with the engine logo 20 x 20 at x 122, the title (16/24 weight 700) at x 154 and a 36 x 36 download icon button (slate-500) at the right; the schema picture 332 x 174 px; the description (16/24, padding 8) at the bottom |
| Cards | "Employees schema", "Bike stores schema", "DVD Rental schema" |
| Interaction | the whole card is a button; its hover state is recorded in scene page-examples-card-hover (screenshot); what a click does was not exercised |
| Phone | single column, cards 366 px wide with 12 px side margins |

### 6.2 Templates (/templates, /templates/featured, /templates/tags/<tag>)

| Part | Measured |
|---|---|
| Title / subtitle | "Database schema templates" (24/32 weight 700 Manrope); "Discover a collection of real-world database schema diagrams, featuring example applications and popular open-source projects." 16/24 muted |
| Left filter column | 176 px wide at x 112, first item y 144; items 28 px high, padding 4 px, radius 2 px, 14/20; "Featured" (star icon) and "All Templates" (diamond icon); the active one has fill teal-100 oklch(95.3% .051 181), text teal-600 oklch(60% .118 185) and weight 600; inactive text muted-foreground weight 400; then the heading "Tags" (14/20 weight 600, y 218) and one link per tag at 30 px pitch: MySQL, Pokemon, Example Apps, Postgres, Open Source, WordPress, PHP, Django, Python, Laravel, Visual Novel Database, Node.js, SaaS, Rails, CMS, Symfony |
| Card grid | 4 columns of 198 x 320 px cards, 24 px gaps (x 304, 526, 748, 970), first row at y 144; card = link with a 2 px slate border, radius 12 px, a 6 px coloured top bar (colour varies), the picture 186 x 115.5 px at 6 px inset (radius 4 px), the title h3 16/24 weight 600 at x +10, the engine logo 20 x 20 at the right of the title row, the description 14/20 with 8 px padding (up to four lines), and tag chips at the bottom |
| Tag chip | 22 px high, padding 2 px 10 px, radius 10 px (pill), 1 px border in the border colour, 12/16 weight 600 text in foreground, chips wrap in rows with 4 px gaps |
| Cards in the old catalogue | about 40 (Employees, Pokemon, Airbnb, WordPress, Django, Laravel, Twitter Database, Visual Novel Database, Adonis Acl Database, Akaunting, Laravel Spark, Voyager, Koel, Laravel Permission, Gravity, Ticketit, Lobsters, Refinerycms, BuddyPress, Snipe-It, Comfortable Mexican Sofa, ...) |
| Phone | the filter column becomes a full-width list above the grid and the grid is one column of 366 px cards (page height about 17 000 px) |
| Detail page (/templates/<name>) | the old build shows an error page here ("Unexpected Application Error!", "useDiff must be used within an DiffProvider"); this is a defect of the old build and is not a visual target |

### 6.3 Not found

A centred block: "404" in primary colour, 128/128 weight 800 letter spacing -3.2 px, centred in a 640 px column at y 64; heading "Something's missing." 36/40 weight 700 letter spacing -0.9 px at y 208; text "Sorry, we can't find that page. You'll find lots to explore on the home page." 18/28 weight 300 muted-foreground at y 264 (wraps to two lines in the 640 px column) and the "Powered by Qubdi" footer. The page has no header strip.

## 7. Text inventory

The complete screen by screen inventory of English text, with the old wording and a comparison against the
new editor's current English, is in `visual-copy.md`.

## 8. Known quirks of the old build seen while measuring

| Quirk | Where |
|---|---|
| Panel content is wider than the panel, the "Add Table" label is clipped at the divider and the canvas tool buttons overlap the panel header | Tables section at the default panel width |
| The three DBML icon buttons and the language button have no accessible names or tooltips (the language button has screen-reader text only) | DBML panel, navbar |
| The template detail page crashes with an application error | /templates/employees-database |
| Radio tiles for databases are announced as "Toggle bold" (logo alt text is on the image only) | New diagram |
| Empty-state wording is inconsistent in capitals ("No Notes" versus "No tables") | Notes tab |
