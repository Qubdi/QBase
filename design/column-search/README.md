# Field search in the filter panel

Decided 2026-11-18.

## The question

The panel opened with Ctrl+F (then called Filter Tables) found a table only when its **name**
contained the search text. Searching "email" gave "No tables found", although several tables had an
email field. How should the search find fields too, and what should the panel then be called?

Four ways were drawn with the app's own colours and the panel's real size (`w-80`, 320 px) in
[`options.html`](options.html), over the same diagram and the same search text;
[`sheet.png`](sheet.png) shows them.

## Chosen: A, one box for tables and fields

- A table is listed when its name, or the name of one of its fields, contains the text
  (case-insensitive substring). The fields that match are listed under their table: the first three,
  then "Show n more" (and "Show fewer"), each with the text found marked and its type in grey. A table
  found by its name only shows no fields.
- A click on a field makes the table visible if it was hidden, selects it, centres it and focuses the
  field on the canvas (`setFocusColumn`), as a click on the field's row in the table card does: the
  field is marked and the tables not related to it stand back.
- The search still only narrows the list. It never changes which tables are hidden; hidden tables
  that match are listed, greyed. The groups, their counts and the eyes work as before.
- Where: `src/features/filters/filter-tree.ts` (`buildTree` gives each table the `fields` that match)
  and `filter-panel.tsx` (`Marked`, the field rows, `openField`). The test helper
  `withFields` in `src/core/testing/helpers.ts` builds designs with named fields.
- Tests: `src/features/filters/__tests__/field-search-tree.test.ts` and `field-search.test.tsx`.

### The name

"Filter Tables" no longer says what the panel does: it searches tables and fields and filters what
the canvas shows. It is now **Search & Filter** (toolbar tooltip "Search & Filter (Ctrl+F)", the
panel title, and its accessible name), in all five languages: Suchen & Filtern, Rechercher et filtrer,
Cerca e filtra, Поиск и фильтр. The box reads "Search tables or fields...". Changing the name again is
one string each: `filters.title` and the toolbar's `filter` in `canvas-strings.ts`, in every language.

### What differs from the drawing

- The app calls columns **fields** everywhere (Fields, Add Field, Field Attributes), so the text says
  fields, not columns.
- "Show 2 more" replaces "2 more matching columns": the app does not use plural forms, and "more"
  needs none. It is a button that opens the rest.

## The others, not chosen

| | Look | Why not |
| --- | --- | --- |
| Today | Table names only | The reason for this record. |
| B | A, with "Search in: Tables / Columns" switches under the box | Lets you leave table names out so that "id" does not bring in every table with "id" in its name, but adds a row of controls to a small panel. Can be added on top of A later: `buildTree` would take the two switches. |
| C | Two boxes, one for tables and one for columns, both must match | The most exact, and the most to look at and to clear. |

## Regenerating the pictures

`options.html` opens in any browser. `options.html?theme=dark` picks the theme, `&only=a` shows one
card (`now`, `a`, `b`, `c`), and `&shot=1` hides the page text. The picture was taken with headless
Edge:

```
msedge --headless=new --window-size=1120,1800 --screenshot=sheet.png "file:///.../design/column-search/options.html?shot=1"
```
