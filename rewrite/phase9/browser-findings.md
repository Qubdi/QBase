# Browser findings (tools/e2e/flows.mjs)

Found by the real-browser flows and not fixed yet. Screenshot names are from
`/tmp/qbase-flows` (run `tools/e2e/run-flows.sh`; the numbers can shift when steps are added).

1. Edit card runs off the bottom of the window. A table near the middle of the screen opens an edit card taller
   than the space below it; the card's lower part (Add field, indexes) sits under the canvas toolbar and cannot
   be reached without panning. The field name boxes are also narrow ("order_i" is cut).
   Screenshots: `008-edit-card.png`, `009-duplicate-warning.png`.
2. German rail label is clipped. "Beziehungen" under the Links icon is wider than the 56 px rail and is cut on
   both sides. Other long translations will do the same. Screenshot: `034-german.png`.
3. DBML preview: a table that exists only in the preview ("warehouses") is drawn at the right edge, half outside
   the window, the canvas does not pan to it and the minimap leaves it out. Screenshot: `024-dbml-diff.png`.
4. Phone navbar takes three rows (about 150 px): menu bar, lint badge, then the diagram name. Little canvas is
   left on a 390x844 screen. Screenshot: `041-phone-canvas.png`.
5. Import into an open diagram shows two lines that say the same thing ("Found 2 tables to import." and
   "Found 2 tables and 0 relationships."). Screenshot: `028-import-open-dialog.png`.
