# Rewrite plan: replace the ChartDB-derived editor with original code

Branch: `rewrite/clean-room` (its own history, no parent; `main` is the read-only reference).
Last reviewed: 2026-11-07. Measured against ChartDB commit `ee95448` (2026-11-01).

Not legal advice. A lawyer should review the process early (Phase 2) and the result at the
end (Phase 9) before any licence change.

## 1. Why

The editor in `src/` began as a copy of ChartDB (AGPL-3.0) and still contains most of it.
AGPL-3.0 does not allow relicensing that code or removing its notices. The goal of this
branch is to replace every ChartDB-derived file with original code, so the project can carry
its own licence (for example one that blocks use as a SaaS).

What was measured on `main` (`rewrite/inventory/src.csv`, `src/` text files only; each file
is compared with the whole ChartDB repository, so moved or renamed copies are found):

| Status | Files | Lines | Share of lines |
| --- | ---: | ---: | ---: |
| identical to ChartDB | 319 | 178,323 | 67.2% |
| derived (30% or more of lines shared) | 230 | 52,737 | 19.9% |
| modified (10% to 30% shared) | 14 | 1,361 | 0.5% |
| ours (under 10% shared) | 277 | 32,753 | 12.4% |
| **total** | **840** | **265,174** | |

There are also 136 binary files (images) in `src/` that exist in ChartDB; they are not in the
CSV. 100 of them are template thumbnails (`src/assets/templates/*.png`).

Outside `src/`, 49 text files were measured (`rewrite/inventory/other.csv`): 5 identical,
11 derived, 4 modified, 29 ours. `server/` and `shared/` were measured too: no file is derived
(one is at 12% shared, longest run 9 lines).

## 2. Interim compliance: decide this first

This is a live problem, separate from the rewrite.

- The Docker Hub image `qubdi/qbase` is **public** (tags `latest` and `1.0.0`, last updated
  2026-11-06, 151 pulls when checked). It ships the ChartDB-derived editor under a licence
  (PolyForm Noncommercial) that does not match the AGPL-3.0 terms of the code inside it, and
  without ChartDB's name and copyright.
- The GitHub repository returned 404 to anonymous requests when checked, so it looks private.
  Confirm that, because publishing it as is would be the same problem.

Options (the project owner decides; not decided yet):

1. **Take the image down** (make the Docker Hub repository private or remove the tags) until
   the rewrite is released. Simplest and removes the exposure.
2. **Comply with the AGPL now**: restore ChartDB's name, copyright and licence in `NOTICE`
   and the README, add a modification notice, license the derived parts under AGPL-3.0, and
   offer the corresponding source to everyone who uses the service.

Until one is done: do not publish the repository, do not publish new images, do not change
the licence of `main`.

## 3. What is ours

Kept on this branch (277 files in `src/`, all under 10% shared with ChartDB):

- `src/lib/qubdi` (79 files), `src/components/qubdi` (60), `src/pages/admin-page` (32),
  `src/i18n/qubdi`, `src/pages/share-viewer-page`, `src/pages/home-page`,
  `src/context/qubdi-context`, `src/context/local-config-context`, and small parts inside
  folders that are otherwise rebuilt (for example 21 files in `src/lib/data`, 15 in
  `src/pages/editor-page`).
- `server/` and `shared/` (120 files), unchanged by this plan.
- Root files marked `ours` in `rewrite/inventory/other.csv` (29 files, for example
  `Dockerfile`, `run.sh`, `docker-compose*.yml`; `NOTICE` and `.env.example` are original too but are not text types the tool measures).

These files still import modules that were removed from the branch, so the branch does not
build yet. They may need adapting once the new foundations exist.

Note: earlier drafts of this plan listed `src/templates-data`, `src/context/diagram-context`
and `src/pages/examples-page` as "ours". That was wrong: they match ChartDB and were removed.

## 4. What has to be rebuilt

Measured from the inventory (563 text files, 232,421 lines on `main`, already deleted here):

| Kind | Files | Lines | Notes |
| --- | ---: | ---: | --- |
| Code (`.ts`, `.tsx`) | 410 | 138,174 | includes 50 template files with 84,980 lines of data |
| of which logic, without templates | 360 | 53,194 | the real rewrite effort |
| Tests | 129 | 85,102 | 44 files / 68,940 lines are SQL and DBML test fixtures |
| Translations | 22 | 8,966 | |
| Styles | 2 | 179 | |
| Binary images | 136 | n/a | 100 template thumbnails and 36 others |

