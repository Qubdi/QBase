# Architecture of the rewritten editor

Status: accepted by the owner 2026-11-07; lawyer review pending (see `rewrite/lawyer-brief.md`).
Written 2026-11-07 from `rewrite/spec/`
and `rewrite/PLAN.md`. It does not use ChartDB's source. Where the spec records a fact the
old editor fixes (JSON keys, storage database name, import path), that fact is kept; every
other name, folder and mechanism below is chosen here.

Goals, in order: (1) differ from ChartDB in structure, naming and state management (plan
rule 3); (2) let phases 4, 5 and 6 proceed in parallel behind fixed interfaces; (3) keep the
original QBase code working with small, mechanical edits; (4) keep every saved diagram
readable.

## 1. Principles

1. **One document, one store.** The diagram being edited is a single immutable value held in
   one store. Everything else (canvas, sidebar, dialogs, QBase controls) reads it through
   selectors. There is no tree of context providers that each own a slice.
2. **All edits are commands.** A change to the document goes through one function that
   applies a command and records the inverse. Undo, redo, autosave, lint fixes, re-sync and
   paste use the same path. No component mutates the document directly.
3. **Pure core, thin shell.** The model, commands, history, validation, format conversion and
   migration are plain TypeScript with no React and no browser APIs, so they are testable
   from the spec alone and can be written by a clean author without touching the UI.
4. **Wire format is separate from model.** Saved and exported JSON keeps the old keys (spec
   `data-format.md`). The in-memory model uses its own names. A serialiser/parser pair is the
   only place that knows both.
5. **Dialects are plug-ins.** Each database dialect is one module registered in a table; the
   rest of the app asks the registry, it never branches on the dialect name.
6. **Features own their folders.** UI is grouped by what a person does (organise tables,
   draw relationships, export), not by technical kind (contexts, hooks, dialogs).

## 2. Folder layout

New code lives under `src/`; the original QBase code stays where it is.

```
src/
  core/                 pure TypeScript, no React, no DOM
    model/              the design document and its parts (types, defaults, ids)
    commands/           command definitions, apply and invert
    history/            undo and redo stack over commands
    rules/              structural validation and repair of a document
    wire/               parse and serialise the saved JSON; version upgrades
  store/                the editor store (zustand) and its selectors
  persistence/          storage adapter interface, IndexedDB adapter, migration of old data
  dialects/             one folder per dialect: types, capabilities, SQL read and write
    registry.ts         lookup by dialect id
  formats/              DBML, JSON file, image export; metadata import (database-metadata)
  canvas/               diagram surface built on @xyflow/react (view only)
  workspace/            the editor page: layout, navbar, side panel, shortcuts
  features/
    tables/ fields/ links/ regions-memos/ filters/ compare/ clipboard/
    import/ export/ designs/ settings/
  platform/
    ui/                 UI primitives (shadcn-generated plus our wrappers)
    i18n/ theme/ toast/ router/ config/ hooks/
  qbase/                adapter facade for the original QBase code (section 8)
  lib/qubdi, components/qubdi, context/qubdi-context, pages/*   (existing, original)
```

Naming rules: folders are nouns for what the user manages; files are kebab-case; one
exported concept per file; no `index.ts` barrel files except `registry.ts`; no `-context`,
`-provider` or `use-<thing>-context` names for the editor's own code.

## 3. Model names

The model uses its own vocabulary. The wire column is the fact that must not change.

| Concept | Model type | Wire key (saved JSON) |
| --- | --- | --- |
| Whole diagram | `Design` | top-level diagram object |
| Table or view | `Entity` (`kind: 'table' \| 'view'`) | `tables[]` (view flag as stored) |
| Column | `Column` | `fields[]` |
| Index | `Key` | `indexes[]` |
| Check constraint | `Rule` | `checkConstraints[]` |
| Relationship | `Link` | `relationships[]` |
| Enum or composite type | `UserType` | `customTypes[]` |
| Area | `Region` | `areas[]` |
| Note | `Memo` | `notes[]` |

Entities, columns, keys and links are held by id in maps plus an explicit order list, not as
nested arrays, so a command touches one record and selectors can be narrow. The serialiser
produces the arrays and the order rules from `data-format.md` section 4.3, and fixes the
undefined table order (spec DAT-032): the saved order is the on-screen list order.

## 4. State management and data flow

