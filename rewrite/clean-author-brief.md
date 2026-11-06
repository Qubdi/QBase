# Brief for the clean author: Phase 4, domain model and storage

You are a CLEAN AUTHOR in a clean-room rewrite of a database-diagram editor (QBase). This file
is your CLAUDE.md. Read all of it before doing anything.

## The one rule

You must not read, open, search for or ask about ChartDB's source code, nor the `main` branch
of the QBase repository, nor any copy of either. You work only from the files in this
checkout. If a file in this checkout seems to contain code from another project, stop and tell
the owner. Do not browse outside this directory (no `..`, no other paths under the owner's
home, no `/tmp` scratch folders you did not create, no web search for ChartDB code). Library
documentation for npm packages is fine. If you already know the ChartDB project from
training, do not reproduce its structure, names or algorithms; design from the spec.

## What you write

Phase 4 of `rewrite/architecture.md`. New original code, all under `src/`:

| Folder | What | Notes |
| --- | --- | --- |
| `src/core/model/` | `Design`, `Entity`, `Column`, `Key`, `Rule`, `Link`, `UserType`, `Region`, `Memo`, id generation, defaults | names fixed by architecture section 3; no React |
| `src/core/commands/` | the command union, `apply(design, command)` returning next design and the inverse | pure; read-only designs refuse commands |
| `src/core/history/` | undo and redo stacks over command groups, coalescing rules | follows the undo rows in the checklist |
| `src/core/wire/` | tolerant `parse`, `serialise`, `upgrade` between the saved JSON and the model | wire keys per `rewrite/spec/data-format.md` |
| `src/persistence/` | `StorageAdapter` interface, IndexedDB (Dexie) adapter, one-time migration of the old nine-store layout | architecture section 5 |

No React, no DOM in `src/core`. Do not touch anything else (no UI, no SQL, no canvas, no
server).

## What you read

- `rewrite/architecture.md` (your design constraints)
- `rewrite/spec/data-format.md` (the saved format: facts you MUST keep)
- `rewrite/spec/editor.md` (what each edit does, undo, copy and paste, ordering)
- `rewrite/parity-checklist.md` rows `DAT-*` (all) and the `EDT-*` rows about tables, fields,
  indexes, checks, relationships, custom types, areas, notes, undo and redo, copy and paste
- `rewrite/spec/owner-decisions.md` (what was dropped; dependencies are DROPPED, do not model
  them for new diagrams, but a saved file that has them must still load and be written back
  unchanged)
- `shared/` and `server/src/diagrams` (the server already stores diagrams: your wire output must be
  accepted by it)

## How to work

1. Use new names, folders and algorithms of your own. Do not try to remember how any existing
   editor did it. Keep the wire keys and string values from the spec exactly.
2. Write tests first or alongside, from the spec rows. Name each test after the parity row ID it
   covers (for example `DAT-032`). Fixtures: invent your own diagrams; you may also write
   fixtures by hand from the JSON examples in `data-format.md`.
3. Node is not installed on the host. Run tools through Docker, for example:
   `docker run --rm -u $(id -u) -v "$PWD":/w -w /w node:24 npx vitest run src/core`
   (run `npm ci` in a container first if `node_modules` is missing).
4. Quality gates before you hand back: `npx tsc -p tsconfig.app.json --noEmit` shows no errors
   in your files; `npx eslint src/core src/persistence --max-warnings 0` is clean; your tests pass.
5. Add a row to `rewrite/provenance.md` (author: "clean author session", has read ChartDB source:
   no) before your first commit, and one row per finished module to `rewrite/log.md`.
6. Commit to a branch named `clean/phase4` in this checkout. Small commits, one module each.
   Do not push anywhere.

## Order

1. `core/model` (types, ids, defaults) and `core/wire` (parse and serialise; round trip tests
   with hand-made files, including an old-style file with missing keys, a file with unknown keys,
   a file with dependencies, and an Oracle or ClickHouse type)
2. `core/commands` then `core/history`
3. `persistence` adapter and the migration of the old layout (invent an old-layout database in
   a test with fake-indexeddb or the equivalent; check the package licence before adding it)

## Done when

- every DAT row marked keep or change is covered by a test or listed as not applicable with a
  reason in `rewrite/log.md`
- undo and redo work for every edit type in the undo rows
- a diagram saved in the old layout migrates with no data loss (your own fixtures)
- gates in step 4 pass
- you list, in your final message, every open question you hit and every place where the spec
  was unclear or contradictory

## Hand-back

Stop when done. Tell the owner the branch name. The owner copies the new files out of your
checkout (not a merge) and runs the similarity check against ChartDB. Do not try to run it
yourself; you do not have, and must not fetch, ChartDB.
