# Decisions for the owner (Phase 1 sign-off)

Generated from the rows in `parity-checklist.md`. Everything not listed here is recommended **keep**.

Sign-off = reply per section: accept, or name the IDs to change. Open questions from each spec are collected at the end of that spec file.


## Drop (15)

| ID | Area | Behaviour | Recommendation |
| --- | --- | --- | --- |
| DAT-089 | Server sync | Stray `diagramId` key on table rows leaks into server content | drop |
| EDT-045 | Canvas: toolbar and chrome | A Type colours legend at the top-right (desktop only) explains the six field-type tints | drop: low value; replace by tooltips |
| EDT-183 | Dependencies | Dragging from a view's top or bottom dot onto a table creates a dependency | drop: niche; no dialog; import covers it |
| EDT-184 | Dependencies | A dependency is drawn as a distinct line and listed under Dependencies in Refs with a Delete action | drop: niche |
| EDT-185 | Dependencies | Dependencies are deleted with Delete on the line or the Refs action and are undoable | drop: niche |
| EDT-186 | Dependencies | Deleting a table removes its dependencies in the same undo step | drop: follows the dependency feature |
| EDT-196 | Custom types | Highlight Fields tints every field using the type yellow; only one type at a time; not saved or undoable | drop: niche |
| EXP-008 | SQL export | Oracle/ClickHouse sources and unsupported targets use a generic generator with a warning header | drop, replace by a clear 'not supported' message |
| SHL-008 | Config | `VITE_HOST_URL` and `VITE_APP_URL` build variables exist but change nothing visible [A1] | drop |
| SHL-018 | Routes | `/examples` and `/templates*` pages exist in local mode only [A2, A12] | drop |
| SHL-041 | New dialog | A card links to the examples page [A5, A12] | drop |
| SHL-064 | Menu Backup | Backup menu: Export diagram and Restore diagram, same dialogs as the JSON items under Actions [A6] | drop |
| SHL-091 | Templates | Examples page with 3 shipped example diagrams [A12] | drop |
| SHL-092 | Templates | 50 templates (36 PostgreSQL, 14 MySQL, 22 featured, 16 tags) with list, featured, by-tag, detail and clone pages, 100 thumbnails [A12] | drop |
| SHL-104 | Browser fixes | Old-Safari workaround that disables extra markdown table features in the templates preview [A16] | drop |

## Change (53)