```
 UI event ──> command ──> apply(design, command) ──> next design + inverse command
                                   │                          │
                                   v                          v
                          store.setDesign()          history.push(inverse)
                                   │
                       selectors ──┴──> canvas, sidebar, dialogs, QBase controls
                                   │
                         autosave subscriber ──> persistence.save(design)
```

- **Store** (`store/`): holds `design`, a small `ui` slice (selection, panel state, filters,
  zoom) and `session` (readonly flag, dirty flag, diagram location). One store instance per
  open editor. Components subscribe with narrow selectors; the canvas never re-renders for
  sidebar-only state.
- **Commands** (`core/commands`): a closed set of plain data objects (add entity, move
  entities, set column property, add link, replace whole design, group of commands, and so
  on). `apply` is a pure function that returns the next design and the inverse command.
  Immer is used inside `apply` for structural sharing only.
- **History** (`core/history`): two stacks of command groups. Typing in one field and
  dragging a group of tables each collapse into one step (coalescing rule per command kind).
  Moves are recorded when the drag ends, not per frame. Replacing the whole design (re-sync,
  open, resync dialog) is one command. The cap and the list of undoable actions follow the
  spec rows for undo; actions the spec marks "not undoable" bypass history.
- **Read-only** is a store flag. `apply` refuses commands when it is set, so no component
  needs its own guard. The compare view sets it.
- **Autosave**: a store subscriber debounces and calls the persistence adapter; failures
  raise a toast and keep the dirty flag.
- **Server sync** stays in `lib/qubdi` (original). It reads and writes through the facade in
  section 8; it never touches the store internals.

## 5. Persistence and migration

Interface (`persistence/`): `list()`, `load(id)`, `save(design)`, `remove(id)`,
`readSettings()`, `writeSettings()`, plus `onChange` for cross-tab refresh. One adapter is
written, over IndexedDB with Dexie.

Layout decision (answers data-format Q on Dexie layout): **one record per diagram** holding
the whole serialised design, plus a small index store (id, name, database type, dates) for
the list screens. The old nine-store layout is read once and never written again.

Server sync (unchanged in behaviour, original code in `lib/qubdi`): the server keeps its own
copy of each published diagram as JSON in the wire format. The editor never talks to the server
directly; the QBase code reads the current design through `qbase/editor-api` and serialises it
with `core/wire`, so one serialiser feeds local storage, files and the server. A local diagram
and a server diagram are linked by the ids the QBase code stores beside the design (binding
rules in `spec/data-format.md` section 6.3); replacing the local copy from the server is one
"replace whole design" command, so it can be undone. Conflicts (409 on `baseUpdatedAt`) and the
edit lock (423) stay in the QBase code and surface as save status in the navbar slot.

Compatibility rules:

1. The database keeps the name `QBase` and the legacy `QubdiDB` merge from the spec still
   runs first.
2. On first open by the new editor a one-time migration reads the old stores, builds one
   serialised design per diagram, writes it to the new stores, and sets a marker. The old
   stores are left in place for one release so a rollback loses nothing. Fixtures for tests
   come from our own exports of real diagrams, not ChartDB's tests (plan Phase 4).
3. Every load goes through `core/wire` parse. Parse is **tolerant**: unknown keys are kept
   in a side bag and written back; known-bad values are repaired with a warning list shown
   once. Files with no version key are version 1. The exporter writes a version key
   (owner decision 5).
4. Databases of type Oracle or ClickHouse open read-only as "generic" with a banner;
   import and export are unavailable for them (owner decision 4).

## 6. Dialects

A dialect module exports one object: `id`, display label, capabilities (schemas, enums,
composite types, check constraints, views, per-column features), type catalogue,
default type for new columns, default schema, and optional `sql.read` and `sql.write`. The
registry offers lookup by id and listing for pickers. Supported: PostgreSQL, MySQL, SQL
Server, SQLite, plus MariaDB and CockroachDB as thin variants of MySQL and PostgreSQL
(owner decision 4). Unsupported ids resolve to a read-only "generic" dialect.

SQL read uses `node-sql-parser` (Apache-2.0) where it parses, with our own handling for
dialect statements it cannot; DBML uses `@dbml/core` (Apache-2.0). Both libraries stay behind
`dialects/` and `formats/`; nothing else imports them. Round trip (import, export, import)
must give the same model (plan Phase 5).

## 7. Canvas and UI

- `canvas/` renders `Entity`, `Link`, `Region` and `Memo` as xyflow nodes and edges. Node
  components are pure views of one record; positions come from the document, measured
  sizes live in the `ui` slice. Dragging updates local node state and sends one move
  command on release.
