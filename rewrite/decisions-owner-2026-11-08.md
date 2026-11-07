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
- Still to do: written confirmation from the lawyer that ELv2 suits the goal, and the audit
  files (REPO-045, REPO-049, REPO-069).

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
