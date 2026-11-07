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
- The licence is still to be chosen by the owner (the file today is PolyForm Noncommercial
  1.0.0; BSL and PolyForm Shield are the candidates). Nothing was changed in `LICENSE`.
