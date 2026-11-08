# Owner decisions, 2026-11-08

## Lawyer's informal answer (relayed by the owner, not yet in writing)

- If more than 98% of the code is original, there is no problem in applying any licence.
- As a good gesture, say that the project is inspired by ChartDB.

Measured on the final tree: 97.8% of lines original (829 of 862 files), 0 identical,
13 files (0.6%) derived from shared upstream boilerplate and 20 files (1.7%) modified
but under the limits. Similarity is a measure of copying, not a legal test; the lawyer's
answer does not cover the other questions in `lawyer-brief.md` (AI authorship, the
behaviour spec, the history of the old branch, notices for the dependencies).
Action for the owner: ask the lawyer to confirm the answer by email and to answer questions
4, 5, 9 and 10 of the brief, so the confirmation is on record in `provenance.md`.

## What was done with it

- Acknowledgement added to `NOTICE` and `README.md` ("inspired by ChartDB", with thanks).
  This also answers the part of audit REPO-045 about naming the upstream.
- EDT-047 (credit mark on the canvas) closed: the acknowledgement lives in README and NOTICE,
  not on the canvas. An About line in the app can be added if the owner wants it.
- Licence chosen by the owner: **Elastic License 2.0** (wide use by developers and companies,
  no hosting as a service for third parties). Applied the same day: `LICENSE` (official text,
  fetched from Elastic's repository), `license` fields in both `package.json` files and both
  lock files (`Elastic-2.0`), `NOTICE`, `README.md`, `CLA.md` and `QBase-build-tasks.md`.
  The CLA's grant (section 1) does not depend on the licence, so earlier signatures stand;
  only its description of the project licence changed.
- Written confirmation from the lawyer that ELv2 suits the goal: see the next section. Audit
  files: rev 28 (REPO-045, REPO-049 fixed, REPO-069 narrowed), rev 29 below.

## Languages (owner, 2026-11-08)

Only these languages ship: English, Russian, Georgian, German, Italian, French and Chinese
(both Simplified and Traditional, kept because "Chinese" covers both). The other 16 locale
files, their list entries, their "time ago" wording and their translation notes were removed;
Georgian and Italian were translated new. Right-to-left support in `i18n.ts` stays (it costs
nothing and a language can be added later). Translations remain machine-made and need a
native-speaker review before release.

## New diagram dialog (owner, 2026-11-08; SHL-032, SHL-042)

One grid of every supported database (PostgreSQL, MySQL, SQL Server, SQLite, MariaDB,
CockroachDB, Generic). No Transactional/Analytical tabs and no "More databases" toggle: the
analytical tab only held ClickHouse, which was dropped, and seven choices fit on one screen.

## Old Safari (owner, 2026-11-08; SHL-103)

Supported: Safari 16.4 and newer, Chrome and Edge 111 and newer, Firefox 114 and newer (the
build's default target). No stand-ins for older browsers. A browser that lacks a needed
function gets a short notice in its own language (en, ru, ka, de, it, fr, zh) from
`public/browser-check.js`, which runs before the app and uses no eval, so the page's script
policy allows it. `src/main.tsx` does not start the app when the notice was shown.

## Owner items closed on the owner's word (2026-11-08)

The owner marked these as done. They cannot be checked from this repository; what the
orchestrating session could and could not verify is stated for each.

| Item | Status | What was checked |
| --- | --- | --- |
| Lawyer's written confirmation (ELv2 suits the goal; questions 4, 5, 9, 10 of the brief) | done | the document is not in the repository; keep a copy with the records |
| SEC-001: rotate the old `POSTGRES_PASSWORD`, `CONNECTION_KEY`, `MSSQL_SA_PASSWORD` | rotation done | not verifiable here |
| SEC-001: GitHub Support purges the old pull-request refs | **not confirmed** | `git ls-remote origin 'refs/pull/*/head'` still lists 71 refs on 2026-11-08; re-run it after Support answers |
| REPO-005: branch protection | done | not verifiable here (GitHub CLI not installed) |
| Declarations of the peer sessions `qbase-e4` and `qbase-91` | done | the text is not in the repository; attach it to `provenance.md` |
| Native-speaker review of the translations (ru, ka, de, it, fr, zh_CN, zh_TW) | done | any changes the reviewers made are not in the repository; if there were any, they must be committed |
| Docker Hub release secrets (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`) | set | not verifiable here |

## Restore the old UI/UX (owner, 2026-11-08)

The owner looked at the new editor next to the old one and decided: "keep all old UI/UX and just
change the code and the structure; the old UI was perfect". This replaces earlier decisions
that made the new editor look or behave differently.

**Comes back (measured from the running old editor, black-box; see `spec/visual-*.md`):**
the look of everything (colours, sizes, radii, spacing, fonts, shadows, animations: shell, panels,
dialogs, tables, relationship lines and markers, areas, notes, minimap, toolbar, menus), the old
English wording and its capitalisation, the Backup menu (SHL-064), the dependencies feature
(EDT-183 to EDT-186), Highlight Fields (EDT-196), the Type colours legend (EDT-045),
Oracle and ClickHouse import and export (EXP-008), and the Transactional and Analytical tabs with
the More/Primary Databases toggle in the New dialog (SHL-032, SHL-042). Accessibility fixes stay:
where an old colour or control fails the contrast or keyboard checks, it is changed by the smallest
amount needed and the change is listed.

**Stays out (owner, same day):** the examples and templates pages and their content, the Check
Examples card (SHL-018, SHL-041, SHL-091, SHL-092, SHL-104), because that content was written by
the ChartDB authors; the database logos in the New dialog (neutral icons take their place), for the
same reason; the stray `diagramId` key (DAT-089) and the unused build variables (SHL-008).

**Changed later the same day (owner):** the database logos are back, copied as image files from the
main branch, with the icons of the old editor, so the interface looks the same; the code that shows
them is new (see NOTICE). The ChartDB examples and templates pages stay out. In their place QBase has
its own examples, one per database (a hospital network, an online bookshop, a library network, a
wellness app, a hotel chain, airline operations, a delivery network, web analytics), written for this
project. Each has 43 to 46 tables in 7 to 8 areas, with sticky notes and descriptions on every table
and most columns. They open from "Check Examples" in the New dialog and from Actions, Examples.

**Not yet decided:** the "change" rows of the parity checklist that improved behaviour (for example
undo shortcuts inside text boxes, warning on duplicate table names, the copy toast naming the
platform's key). They stay as built until the owner says otherwise.

Method: two black-box observers measure the old editor (no source, bundles or `main` read);
implementers who have not seen the old code apply the measurements and a pixel comparison
(`tools/e2e/visual/compare.mjs`) shows what still differs.

## The rule for the restored UI (owner, 2026-11-08)

"UI must be very much the same, but the code structure and logic can be different."

- The UI (what a person sees and does: look, sizes, colours, spacing, wording, behaviour) is to
  match the old editor as closely as the measurements allow.
- The code (structure, file and variable names, component split, state handling, CSS
  organisation, helper functions) is written new and may differ. It is not a copy of the old
  project, and an exact replica is not wanted.
- Checks that keep both true: the pixel comparison against the old editor
  (`tools/e2e/visual/compare.mjs`) for the UI, and for the code the similarity gate over the whole
  tree plus the transcript scan of every session (`rewrite/provenance-audit/`).