Largest logic areas (lines, files):

| Area | Lines | Files |
| --- | ---: | ---: |
| `lib/data` (SQL import and export) | 14,008 | 61 |
| `pages/editor-page` | 12,668 | 84 |
| `lib/domain` (data model) | 3,030 | 27 |
| `pages/examples-page` | 2,891 | 3 |
| `lib/dbml` | 2,591 | 5 |
| `context/diagram-context` | 1,907 | 2 |
| `dialogs/common` | 1,795 | 11 |
| `context/storage-context` | 862 | 2 |
| everything else | about 13,400 | |

### Files outside `src/`

| File | Shared | Action |
| --- | ---: | --- |
| `tailwind.config.js` | 91%, run of 77 lines | rewrite from our own design tokens |
| `components.json` | 81% | regenerate with the shadcn CLI; it is tool output |
| `tsconfig.app.json` | 88% | rewrite with our own compiler options (Vite template based) |
| `index.html` | 63% | rewrite |
| `vitest.config.ts`, `vite.config.ts`, `eslint.config.mjs` | 53% to 59% | rewrite |
| `.github/workflows/cla.yaml`, `release.yaml` | 53% to 57% | rewrite |
| `.dockerignore` | 58% | rewrite |
| `CODE_OF_CONDUCT.md` | 99% | keep: it is the Contributor Covenant (CC BY 4.0) with its attribution; allow-listed |
| `.nvmrc`, `.prettierignore`, `public/config.js`, `tsconfig.json`, `tsconfig.node.json` | identical | allow-listed: one-line, empty or standard-template files |
| `CLA.md`, `CONTRIBUTING.md`, `publish.yaml`, `package.json` | 10% to 26% | review wording; list in `rewrite/rewritten.txt` when done |
| `public/load-new-db-instructions.gif` | identical file | replace with our own |

The root files are cheap to fix (about 800 lines in total). Do them in Phase 0 so the
CI check can cover them.

### Dependencies

116 direct dependencies, all permissive except three font packages (OFL-1.1, fine with
attribution). Full list: `rewrite/inventory/third-party-licences.csv`. Choosing the same libraries as
ChartDB is not copying; copying its code is. Re-run `node tools/licences.mjs` in Phase 9 and attach each library's notice to `NOTICE`.

## 5. How this branch works

- The ChartDB-derived code is deleted from this branch. `main` still has all of it and is
  the reference: `git show main:src/<path>`, or a second worktree
  (`git worktree add ../QBase-main main`).
- `rewrite/inventory/src.csv` was made from `main` and lists every file that has to be
  rebuilt. `rewrite/inventory/other.csv` covers the files outside `src/`.
- The branch has its own history: one root commit, then new work only. `main` keeps the old
  history, which contains ChartDB code, so Phase 10 still ends in a fresh repository.
- Pull requests into `main` are not possible (unrelated histories). Work lands directly on
  this branch; protect it and review changes before merging.
- The branch does not build until the foundations exist (Phase 3). That is expected; the
  similarity check is the CI gate until then.
- Never copy a file back from `main` (`git checkout main -- <path>`).

## 6. Rules for writing

1. **Reading ChartDB is allowed. Copying is not.** Do not paste, retype or translate its code
   line by line. Do not keep its file open while writing the replacement.
2. **Write from a behaviour spec** (`rewrite/spec/`), not from the old file.
3. **Use a different structure.** New folders, module boundaries, names, state management.
   Do not mirror ChartDB's layout.
4. **Prefer maintained libraries** (MIT or Apache) to reimplementing, and keep their notices.
5. **Old code is already deleted here.** It lives on `main`: look, do not copy back.
6. **Every pull request passes the similarity check** (section 9).
7. **Keep the records**: `rewrite/provenance.md` (who has read what) and `rewrite/log.md`
   (one row per finished module).
8. **Clean authors for the risky modules.** SQL import and export, the canvas and the data
   model are written by someone (or a fresh AI session) who has not read ChartDB's source,
   working only from the spec. See `rewrite/provenance.md`.

