# Rewrite plan: replace the ChartDB-derived editor with original code

Branch: `rewrite/clean-room`

## Why

The editor in `src/` began as a copy of ChartDB (AGPL-3.0). A comparison with ChartDB's
latest commit (2026-11-01) found:

- 581 of ChartDB's 606 `src/` files exist in QBase at the same path (96%).
- 98.6% of ChartDB's non-blank lines in those files are still present in QBase
  (316,580 of 321,198). Most of that is data and fixtures, but the code is almost
  untouched too (for example `lib/data`: 32,265 of 33,370 lines).
- 145 files are byte-for-byte identical.

AGPL-3.0 does not allow relicensing that code. Goal of this branch: replace every
ChartDB-derived file with original code, so the project can carry QBase's own licence.

Not legal advice. A lawyer should review the finished result before any licence change.

## What is already ours (keep)

- `server/` and `shared/`: no ChartDB counterpart found. Verify in Phase 0.
- `src/components/qubdi`, `src/lib/qubdi`, `src/pages/admin-page`,
  `src/pages/examples-page`, `src/pages/share-viewer-page`, `src/context/qubdi-context`,
  `src/context/diagram-context`, `src/i18n/qubdi`, `src/templates-data` (about 50 files).
  These may call ChartDB-derived code and will need adapting.

## What must be replaced (by size in lines)

| Area | Lines | Note |
| --- | --- | --- |
| `assets/templates` (100 files) | 131k | identical copies of ChartDB data; recreate or drop |
| `lib/dbml` (49 files) | 93k | mostly test fixtures; check how much is code |
| `lib/data` (142 shared files) | 33k | SQL import and export; largest code area |
| `assets/examples`, `assets/*` | 18k | identical copies; recreate or drop |
| `i18n/locales` (22 files) | 11k | translations; re-translate or regenerate |
| `pages/editor-page` (35 shared files) | 8k | canvas, sidebar, panels |
| `lib/domain` | 7k | data model |
| everything else (dialogs, hooks, context, components) | about 12k | |

Exact per-folder numbers are in the comparison output; regenerate them with the script in
Phase 0.

## How this branch works

The ChartDB-derived code has been removed from this branch (699 files in `src/`). Only files
the inventory marks as `ours` remain (277). `main` still has everything and is the reference:

- Read old behaviour with `git show main:src/<path>`, or open a second worktree:
  `git worktree add ../QBase-main main`.
- `docs/rewrite-inventory.csv` was made from `main` and is the list of what has to be rebuilt.
  Status `identical`, `derived` and `modified` were deleted; `ours` stayed.
- The branch does not build until the foundations (Phases 2 to 4) exist. Remaining `ours`
  files import modules that are gone. That is expected.
- Everything that appears on this branch from now on is new, so the similarity check applies
  to all of it. Never copy a file from `main` back with `git checkout main -- <path>`.
- The git history of this branch still contains the ChartDB code. Phase 10 publishes a fresh
  repository for that reason.
- Root files (`vite.config.ts`, `tailwind.config.js`, `components.json`, `index.html`, ...) are
  not covered by the inventory yet. Review them in Phase 0 follow-up.

## Rules for writing

1. **Reading ChartDB is allowed. Copying is not.** Do not paste, retype or translate
   ChartDB code line by line. Do not keep its file open while writing the replacement.
2. **Write from a behaviour spec, not from the source.** Work from `docs/spec/`
   (written in Phase 1), not from the upstream file.
3. **Use a different structure.** New folder names, new module boundaries, new function and
   type names, new state-management approach. Do not mirror ChartDB's layout.
4. **Prefer well-maintained libraries** (MIT/Apache) over reimplementing, and keep their
   notices. Examples: a SQL parser, a DBML parser, React Flow, Dexie.
5. **Old code is already deleted here.** It lives on `main`; look, do not copy back.
6. **Every phase ends with the similarity check** (Phase 0 script). New files must not
   share long runs of identical lines with the upstream file they replace.
7. **Keep a log** in `docs/rewrite-log.md`: module, author, date, what it replaces,
   similarity result.

