# Where the side-panel popups open

Decided 2026-11-18.

## The question

The column type list opens with its left edge on its button and grows to the right, over the
canvas, so the list it was opened from stays in view. The description popover, Field Attributes,
Index Attributes, Check constraint and the "..." menus all hung on their button by the **right**
edge, so they grew to the left and sat on top of the names and types of the rows being edited. The
colour picker had no alignment of its own and was centred on its swatch. How should they open?

The side panel is on the left of the window and the canvas is to its right, so growing to the right
is growing toward the canvas.

The options were drawn with the app's own colours and sizes (rail 52 px, panel 350 px, the popup
widths of the code) in [`options.html`](options.html): one tab for each popup, a light and a dark
theme. The pictures are of that page, not of the running app.

## Chosen: A, Like the column type

Left edge on the button, opens below it (above, where the button is at the bottom of the panel),
grows to the right.

- Where: the defaults of the two shared pieces, so every popup follows the rule and a new one does
  too without being told. `src/platform/ui/popover.tsx` (`PopoverContent`, `align = 'start'`) and
  `src/platform/ui/dropdown-menu.tsx` (`DropdownMenuContent`, `align = 'start'`). The `align="end"`
  was taken off the side-panel popups: `description-popover.tsx`, `attributes-popover.tsx`,
  `indexes-editor.tsx`, `checks-editor.tsx`, and the menus of `table-row.tsx`, `tables-section.tsx`,
  `user-types-section.tsx` and `visuals-section.tsx`. The colour picker had no `align`, so it follows
  the default.
- What did not change: sizes, contents, animation, Escape and click-outside closing, and where a
  popup goes when there is no room (the browser flips or shifts it, as it does for the type list).
- At the right edge of the window the old rule stays, because there is no room to the right:
  `align="end"` on the account menu, the language picker, the app menu, the type legend on the
  canvas, and the menus of the project and design lists and the admin page.
- The select lists inside the popups ("Max length", Index Type) open under their own field at its
  width and are not part of this.
- Tests: `src/features/tables/__tests__/popup-side.test.tsx` opens each popup and checks the
  position Radix reports (`data-align="start"`), and that the primitives default to it and still
  take `align="end"`. Where the popup lands needs layout, so it is not checked by a test.
- Not decided: Index Attributes has no divider under its heading and a smaller corner radius than
  Field Attributes and Description. Only the position was changed.

## The other option, not chosen

| | Look | Why not |
| --- | --- | --- |
| Today | Right edge on the button, grows to the left | Covers the rows being edited (the reason for this record). |
| B | Every popup at the panel's right edge, level with its row, on the canvas | The tidiest (one place for all), and it never covers the list. But it is not what the type list does, it needs the panel as a shared anchor, and the popup ends up far from the small icon that opened it. |

### Recipe for B, if it is wanted later

Not tried in code. Make the panel's element available through a context, give each popup
`side="right"` and `align="start"`, and anchor it to the panel with Radix's `PopoverAnchor`
(`virtualRef`) for popovers and the equivalent for menus, with the vertical position taken from the
row. Open `options.html` and choose a tab to see where each popup would land.

## Regenerating the pictures

`options.html` opens in any browser. `options.html?tab=field&theme=dark` picks the popup and the
theme (`tab` is `desc`, `field`, `index`, `check`, `menu` or `color`), `&only=a` shows one card
(`ref`, `today`, `a`, `b`), and `&shot=1` hides the page text. The pictures were taken with headless
Edge:

```
msedge --headless=new --window-size=1120,2300 --screenshot=sheet-field.png "file:///.../design/popup-side/options.html?tab=field&shot=1"
```