The project's working rule ("we may look at the old code but must not copy line by line") is
weaker than a strict clean-room process. Similar structure and logic can still make a derived
work even when no line is identical. Rules 2, 3, 6, 7 and 8 reduce that risk but do not remove
it. Ask the lawyer in Phase 2 whether this process is enough.

## 7. Phases

Order: 0 then 1 then 2 then 3. After 3, phases 4 and 5 can run in parallel, then 6. Phase 7
can start once 5 exists. Phase 8 happens inside every phase. Phases 9 and 10 are last.

A phase is finished only when all of its "done when" lines are true.

### Phase 0: Baseline and tooling

Deliverables: similarity tool, inventories, CI check, provenance and log files, root files
rewritten, fixture decision.

Done when:
- [x] `tools/similarity.mjs` exists, handles CRLF, finds moved copies and checks any tracked file.
- [x] `rewrite/inventory/src.csv` and `rewrite/inventory/other.csv` are committed.
- [x] `server/` and `shared/` confirmed clean (no derived file).
- [x] `rewrite/inventory/third-party-licences.csv` lists the direct dependencies.
- [x] `rewrite/provenance.md`, `rewrite/log.md`, `rewrite/parity-checklist.md` and
      `rewrite/similarity-allow.txt` exist.
- [x] `.github/workflows/similarity.yaml` checks every file on this branch. (Written; not yet
      run on GitHub.)
- [ ] The workflow has passed once on GitHub.
- [x] The root files in section 4 are rewritten and listed in `rewrite/rewritten.txt`
      (2026-11-07; local check passes, 0 files over the limits).
- [x] Fixture strategy decided (section 8, decision 4): drop all ChartDB templates, examples
      and fixtures; write our own (2026-11-07).
- [x] Interim compliance decided (section 2): take the image down; the owner removes it
      from Docker Hub (2026-11-07). Confirm it is done before Phase 1 ends.

### Phase 1: Behaviour spec

Deliverables: `rewrite/spec/` and a filled `rewrite/parity-checklist.md`.

Done when:
- Every feature area in the checklist has behaviour lines, each marked keep, change or drop.
- The saved-diagram data format is documented (needed for the server and for existing user
  data). Data formats and facts may be kept; code may not.
- A manual test script exists (`rewrite/spec/manual-test-script.md`).
- The project owner has signed off the drop list.

How: run `main` side by side (`run.sh` or the Docker image) and describe what a person sees.
The spec describes behaviour, not code.

### Phase 2: Architecture

Deliverables: `rewrite/architecture.md`.

Done when:
- Folder layout, naming rules, state management and data flow are written down and differ
  from ChartDB's.
- Module interfaces are fixed so phases 4 to 6 can proceed independently.
- Storage design covers local Dexie data, server sync and migration of existing saved
  diagrams.
- A lawyer has reviewed the process in sections 6 and 9.

### Phase 3: Foundations

Deliverables: UI primitives (regenerated with the shadcn CLI, MIT, and our own wrappers),
theme, i18n loader, toasts and dialogs, router, app shell, `vite`/`tailwind`/`eslint` configs.

Done when:
- `npm run build`, `npm run lint` and `npm run test:ci` pass.
- The app starts with an empty editor shell and the existing QBase screens (admin, share
  viewer, home) render.
- The similarity check passes.

### Phase 4: Domain model and storage

Deliverables: types for diagrams, tables, fields, relationships, areas, notes; local storage;
undo and redo; migration of existing local data.

Replaces: `lib/domain`, `context/storage-context`, `context/history-context`,
`context/diagram-context`.

Done when:
- A diagram saved by the old editor (fixtures taken from real exports, not from ChartDB's
  tests) opens in the new one with no data loss.
- Undo and redo work for every edit type in the parity checklist.
- Written by a clean author (section 6, rule 8).

### Phase 5: Import and export

Deliverables: SQL import per dialect (PostgreSQL, MySQL, SQL Server, SQLite and the others
kept after Phase 1), SQL and DBML export, image export, JSON export.

Replaces: `lib/data`, the code in `lib/dbml`.

Done when:
- For each dialect, a set of our own sample schemas imports and exports correctly.
- Round trip: import, export, import again gives the same model.
- Written by a clean author. Prefer maintained parsers over hand-written ones.

