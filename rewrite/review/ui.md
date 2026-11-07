# UI review: canvas, workspace, features, editor page, platform

Branch rewrite/clean-room, read-only review. Scope: src/canvas, src/workspace, src/features, src/pages/editor-page, src/platform.
"Confirmed" means read in code and, where noted, reproduced with a throwaway vitest run in docker (scratch files live in the session scratchpad, nothing under src was touched). Nothing here was run in a real browser.

## Ranked list

1. HIGH  Image and SVG export drops every table that is off screen (capture-image.ts:49, diagram-canvas.tsx:623)
2. MED   Keyboard moves of a table (arrow keys) are never committed (diagram-canvas.tsx:517, 531)
3. MED   Canvas Escape handler ignores `defaultPrevented`; closing a popover closes the table editor and drops pending edits (diagram-canvas.tsx:402)
4. MED   Debounced editors lose the last edit when unmounted without a blur (debounced-input.tsx:51)
5. MED   Canvas Delete/Backspace/Mod+V fire while a dialog or any non-text control has focus (diagram-canvas.tsx:411-435)
6. MED   Quick-link card, link popover and pointer menu are not kept on screen (quick-link-card.tsx:101, link-popover.tsx:70, pointer-menu.tsx:81)
7. LOW-MED  Controls that exist only on hover: table header actions and field connection dots (entity-node.tsx:229, field-row.tsx:26)
8. LOW-MED  DBML Accept applies an older parse than the text on screen (dbml-section.tsx:158)
9. LOW   Store `replaceDesign` in 'reset' mode skips the read-only and open-only guards (editor-store.ts:206)
10. LOW  Rename in the Open dialog is silently dropped for the open diagram when it is locked (open-design-dialog.tsx:104)
11. LOW  JSON export file name is not passed through safeFileName (export-json-dialog.tsx:62, file-export.ts:8)
12. LOW  Large PNG/JPEG exports can exceed the canvas area limit on phones (capture-image.ts:17, 128)
13. LOW  Smaller a11y/touch items (see the end)

## Findings

### 1. Export misses off-screen tables (HIGH)
- capture-image.ts:49-62 `measureNodes` reads `.react-flow__node` elements from the DOM, and `toSvg/toPng` serialise `.react-flow__viewport`. diagram-canvas.tsx:623 sets `onlyRenderVisibleElements`, so xyflow removes nodes and edges outside the current viewport from the DOM.
- Scenario: a 40 table diagram, zoom to 100% on a corner, File > Save as > PNG (or SVG, which exports at once with no dialog). `diagramBounds` is computed from only the rendered nodes, so the picture holds just the tables on screen plus a margin. Tables and links that were off screen are missing and nothing warns the person. The code comment says "the view is left alone", so the author assumed all nodes are in the DOM.
- Fix: before capture, turn the prop off for the capture (a store flag the Surface reads, wait two frames, then capture, then restore), or do a `fitView` with duration 0 first. A capture-only flag is safer because it also keeps the user's view. Add a test that exports with a design larger than the viewport.
- Status: confirmed by reading the code and the xyflow prop. Not run in a browser.

### 2. Arrow-key moves are lost (MED)
- xyflow 12.12 moves the selected node on arrow keys (node_modules/@xyflow/react/dist/esm/index.js:2323, `moveSelectedNodes`). That path calls `updateNodePositions` and emits `position` changes only; it never calls `onNodeDragStop`.
- diagram-canvas.tsx:200-209 turns position changes into `live` state, and the only commit points are `onNodeDragStop` and `resizeEnd` (`finishGesture`).
- Scenario: keyboard user selects a table, presses ArrowRight five times. The table moves on screen, but the store, the undo history, autosave and any reload never see it. The old position comes back after a reload. Worse, `live.positions` stays set, so the next unrelated drag commits all the stale keyboard moves with it.
- Fix: commit on `keyup` of an arrow key (debounced ~300 ms) when `live.positions` is not empty and no pointer drag is running, or set `disableKeyboardA11y` for node movement and offer arrow-key moves through a canvas command that calls `edit`.

