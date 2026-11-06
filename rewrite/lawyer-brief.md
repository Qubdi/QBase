# Brief for the lawyer review

For the project owner to send, with the documents listed at the end. Not legal advice; this
file only collects the facts and the questions. Prepared 2026-11-07.

## Situation

QBase is a database-diagram tool with a server (original code) and a browser editor. The editor
in `src/` began as a copy of ChartDB (AGPL-3.0) and still contained most of it (measured: about
87% of its lines identical or derived). The owner wants to release QBase under its own licence
(for example one that blocks use as a SaaS). Since AGPL-3.0 does not allow relicensing that
code or removing its notices, the editor is being rewritten so that no ChartDB-derived code
remains. The rewrite is done on a branch with its own history (`rewrite/clean-room`); the old
code stays on `main` and is not to be published.

## What was done so far

- A similarity tool measures every file against ChartDB at one pinned commit (`ee95448`) and is
  a CI gate (identical, 30% or more shared lines, or a run of more than 25 shared lines fails).
- A behaviour spec of the old editor was written from its code (no code in it; a checker rejects
  code and long runs shared with ChartDB). The saved-diagram data format (JSON keys, string
  values, storage names) is recorded as facts so existing users' data keeps opening.
- An architecture was chosen that differs from ChartDB's in structure, naming and state
  management.
- Risky modules (data model, SQL import and export, canvas) are to be written by a clean author:
  a person or a fresh AI session working only from the spec, in a checkout with no access to
  ChartDB or the old branch. Others (dialogs, settings, admin screens, styling) are written by
  people or AI sessions that have read the old code.
- Records: `rewrite/provenance.md` (who read what), `rewrite/log.md` (one row per module).
- Some UI primitives are written in the style of shadcn/ui (MIT); ChartDB's copies come from the
  same upstream, so they share lines and are allow-listed with that reason.

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
6. Which licence could carry the final project (BSL or PolyForm Shield are candidates), given
   the dependencies are permissive (MIT, Apache-2.0, OFL fonts)? Notices to keep for them.
7. Files that remain from the old project by design: the Contributor Covenant (CC BY 4.0),
   one-line config files, and the shadcn/ui-style components. Are the reasons recorded enough?
8. After the result is finished, what should the final review look at (Phase 9)?

## Documents to attach

`rewrite/PLAN.md` (sections 1, 2, 6, 9, 11), `rewrite/architecture.md`,
`rewrite/provenance.md`, `rewrite/log.md`, `rewrite/spec/owner-decisions.md`,
`rewrite/similarity-allow.txt`, `rewrite/inventory/src.csv` (the measured overlap per file), and a
sample of the spec (`rewrite/spec/data-format.md`).
