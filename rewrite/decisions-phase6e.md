# Phase 6e decisions: DBML edit mode and diff preview (EDT-238 to EDT-247)

## Decisions
- Editor is a plain `textarea` over a mirrored backdrop; the backdrop paints the error line red (no new dependency).
- Parse runs 1 s (`PARSE_DELAY_MS`) after the last keystroke, with `importDbml`. The error line is the first diagnostic's `line`; without a line the message omits "in line N".
- `diffDesigns` (pure, `src/features/dbml-diff/diff-designs.ts`): tables matched by schema (default schema filled in) + name; views are not part of DBML and are ignored and kept. A table is "changed" when comments, columns (name, type, size, flags, default, collation, comment), non-pk indexes or checks differ. Links match by endpoint names and cardinalities. Custom types match by name and compare kind/values/members. A DBML export then import of S1 to S3 gives an empty diff (tested).
- Renames are removed + added (no matching by id or position is possible).
- `buildProposal` makes the accepted design (parsed tables, links, custom types; matching tables keep id, position, colour, width, expanded, area; areas, notes, views, dependencies kept) and the preview design (accepted plus removed tables as ghosts plus removed links resolved by name). New tables go in one column 150 px right of the right-most table.
- Canvas: `CanvasHooks.diff?: DiffMarks { design, tables, links }`. The canvas draws `diff.design`; entity cards and link lines read through `useShown`. While a diff is shown the canvas is not editable (the extra tables are not in the store). Marks: ring, badge with tooltip, coloured name; lines green/red, stroke 3.
- Preview state lives in a small zustand store (`preview-store.ts`), written by the DBML section, read by `canvas-slot.tsx`.
- Accept uses `replaceDesign(design, { history: 'step' })`, i.e. the existing `design.replace` command: one undo step, exact inverse. No new command.
- Leaving: unmount, panel closed or another section selected clears the preview.

## Open items
- EDT-242: a renamed table is not shown as old struck through, arrow, new name.
- The loading overlay while Accept runs (spec 16.1) is not built: accept is synchronous.
- Tables with no columns are not in the DBML export, so editing the text and accepting removes them.
- Added tables are placed in one column; large additions may need Auto Arrange.
- Detailed per-field diffs (re-sync flow) are not built.
- Interaction on preview-only tables (selecting, hover cards for ghost columns) is limited; hover notes read the store design.
