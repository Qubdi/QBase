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
| 2026-11-07 | src/platform/ui primitives (alert-dialog badge button checkbox dialog input popover scroll-area select separator table tabs textarea) | src/components/ui/* | n/a | shadcn CLI 4.23.0 output (`npx shadcn@latest add ... --overwrite`, new-york, run in a scratch copy with ui alias src/platform/ui); import paths and dialog showClose/DialogInternalContent adapted by hand | 9 of 13 files over the 30% limit (alert-dialog 63.5, select 60.2, table 62.1, tabs 55.3, dialog 44.4, scroll-area 39.5, input 35.7, checkbox 33.3, separator 30.0); longest run 12 (limit 25) | n/a | toast not offered by the CLI for this project (Radix); toast.tsx kept as is |