### Phase 6: Editor

Deliverables: canvas, sidebar, table and field editors, relationship dialogs, filters, diff
view, shortcuts, clipboard.

Replaces: `pages/editor-page`, `context/canvas-context`, `context/diff-context`,
`context/diagram-filter-context`, `dialogs`, `hooks`.

Done when:
- Every **keep** line of the parity checklist for the editor is ticked.
- The QBase server features (publish, share links, re-sync, drift, lint) work end to end.
- The canvas is written by a clean author.

### Phase 7: Data and content

Deliverables: translations, templates and examples, test fixtures, images.

Done when:
- No template, example, thumbnail or locale file from ChartDB remains (the inventory shows no
  `identical` or `derived` row).
- New content, if any, is ours: schemas we wrote or generated from public sources with a
  note on the source, thumbnails we made.

### Phase 8: Tests

Runs inside every phase, not at the end.

Done when:
- Each module's tests are written from the spec. No test file is copied from `main`.
- Server, shared and editor tests all pass in CI.

### Phase 9: Cleanup and verification

Done when:
- `node tools/similarity.mjs ... --check --all` passes for every tracked file, with only the
  reasoned entries in `rewrite/similarity-allow.txt`.
- Every **keep** line in `rewrite/parity-checklist.md` is ticked.
- Dependencies were re-audited; `NOTICE` lists third-party licences.
- Audit findings REPO-045, REPO-049 and REPO-069 are updated.
- A lawyer has reviewed the finished result and the records.

### Phase 10: Release

Done when:
- A fresh repository exists, containing only this branch's content.
- The chosen licence is applied (section 8, decision 5) and `NOTICE` is correct.
- The old Docker Hub tags are replaced or removed and the new image is published.

## 8. Decisions

| # | Decision | Recommendation | Status |
| --- | --- | --- | --- |
| 1 | Interim compliance (section 2) | take the image down until release | decided 2026-11-07: take down (owner does it) |
| 2 | Keep saved diagrams compatible | yes: you have users and a server | open |
| 3 | Which features to drop | decide in Phase 1, fewer is faster | open |
| 4 | Templates and examples | drop all ChartDB ones (50 data files, 100 PNGs); add own later | decided 2026-11-07: drop all |
| 5 | Final licence | BSL or PolyForm Shield blocks SaaS use but allows reading and self-hosting | open |
| 6 | Who writes the risky modules | a clean author, from the spec | open |

## 9. The similarity check, and its limits

Run: `node tools/similarity.mjs --upstream <chartdb checkout> --src src --src server/src --src shared --check --all --rewritten rewrite/rewritten.txt --allow rewrite/similarity-allow.txt`

A file fails if it is identical to an upstream file, shares 30% or more of its lines, or
contains a run of more than 25 identical lines (blank lines and lines of three characters or
fewer are ignored, line endings and indentation too). The thresholds are judgement, not law.

What it does not catch:

- code translated into another style or language, or rewritten from memory after reading the
  original: that is why the process rules in section 6 matter more than the number;
- binary files such as images;
- anything compared against a different ChartDB version than `ee95448` (the check pins that
  commit; a fork based on an older version may share lines that only an older checkout has);
- structure and naming that mirror ChartDB without sharing lines.

Passing the check is necessary, not sufficient.

## 10. Effort (rough guess, re-estimate after Phase 2)

About 53,000 lines of logic must be rebuilt, plus tests and content. If half of the features
are dropped, about 25,000. As an order of magnitude only: one developer working with AI
assistance, a few months for a reduced feature set, more for full parity. The biggest risks
to the schedule are SQL import and export, and reaching parity on the canvas.

## 11. Risks

- The process is judged too weak: mitigate with the lawyer review in Phase 2 and clean authors.
- The branch cannot build for a long time: mitigate by making Phase 3 small and early.
- The rewrite drifts from `main` behaviour: mitigate with the parity checklist and sign-off.
- The public image keeps circulating: see section 2.
- Contributors read `main` while writing clean modules: mitigate with `rewrite/provenance.md`.

## 12. Until the rewrite is done

Do not publish this repository and do not change the licence. If you must release earlier,
release the existing editor under AGPL-3.0 with ChartDB's name, copyright and a modification
notice restored (section 2, option 2).
