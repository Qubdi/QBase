# UI review fixes

Fixes for rewrite/review/ui.md (items 1 to 13) and rewrite/phase9/browser-findings.md (items 1 to 5).
Checks at the end: `tsc -b` 0 errors, `npm run lint` clean, `npx vitest run` 241 files / 3092 tests pass,
`tools/e2e/run-smoke.sh` 14/14, `tools/e2e/run-flows.sh` 60/60 (58 plus two new steps; the two
Escape steps were reworked). Screenshots of the edit card, German rail, DBML diff, import dialog and phone bar were looked at.

## ui.md

| # | Status | What changed | Test |
|---|--------|--------------|------|
| 1 | fixed | `src/canvas/capture-mode.ts`: `holdFullRender()` makes the surface draw every node (`onlyRenderVisibleElements={!fullRender}`). `captureDiagram` holds it, waits until the node and line count is stable for 3 frames, captures, then releases (finally). | `src/canvas/capture-mode.test.tsx` (table 90000 px away is absent, present while held, absent after); flow `F8 02b SVG export holds tables that are off screen` (zoomed in so tables leave the page, the SVG still names all three) |
| 2 | fixed | Arrow-key moves: after the last arrow key goes up, 300 ms later (`ARROW_COMMIT_MS`) `finishGesture` commits the live positions as one edit. Not while a pointer drag or resize runs (`markGesture`). | `src/canvas/review-ui.test.tsx` "five arrow presses become one edit"; flow `F2 08 arrow keys move a table, one undo puts it back` |
| 3 | fixed | `escapeIsFree` (`src/canvas/keyboard.ts`): ignores `defaultPrevented` and keys from inside listbox/menu/popper content. Used by the canvas handler and the quick-link card; link popover and pointer menu also check `defaultPrevented`. | `review-ui.test.tsx` "a prevented Escape leaves the editing state alone"; flow `F2 06/07` now checks that Escape closes only the colour popover, a second one closes the card |
| 4 | fixed | `DebouncedInput`/`DebouncedTextarea` flush a pending text on unmount. A required box left empty snaps back to the saved text on blur. | `src/platform/panel/debounced-input.test.tsx` (3 tests) |
| 5 | fixed | `canvasKeysAllowed` for Delete/Backspace/Mod+C/Mod+V: not in text boxes, not while a dialog/menu/listbox is open, not from inside one, not from a focused button or link. | `review-ui.test.tsx` "keeps the selected tables when a button in a dialog gets Backspace", "skips Delete when a plain button ... has the focus" |
| 6 | fixed | `src/canvas/use-clamped.ts` (`useClampedPlacement`, visual viewport, 8 px edge) used by the quick-link card, link popover and pointer menu (max width = window less 16 px; the link popover wraps). | `src/canvas/use-clamped.test.tsx` |
| 7 | fixed (keyboard route for the dots: not done, see below) | Header buttons are always in the page (no `display:none`) and drawn on hover, focus-within, selection and `pointer-coarse`; bigger hit area on touch. Field dots visible on focus-within, selection and touch, 10 px dot with a `::after` hit layer, 14 px on touch. | `review-ui.test.tsx` "header actions are reachable without a hover"; phone screenshot shows the dots |
| 8 | fixed | DBML Accept is disabled while a newer edit waits for its parse (`stale`); `accept` also refuses then. | `dbml-section.test.tsx` "Accept applies the text on screen" |
| 9 | fixed | `replaceDesign` 'reset' and 'keep' check read-only and open-only before swapping ('step' already did). | `src/store/store.test.ts` "replaceDesign honours the locks in every mode" |
| 10 | fixed | Rename of the open diagram checks `result.ok` and shows the destructive toast ("This diagram cannot be edited"). | `designs-dialogs.test.tsx` "review ui 10" |
| 11 | fixed | JSON export goes through `safeFileName`; `safeFileName` also handles dots-only, trailing dots/spaces and Windows device names. | `src/features/export/__tests__/download-file.test.ts` |
| 12 | fixed | `exportRatio` (`export-options.ts`) caps side (16000) and area (16 M px); a lowered scale shows the toast `editor.exporting.image.lowered` (added in English and the 20 other languages). | `export-options.test.ts` "review ui 12" |
| 13 | fixed except one item | pointer menu: focus moves in, Arrow/Home/End, focus returns on close; panel handle `touch-none` and `aria-valuetext`; table row toggle label includes the table name (tests updated to a prefix match); Ctrl+Y redoes (Windows/Linux, not in text boxes); field card ignores the emulated mouseenter after a touch; filter panel closes on Escape; navbar diagram name no longer saves after Escape (`cancelled` ref, as in InlineName). | `menus.test.tsx` "pointer menu is keyboard operable", `shortcuts.test.ts` "Ctrl+Y", `review-ui.test.tsx` "field card on touch". No unit test for the DiagramName Escape/blur and the panel handle attributes (browser behaviour). |

Not done, with reason:
- 7, keyboard route for the field connection dots: xyflow handles are plain `div`s that cannot take focus. The keyboard way to
  start a relationship is the pointer menu (now keyboard operable) with "draw relationship", and the table header buttons
  are now focusable. A real focusable handle would need a custom handle component.
- 3, a second Escape pressed within about 150 ms of the first one is ignored while the closing popover is still mounted
  (its exit animation); the flow waits for the popover to detach.

## browser-findings.md

| # | Status | What changed | Test |
|---|--------|--------------|------|
| 1 | fixed | Edit card is `26rem` wide (field names have room), limited in height to the area above the toolbar, scrolls inside, and the view pans to show all of it (`revealShift`, `safeArea` in `diagram-canvas.tsx`). | `src/canvas/geometry.test.ts`; flow `F2 04` checks the card lies inside the window and above `.qb-toolbar` |
| 2 | fixed | Rail is 72 px wide, labels longer than 9 characters use 10 px tight text and no side padding, wrap anywhere as a last resort, and carry a `title`. "Beziehungen" now fits on one line. | `review-ui-layout.test.tsx` (German label) |
| 3 | fixed | While a preview is shown the canvas draws everything (so preview-only tables are measured); preview tables are reported to the measure book (minimap and fit need the size); the view fits once per new set of added tables. | `src/canvas/diff-fit.test.tsx`; flow `F5 02` checks the table is fully in view and the minimap has 4 nodes |
| 4 | fixed | Phone bar is two grid rows (84 px): logo, name and language on the first, menus plus save/lint controls (scrolling sideways) on the second. DOM order kept as SHL-068 requires. | `review-ui-layout.test.tsx` |
| 5 | fixed | The engine's "Found N tables to import." info line is no longer listed; the counts line stays. | `p8-imp-box.test.tsx` "browser finding 5" |

Flow adjustments caused by the fixes: F1 05 clicked the pane at a spot that the wider rail moved under the minimap (now x 300, y 600).
