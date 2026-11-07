# Phase 9: performance on large diagrams

Measured in headless Chromium (Playwright 1.49, software rendering, 1440x900) on
the built app, local-only mode. `sh tools/e2e/run-perf.sh [out-dir]` builds the
app into `out-dir/dist`, generates a PostgreSQL script of 50 / 200 / 500 tables
(8 columns each, one link per table; the JSON variant also has one area per 20
tables), loads it once through the SQL import dialog and once through
Import > Diagram file, then measures. Options: `SIZES=200`, `SOURCES=json`,
`STEPS=drag,delete`, `LOADONLY=1`, `PROFILE=1` (CPU profile per phase, readable
build, written to `out-dir/profile-*.txt`), `TRACE=1` (Chrome trace sums),
`EXPERIMENT_CSS=...`. Results also go to `out-dir/perf-results.json`.

How the numbers are taken: frame times from `requestAnimationFrame` deltas,
long tasks from `PerformanceObserver`, "event to paint" from the input event
timestamp to the next painted frame, JS heap from CDP after a GC, autosave from
a wrapper around `IDBObjectStore.put`. Frame times are quantised to 16.7 ms.

## Before and after (200 tables, SQL import; JSON import is within 5 %)

| Metric | Limit | Before | After |
|---|---|---|---|
| Import click to first table drawn | 2000 | 5890 | 906 |
| Interactive after import (last long task) | 2000 | 6231 | 1080 |
| Longest long task at load | - | 5333 | 454 |
| Select a table | 200 | 246 | 142 |
| Drag frame p95 (60 moves) | 50 | 100 | 33 |
| Drag frame max | - | 167 | 100 |
| Pan, longest long task (wheel x30) | 200 | 90 | 61 |
| Zoom, longest long task (ctrl+wheel x30) | 200 | 0 | 0 |
| Typing in the table name, slowest key | 100 | 64 | 64 |
| Add a table, click to paint | 300 | 307 | 202 |
| Undo of the add | 300 | 294 | 170 |
| Delete 160 selected tables | 500 | 344 (json) | 193 |
| Undo of that delete | - | 856 | 436 |
| Autosave after an edit, put() call / commit | - | 0 / 2 | 4 / 8 |
| Export SQL (click to text) | - | 915 | 822 |
| Switch to the DBML section | - | 1114 | 1055 |
| JS heap after load (MB) | - | 45.1 | 38.6 |

The SQL import dialog "parse" step was 32 s at 200 tables in the first run;
that was Playwright's `fill()` typing 40 KB into the textarea, not the app (the
parser takes 110 ms for 200 tables, 280 ms for 500 in Node). The script now
sets the value the way a paste does; the dialog reports the count in about
0.85 s (0.5 s of it is the debounce).

## After, all sizes

| Metric | 50 | 200 | 500 |
|---|---|---|---|
| Import to first table (sql / json) | 311 / 323 | 906 / 988 | 1777 / 2048 |
| Interactive after import (sql / json) | 348 / 354 | 1080 / 1101 | 2002 / 2241 |
| Longest long task at load | 141 | 454 | 853 |
| Select a table | 39 | 142 | 173 / 211 |
| Drag frame p95 | 17 | 33 | 50 / 67 |
| Pan, longest long task | 0 | 61 | 87 |
| Zoom, longest long task | 0 | 0 | 0 |
| Typing, slowest key | 40 | 64 | 48 / 64 |
| Add / undo a table | 63 / 59 | 202 / 170 | 271 / 296 (sql), 370 / 331 (json) |
| Delete selected (count) | 34: 58 | 160: 193 | 189: 329 |
| Undo of the delete | 130 | 436 | 674 |
| Drop plus autosave, longest long task | 0 | 106 | 191 |
| Autosave put() call / commit | 1 / 2 | 4 / 8 | 9 / 12 |
| JS heap (MB) | 17.7 | 38.6 | 60.8 |

Every target at 200 tables is met: interactive within 2 s (1.1 s), drag p95
below 50 ms (33 ms), deleting 100+ tables below 500 ms (193 ms for 160), no
long task above 200 ms during pan or zoom (61 ms, 0 ms).

## What was fixed

1. Mount-time `updateNodeInternals` per table (`canvas/entity-node.tsx`).
   Every table asked xyflow to measure it again right after it mounted, 200
   separate store updates with forced layout. Now it only does so when the
   column ids change (the case the call is for). Import to first paint
   5.9 s -> 0.9 s at 200 tables. Biggest single win.
2. Translations once per table, not per row (`canvas/field-row.tsx`). Each of
   the 1600 rows called `useTranslation` and up to three `t()`; the table now
   passes five labels down.
3. Node and edge objects kept between builds (`canvas/flow-model.ts`
   `NodeMemory`, `buildEdges(..., kept)`). A drag changed every node and every
   edge object, so xyflow rebuilt all of them on each move; now only the moved
   table (and the edges whose sides flipped) are new objects. `dimmedEntities`
   uses a set instead of `Array.includes` per link.
4. Connection dots only where a line ends when zoomed out below 0.4
   (`HANDLES_MIN_ZOOM`, `canvas/field-row.tsx`, `entity-node.tsx`,
   `diagram-canvas.tsx`). A Chrome trace of the drag showed the 3200 dots of
   200 tables cost about half of every frame (layerize, paint, hit test). At
   that zoom the dots are unusable anyway. When the zoom crosses the limit the
   canvas asks xyflow to measure all tables once. Drag p95 100 -> 33 ms.
