# Phase 9 restore: Oracle, ClickHouse, Backup menu, New dialog tabs

Owner, 2026-11-08: "keep all old UI/UX". This file records the choices made where the spec is
silent or ambiguous. Rows: EXP-008, SHL-064, SHL-032, SHL-042, IMP-001.

## Oracle and ClickHouse

- No more open-only designs: `isOpenOnly`, the banner and the locked menus are gone. Stored
  files keep their type and edit like any other (wire round trip tests unchanged).
- Traits (editor 14.1): schema pickers for both; Oracle has no default schema, ClickHouse has
  `default`; no arrays, no custom types; checks for Oracle, none for ClickHouse; default new
  column type `number` for Oracle, `bigint` for ClickHouse (kept, so `bigint` is in the
  ClickHouse list as one of the SQL-standard aliases).
- Type lists: Oracle 23 names (lower case, like imported names); ClickHouse the UInt/Int
  families, Float, Decimal, String, FixedString, dates, UUID, Bool, Enum, LowCardinality, Tuple,
  Map, Nested, Array, IPv4/6, geo, JSON and SQL aliases, kept in ClickHouse's own spelling.
- SQL export (spec 9.1.1, 9.1.10): a generic generator (`src/dialects/generic/write.ts`).
  The spec says a same-type export falls back to the PostgreSQL generator; that would write
  PostgreSQL for an Oracle design, so the same type also uses the generic generator, with its
  own warning header ("-- Oracle (generic SQL)"). A pair with no converter (either side Oracle
  or ClickHouse, or generic to Oracle) gets the "A to B ... WARNING: there is no converter"
  header. Schemas, enums, checks and comments are written only where the target's capabilities
  say so; views are left out and reported as a warning. ClickHouse type names are written in
  ClickHouse's spelling.
- Export SQL menu: an Oracle or ClickHouse diagram offers its own type first, then the five
  standard targets. They are NOT offered as targets from other databases (spec A6 and open
  question 4: "never offered as targets"). Generic still has no writer.
- SQL import: Oracle has its own reader (quotes `"`, VARCHAR2(n CHAR|BYTE), NUMBER(p,s),
  `GENERATED ... ON NULL AS IDENTITY`, TIMESTAMP ... WITH LOCAL TIME ZONE, COMMENT ON) and the
  per-line warnings of spec 3.4. Semicolon warning is off (not listed for Oracle). Type
  detection for Generic text has an Oracle step before the PostgreSQL keywords (VARCHAR2,
  NUMBER(n), SYSDATE, SYS_GUID, BINARY_FLOAT/DOUBLE, PCTFREE/NOCOMPRESS/NOLOGGING, TABLESPACE).
  `INTERVAL DAY(n) TO SECOND(n)` keeps only "interval day" (not worth a special case).
- ClickHouse has no SQL reader (spec 3.1): the SQL tab is not offered, the Import > SQL menu item
  is disabled, and `importSql` still answers "Unsupported database type".
- DBML: both types use the common DBML code (like MySQL), no array support; tests in
  `src/dialects/p9-oracle-clickhouse.test.ts`.
- Database-metadata path: `loadFromDatabaseMetadata` already accepts any type; new scripts
  `src/features/import/scripts/oracle.ts` (USER_* views, 12.2+) and `clickhouse.ts` (`system.*`).
  Oracle: defaults, view definitions and check conditions are left out (LONG columns).
  ClickHouse: the sorting key is reported as the primary key, no foreign keys or indexes.
  **Neither script has been run against a live server** (no Oracle or ClickHouse here); the
  tests check the contract keys and that the metadata they would return loads.
- Field attributes: `fixedstring` takes a length, `decimal32..256` precision, Oracle `number`
  can auto-number, ClickHouse cannot; Oracle length limits (4000/2000/1000).

## Backup menu (SHL-064)

Fourth menu after View: Export diagram (JSON export dialog) and Restore diagram (JSON import
dialog), same handlers as the items under the first menu. Wording lives in
`editor.workspace.menu.backup.*` (8 languages), so the final wording can change in one place.
The first menu is still labelled "Diagram" (the old "Actions" wording comes with visual-copy).

## New diagram dialog (SHL-032, SHL-042)

- `database-picker.tsx`: Transactional tab (MySQL, PostgreSQL, MariaDB, SQLite, SQL Server,
  Oracle, CockroachDB) and Analytical tab (ClickHouse), three cards per row, two rows shown.
  "More databases" moves the window one row down (SQLite ... CockroachDB), "Primary databases"
  moves it back. Reading of the spec's "next or previous row".