### 3. Escape closes more than the person asked (MED)
- diagram-canvas.tsx:402-408: the window `keydown` handler cancels the link draft, the link popover, the table editor and the rename on every Escape. It does not check `event.defaultPrevented`.
- Radix `DismissableLayer` handles Escape for selects, popovers and dialogs and calls `event.preventDefault()` (node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs:92-97). The event then still reaches the window handler.
- Scenario: the table card is open on the canvas (EntityEditor), the person opens the type drop-down and presses Escape to dismiss it. The drop-down closes and the whole table card closes too. If they had just typed in the name box (1000 ms debounce, see finding 4), that edit is lost. The same pattern is in quick-link-card.tsx:42-47 (a document-level Escape that calls `done()` while its own OptionSelect is open).
- Fix: `if (event.defaultPrevented) return;` first in both handlers, and register the canvas handler only for events whose target is inside the canvas host or the body.

### 4. Debounced editors drop the pending text on unmount (MED)
- platform/panel/debounced-input.tsx:51: `useEffect(() => () => clearTimeout(timer.current), [])` clears the timer and never flushes. Commit happens only from the timer or from `onBlur`.
- Reproduced: a vitest with fake timers typed "abc" into `DebouncedInput` (delay 1000), unmounted after 200 ms, and `onCommit` was called 0 times.
- Scenario: table name in the canvas card (`delay={1000}`, entity-editor.tsx:110), field names and descriptions in the panel (300 ms). Type, then close the card with Escape (finding 3), or switch diagram, navigate back (Alt+Left), or close the mobile drawer by swipe before the timer fires. Whether a blur fires on removal differs between browsers, so the loss is browser dependent; the mouse path (click on Done or on another row) blurs first and is fine.
- Related, low: with `required` and an empty box, blur commits nothing and the box keeps showing an empty name while the model keeps the old one. The box should snap back to `value` on blur.
- Fix: in the cleanup call the same logic as `flush` (read `latest.current`), and on blur reset `text` to `value` when the commit is refused.

### 5. Canvas shortcuts are not guarded the way the workspace ones are (MED)
- diagram-canvas.tsx:411-435 uses `isTypingTarget` (input, textarea, select, contenteditable) only. The workspace listener (use-workspace-shortcuts.ts:9-12) also stops when a `role=dialog` is open; the canvas one does not.
- Scenario A: select three tables, open any dialog (Settings, Export, Open diagram), tab to a button and press Backspace or Delete. `deleteSelection` removes the three tables behind the dialog. Scenario B: an AlertDialog with focus on its button, Ctrl+V pastes a copied table behind it.
- Scenario C (same cause): after clicking a table row's chevron in the side panel the focus is on a button; Backspace deletes every selected table.
- Fix: share one guard (`typing target || modal open || target inside [role=dialog|menu|listbox]`) between the two listeners, and consider requiring the canvas host (or body) to hold focus for Delete/Backspace. The deletion is one undo step, so this is not data loss for a person who knows Ctrl+Z.

### 6. Floating cards can be placed off screen (MED, phones)
- quick-link-card.tsx:101-103 (`fixed`, `left: anchor.x`, w-72), link-popover.tsx:70-72 and pointer-menu.tsx:81-83 use the pointer position directly with no clamp.
- Scenario on a 360 px phone: tap "Draw relationship", then tap a target table on the right half. The 288 px card starts at x>180 and its right side, including the Create button, is clipped and cannot be scrolled to. A context menu long-pressed in the lower third has the same clipping (the pane menu has about 12 lines).
- Fix: measure the card after mount (or use a small helper) and clamp `left/top` into `visualViewport` with 8 px margin; on narrow screens render the quick-link card as a bottom sheet.

### 7. Hover-only controls (LOW-MED, a11y and touch)
- entity-node.tsx:229 `hidden ... group-hover:flex` hides the "open in panel" and "widen" buttons with `display:none`, so they cannot take keyboard focus and are unreliable on touch. Double click is the only way to open the card editor; there is no keyboard route on the canvas (the table list in the panel is the workaround).
- field-row.tsx:26 connection dots are `opacity-0` until row hover and are 10 px; on a phone the person cannot see or hit them. The long-press menu has "draw relationship" for table-to-table, but field-to-field dragging is effectively desktop only.
- Fix: show them on `focus-within` and when the table is selected; use `group-focus-within:flex`; enlarge dots on `pointer: coarse`.

### 8. DBML Accept can apply a stale parse (LOW-MED)
- dbml-section.tsx:149-175: `type()` schedules `parse` 1000 ms after typing; `accept()` clears that timer and applies `pending.parsed`, which belongs to the previous parse.
- Scenario: type text A, wait for the preview, then edit to B and click Accept within one second. The design gets A while the box shows B, and the person sees no sign of it.
- Fix: in `accept`, if the timer is pending, parse `draft` first (or disable Accept while `timer.current` is set).