Note: "can look at it, must not copy line by line" is weaker than a strict clean-room
process. Similar structure and logic can still make a derived work. Rules 2 to 6 reduce that
risk but do not remove it. For the most sensitive modules (SQL import/export, canvas),
prefer having someone who has not read the upstream code write them from the spec.

## Phases

### Phase 0: Baseline and tooling
- [ ] Confirm `server/` and `shared/` contain no ChartDB-derived code (search, compare).
- [ ] Commit `tools/similarity.mjs`: compares each `src/` file with an upstream checkout,
      normalises line endings (CRLF vs LF), reports shared-line percentage and longest run
      of identical lines.
- [ ] Generate `docs/rewrite-inventory.csv`: every `src/` file, status
      (identical / modified / ours), line count, similarity.
- [ ] Add CI check: fail if a new or changed file exceeds the similarity threshold.
- [ ] Decide fixture strategy (see Phase 7).

### Phase 1: Behaviour spec
- [ ] Write `docs/spec/` describing what the editor does: features, data model, import and
      export formats, keyboard shortcuts, edge cases, UI states. Describe behaviour, not code.
- [ ] Record the saved-diagram data format (needed for compatibility with the server and
      existing user data). Formats and facts are fine to keep; code is not.
- [ ] Decide which features to drop. Less to rewrite is better.

### Phase 2: Architecture
- [ ] New folder structure and naming convention.
- [ ] State management choice and data flow.
- [ ] Storage layer design (local Dexie plus server sync).
- [ ] Public interfaces between modules, so phases can proceed independently.

### Phase 3: Foundations
- [ ] UI primitives: regenerate from the shadcn/ui CLI (MIT) with QBase's own wrappers;
      delete the copied `components/` folders as they are replaced.
- [ ] Theme, i18n loader, toast and dialog infrastructure.
- [ ] Router and app shell.

### Phase 4: Domain model and storage
- [ ] Types for diagrams, tables, fields, relationships, areas, notes.
- [ ] Local storage layer and migration of existing local data.
- [ ] Undo and redo history.
- [ ] Replaces: `lib/domain`, `context/storage-context`, `context/history-context`.

### Phase 5: Import and export
- [ ] SQL import per dialect (PostgreSQL, MySQL, SQL Server, SQLite, others), using
      maintained parser libraries where possible.
- [ ] SQL and DBML export, image export.
- [ ] Replaces: `lib/data` and the code in `lib/dbml`.

### Phase 6: Editor
- [ ] Canvas: tables, relationships, areas, notes, selection, minimap.
- [ ] Sidebar, table editor, field editor, relationship dialogs.
- [ ] Filters, diff view, keyboard shortcuts.
- [ ] Replaces: `pages/editor-page`, `context/canvas-context`, `context/diff-context`,
      `context/diagram-filter-context`, dialogs, hooks.

### Phase 7: Data and content
- [ ] Templates and examples: recreate original ones or drop them
      (`assets/templates`, `assets/examples`).
- [ ] Locales: write new translations or generate new ones; remove copied files.
- [ ] Test fixtures: write new ones.

### Phase 8: Tests
- [ ] Rewrite tests from the spec for every new module; delete copied tests.

### Phase 9: Cleanup and verification
- [ ] Similarity check shows no meaningful overlap with upstream.
- [ ] Remove unused dependencies and leftover files.
- [ ] Update `Audit/` findings REPO-045, REPO-049, REPO-069.
- [ ] Lawyer review.

### Phase 10: Release
- [ ] Create a fresh repository with new git history (the current history contains
      ChartDB code and must not be published as is).
- [ ] Apply the chosen licence (for example BSL or PolyForm Shield to block SaaS use).
- [ ] Update `NOTICE` with third-party licences (not ChartDB, once nothing remains).
- [ ] Publish.

## Until the rewrite is done

Do not publish this repository, and do not change the licence. If it must be released
earlier, release it under AGPL-3.0 with ChartDB's name, copyright and a modification notice
restored.

## Open decisions

- Keep backward compatibility with existing saved diagrams? (Recommended: yes.)
- Which features to drop to shrink the scope?
- Who writes the sensitive modules, and have they read ChartDB's code?
- Which final licence: BSL, PolyForm Shield, or other?
