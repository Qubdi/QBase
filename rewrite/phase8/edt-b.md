# Phase 8, slice edt-b: EDT-134 to EDT-278 (unticked rows)

132 unticked rows. Existing proof found for 108 rows, 17 rows proved by new tests, 5 dropped, 1 manual, 1 missing, 0 fixed (no bug found).
New tests (28, all pass, eslint clean, tsc 0 errors):
src/core/commands/p8-edt-b-model.test.ts, src/features/tables/__tests__/p8-edt-b-indexes.test.tsx,
src/features/user-types/__tests__/p8-edt-b-types.test.tsx, src/workspace/__tests__/p8-edt-b-menus.test.tsx.
Rows whose test sits in a describe block that names the ID are listed with the first test of that block.

| ID | class | proof |
| --- | --- | --- |
| EDT-134 | covered | src/core/commands/commands.test.ts::EDT-134 a primary key is not null; the first one is also unique; several are allowed |
| EDT-135 | covered | src/core/commands/commands.test.ts::EDT-135 an edit repairs a nullable primary key from old data |
| EDT-136 | covered | src/core/commands/commands.test.ts::EDT-136 reordering columns keeps the primary-key index in column order |
| EDT-138 | covered | src/core/commands/commands.test.ts::EDT-138 / EDT-139 deleting a column |
| EDT-140 | covered | src/features/tables/__tests__/table-editor.test.tsx::indexes and checks are not offered for a view (EDT-140, EDT-147) |
| EDT-141 | covered | src/core/commands/commands.test.ts::EDT-141 a new index is btree on PostgreSQL and has no method elsewhere |
| EDT-142 | covered | src/features/tables/__tests__/p8-edt-b-indexes.test.tsx::EDT-142 the Index Attributes popover > has Name, Unique, Index Type, a description and Delete (new); also src/features/tables/__tests__/unique-index-types.test.tsx (the Unique toggle and switch are greyed for a field type the database cannot index, and for an index type that cannot be unique) |
| EDT-143 | covered | src/features/tables/__tests__/p8-edt-b-indexes.test.tsx::EDT-143 Index Type only where the database has a choice (new); also src/core/commands/p8-edt-b-model.test.ts::EDT-143 / EDT-276 per-database features |
| EDT-144 | covered | src/core/commands/commands.test.ts::DAT-044 / EDT-144 gin needs array, json, jsonb, tsvector or hstore columns; removing one resets the method |
| EDT-145 | covered | src/core/commands/commands.test.ts::EDT-145 the primary-key index cannot be edited by hand and sits first |
| EDT-146 | covered | src/core/commands/commands.test.ts::EDT-141 to EDT-146 indexes |
| EDT-147 | covered | src/features/tables/__tests__/table-editor.test.tsx::indexes and checks are not offered for a view (EDT-140, EDT-147) |
| EDT-148 | covered | src/core/commands/commands.test.ts::EDT-148 / EDT-151 check constraints |
| EDT-149 | covered | src/core/commands/p8-edt-b-model.test.ts::EDT-149 check expressions are not validated > accepts any text, including a broken expression (new) |
| EDT-151 | covered | src/core/commands/commands.test.ts::EDT-148 / EDT-151 check constraints |
| EDT-152 | covered | src/canvas/entity.test.tsx::EDT-152, EDT-157: field dots are offered in an editable table, never on a view |
| EDT-153 | covered | src/core/commands/commands.test.ts::EDT-153 / EDT-167 a new link is one to one and named from the source |
| EDT-154 | covered | src/core/commands/commands.test.ts::EDT-154 incompatible types are refused |
| EDT-155 | covered | src/canvas/links.test.tsx::EDT-155, EDT-168: a pair that is already joined, in either direction, says so and adds nothing |
| EDT-156 | covered | src/canvas/links.test.tsx::EDT-156: a connection with no field dot at the end creates nothing |
| EDT-157 | covered | src/core/commands/commands.test.ts::EDT-157 a view cannot take a link |
| EDT-158 | covered | src/canvas/menus.test.tsx::EDT-158, EDT-162: Add relationship draws a line; Escape cancels it |
| EDT-159 | covered | src/canvas/menus.test.tsx::EDT-159, EDT-160: clicking a target table hands the workspace a card with both tables |
| EDT-160 | covered | src/canvas/menus.test.tsx::EDT-159, EDT-160: clicking a target table hands the workspace a card with both tables |
| EDT-161 | covered | src/canvas/links.test.tsx::EDT-160, EDT-161: confirming a new name adds the field and the link in one undo step and selects the line |
| EDT-162 | covered | src/canvas/menus.test.tsx::EDT-158, EDT-162: Add relationship draws a line; Escape cancels it |
| EDT-163 | covered | src/core/commands/commands.test.ts::EDT-153 to EDT-170 links |
| EDT-164 | covered | src/features/links/__tests__/refs-section.test.tsx::field picker waits for its table (EDT-164) |
| EDT-165 | covered | src/features/links/__tests__/refs-section.test.tsx::says No tables found when there are none (EDT-165) |
| EDT-166 | covered | src/core/commands/commands.test.ts::EDT-153 to EDT-170 links |
| EDT-167 | covered | src/core/commands/commands.test.ts::EDT-153 / EDT-167 a new link is one to one and named from the source |
| EDT-168 | covered | src/core/commands/commands.test.ts::EDT-168 / DAT-050 a second link between the same two columns, in either direction, returns the first |
| EDT-169 | covered | src/core/commands/commands.test.ts::EDT-169 compatible types: equal, or the short list |
| EDT-170 | covered | src/core/commands/commands.test.ts::DAT-047 / EDT-170 / EDT-176 the many side is always the target: N:1 swaps and stores 1:N |
| EDT-171 | covered | src/canvas/links.test.tsx::EDT-171: the line leaves the edges that face each other |
| EDT-172 | covered | src/canvas/links.test.tsx::EDT-172: a self link loops out of one side and parallel lines are offset |
| EDT-173 | covered | src/canvas/links.test.tsx::EDT-173: ends carry a bar for one and a foot for many; the preference hides them |
| EDT-174 | covered | src/canvas/links.test.tsx::EDT-026, EDT-174: a selected line takes the picked colour and shows a dot to open the popover |
| EDT-175 | covered | src/canvas/links.test.tsx::EDT-175: the popover offers 1:1, 1:N, switch tables, open in sidebar and delete |
| EDT-176 | covered | src/core/commands/commands.test.ts::DAT-047 / EDT-170 / EDT-176 the many side is always the target: N:1 swaps and stores 1:N |
| EDT-177 | covered | src/core/commands/commands.test.ts::EDT-177 switch tables swaps the ends; an old N:1 ends as 1:N |
| EDT-178 | covered | src/features/links/__tests__/refs-section.test.tsx::EDT-178 EDT-179 EDT-181 a relationship row |
| EDT-179 | covered | src/features/links/__tests__/refs-section.test.tsx::EDT-178 EDT-179 EDT-181 a relationship row |
| EDT-180 | covered | src/features/links/__tests__/refs-section.test.tsx::EDT-180 filtering the list |
| EDT-181 | covered | src/core/commands/commands.test.ts::EDT-181 delete a link and undo |
| EDT-182 | covered | src/features/links/__tests__/refs-section.test.tsx::EDT-182 an empty Refs list |
| EDT-183 | dropped | owner decision |
| EDT-184 | dropped | owner decision |
| EDT-185 | dropped | owner decision |
| EDT-186 | dropped | owner decision |
| EDT-187 | covered | src/pages/editor-page/side-panel/side-panel.test.tsx::EDT-002 EDT-003 EDT-187 the panel shows the section the store names |
| EDT-188 | covered | src/features/user-types/__tests__/user-types-section.test.tsx::EDT-188 EDT-189 the section and New Type |
| EDT-189 | covered | src/core/commands/commands.test.ts::EDT-189 New Type adds type_N, an enum with no values |
| EDT-190 | covered | src/core/commands/commands.test.ts::EDT-189 to EDT-199 custom types |
| EDT-191 | covered | src/core/commands/commands.test.ts::EDT-189 to EDT-199 custom types |
| EDT-192 | covered | src/features/user-types/__tests__/user-types-section.test.tsx::adds enum values with Enter and removes them as chips (EDT-192) |
| EDT-193 | covered | src/features/user-types/__tests__/user-types-section.test.tsx::adds and removes composite fields (EDT-193) |
| EDT-194 | covered | src/core/commands/commands.test.ts::EDT-194 switching kind clears the data of the kind that is left |
| EDT-195 | covered | src/features/user-types/__tests__/p8-edt-b-types.test.tsx::EDT-195 the More actions menu of a custom type > offers Delete and no Highlight Fields (new; Highlight Fields dropped with EDT-196, MT-161) |
| EDT-196 | dropped | owner decision |
| EDT-197 | covered | src/core/commands/commands.test.ts::EDT-189 to EDT-199 custom types |
| EDT-198 | covered | src/core/commands/commands.test.ts::EDT-198 deleting a type leaves columns that used it as they are |
| EDT-199 | covered | src/features/user-types/__tests__/user-types-section.test.tsx::renames on Enter and deletes from the menu, undoably (EDT-199) |
| EDT-200 | covered | src/canvas/visuals.test.tsx::EDT-200: a new area is Area N, 300 x 200, with a palette colour, at the given point |
| EDT-201 | covered | src/canvas/visuals.test.tsx::EDT-201: an area is a tinted rectangle with a border and a name strip |
| EDT-202 | covered | src/core/model/model.test.ts::DAT-031 a table fully inside a region belongs to it; the top-most region wins |
| EDT-203 | covered | src/core/commands/commands.test.ts::EDT-036 / EDT-203 a move re-reads membership in the same step |
| EDT-204 | covered | src/canvas/arrange.test.ts::EDT-204: tables go into a tidy grid inside the area, which grows if needed |
| EDT-205 | covered | src/canvas/arrange.test.ts::EDT-205: No area moves a table to just outside the rectangle |
| EDT-206 | covered | src/canvas/visuals.test.tsx::EDT-206: a double click renames; Enter saves |
| EDT-207 | covered | src/core/commands/commands.test.ts::EDT-207 deleting an area keeps its tables and clears their membership |
| EDT-208 | covered | src/core/commands/commands.test.ts::EDT-200 to EDT-210 areas |
| EDT-209 | covered | src/core/commands/commands.test.ts::EDT-200 to EDT-210 areas |
| EDT-210 | covered | src/canvas/visuals.test.tsx::EDT-207, EDT-210: deleting an area keeps its tables, clears their membership, and undoes |
| EDT-211 | covered | src/canvas/visuals.test.tsx::EDT-211: a new note is empty, 200 x 150 and yellow, at the given point |
| EDT-212 | covered | src/canvas/visuals.test.tsx::EDT-212, EDT-216: a note has a coloured header, a pale body and says Empty note when empty |
| EDT-213 | covered | src/canvas/visuals.test.tsx::EDT-213: double click edits; clicking away saves; Escape abandons |
| EDT-214 | covered | src/features/regions-memos/__tests__/visuals-section.test.tsx::EDT-211 EDT-214 to EDT-216 the Notes tab |
| EDT-215 | covered | src/features/regions-memos/__tests__/visuals-section.test.tsx::EDT-211 EDT-214 to EDT-216 the Notes tab |
| EDT-216 | covered | src/canvas/visuals.test.tsx::EDT-212, EDT-216: a note has a coloured header, a pale body and says Empty note when empty |
| EDT-217 | covered | src/canvas/visuals.test.tsx::EDT-217: add, edit and delete of a note are undoable |
| EDT-218 | covered | src/workspace/__tests__/shortcuts.test.ts::keyboard shortcuts (EDT-217, EDT-218, EDT-256, SHL-032) |
| EDT-219 | covered | src/core/history/history.test.ts::EDT-219 undo and redo |
| EDT-220 | covered | src/core/history/history.test.ts::EDT-220 a new action clears the redo stack |
| EDT-221 | covered | src/workspace/__tests__/shortcuts.test.ts::only the theme and filter keys work inside a text box (EDT-221, EDT-256) |
| EDT-222 | covered | src/core/history/history.test.ts::EDT-222 depth and reset |
| EDT-223 | covered | src/core/commands/commands.test.ts::EDT-223 every edit type undoes and redoes exactly |
| EDT-224 | covered | src/core/commands/commands.test.ts::EDT-037 / EDT-224 dragging an area moves its members by the same amount in one step |
| EDT-225 | covered | src/store/store.test.ts::skips history for edits that must not be undoable (EDT-225) |
| EDT-226 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-226 Clear asks first and empties the history (new; button wording is 'Empty it', title 'Empty the diagram?', behaviour as the spec) |
| EDT-227 | covered | src/canvas/menus.test.tsx::EDT-227: Mod+C remembers the selected tables; the toast names the platform key (EDT-228) |
| EDT-228 | covered | src/canvas/menus.test.tsx::EDT-227: Mod+C remembers the selected tables; the toast names the platform key (EDT-228) |
| EDT-229 | covered | src/canvas/menus.test.tsx::EDT-229: copy is ignored when page text is selected or the person is typing |
| EDT-230 | covered | src/core/commands/commands.test.ts::EDT-230 an empty clip pastes nothing |
| EDT-231 | covered | src/core/commands/commands.test.ts::EDT-231 keeps a free name and adds _copy, _copy2, _copy3 otherwise (case-insensitive, per schema) |
| EDT-232 | covered | src/core/commands/commands.test.ts::EDT-232 lands right of the group by its width plus 40; each paste one slot further |
| EDT-233 | covered | src/core/commands/commands.test.ts::EDT-233 schema only for schema databases; area only if it exists |
| EDT-234 | covered | src/core/commands/commands.test.ts::EDT-234 copies columns and indexes, never links or dependencies |
| EDT-235 | covered | src/canvas/menus.test.tsx::EDT-227, EDT-228, EDT-235: the keys copy and paste on the canvas and tell the person |
| EDT-236 | covered | src/canvas/menus.test.tsx::EDT-236: the clipboard lives in the page, so another diagram can paste it |
| EDT-237 | covered | src/core/commands/commands.test.ts::EDT-237 paste is refused in a read-only diagram |
| EDT-248 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-248 the import summary (new; overwritten tables became a duplicates warning by IMP-076); also src/workspace/__tests__/frame.test.tsx::adds the pasted tables, says how many, and clears the history |
| EDT-249 | covered | src/core/commands/p8-edt-b-model.test.ts::EDT-249 imported tables land 150 px right of the right-most table (new); history reset in src/workspace/__tests__/frame.test.tsx::adds the pasted tables, says how many, and clears the history |
| EDT-250 | manual | needs a live database and the server (resync-dialog reads metadata over the API); plan/apply logic is in src/lib/qubdi/__tests__/resync.test.ts (selective apply, renames), the checkbox UI and the single undo step are in the manual script (rewrite/spec/manual-test-script.md) |
| EDT-251 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-251 the menu bar (new; Backup dropped by SHL-064, so Diagram/Edit/View) |
| EDT-252 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-252 View > side panel > toggles the panel and shows the Mod+B key (new) |
| EDT-253 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-253 View > Theme > offers System, Light and Dark and applies the choice (new); Mod+M while typing: src/workspace/__tests__/frame.test.tsx::Ctrl+M flips the theme, also inside a text box |
| EDT-254 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-254 display preferences live in the browser, not in the diagram (new) |
| EDT-255 | covered | src/workspace/__tests__/frame.test.tsx::diagram name (SHL-035) > double-click edits, Enter saves, an empty name is ignored |
| EDT-256 | covered | src/store/store.test.ts::autosave > waits for a quiet moment, then saves once and clears the dirty flag |
| EDT-257 | covered | src/workspace/__tests__/frame.test.tsx::Ctrl+S confirms with a toast (EDT-257) |
| EDT-258 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-258 Delete diagram (new, 2 tests: owner-only visibility; Delete and Cancel) |
| EDT-259 | covered | src/workspace/__tests__/frame.test.tsx::Ctrl+B hides and shows the side panel; Ctrl+Z undoes an edit; src/workspace/__tests__/shortcuts.test.ts::Shift makes redo of undo, and a capital letter still matches |
| EDT-260 | covered | src/workspace/__tests__/frame.test.tsx::Ctrl+O opens the Open dialog in local mode |
| EDT-261 | covered | src/workspace/__tests__/frame.test.tsx::Ctrl+S confirms with a toast (EDT-257) |
| EDT-262 | covered | src/workspace/__tests__/frame.test.tsx::Ctrl+B hides and shows the side panel; Ctrl+Z undoes an edit |
| EDT-263 | covered | src/workspace/__tests__/shortcuts.test.ts::maps the other keys (Ctrl+0 = fitAll); src/workspace/__tests__/canvas-frame.test.tsx::EDT-023: Show All moves the camera, from the toolbar and from the workspace |
| EDT-264 | covered | src/workspace/__tests__/frame.test.tsx::Ctrl+M flips the theme, also inside a text box |
| EDT-265 | covered | src/workspace/__tests__/canvas-frame.test.tsx::EDT-042: the Filter button opens the Filter Tables panel, and Ctrl+F toggles it |
| EDT-266 | covered | src/canvas/menus.test.tsx::EDT-227, EDT-228, EDT-235: the keys copy and paste on the canvas and tell the person |
| EDT-267 | covered | src/canvas/menus.test.tsx::EDT-031, EDT-267: Delete removes everything selected; typing in a box is not touched |
| EDT-268 | covered | src/canvas/menus.test.tsx::EDT-158, EDT-162: Add Relationship draws a line; Escape cancels it; src/canvas/links.test.tsx::EDT-175: Escape and a click elsewhere close it; src/canvas/visuals.test.tsx::EDT-206: Escape cancels...; src/workspace/__tests__/p8-edt-a-card.test.tsx::EDT-093: Escape and a click on the empty canvas close the card |
| EDT-269 | covered | src/canvas/visuals.test.tsx::EDT-206: a double click renames; Enter saves; src/features/user-types/__tests__/user-types-section.test.tsx::adds enum values with Enter and removes them as chips (EDT-192); src/workspace/__tests__/frame.test.tsx::diagram name (SHL-035) > double-click edits, Enter saves |
| EDT-270 | covered | src/canvas/shell.test.tsx::EDT-035: holding Shift snaps to the 20 px grid |
| EDT-271 | covered | src/canvas/chrome.test.tsx::EDT-271: shortcuts are written with this platform's symbols |
| EDT-272 | missing | the string `clipboard.failed` ('Copy failed') exists but no code path uses it: the clipboard is held in the page (canvas/clipboard.ts), so a copy cannot fail, and there is no 'Clipboard not supported' / 'Something went wrong' text. Row is only reachable if EDT-236's OS-clipboard option is built |
| EDT-273 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-273 a failed diagram delete > shows a toast and leaves the diagram editable and stored (new; toast reads 'The diagram could not be deleted') |
| EDT-274 | covered | src/core/commands/commands.test.ts::EDT-274 a broken command is refused and the design is untouched |
| EDT-275 | covered | src/core/commands/p8-edt-b-model.test.ts::EDT-275 schema pickers only where the database has schemas (new, 3 tests); schema labels in src/features/tables/__tests__/table-list.test.ts::EDT-103 EDT-275 schema labels |
| EDT-276 | covered | src/core/commands/p8-edt-b-model.test.ts::EDT-143 / EDT-276 per-database features (new, 3 tests) |
| EDT-277 | covered | src/core/commands/p8-edt-b-model.test.ts::EDT-277 a new table takes the default schema (new, 2 tests) |
| EDT-278 | covered | src/core/commands/p8-edt-b-model.test.ts::EDT-278 each database offers its own type list, common types first (new, 2 tests) |