### 9. `replaceDesign` 'reset' mode has no lock check (LOW)
- editor-store.ts:206-212: 'step' goes through `dispatch` (guarded), 'keep' checks `session.readonly`, but the default 'reset' path sets the design unconditionally and ignores both read-only and open-only. Callers: import-database-dialog.tsx:66, clear-design-dialog.tsx:40, editor-api.ts:109.
- Scenario: the Import dialog is open and access turns read-only (AccessBanner, the Open dialog's delete sets read-only for the open diagram); pressing Apply still rewrites the design. The menu items are disabled when locked, so this needs a state change while a dialog is open.
- Fix: check `get().session.readonly` and `isOpenOnly` in the 'reset' branch as well, or route import/clear through `edit` with a flag that clears history.

### 10. Silent drop of a rename (LOW)
- open-design-dialog.tsx:104-109: for the open diagram it calls `store.edit({type:'design.rename'})` and ignores the result. In a read-only or open-only diagram the edit is refused, the dialog closes and the old name stays with no message.
- Fix: check `result.ok` and show the destructive toast (as `useEditorEnv.edit` does), or hide the rename action when `selectLocked`.

### 11. JSON export name (LOW)
- export-json-dialog.tsx:62 passes `file.fileName` (`QBase(<name>).json`, core/wire/file-export.ts:8) straight to the download. SQL and image exports use `safeFileName`. Browsers sanitise `download` themselves, so the practical effect is only inconsistent names (`/`, `:` replaced by the browser differently). Apply `safeFileName` to be consistent. `safeFileName` also keeps names like `..` or trailing dots and Windows device names (`CON`); consider handling them.

### 12. Export size on phones (LOW)
- capture-image.ts:17,128: only the longest side is capped (16000 px). Safari on iOS limits canvas area (about 16.7 million pixels), so a 4x export of a medium diagram yields a blank or failed image (the error toast shows, so no silent loss). Cap by area too.

### 13. Smaller items
- pointer-menu.tsx: `role=menu` with no focus move, no arrow-key navigation, no Escape return of focus; keyboard users who open it with the context-menu key cannot operate it.
- editor-frame.tsx:46 PanelHandle has no `touch-none`, so on a tablet (>= 768 px) drag starts a pan and the browser cancels the pointer; no `aria-valuetext`.
- table-row.tsx:62 every row's toggle button has the same label (`tables.toggle`) without the table name.
- use-workspace-commands.ts: redo has Ctrl+Shift+Z only (no Ctrl+Y, the usual Windows key). Not a bug, noted for parity.
- field-row.tsx:75: the field card tooltip opens on `mouseenter`; on touch the emulated mouseenter keeps it open until another tap.
- filter-panel.tsx:66: `role="dialog"` floating panel that Escape does not close.

## Checked and found sound (dropped)
- Hostile input. Throwaway vitest runs on `importFileText` and `analyzeImport`: ids named `__proto__`/`constructor`/`toString`, a raw `"__proto__"` key, 200k-deep arrays (refused as invalid), 100k nested parentheses in SQL, 5000 table SQL (1.5 s), 3000 table DBML (1.0 s), 100k-deep nested metadata, repair-text with 200k braces: none polluted `Object.prototype`, none threw out of the analyzer, none hung. One edge: a JSON diagram file whose unknown key holds a 5000-deep object makes `importFileText` throw a `RangeError` instead of `ImportError`; the dialog catches it and shows the generic failure message, so it is cosmetic. Big pastes parse on the main thread (the UI freezes for a second or two) but are bounded.
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `window.open` in the scoped folders. Memo text, table names, comments and diagnostics render as React text. SVG export goes through html-to-image serialisation of the live DOM, so names cannot inject markup.
- Event listeners: every `addEventListener` in scope has a matching remove (shortcuts, long press, link draft, popover, pointer menu, fullscreen, media query). The ResizeObserver is disconnected.
- Read-only: `edit`, `editWithoutHistory`, undo and redo all go through `dispatch` with `readOnly`/open-only checks (core/commands/apply.ts:65), so the unguarded canvas actions (delete, drop, paste, duplicate) are refused in locked sessions; finding 9 is the exception.
- Inline names (`InlineName`, memo editor) use a `done` guard so Escape followed by a blur does not save.
- DiagramName (navbar): Escape sets `editing=false` while `onBlur` calls `save()`; if a browser fires blur on removal of the focused input the typed draft would be saved despite Escape. I could not confirm this without a real browser, so it is not ranked; adding the same `done` ref as `InlineName` would remove the doubt.