| ID | Area | Behaviour | Recommendation |
| --- | --- | --- | --- |
| DAT-012 | Local storage | Relationships and custom types are listed alphabetically after load | change |
| DAT-014 | Local storage | The one-row-per-entity layout with many stores and accidental indexes | change |
| DAT-032 | Table | Array order of tables in the saved diagram is undefined; only `order` hints list order | change |
| DAT-034 | Field | Length is stored as text so values like `max` work; text `"null"` means none | change |
| DAT-040 | Field | A column-level `check` text on the field | change |
| DAT-060 | Ids | Local diagram ids are a per-browser prefix plus 4 characters | change |
| DAT-064 | Export | Export has no version marker | change |
| EDT-009 | Layout | On a narrow window right-click menus are not available | change: offer long-press menus on touch |
| EDT-039 | Canvas: moving | Overlapping tables carry a persistent subtle outline | change: make the outline optional to cut noise |
| EDT-047 | Canvas: toolbar and chrome | A credit mark sits at the bottom-right | change: keep only if the product owner wants branding |
| EDT-048 | Canvas: toolbar and chrome | There is no full-screen mode; the browser's own works | change: owner to decide (open question 1) |
| EDT-082 | Tables: create and look | The widen button toggles between narrowest and widest (first press below 337 widens to 337) | change: simplify to a two-state toggle |
| EDT-086 | Tables: create and look | Views are hidden by default and View > Database Views On/Off shows or hides all views everywhere | change: show views by default when the diagram has any (open question 9) |
| EDT-097 | Tables: edit and manage | Duplicate table names are allowed without warning | change: warn on duplicates (open question 7) |
| EDT-101 | Tables: edit and manage | Change Schema opens a dialog (Cancel, Change) and also assigns the schema to any schema-less table | change: only change the one table; the side effect surprises |
| EDT-137 | Fields | Fields cannot be re-ordered from the canvas edit card | change: add reordering to the edit card |
| EDT-139 | Fields | Deleting a field used in a relationship leaves the relationship dangling | change: remove or warn (open question 6) |
| EDT-150 | Check constraints | Check constraints are shown for every database even where export ignores them | change: hide or warn where unsupported (open question 15) |
| EDT-194 | Custom types | Switching kind keeps the other kind's hidden data | change: clear it (open question 14) |
| EDT-221 | Undo and redo | Undo and redo shortcuts do not act while a text box has focus | change: make them work everywhere or hand off clearly (open question 20) |
| EDT-222 | Undo and redo | Undo history is unlimited and cleared on reload or when switching diagrams | change: cap or persist (open question 5) |
| EDT-228 | Copy and paste | The copy toast says Press Ctrl+V on every platform | change: show the platform's key |
| EDT-236 | Copy and paste | The clipboard lives in the page (works between diagrams in the same tab) and is lost on reload | change: consider the OS clipboard for cross-tab paste |
| EDT-257 | Menus, themes and settings | Mod+S marks the diagram saved but does nothing visible | change: confirm with a toast or remove (open question 2) |
| IMP-015 | SQL import | A result with no tables and no relationships adds nothing and says nothing | change: show 'Nothing to import' |
| IMP-017 | SQL import | Other dialects skip unsupported statements silently | change: one summary warning per kind (Q4) |
| IMP-024 | SQL import | SQLite import creates a placeholder table for a foreign key that points at a table not in the script | change: do not invent tables, drop the key with a warning |
| IMP-033 | SQL import | COMMENT ON TABLE/COLUMN statements are not read by the SQL importers | change: read them (PostgreSQL, Oracle) and MySQL COMMENT |
| IMP-035 | SQL import | Source type names are mapped to generic types and unknown types become text | change: keep the source type name, never text (Q8) |
| IMP-039 | SQL import | MySQL unsigned, display width and enum/set values are dropped | change: decide in Q7 |
| IMP-043 | SQL import | Layout: connected tables near each other, isolated tables in a grid, no overlaps, per schema group | change: groups must not overlap each other |
| IMP-053 | DBML import | Accented letters are replaced by plain letters before parsing | change: stop doing it (Q9) |
| IMP-054 | DBML import | Default values lose their quotes (e.g. 'abc' stored as abc) | change: keep the quotes |
| IMP-055 | DBML import | DBML tables are placed on a simple grid without the layout pass | change: run the same layout as SQL import |
| IMP-076 | Import into open diagram | Importing a table that already exists creates a duplicate; custom types and dependencies are not added | change: warn on duplicates, add custom types (Q5) |
| IMP-083 | DBML apply | A new table from the DBML can land on top of an existing one | change: place it in free space |
| EXP-007 | SQL export | Types with no generator (generic, CockroachDB, Oracle, ClickHouse) export with the PostgreSQL generator | change: decide in Q10 |
| EXP-025 | MySQL export | Several blank lines between tables | change or keep: decide in Q1 |
| EXP-056 | DBML export | Relationship names become fk_<index>_<name>; empty names get a fixed fallback (not random) | change: no random names |
| EXP-064 | Image export | Exports only the visible viewport | change: fit the whole diagram (Q13) |
| EXP-065 | Image export | JPEG with transparent on becomes black | change: use the theme background |
| SHL-030 | Local data | "Time ago" wording is translated for 12 languages, English for the rest; the word "Saved" is English only [A4] | change |
| SHL-031 | Local data | Ctrl/Cmd+S only updates the last-modified time [A4, A6] | change |
| SHL-042 | New dialog | The "More Databases" / "Primary Databases" toggle is English only [A14] | change |
| SHL-048 | Open dialog | Delete happens with no confirmation; deleting the open or last diagram reloads to `/` [A5] | change |
| SHL-049 | Open dialog | There is no search box and no rename in the local Open dialog [A5] | change |
| SHL-069 | Mobile | Save status, get-latest, lint, drift and publish controls are not shown on phones [A6] | change |
| SHL-071 | Mobile | The mobile section dropdown lacks DBML and its "Areas" entry shows Custom types [A7] | change |
| SHL-073 | Mobile | Drawer title and description are English only [A7, A14] | change |
| SHL-082 | Settings | Show field attributes is not persisted on main (resets on reload) [A10] | change |
| SHL-089 | Toasts | Toaster is mounted only in the editor page on main; mount it at the app root [A11] | change |
| SHL-099 | Languages | Texts that are English only on main (compact tables label, drawer title, "Saved", more-databases toggle, 404 page) get translated [A14] | change |
| SHL-103 | Browser fixes | Safari 15.3 and older: stand-ins for structured copy, `at()` and `Object.hasOwn` installed before anything runs [A16] | change |

## Open questions by spec

- [Data format](spec/data-format.md): see the final section "Open questions".
- [Editor](spec/editor.md): see the final section "Open questions".
- [Import and export](spec/import-export.md): see the final section "Open questions".
- [App shell and QBase](spec/app-shell.md): see the final section "Open questions".
