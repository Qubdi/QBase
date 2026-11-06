# Provenance record

The rewrite only works as a defence if we can show how each module was written. This
file is that record. Keep it honest and up to date; a gap in it is worse than a "yes".

## Definitions

- **Has read ChartDB source**: the person (or AI session) has opened ChartDB's code, or
  this repository's `main` branch, for the module being written, at any time before or
  while writing it.
- **Clean author**: has not read ChartDB's source for that module. They work only from
  `rewrite/spec/`.
- An AI assistant session counts as "has read" as soon as it can read `main` or the
  ChartDB checkout, and as soon as ChartDB code appears in its context. For a clean
  module, use a fresh session in a checkout of this branch only, with no `main` worktree
  and no ChartDB clone on the machine path it can reach.

## Which modules need a clean author

Required (the highest risk of looking like ChartDB's code):

- SQL import and export (`lib/data` replacement)
- the canvas and table nodes
- the data model and its type names

Allowed with a "has read" author, using the other rules in `rewrite/PLAN.md`:

- dialogs, forms, settings, admin screens, styling, small hooks

## Declarations

One row per person or AI session. Add a row before the first commit of a module.

| Date | Author | Has read ChartDB source? | Modules written | Notes |
| --- | --- | --- | --- | --- |
| 2026-11-07 | Anri Tvalabeishvili and an AI assistant | yes (both) | plan, tooling, inventory | not a clean author for any module |
| 2026-11-07 | AI assistant sessions (4 spec writers) | yes (read `main` via ../QBase-main) | `rewrite/spec/` only | spec authors, not clean for any code module |
| 2026-11-07 | Clean author session (AI assistant, Phase 4 checkout) | no | `src/core/model`, `src/core/wire`, `src/core/commands`, `src/core/history`, `src/persistence` | worked only from `CLAUDE.md`, `rewrite/architecture.md`, `rewrite/spec/`, `rewrite/parity-checklist.md`, `shared/` and `server/src/diagrams` in this checkout; never opened ChartDB or `main`; node ran only in docker with this directory mounted |
| 2026-11-07 | Clean author session (AI assistant, Phase 5 checkout) | no | `src/dialects`, `src/formats`, `src/lib/data/import-metadata` | worked only from `CLAUDE.md`, `rewrite/architecture.md`, `rewrite/spec/`, `rewrite/parity-checklist.md`, `src/core` and `server/src/introspect` (plus the server's own test fixtures) in this checkout; never opened ChartDB or `main`; node ran only in docker with this directory mounted |


## Per-module record

Copy a row into `rewrite/log.md` when a module is finished, with the similarity
result and the name of the declaration above.