- `workspace/` composes layout (desktop and mobile), navbar slots, side panel and the
  keyboard shortcut table. Shortcuts are data (a table of key, command), not scattered hooks.
- `features/*` each exports its sidebar section, dialogs and canvas tools. A feature never
  imports another feature; shared things go to `core`, `store` or `platform`.
- `platform/ui` is regenerated with the shadcn CLI (MIT) and wrapped; `platform/i18n` loads
  one locale file per language lazily. New translations are written in Phase 7.
- Dropped by owner decision: templates and examples, dependencies, Backup menu, generic SQL
  generator, Oracle and ClickHouse import and export.

## 8. QBase adapter (`src/qbase/`)

The contract in `spec/app-shell.md` part B names 24 modules by their old paths and hook
names, which mirror ChartDB's layout. Keeping those paths would copy that layout, so this
architecture does **not** keep them. Instead:

- `src/qbase/editor-api.ts` exposes the capabilities the QBase code needs: read the current
  design, apply commands (add/remove key, update column or entity, replace design with one
  undo step), history add and reset, show a table in the side panel, focus a table, readonly
  flag, local storage list/get/add/remove, toast, the metadata types and loaders.
- The original QBase files (about 30 imports) are edited once to import from `@/qbase/...`
  and the new `platform/` paths. The edits are mechanical, listed in a table in the Phase 3
  change log, and the existing QBase tests are the acceptance tests.
- **One path is kept exactly** (owner decision 3):
  `src/lib/data/import-metadata/metadata-types/database-metadata` (type and zod schema),
  because the server and the Docker build import it.
- Plug-in points P1 to P12 become named slots in `workspace/` (navbar right slot,
  below-navbar row, page wrapper before the store, dialog openers for new and open). The
  window event `qubdi:open-resync` is unchanged.

## 9. Interfaces between phases

Fixed here so phases 4 to 6 can run in parallel with only the spec and this file:

| Interface | Provided by | Used by | Shape (prose) |
| --- | --- | --- | --- |
| Model types | phase 4 `core/model` | everything | the nine types in section 3, ids as strings |
| `apply`, `invert`, command union | phase 4 `core/commands` | store, features, qbase | pure; returns next design and inverse |
| History | phase 4 `core/history` | store | push, undo, redo, reset, canUndo, canRedo |
| `parse`, `serialise`, `upgrade` | phase 4 `core/wire` | persistence, formats, server sync | tolerant parse returning design plus warnings |
| `StorageAdapter` | phase 4 `persistence` | store, designs feature, qbase | section 5 |
| `Dialect`, registry | phase 5 `dialects` | features, formats | section 6 |
| `importSql`, `exportSql`, `importDbml`, `exportDbml`, `loadFromMetadata`, `exportImage` | phase 5 | import/export features, qbase | take text or metadata plus dialect, return a design (or text) plus diagnostics |
| Store, selectors | phase 6 `store` | canvas, workspace, features | section 4 |
| Slots | phase 6 `workspace` | qbase controls | section 8 |

Phase 3 delivers `platform/*`, the router, app shell and configs, and stubs for the store so
screens render. Phase 4 and 5 are clean-author modules (`core`, `dialects`, `formats`, canvas
node views). They are written from `rewrite/spec/` and this file only.

## 10. Testing approach

- Each module has tests written from the spec rows, named by the row id they cover (this is
  what ticks the parity checklist).
- `core` and `dialects` tests are table-driven: input, command or SQL, expected result. The
  sample schemas are our own (spec `import-export.md` has invented samples; Phase 5 verifies
  them once against the old editor before they become fixtures).
- A migration test opens fixtures exported from real old diagrams and compares the parsed
  model with the expected one.
- The QBase test suite on this branch runs unchanged in CI after the adapter edits.

## 11. Risks and open points

- **Process strength** is the lawyer question (plan section 6); this layout lowers risk but
  does not remove it.
- Mismatch risk: the contract's hook names (for example a `useDiagram` that returns many
  functions) invite re-creating ChartDB's API. The adapter must stay small and be driven by
  what QBase actually calls.
- Coalescing and "what is undoable" must follow the spec rows exactly; the 15 old defects the
  spec marks "change" are decided row by row in Phase 4 and 6.
- To decide in Phase 3: zustand and immer are new dependencies (both MIT); confirm in
  `third-party-licences.csv` before use.
- Still open from the specs: the remaining owner questions at the end of each spec file;
  none blocks Phase 3.
