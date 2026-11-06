# QBase TODO

Open work, newest first. Tick an item when it ships and note the commit.

## Clean-room rewrite of the editor

Plan and rules: [REWRITE-PLAN.md](REWRITE-PLAN.md). Branch: `rewrite/clean-room`. Goal: replace every
ChartDB-derived file in `src/` so the project can carry its own licence. Measured 2026-11-07 against
ChartDB `ee95448`: 87% of `src/` lines are identical or derived (`docs/rewrite-inventory.csv`);
`server/` and `shared/` are clean. Do not publish or relicense until the last item is ticked.
The derived files are already deleted on this branch; read them from `main` (see "How this branch works" in the plan).

1. [x] **Phase 0: tooling.** `tools/similarity.mjs`, `docs/rewrite-inventory.csv`,
   `.github/workflows/similarity.yaml`, `docs/rewritten.txt`. Derived code removed from the branch. Still open here: decide the fixture strategy (item 8) and review the root config files (`vite.config.ts`, `tailwind.config.js`, `components.json`, `index.html`) for ChartDB origin.
2. [ ] **Phase 1: behaviour spec** in `docs/spec/`: features, data model, import and export formats,
   shortcuts, edge cases. Describe behaviour, not code. Decide which features to drop.
3. [ ] **Phase 2: architecture.** Own folder layout, state management, storage design, module interfaces.
4. [ ] **Phase 3: foundations.** UI primitives regenerated from the shadcn/ui CLI, theme, i18n loader,
   toasts and dialogs, router and app shell.
5. [ ] **Phase 4: domain model and storage.** Types, local storage and migration of existing data,
   undo and redo. Replaces `lib/domain`, `context/storage-context`, `context/history-context`.
6. [ ] **Phase 5: import and export.** SQL import per dialect (prefer maintained parser libraries), SQL
   and DBML export, image export. Replaces `lib/data` and the code in `lib/dbml`.
7. [ ] **Phase 6: editor.** Canvas, sidebar, table and field editors, relationship dialogs, filters, diff
   view, shortcuts. Replaces `pages/editor-page`, `context/canvas-context`, `diff-context`,
   `diagram-filter-context`, dialogs and hooks.
8. [ ] **Phase 7: data and content.** Recreate or drop `assets/templates` (131k lines),
   `assets/examples`, copied locale files and test fixtures. Decide this early: it is most of the line count.
9. [ ] **Phase 8: tests.** Rewrite tests from the spec and delete copied ones.
10. [ ] **Phase 9: cleanup.** Similarity check clean, unused dependencies removed, Audit REPO-045, REPO-049
    and REPO-069 updated, lawyer review.
11. [ ] **Phase 10: release.** Fresh repository with new git history (the current history contains ChartDB
    code), chosen licence applied (BSL or PolyForm Shield to block SaaS use), NOTICE updated.

Open decisions: keep compatibility with existing saved diagrams (recommended: yes), which features to drop,
who writes the sensitive modules (SQL import and export, canvas) and whether they have read ChartDB's code,
final licence.

## Dependency upgrades (client)

Checked 2026-10-19 with `npm outdated` and `npm audit --omit=dev`: no known vulnerabilities, the
server and runtime images (Node 24, PostgreSQL 18, nginx stable) are current. The client is behind
on a few major versions. None of this is a security fix; it keeps later upgrades from getting
harder. One PR per step, with `npx vitest run` and `npm run build` (includes lint) green before it is ticked.
Let Dependabot's minor and patch PRs merge as they come; take majors here, on purpose.

1. [x] **zod 3.25 → 4 on the client.** Small, and puts the client on the same major as the server
   (already zod 4). Watch for changed error formatting (`.format()`/`.flatten()`, `message` →
   `error`) and `.default()`/`.optional()` behaviour in form and import schemas.
2. [x] **React 18.3 → 19, in one PR together with the libraries that follow it:**
   react-helmet-async 2 → 3, vaul 0.9 → 1, framer-motion 12 → 14. Before starting, scan for what
   React 19 removed: `defaultProps` on function components, string refs, legacy context,
   `ReactDOM.render`/`findDOMNode`, and `@types/react` 19 type changes (`useRef` needs an
   argument, `JSX` namespace). Check Radix, xyflow, monaco and cmdk still render and behave.
3. [x] **@dbml/core and @dbml/parse 3.x/5.x → 10.x, only when there is a reason** (newer DBML
   syntax or a parser fix we need). It is the core of DBML import/export; run the `dbml-export`
   cases and the import tests, and compare the output of the existing cases before and after.
4. [x] **Only when needed or when step 2 forces it:** react-resizable-panels 2 → 4 (API changed),
   @dnd-kit/sortable 8 → 10, nanoid 5 → 6.
5. [x] **tailwind-merge 2 → 3 only together with a Tailwind 4 move**, not on its own.

## React Compiler lint rules

`eslint-plugin-react-hooks` 7 adds rules from the React Compiler. The existing
components were written before them (about 80 places reset state in an effect or
read a ref while rendering), so `eslint.config.mjs` keeps these four off until
those places are migrated. Turn each on, fix what it reports, then remove its
line from the config.

1. [ ] `react-hooks/set-state-in-effect`
2. [ ] `react-hooks/refs`
3. [ ] `react-hooks/preserve-manual-memoization`
4. [ ] `react-hooks/use-memo`
