# Phase 8 slice edt-a (EDT-001 to EDT-133, unticked rows)

Rows handled: 130 (EDT-008, EDT-009, EDT-048 were already ticked). Existing coverage: 103; covered by new tests: 20; fixed: 1; missing: 5; dropped: 1; manual: 0.
New tests (22, all passing, eslint clean, tsc clean): src/workspace/__tests__/p8-edt-a-frame.test.tsx, src/workspace/__tests__/p8-edt-a-card.test.tsx, src/features/tables/__tests__/p8-edt-a-panels.test.tsx, src/canvas/p8-edt-a-canvas.test.tsx.
Source fix: src/workspace/entity-editor.tsx (table name delay 1000 ms).

| ID | Class | Evidence |
|---|---|---|
| EDT-001 | covered (new test) | src/workspace/__tests__/p8-edt-a-frame.test.tsx::EDT-001/EDT-005: desktop shows the top bar, the rail, the panel... |
| EDT-002 | covered (new test) | src/workspace/__tests__/p8-edt-a-frame.test.tsx::EDT-002: the rail lists New, Open, Tables, DBML, Links and Extras... |
| EDT-003 | covered (new test) | src/workspace/__tests__/p8-edt-a-frame.test.tsx::EDT-003: clicking a rail section opens a hidden panel on that section |
| EDT-004 | covered (new test) | src/workspace/__tests__/p8-edt-a-frame.test.tsx::EDT-004: the handle moves the width by keys, never under 350 px... |
| EDT-005 | covered (new test) | src/workspace/__tests__/p8-edt-a-frame.test.tsx::EDT-001/EDT-005: desktop shows the top bar, the rail, the panel (open at first)... |
| EDT-006 | covered (new test) | src/workspace/__tests__/p8-edt-a-frame.test.tsx::EDT-006/EDT-007: on a phone the panel is a drawer opened by the pencil button... (drawer title reads "Diagram contents", not "Manage Diagram": wording choice, not asserted) |
| EDT-007 | covered (new test) | src/workspace/__tests__/p8-edt-a-frame.test.tsx::EDT-006/EDT-007 (drop-down labelled Section; entries come from mobile-panel) |
| EDT-010 | covered | src/features/tables/__tests__/tables-section.test.tsx::focus selects the table and asks the canvas to centre it (EDT-107, EDT-010) |
| EDT-011 | covered | src/canvas/shell.test.tsx::EDT-011: a badge shows while the design is loading |
| EDT-012 | covered | src/canvas/shell.test.tsx::EDT-012: the first view fits with 10% padding and at most 80% zoom |
| EDT-013 | covered (new test) | src/workspace/__tests__/p8-edt-a-frame.test.tsx::EDT-013: the tab title reads QBase - <diagram name> |
| EDT-014 | covered | src/canvas/shell.test.tsx::EDT-014 + src/canvas/entity.test.tsx::EDT-014 + src/canvas/menus.test.tsx::EDT-014 |
| EDT-015 | covered | src/canvas/shell.test.tsx::EDT-015, EDT-016 |
| EDT-016 | covered | src/canvas/shell.test.tsx::EDT-015, EDT-016 |
| EDT-017 | covered | src/canvas/shell.test.tsx::EDT-017 |
| EDT-018 | covered | src/canvas/shell.test.tsx::EDT-018 |
| EDT-019 | covered | src/canvas/shell.test.tsx::EDT-019 |
| EDT-020 | covered | src/canvas/chrome.test.tsx::EDT-020, EDT-021, EDT-022 |
| EDT-021 | covered | src/canvas/chrome.test.tsx::EDT-020, EDT-021, EDT-022 |
| EDT-022 | covered (new test) | src/canvas/p8-edt-a-canvas.test.tsx::EDT-022: Show All animates for half a second and Mod+0 fits the view |
| EDT-023 | covered | src/canvas/chrome.test.tsx::EDT-023: with no table on screen a Show All pill offers the way back |
| EDT-024 | covered | src/canvas/chrome.test.tsx::EDT-024 + src/canvas/shell.test.tsx::EDT-073 |
| EDT-025 | covered (new test) | src/canvas/p8-edt-a-canvas.test.tsx::EDT-025: clicking a table selects it and clicking the background clears the selection |
| EDT-026 | covered | src/canvas/links.test.tsx::EDT-026, EDT-174 |
| EDT-027 | covered | src/canvas/shell.test.tsx::EDT-027, EDT-028 |
| EDT-028 | covered | src/canvas/shell.test.tsx::EDT-027, EDT-028 |
| EDT-029 | covered | src/canvas/chrome.test.tsx::EDT-029 |
| EDT-030 | covered | src/canvas/move.test.ts::EDT-030, EDT-224 |
| EDT-031 | covered | src/canvas/menus.test.tsx::EDT-031, EDT-267 |
| EDT-032 | covered | src/canvas/entity.test.tsx::EDT-032 |
| EDT-033 | covered | src/canvas/entity.test.tsx::EDT-033 |
| EDT-034 | covered | src/canvas/move.test.ts::EDT-034 |
| EDT-035 | covered | src/canvas/chrome.test.tsx::EDT-035 + src/canvas/move.test.ts::EDT-035 |
| EDT-036 | covered | src/canvas/move.test.ts::EDT-036 |
| EDT-037 | covered | src/canvas/move.test.ts::EDT-037 |
| EDT-038 | covered | src/canvas/chrome.test.tsx::EDT-038 |
| EDT-039 | covered | src/canvas/chrome.test.tsx::EDT-039 |
| EDT-040 | covered | src/canvas/chrome.test.tsx::EDT-040 |
| EDT-041 | covered | src/canvas/chrome.test.tsx::EDT-041 |
| EDT-042 | covered | src/canvas/chrome.test.tsx::EDT-042, EDT-061 |
| EDT-043 | covered | src/canvas/chrome.test.tsx::EDT-043 |
| EDT-044 | covered | src/canvas/chrome.test.tsx::EDT-044 |
| EDT-045 | dropped | drop: Type colours legend |
| EDT-046 | covered | src/canvas/entity.test.tsx::EDT-046 |
| EDT-047 | missing | no credit mark is drawn on the canvas (spec: change, only if the owner wants branding; left off, decision pending) |
| EDT-049 | covered | src/canvas/chrome.test.tsx::EDT-049 |
| EDT-050 | covered | src/canvas/menus.test.tsx::EDT-050 + src/canvas/chrome.test.tsx::EDT-050 |
| EDT-051 | covered | src/canvas/arrange.test.ts::EDT-051 |
| EDT-052 | covered | src/canvas/arrange.test.ts::EDT-052 |
| EDT-053 | covered | src/canvas/arrange.test.ts::EDT-053 |
| EDT-054 | covered | src/canvas/menus.test.tsx::EDT-054 |
| EDT-055 | covered | src/canvas/menus.test.tsx::EDT-055 |
| EDT-056 | covered | src/canvas/menus.test.tsx::EDT-056 |
| EDT-057 | covered | src/canvas/menus.test.tsx::EDT-057 |
| EDT-058 | covered | src/canvas/menus.test.tsx::EDT-058 |
| EDT-059 | covered | src/canvas/menus.test.tsx::EDT-059 |
| EDT-060 | covered | src/canvas/menus.test.tsx::EDT-060 |
| EDT-061 | covered | src/canvas/chrome.test.tsx::EDT-042, EDT-061 + src/workspace/__tests__/canvas-frame.test.tsx::EDT-042 |
| EDT-062 | covered | src/features/filters/__tests__/filter-panel.test.tsx::has a focused search box and the two grouping buttons |
| EDT-063 | covered | src/features/filters/__tests__/filter-panel.test.tsx::EDT-063 EDT-064 EDT-072 the eyes |
| EDT-064 | covered (new test) | src/features/tables/__tests__/p8-edt-a-panels.test.tsx::EDT-064 a group zoom-to control asks the canvas to show all the tables of the group |
| EDT-065 | covered | src/features/filters/__tests__/filter-panel.test.tsx::shows it if hidden, selects it and asks the canvas to centre it |
| EDT-066 | covered | src/features/filters/__tests__/filter-panel.test.tsx::narrows by name without changing what is hidden |
| EDT-067 | covered | src/features/filters/__tests__/filter-panel.test.tsx::offers Clear filter when nothing matches |
| EDT-068 | covered | src/features/filters/__tests__/filter-panel.test.tsx::says Create a table to get started when the diagram is empty |
| EDT-069 | covered | src/canvas/shell.test.tsx::EDT-069 + src/features/tables/__tests__/tables-section.test.tsx::says so and Show all brings them back |
| EDT-070 | covered | src/canvas/shell.test.tsx::EDT-070 |
| EDT-071 | covered | src/features/filters/__tests__/filter-panel.test.tsx::the visibility choice is not an undo step (EDT-071) |
| EDT-072 | covered | src/features/filters/__tests__/filter-tree.test.ts::a schema whose tables are all ticked counts as the schema |
| EDT-073 | covered | src/canvas/shell.test.tsx::EDT-073 |
| EDT-074 | covered | src/features/tables/__tests__/tables-section.test.tsx::puts the new table near the corner (EDT-074) |
| EDT-075 | covered | src/features/tables/__tests__/tables-section.test.tsx::creates table_1 with an id field (EDT-075) |
| EDT-076 | covered | src/features/tables/__tests__/tables-section.test.tsx::asks for a schema when several are shown |
| EDT-077 | covered (new test) | src/features/tables/__tests__/p8-edt-a-panels.test.tsx::EDT-077 offers Add view only while Database Views is on |
| EDT-078 | covered | src/canvas/entity.test.tsx::EDT-078 |
| EDT-079 | covered | src/canvas/entity.test.tsx::EDT-079 |
| EDT-080 | covered | src/canvas/entity.test.tsx::EDT-080, EDT-082 |
| EDT-081 | covered | src/canvas/entity.test.tsx::EDT-081 |
| EDT-082 | covered | src/canvas/entity.test.tsx::EDT-080, EDT-082 |
| EDT-083 | covered | src/canvas/entity.test.tsx::EDT-083 |
| EDT-084 | missing | tables have no colour picker (ColorPicker is used only for areas/notes); palette in src/lib/colors.ts has 10 colours not 12; table colour cannot be changed from the UI, only via the model |
| EDT-085 | covered | src/canvas/entity.test.tsx::EDT-085 |
| EDT-086 | covered | src/canvas/shell.test.tsx::EDT-086 |
| EDT-087 | covered | src/canvas/entity.test.tsx::EDT-087 |
| EDT-088 | missing | the edit card has the name, field list and Add Field but no schema drop-down, colour picker, open-in-panel button or "<n> Fields" count |
| EDT-089 | covered | src/canvas/menus.test.tsx::EDT-057 (Edit Table) + EDT-055 (opens for editing); card itself in src/workspace/__tests__/canvas-frame.test.tsx::EDT-084 |
| EDT-090 | covered (new test) | src/workspace/__tests__/p8-edt-a-card.test.tsx::EDT-090: each field row has a name box, type picker, N toggle, PK toggle and attributes (delete is in the attributes popover, no separate trash toggle) |
| EDT-091 | covered (new test) | src/workspace/__tests__/p8-edt-a-card.test.tsx::EDT-091: a new field is focused and highlighted light blue |
| EDT-092 | covered (new test) | src/workspace/__tests__/p8-edt-a-card.test.tsx::EDT-092: the card is shielded from canvas panning and wheel handling (nowheel/nopan; the Ctrl/Cmd zoom pass-through is xyflow behaviour, not asserted) |
| EDT-093 | covered (new test) | src/workspace/__tests__/p8-edt-a-card.test.tsx::EDT-093: Escape / empty canvas click / starting a relationship close the card (closes with a Done check button, not an X) |
| EDT-094 | fixed | the edit card saved the table name after 0.3 s; spec says 1 s. src/workspace/entity-editor.tsx now passes delay={1000}. Test: src/workspace/__tests__/p8-edt-a-card.test.tsx::EDT-094 |
| EDT-095 | missing | the edit card has no schema box; Create new schema exists only in the Change Schema dialog (tables-section test) |
| EDT-096 | covered (new test) | src/features/tables/__tests__/p8-edt-a-panels.test.tsx::EDT-096 tooltip and double click; pencil and Escape |
| EDT-097 | missing | no warning is shown for duplicate table names (spec: change, warn on duplicates) |
| EDT-098 | covered | src/features/tables/__tests__/table-editor.test.tsx::EDT-098 the description of a table |
| EDT-099 | covered | src/canvas/menus.test.tsx::EDT-057, EDT-099 |
| EDT-100 | covered | src/canvas/menus.test.tsx::EDT-100 |
| EDT-101 | covered | src/features/tables/__tests__/tables-section.test.tsx::changes the schema of one table only |
| EDT-102 | covered | src/features/tables/__tests__/tables-section.test.tsx::EDT-110 EDT-102 |
| EDT-103 | covered | src/features/tables/__tests__/tables-section.test.tsx::opens one row at a time (EDT-103) |
| EDT-104 | covered | src/features/tables/__tests__/tables-section.test.tsx::duplicates and deletes through the actions menu + offers Add index only for tables |
| EDT-105 | covered | src/features/tables/__tests__/table-list.test.ts::EDT-105 dragging a row re-orders the list |
| EDT-106 | covered | src/core/wire/wire.test.ts::EDT-106 |
| EDT-107 | covered | src/canvas/focus.test.tsx::EDT-107, EDT-065 |
| EDT-108 | covered | src/features/tables/__tests__/tables-section.test.tsx::shows a view tag and hides views while Database Views is off (EDT-108) |
| EDT-109 | covered | src/features/tables/__tests__/tables-section.test.tsx::lists the tables and narrows them by name |
| EDT-110 | covered | src/features/tables/__tests__/tables-section.test.tsx::says so and offers Add Table |
| EDT-111 | covered | src/features/tables/__tests__/tables-section.test.tsx::opens the row of a table asked for from the canvas (EDT-111) |
| EDT-112 | covered | src/canvas/entity.test.tsx::EDT-112 |
| EDT-113 | covered | src/canvas/entity.test.tsx::EDT-113 |
| EDT-114 | covered | src/canvas/entity.test.tsx::EDT-114 |
| EDT-115 | covered | src/canvas/entity.test.tsx::EDT-115 |
| EDT-116 | covered | src/canvas/entity.test.tsx::EDT-116 + src/features/tables/__tests__/field-hover-card.test.tsx |
| EDT-117 | covered | src/features/tables/__tests__/table-editor.test.tsx::adds field_2 with the default type |
| EDT-118 | covered (new test) | src/workspace/__tests__/p8-edt-a-card.test.tsx::EDT-118: a field name saves 0.3 s after typing stops; unchanged text is not saved |
| EDT-119 | covered | src/features/tables/__tests__/table-editor.test.tsx::lists types, filters, and says when none match + src/features/tables/fields/__tests__/field-rules.test.ts::EDT-119 |
| EDT-120 | covered | src/features/tables/__tests__/table-editor.test.tsx::splits standard and custom types (EDT-120) |
| EDT-121 | covered | src/features/tables/__tests__/table-editor.test.tsx::picking varchar then typing varchar(30) sets the length + src/core/model/model.test.ts::EDT-121 |
| EDT-122 | covered | src/features/tables/fields/__tests__/field-rules.test.ts::EDT-121 EDT-122 typed declarations |
| EDT-123 | covered | src/core/commands/commands.test.ts::EDT-123 + field-rules.test.ts::EDT-123 EDT-124 |
| EDT-124 | covered | src/features/tables/__tests__/table-editor.test.tsx::serial makes the field not null with auto increment |
| EDT-125 | covered | src/features/tables/__tests__/table-editor.test.tsx::EDT-125 to EDT-132 the attributes popover |
| EDT-126 | covered | src/features/tables/fields/__tests__/field-rules.test.ts::locks Unique for a lone primary key only |
| EDT-127 | covered | src/features/tables/fields/__tests__/field-rules.test.ts::offers Auto Increment for integer types, locked while nullable or serial |
| EDT-128 | covered | src/features/tables/__tests__/table-editor.test.tsx::shows only what fits (Array on PostgreSQL) + has no Array for MySQL |
| EDT-129 | covered (new test) | src/features/tables/__tests__/p8-edt-a-panels.test.tsx::EDT-129 SQL Server offers None, Max and Custom...; PostgreSQL has no Max |
| EDT-130 | covered (new test) | src/features/tables/__tests__/p8-edt-a-panels.test.tsx::EDT-130 precision and scale show the default as placeholder and the range limits |
| EDT-131 | covered | src/features/tables/__tests__/table-editor.test.tsx::keeps the default value verbatim and an empty one clears it |
| EDT-132 | covered | src/features/tables/__tests__/table-editor.test.tsx::a description shows a comment icon beside the name (EDT-132) |
| EDT-133 | covered | src/features/tables/__tests__/table-editor.test.tsx::EDT-133 EDT-134 the N and key toggles + commands.test.ts::EDT-133 |