5. Batched table removal and insertion (`core/commands/apply.ts`
   `removeEntities`, `insertEntities`, used by `runGroup` for a run of
   `entity.remove` / `entity.insert`). Same results and same inverse commands as
   one by one (a test compares both), one copy of the maps instead of one per
   table. Review item 11: delete 400 of 500 tables 557 ms -> 6 ms, its undo
   258 ms -> 4 ms (core only, Node).
6. Structural sharing in `writeParts` (`core/commands/apply.ts`). Renaming,
   moving or resizing a table copied the column, index and check maps of the
   whole design (65 ms at 500 tables per move or drop); lists that did not
   change now keep the same map.

Tests guarding the behaviour (not the timing): `core/commands/batch-remove.test.ts`
(20: batch equals one-by-one, inverses equal, exact undo/redo, refusals),
`core/commands/structural-sharing.test.ts`, `canvas/large-diagram.test.tsx`
(node/edge reuse, change detection, dots by zoom).

Autosave was already debounced (1 s quiet, 10 s maximum) and writes the
design once per burst; it costs 4 ms in `put()` and 8 ms to commit at 200 tables, so
nothing was changed there. Export SQL and the DBML section were not changed:
the export itself takes 20 ms (200 tables) in Node; the 0.8-1.4 s is the first
use of the lazily loaded code plus the dialog (the 50-table figure is the same
0.9 s). The DBML parser chunk accounts for a 330 ms long task.

## What is still slow

- 500 tables: first paint 1.8-2.0 s, interactive 2.0-2.3 s, add / undo a table
  270-400 ms, undo of a 189-table delete 0.7 s, drag p95 50-67 ms. The
  side-panel table list renders all 500 rows (`features`, not virtualised) and
  re-renders with each edit; the profile of an undo shows the rows and the
  canvas about equal. Virtualising that list is the next step.
- Undo of a large delete (160 tables 436 ms): the work is mounting 160 table
  cards, not the command (4 ms).
- Rendering is the limit: at the fitted zoom all tables are on screen, so
  `onlyRenderVisibleElements` cannot help (258 of 500 are drawn at the
  minimum zoom). A "header only" level of detail at very low zoom would cut
  it further; not done, it changes what the canvas shows.
- Switching to the DBML section and Export SQL take about 1 s the first time
  (code loading plus a 300 ms long task for the DBML parser), more at 500.
- The measurement script's own flakiness: a metric reads -1 when the
  expected rendered-count change was not seen within the timeout (seen once
  or twice per run for undo/redo/delete at 500 tables). Re-run to confirm.
- The SQL import lays tables out in columns by link distance; with an
  unrelated link structure (every table linked to one hub) it makes a single
  tall column at 10 % zoom. Not a speed problem, noted for the layout.

## Windowed side-panel lists

The Tables, Links, Types, Areas and Notes lists draw only the rows near the
scroll position when they have more than 60 rows (`features/tables/windowed-list.tsx`,
range maths in `window-range.ts`). Up to 60 rows the output is the same plain
list as before (no wrapper, no roles).

- Rows are measured (ResizeObserver), with a 44 px + gap guess for rows not yet
  drawn, because an open table or type is far taller than a closed one. Spacer
  divs stand in for the rest, so the scrollbar and the browser's own scroll
  position are unchanged by edits. 320 px of overscan each way.
- Kept drawn: the focused row (until focus is in no row and the list is
  scrolled), the open row(s) (`keepIds`), and the row a keyboard move is going to.
- Keyboard: Tab / Shift+Tab off the last / first drawn row scrolls the next row
  in and focuses it; ArrowDown / ArrowUp on a row's toggle button moves to the
  neighbouring row's toggle (also when it was not drawn).
- A table opened from the canvas (`expandedEntityId`, mirrored in `openId`) is
  scrolled into view through the spacer offsets even when its row is not drawn;
  the row's own `scrollIntoView` then refines it.
- Accessibility: the windowed list is `role="list"`, rows `role="listitem"` with
  `aria-setsize` / `aria-posinset`; spacers are `aria-hidden`. The row toggles keep
  their labels. Filter box, Add table button and the drag sources are untouched;
  the sortable list still gets all ids, so drag reordering works for drawn rows.
- Known limits: crossing 60 rows (adding the 61st or filtering back below it)
  remounts the rows once, so an open editor's local state is lost at that moment;
  dragging a table row to reorder auto-scrolls only over drawn rows.

500 tables (run-perf.sh, SIZES=500, ms, sql / json import), before -> after:

| metric | before | after |
|---|---|---|
| add table (click to paint) | 338 / 386 | 189 / 197 |
| undo add table | 410 / 449 | 232 / 217 |
| redo add table | 58 / 384 | 209 / 225 (the 58 was a missed sample) |
| undo again | 369 / 384 | 195 / 234 |
| delete 189 selected tables | -1 / 382 | 256 / 267 |
| undo the delete of 189 | 939 / 798 | 475 / 477 |
| select a table | 213 / 209 | 200 / 215 |
| first table drawn after import | 2067 / 2056 | 1737 / 1776 |
| interactive after import | 2329 / 2218 | 1973 / 1941 |

Add / undo / redo are now within the 300 ms limit. Select is unchanged (it is
the canvas, not the list) and sits at the 200 ms limit. Tests:
`features/tables/__tests__/windowed-list.test.tsx` (window size and counts,
scroll, total height, focused and kept rows stay, scroll to a requested row, Tab
and arrow movement into undrawn rows, short list unchanged, Tables section).
