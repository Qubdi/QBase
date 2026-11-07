# Brief for the lawyer review

For the project owner to send, with the documents listed at the end. Not legal advice; this
file only collects the facts and the questions. Prepared 2026-11-07, updated 2026-11-08
after the rewrite was finished (the review asked for in Phase 9).

## Situation

QBase is a database-diagram tool with a server (original code) and a browser editor. The editor
in `src/` began as a copy of ChartDB (AGPL-3.0) and still contained most of it (measured: about
87% of its lines identical or derived). The owner wants to release QBase under its own licence
(for example one that blocks use as a SaaS). Since AGPL-3.0 does not allow relicensing that
code or removing its notices, the editor is being rewritten so that no ChartDB-derived code
remains. The rewrite is done on a branch with its own history (`rewrite/clean-room`); the old
code stays on `main` and is not to be published.

## What was done

- A similarity tool measures every file against ChartDB at one pinned commit (`ee95448`) and is
  a CI gate (identical, 30% or more shared lines, or a run of more than 25 shared lines fails).
- A behaviour spec of the old editor was written from its code (no code in it; a checker rejects
  code and long runs shared with ChartDB). The saved-diagram data format (JSON keys, string
  values, storage names) is recorded as facts so existing users' data keeps opening.
- An architecture was chosen that differs from ChartDB's in structure, naming and state
  management.
- The risky modules (data model and commands, storage, SQL/DBML import and export, the canvas)
  were written by "clean authors": fresh AI sessions working in a checkout of the new branch
  only, with no access to `main`, ChartDB or a remote, from the spec alone. Their transcripts
  were parsed afterwards to confirm no access outside that directory. The other modules
  (workspace, dialogs, settings, forms, store adapter) were written by AI sessions briefed by an
  orchestrating session that had read the old code while the spec was written; later sessions
  were instructed not to read `main` or ChartDB. `rewrite/provenance.md` records who read what.
- Records: `rewrite/provenance.md`, `rewrite/log.md` (one row per module), `rewrite/decisions-*.md`.

## State on 2026-11-08

- All of `src/` is rewritten. Similarity run over the whole tree (862 files measured, 876
  checked): 0 files identical, 13 files (753 lines, 0.6%) still classed as derived, 20 files
  (2245 lines, 1.7%) modified but under the limits, 829 files (97.8% of lines) original. The
  derived files are the shadcn/ui-style components, the toast and a few tiny config files; each
  is in `rewrite/similarity-allow.txt` with the reason (shadcn/ui is MIT and ChartDB's copies
  come from the same upstream).
- Behaviour parity: 675 of 687 rows of `rewrite/parity-checklist.md` have a named test; the open
  rows are listed there. About 3,176 tests, a headless-browser smoke test and 62 browser flows
  pass. Tests were written from the spec, not by copying ChartDB's tests.
- The data-format migration from the old browser database was tested with fixtures built from
  the spec, not with a real old database.
- Translations into 6 languages (Russian, Georgian, German, Italian, French, Chinese) are machine-made from our own English text (the old
  translations were not used). A native-speaker review is pending.
- Dependency licences re-audited: 118 direct dependencies, 99 MIT, 13 Apache-2.0, 3 OFL fonts,
  1 ISC, 1 Unlicense; `NOTICE` lists the fonts and shadcn/ui.
- The public Docker Hub image `qubdi/qbase` was taken down by the owner on 2026-11-08.
- The new branch has one root commit (561 files). Its `src/` held only original QBase code (277
  files, none identical or derived), so no session worked in a tree with ChartDB-derived source.
  The ChartDB-derived or identical files in that commit were 16 small root files (editor and
  build configs, workflows, `.dockerignore`, `CODE_OF_CONDUCT.md`, a few tiny dotfiles) and one
  GIF; they were replaced or deleted in the next commits. The old history, which does hold the
  derived code, stays on `main` and is not published. The release is still planned as a fresh
  repository (`rewrite/provenance.md`, section "What the branch's first commit holds").
- The sessions that wrote code worked under written rules (clean authors in isolated checkouts
  for the risky modules; the rest told not to read `main` or ChartDB). A scan of every tool call
  of the 56 sessions the orchestrator started found no session opening `main` or ChartDB material
  except the four spec writers, who did so by design (`rewrite/provenance-audit/README.md`).
  Two peer sessions are not covered by the scan and still need declarations.
- Code review, accessibility, performance and live-database checks were done by further AI
  sessions; their reports are in `rewrite/review/` and `rewrite/phase9/`.

## Questions

1. Is this process (spec, different architecture, clean authors for the risky modules,
   similarity gate, records) enough to treat the result as not derived from ChartDB? What
   would you add or tighten?
2. AI assistant sessions write much of the code. Does the "clean author" idea hold for them
   (fresh session, no access to the old code)? What evidence should we keep?
3. The spec authors read the old code. Is a behaviour spec written by someone who read the code
   acceptable as the only input of the clean authors? Is anything in it (data keys, wire
   format, export file naming, error texts, defaults) at risk of being protected expression?
4. The old code remains in the Git history of `main` and was published in a public Docker image
   (`qubdi/qbase`, tags `latest` and `1.0.0`, with the editor under a licence that does not
   match AGPL-3.0). The owner is taking the image down. What exposure remains, and what should
   be said or done about the past releases (notices, source offer, takedown)?
5. Release plan: a fresh repository containing only the new code. Any problem with that (for
   example the old contributors' rights, the CLA, or the history of the new branch)?
6. The owner chose the Elastic License 2.0 (2026-11-08) because they want wide use by developers
   and companies but no hosting of the product as a service by third parties. It is applied in
   `LICENSE`. Does it fit that goal, and is it compatible with the dependencies (MIT, Apache-2.0,
   OFL fonts, one ISC and one Unlicense) and the notices we keep for them? The old project
   licence was PolyForm Noncommercial 1.0.0, and the contributor agreement (`CLA.md`) was
   written for it; its grant does not depend on the licence, only its description does.
7. Files that remain from the old project by design: the Contributor Covenant (CC BY 4.0),
   one-line config files, and the shadcn/ui-style components. Are the reasons recorded enough?
8. With the result finished, what else should the final review look at? In particular the 13
   files still classed as derived and the 20 modified ones.
9. Much of the code was written by AI assistants. Is the new code protectable and licensable
   by the owner as its own work (including the effect of AI authorship on a restrictive licence
   such as the Elastic License 2.0), and what should the records and the licence text say?
10. The behaviour spec records visible behaviour of a product whose code is AGPL-3.0 (menu
    names, shortcuts, defaults, error texts, layout rules). Is re-implementing that behaviour
    safe, and are any of those texts too close to the original to keep?

## Documents to attach

`rewrite/PLAN.md` (sections 1, 2, 6, 9, 11), `rewrite/architecture.md`,
`rewrite/provenance.md`, `rewrite/provenance-audit/README.md`, `rewrite/log.md`, `rewrite/spec/owner-decisions.md`,
`rewrite/similarity-allow.txt`, `rewrite/inventory/src.csv` (the measured overlap per file), a
sample of the spec (`rewrite/spec/data-format.md`), `rewrite/parity-checklist.md`,
`rewrite/phase8/` (test results per row), `rewrite/review/` and `rewrite/phase9/` (reviews and
checks), and the output of `node tools/similarity.mjs --check --all` on the final tree.
