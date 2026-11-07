# Rewrite TODO

Tasks for the clean-room rewrite. The reasoning, rules and "done when" criteria for each
phase are in [PLAN.md](PLAN.md); this file is only the checklist. Tick an item when it
ships and note the commit. Last reviewed 2026-11-07.

Do not publish the repository or change the licence until the last item is ticked.
The ChartDB-derived code is already deleted on this branch; read it from `main`
(see section 5 of the plan).

## Now (decisions and open Phase 0 items)

- [x] **Interim compliance (plan section 2)** decided 2026-11-07: take it down; owner removes the image.
      (Original item:) The Docker Hub image `qubdi/qbase` is public
      and ships the ChartDB-derived editor. Take it down until release, or comply with the
      AGPL now. Also confirm the GitHub repository is private.
- [ ] **Run the similarity workflow once on GitHub** and confirm it passes.
- [x] **Rewrite the derived root files** (2026-11-07). Rewritten and listed in `rewritten.txt`; the
      reviewed ones are listed too. The GIF was unused and is deleted. `components.json` was
      written by hand, not with the CLI, and now shares 0 lines.
- [ ] **Decide the open questions** in plan section 8: saved-diagram compatibility,
      templates and examples, final licence, who writes the risky modules.
- [ ] **Add a branch protection rule** for `rewrite/clean-room` (reviews and the similarity
      check required), because pull requests into `main` are not possible.

- [x] Regenerated `src/platform/ui/*` with the shadcn CLI 4.23.0 and added its MIT notice to `NOTICE`
      (2026-11-07). `toast.tsx` stays hand-written (no Radix toast in the CLI); replace in Phase 6.
- [x] Merged the duplicated backend-URL logic; removed the unused `src/components/tooltip`.

## Phases

1. [x] **Phase 0: tooling and records.** Similarity tool, inventories, CI workflow, licence
   list, provenance and log files, parity checklist skeleton. Open parts are under "Now".
2. [x] **Phase 1: behaviour spec** (done 2026-11-07; the specs come from reading `main`, not from running
   it: cross-check with the live walkthrough when browser tooling exists) in `spec/`. Fill in `parity-checklist.md` by using the app
   on `main`; mark each behaviour keep, change or drop; document the saved-diagram data
   format; write `spec/manual-test-script.md`; get the owner's sign-off on the drop list.
3. [x] **Phase 2: architecture** (done 2026-11-07 except the lawyer review: owner sends `lawyer-brief.md`) in `architecture.md`: folders, naming, state management, data
   flow, storage and migration, module interfaces. Ask a lawyer to review the process.
4. [x] **Phase 3: foundations** (done 2026-11-07: `npm run build`, lint and `test:ci` pass, similarity gate passes; still open from it: real-browser check). UI primitives (shadcn CLI), theme, i18n loader, toasts,
   dialogs, router, app shell, build configs. The branch builds and tests again.
5. [x] **Phase 4: domain model and storage** (clean author; done 2026-11-07, commits b48a944..ffadd67; owner confirmations in `decisions-phase4.md`). Types, local storage, undo and
   redo, migration of existing local data.
6. [x] **Phase 5: import and export** (clean author; done 2026-11-07, commits ffb0448..73c0a74; not done: import into an open diagram, re-sync and DBML apply, rows IMP-075 to IMP-083, which need the store: Phase 6; open points in `decisions-phase5.md`). SQL import per dialect, SQL, DBML, JSON
   and image export; round-trip tests with our own sample schemas.
7. [ ] **Phase 6: editor** (canvas by a clean author). Done 2026-11-07: store and QBase adapter (6a),
   workspace frame, menus, dialogs, import, export, settings (6c), side panel, forms and clipboard
   (6d), the canvas (clean author, `clean/phase6`), the canvas in the frame with its hooks (6f),
   old canvas tests ported (6e). Open: canvas `onReady` controls for the frame (zoom to filter group,
   real fit and viewport origin), `findFreeShift` wiring into drop, paste and drag, link side
   stickiness, drag of new items from the panel, DBML editing with diff (EDT-239 to 247), re-sync
   and import into an open diagram (IMP-075 to IMP-083), the metadata queries for PostgreSQL,
   MySQL and SQL Server, a real-browser run of everything, trimming the 15 MB import chunk
   (Monaco languages).
8. [ ] **Phase 7: data and content.** New translations, templates and examples (or none),
   fixtures and images. No `identical` or `derived` row left in the inventory.
9. [ ] **Phase 8: tests**, in every phase, written from the spec.
10. [ ] **Phase 9: cleanup and verification.** Similarity check clean for every tracked file,
    parity checklist fully ticked, dependency licences re-audited (`node tools/licences.mjs`),
    `NOTICE` updated, Audit REPO-045, REPO-049 and REPO-069 updated, lawyer review of the
    result.
11. [ ] **Phase 10: release.** Fresh repository with new history, chosen licence applied,
    old Docker Hub tags replaced or removed, new image published.

## Records to keep up to date while working

- `provenance.md`: add a row before the first commit of a module.
- `log.md`: add a row when a module is finished (similarity result and parity lines).
- `parity-checklist.md`: tick lines only with a test or manual step behind them.
- `inventory/src.csv`: the list of files on `main` still to rebuild. It does not change;
  regenerate `inventory/other.csv` with `tools/similarity.mjs --tracked ...` after the root
  files are rewritten.
