# Which tables are in which area

Decided 2026-11-18.

## The question

The Areas list (Visuals > Areas) showed an area as a name, a colour, a focus button and a menu, and
nothing about the tables inside it. To find out which tables belong to an area you had to look at the
canvas and judge which tables lie inside the rectangle. The Refs list already opens a relationship
to the tables and fields it joins. How should the Areas list show the tables of an area?

Each table stores its area (`regionId`, kept in line with the geometry after every move or resize,
editor 10.3). The canvas, the Move to Area menu and the Group by Area filter all read it, so the list
can read it too, without measuring a rectangle, and it always agrees with them.

Two ways were drawn with the app's own colours and sizes (rail 52 px, panel 350 px) in
[`options.html`](options.html), next to a sample canvas; [`sheet.png`](sheet.png) shows them.

## Chosen: A, a row that opens to its tables, with a group for the tables in no area

- Each area row has a chevron and a count. The chevron, or a click on the name, opens the row to its
  tables (name, and the schema in grey when the Tables list names schemas). A click on a table selects
  it and centres it on the canvas, as the area's own focus button does. An open area with no tables says
  "No tables in this area". Rows start closed, so a long list of areas stays short.
- A last row, "Tables outside every area", has the same chevron and count and opens to the tables
  that are in no area. It is left out while the list is narrowed by the filter, when there is no area
  at all, and when every table is in an area.
- Double-click on the name, or the pencil, still renames; the single click on the name now opens the
  row, as it does in the Tables list.
- Where: `src/features/regions-memos/visuals-section.tsx` (`AreasList`, `ActionRow` with its new
  `below`, `OpenButton`, `Count`, `TableLines`) and `visual-lists.ts` (`areaTables`, which groups the
  tables by their stored area). Views are left out while Database Views is off, as in the Tables list;
  a table that records an area that is not there counts as outside.
- Strings: `visuals.toggleTables`, `visuals.tableCount`, `visuals.noTablesInArea` and
  `visuals.outsideAreas`, in English and the four other languages.
- Tests: `src/features/regions-memos/__tests__/area-tables.test.tsx`.

### What differs from the drawing

- The count is the bare number ("3"), not "3 tables": the app does not use plural forms in its
  strings, and "Tables: 3" is the tooltip and what a screen reader reads, in every language.
- The drawing had a small heading ("Not in an area") above the outside row. The row says it already,
  so the heading is left out.
- The stripe of the outside row is a plain grey one, not a dashed one.

## The other option, not chosen

| | Look | Why not |
| --- | --- | --- |
| B | The table names always listed as chips under each area | Nothing to click to see them, but an area of twenty tables is a tall block, the list grows with the tables, and a chip cannot show the schema or find the table on the canvas. |

## Saved for later

Showing the area on the rows of the Tables list (a small coloured chip with the area's name) would
answer the same question from the other side. It was not asked for and is not done.

## Regenerating the pictures

`options.html` opens in any browser. `options.html?theme=dark` picks the theme, `&only=a` shows one
card (`now`, `a`, `b`), and `&shot=1` hides the page text. The picture was taken with headless Edge:

```
msedge --headless=new --window-size=1120,2100 --screenshot=sheet.png "file:///.../design/area-tables/options.html?shot=1"
```
