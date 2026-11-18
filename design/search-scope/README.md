# Where the search looks: tables, fields or both

Decided 2026-11-18.

## The question

The Search & Filter box (see [`column-search`](../column-search/README.md)) looks at table names and
field names together. A short text such as "id" then brings in every table that has an `id` field, and
there was no way back to the old search of table names only. Small icon controls were wanted to say
where the text is looked for: in tables, in fields, or in both. Where should they go, and are they one
control or two?

Three ways were drawn with the app's own colours and the panel's real size (`w-80`, 320 px) in
[`options.html`](options.html), over the same search text and the same tables;
[`sheet.png`](sheet.png) shows them.

## Chosen: C, two switches inside the search box

- Two icon switches, 24 x 22 px, inside the right end of the box: **Search in table names** (table
  icon) and **Search in field names** (list icon). Each has a tooltip and an accessible name, and
  `aria-pressed`. Both are on to begin with, which is the search as it was after field search; "tables
  only" is the search as it was before it; "fields only" is new.
- One of the two always stays on: the last one cannot be switched off.
- With tables only, field names are not read and no fields are listed. With fields only, a table is
  listed only for a field that matches, and a table found by its name alone is left out. With no text
  the switches change nothing.
- The box says which it is: "Search tables or fields..." (both), "Search tables..." and "Search
  fields...".
- A click on a switch leaves the focus in the box (`mousedown` is not allowed to take it), so typing
  goes on.
- The choice lives with the panel, as the search text and Group by do: closing the panel puts both
  switches back on. It is not saved with the diagram.
- Where: `src/features/filters/filter-tree.ts` (`SearchScope`, the `scope` input of `buildTree`) and
  `filter-panel.tsx` (`ScopeSwitch`, `toggleScope`). Strings: `filters.searchInTables`,
  `filters.searchInFields`, `filters.searchOnlyTables`, `filters.searchOnlyFields`, in five languages.
- Tests: `src/features/filters/__tests__/field-search-tree.test.ts` and `field-search.test.tsx`.

### What differs from the drawing

- The drawing showed an X (clear) at the right end of the box. The box has no such button, so the two
  switches sit at the very right end, and the text keeps clear of them (`pr-16`).
- The drawing's option C shows the two switches only; the "Search in" label of A and B is not used.

## The others, not chosen

| | Look | Why not |
| --- | --- | --- |
| A | A row under Group by Schema / Group by Area with "Search in" and one segmented control of three icons (Tables, Fields, Both) | Asked for first, and the clearest wording, but it adds a row to a small panel. |
| B | The same row with two separate switches | The same model as C, with the extra row. |

C is the same two-switch model as B, drawn without the row.

## Saved for later

Keeping the choice for as long as the page is open (it would have to live outside the panel, for
example in the editor store) is not done: it resets with the panel.

## Regenerating the pictures

`options.html` opens in any browser. `options.html?theme=dark` picks the theme, `&only=c` shows one
card (`a`, `b`, `c`), and `&shot=1` hides the page text. The picture was taken with headless Edge:

```
msedge --headless=new --window-size=1120,1960 --screenshot=sheet.png "file:///.../design/search-scope/options.html?shot=1"
```
