# Phase 6d decisions (side panel, forms, clipboard)

From the side-panel agent's report (2026-11-07), accepted by the assistant on the owner's standing
instruction to decide small things autonomously.

## Accepted choices

- Every edit goes through `store.edit(command)` with the core planners; the model-based clipboard
  (`features/clipboard`) is the one the editor uses. The old wire-shaped `src/lib/table-clipboard.ts`
  and `src/hooks/use-table-clipboard.ts` remain only because their tests are acceptance tests; delete
  the pair and their tests in Phase 9 (the owner agrees by default unless told otherwise).
- Check constraints are shown for every database (EDT-150: flag or hide for databases whose export
  ignores them is a Phase 9 polish item).
- DBML editing with a diff preview (EDT-239 to 247) is not built: the DBML section is read-only DBML
  with a standard/inline refs switch and a copy button. Owner: the workspace owns it later
  (Phase 6e, "DBML apply").
- The Add Table split button (Add View) does not open the new row. Hiding a group in the filter panel
  hides by table id, not by future area members.
- EDT-137 and EDT-139 ("change", undecided by the owner): not implemented in the UI; core removes the
  links that use a deleted column.

## Wiring still to do (assigned to the canvas hookup step)

- Workspace: render `<SidePanel viewportOrigin onFocused />` in `SidePanelSlot` and `mobile-panel.tsx`;
  mount `useEditorClipboard()` once under the store provider.
- Canvas: render `<FilterPanel>`, use `isFilterActive` and `hidesEverything`, handle `ui.focus` for
  regions and memos, use the new `FieldHoverCard` props.
- Store: an action to clear `expandedEntityId`; an optional viewport origin in the `ui` slice.