- Cards show a neutral database icon; `DATABASE_LOGOS` in `database-groups.ts` is the empty
  map where a logo image address goes later.
- Generic: still the pre-selected type on every opening (IMP-004); since it has no card, a
  small link under the tabs ("Use a generic database instead") chooses it again.
- Button wording ("Blank diagram", "Continue") unchanged; the spec's "Empty diagram/database"
  wording comes with visual-copy.md.

## Side panel, forms and Filter Tables panel (visual restore)

Wording is the old Title Case ("Add Table", "Check Constraints", "Create Relationship", ...)
in `editor.sidePanel`; the seven other languages keep their translations. New keys, all
translated: `common.customColor`, `fields.typeSearchPlaceholder`, `userTypes.enumValues`.
`filters.noArea` now reads "Ungrouped"; the name box placeholder reads "Name".

Behaviour kept with a new look: table form sections are accordions (Fields open, one open at a
time); a new table opens its form; a colour bar replaces the colour dot on rows; the focus and
rename buttons show on hover and on keyboard focus (and always on touch); the type list lost the
description column (it is the row's title); the DBML section is a code view with line numbers and
colours, three icon buttons at the right (copy, inline refs, edit) that keep their accessible names
(the old ones had none) and green/red icon buttons for accept and undo.

Deliberate deviations (reason in brackets):
- No grip on Areas and Notes rows (they cannot be reordered, a grip would promise it).
- No "+" in the Indexes and Check Constraints headers, and none in Fields (the same actions are
  one row below; three buttons with one name confuse screen readers and tests).
- Panel content stays inside the panel (the old one overflowed by 26 px and clipped the Add
  Table label; that is a defect, not a look).
- Field row toggles are 28 px, not 32 (the panel is 308 px wide; 28 px still passes the 24 px
  target); the name box shrinks to fit instead of a fixed 88 px.
- "Delete Field" is an outline button with red text (as old); destructive red text on white is 4.8:1.
- Colour palette changed to the twelve old colours (`src/lib/colors.ts`); the swatch border uses
  the border token; the selected swatch gets a foreground-coloured border.
- Syntax colours of DBML use Tailwind 700-level (light) and 300-level (dark) shades so the text
  passes 4.5:1; the old blue, red and teal were lighter.
- Filter Tables panel: width 320 and full height are set in the component, but it is still
  placed by `canvas-slot.tsx` at the top left; docking it to the right needs that wrapper
  (`absolute right-4 top-4 bottom-4`) changed by the owner of that file.
- Edit card: header (schema, name, open in panel, close), the same accordion form, field count
  at the bottom. The old card's flat 32 px field list with unique and delete buttons is not
  rebuilt: indexes, checks and the description must stay reachable there.

## Shell restore: accessibility changes and deliberate deviations (visual-shell pass)

Contrast was computed (WCAG 2.x relative luminance) for every measured pair that carries text.
Each change is the smallest step on the measured value that reaches 4.5:1 (3:1 for large text and
icons).

| Item | Measured | Used | Why |
|---|---|---|---|
| Primary (light) | 173 82% 29% = rgb(13,135,120): white on it 4.42:1 | 173 82% 28% = rgb(13,130,116): 4.71:1 | button text, links and the "Q" must reach 4.5:1; one lightness step |
| Primary on accent fill (hover rows, open menu) | 3.91:1 | 4.17:1 at the new primary; accent-foreground (6.98:1) is used for text on accent | large text only sits in that pair |
| Destructive (light) | 0 84.2% 60.2% = rgb(239,68,68): white 3.78:1 | 0 84% 49%: white 4.8:1 | destructive button, error text, red toast |
| Active large tab, light | sky-600 oklch(58.8% .158 242): white 4.02:1 | 202 100% 38% (#007bc2): 4.6:1 | tab label is 14 px |
| Active large tab, dark | sky-500 with white text 2.75:1 | same sky fill with the dark primary-foreground text: 6.9:1 | |
| Selected rail item (light) | teal-600 on gray-100: 3.40:1 | 173 100% 25% (#007e73-like): 4.5:1 | 10 px label |
| Selected rail item (dark) | teal-400 on gray-900: 9.5:1 | unchanged | |
| Key icon on accent (orange-600) | 3.15:1 | left to the side-panel pass | icon only (3:1 holds) |
| Muted text, slate-500 helper text | 4.76:1 on white | unchanged | passes |

Deliberate deviations from the old editor (everything else matches the measurements):

- Side panel floor: the panel is 25 percent of the space right of the rail, as before, but never
  under 240 px (the old one had no floor and was cramped on small windows).
- The panel separator is 1 px wide as measured; its drag and focus target is 8 px wide through a
  pseudo-element so it can still be grabbed. Keyboard use (arrow keys) is kept.
- Input focus: the old input only recoloured its border; kept (a 2 px primary ring appears on
  buttons, tabs and swatches, as measured). Border primary against white is 4.7:1, which counts as
  a visible focus indicator.
- The View menu no longer offers "Preferences" (the old one had no settings dialog). The dialog
  code stays; it is reachable again by one menu entry if the owner wants it.
- The Theme submenu has no separate "Switch light and dark" item: the Ctrl+M hint sits on the
  Theme item itself, as in the old editor.
- "Zoom on Scroll: On/Off" and "Database Views: On/Off" are submenus with a check mark, wired to
  the existing mouse-wheel (zoom/pan) and database-views settings.
- Database tiles in the New dialog keep a visible name under the neutral icon (the old tiles had
  only a logo, so a screen reader heard "Toggle bold"); logos stay out by the owner's decision, and
  `DATABASE_LOGOS` is the documented place for them. The "Check Examples" card is not built.
- Language list keeps its search box and radio semantics (old: a select box).
- Rail labels for other languages are unchanged where the meaning is the same.

## Canvas restore (canvas session, 2026-11-08)

Applied from `spec/visual-canvas.md` and the reference captures: dot surface, table cards (12 px radius,
48 px gradient header with a 28 px colour chip, 32 px field rows, short type chips, 6 px nullable mark),
2 px slate lines with a 35 px stub and 14 px corners, drawn "1" and "N" circle ends, teal dashed marching
selected line with the "..." handle and teal row highlight, link pill, areas (8.2 % fill, 32 px header),
notes (colour bar, fold, hover toolbar with the shared colour picker), 100 x 100 minimap in one grey, the
326 x 44 toolbar, the corner tools, the Type colours legend with its member lines, Title Case wording of
every canvas label (all eight locale files keep their own translations; only the English text changed).

Deliberate deviations and removals:

- Full screen button: removed from the toolbar (the old bar has none). The `fullScreen` strings stay in the
  locale files unused; the browser's own F11 remains.
- Header buttons: the old pair (focus, fold or unfold) replaces our "open in side panel" and "make
  wider/narrower" buttons. Width is changed by dragging the edge of a selected table; the field-row pencil
  opens the edit card, which does what "open in side panel" did.
- React Flow attribution: hidden with `proOptions.hideAttribution`. The library is MIT licensed
  (`node_modules/@xyflow/react/LICENSE`), which allows this; the licence text must stay in the shipped
  third-party notices.
- Minimap viewport window has no outline (old has none); the dark mask keeps it readable.
- Overlap button: always shown and a toggle (old); it flashes overlapping tables once and keeps a red count
  pill on each while it is on.
- The "Show All" way-back pill (EDT-023) stays; the hidden-everything message button too (test ids
  `show-all-pill`, `show-all-hidden`), because their visible name is now equal to the toolbar button.
- Accessible names of toolbar buttons are the plain labels ("Filter Tables", "Undo"); the shortcut moved
  to the tooltip (title) only.
- Contrast (WCAG AA): the 9 px "UQ" mark, the 10 px "Show More" text and the muted schema line use the
  muted-foreground token (4.5:1 or better on white); no old colour had to be changed for contrast so far;
  see the a11y run for the final list.
- Left as is: the table placement algorithm of an import and therefore the initial fit zoom (ours 80 %,
  old 64 % for the demo scene); the type chip keeps a given size (old dropped it for `character varying(40)`).
- Contrast change (the only one the axe scan of the canvas needed): the green chip of a field a selected
  line ends on uses green-800 text in the light theme (green-700 gave 4.09:1 on the teal row, below AA).
- Smoke, flows and a11y runs stop at the New diagram dialog, the menu bar and the rail because their
  selectors still use the pre-restore wording of the shell (Blank diagram instead, Diagram menu, Add table,
  SQL script tab, Build from text); they are the shell session's to update. The canvas was axe-scanned
  separately (light and dark, default and with a selected line): no violations after the change above.
