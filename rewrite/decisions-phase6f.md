# Phase 6f decisions: editor gaps closed (owner to confirm)

Every item below was open or "owner to decide". Each takes the sensible option, is covered by tests,
and is easy to reverse. Owner to confirm.

## Decisions
- **EDT-048 full screen (open question 1): add the button.** The toolbar ends with a Full Screen /
  Exit Full Screen toggle that uses the browser's full-screen mode on the whole page. It follows the
  browser (Escape leaves it and the button follows) and is not drawn where the browser offers no full
  screen (`document.fullscreenEnabled` false). To drop it, remove the `full` block in
  `src/canvas/toolbar.tsx`.
- **EDT-008 minimap on phones:** below the `md` breakpoint the minimap is 60 px high (CSS in
  `chrome-style.tsx`).
- **EDT-009 long-press:** the canvas already opened its menus on a half-second hold. The side panel has
  no right-click menus (spec 2.11 is canvas only), so a hold on a Tables, User types, Areas or Notes row
  opens that row's existing "..." actions menu (`src/platform/panel/hold-menu.ts`). A hold in a text
  field is left alone; after a hold the tap that follows is cancelled.
- **EDT-150 check constraints (open question 15): hide or warn.** `traitsOf(...).hasChecks` is false
  for the open-only databases (Oracle, ClickHouse), the only ones whose SQL export writes no checks.
  There a table without checks does not show the section; a table that has some shows them with a
  warning and no Add button. Every other database is unchanged.
- **EDT-137 re-order from the canvas edit card:** the card shows the same form as the side panel, so
  the drag handles (and the keyboard sensor) are already there; a test now says so. No new code.
- **EDT-139 deleting a field used in a relationship (open question 6): remove the relationships with
  it** (core already does, and undo restores both) **and say so** with a toast "Relationships removed
  with the field: N. Undo brings them back." (not a confirmation dialog: deleting stays unconfirmed,
  EDT-138).
- **EDT-242 renames:** a removed and an added table in the same schema whose fields, indexes and checks
  are identical and that have no other twin are one renamed table. It keeps id, position, colour and
  area, counts as "changed", and the canvas draws the old name struck through, an arrow, then the new
  name. A rename together with another change is still removed plus added (no way to tell). Relationship
  lines to a renamed table are matched under the old name, so they are not shown as changed.
- **DBML Accept:** a loading overlay (spinner, "Applying changes...") is painted for 30 ms
  (`APPLY_DELAY_MS`) before the replace runs. The replace itself is still one undo step.
- **Tables without fields survive an accepted DBML edit:** they are not in the DBML text, so their
  absence is not a removal; `buildProposal` keeps them as it keeps views.
- **Add view** in the Add table menu is a drag source for a view (same drag type as Add table).
- **HydrateFallback:** every lazy route has `HydrateFallback` (a centred spinner), which removes the
  react-router warning on start.
- **Cleanups:** `src/components/empty-state` was imported by nothing and is deleted. The placeholder
  database icon (two letters on a colour) is now a database drum on the colour.

## The 15 MB chunk (Phase 6 item "Monaco")
- Monaco is no longer imported by any component (only the unused `useBundledMonaco` hook and its
  `config.ts` in `src/components/code-snippet` still mention it). The 15.6 MB chunk in the build
  (`import-dbml-*.js`) is `@dbml/core`, not Monaco. It is already lazy: neither `index.html` nor the
  first route preloads it; it loads with the import dialog (`import-box`, 38 kB) or the DBML section.
- Not done: loading it only when the DBML method is picked in the import dialog needs
  `analyze-import.ts` to import `importDbml` on demand; that file belongs to the import work, so it is left.
- Owner: delete `src/components/code-snippet`, `monaco-editor` and `@monaco-editor/react` if no code
  editor is planned.
