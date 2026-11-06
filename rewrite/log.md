# Rewrite log

One row per finished module. Add it in the same pull request that finishes the module.

How to fill it in:

- **Replaces**: the paths on `main` this module replaces (see `rewrite/inventory/src.csv`).
- **Spec**: the file in `rewrite/spec/` it was written from.
- **Author**: who wrote it, and whether they are a clean author (see `rewrite/provenance.md`).
- **Similarity**: output of `node tools/similarity.mjs --upstream <chartdb> --src <paths>`.
  Write the shared-line percentage and the longest identical run.
- **Parity**: the lines of `rewrite/parity-checklist.md` this module satisfies.

| Date | Module | Replaces | Spec | Author | Similarity | Parity | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
