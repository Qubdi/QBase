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
| 2026-11-07 | clean author session, phase 6 canvas (AI assistant) | no | `src/canvas` | worked only from `CLAUDE.md`, `rewrite/architecture.md`, `rewrite/spec/editor.md`, `data-format.md`, `owner-decisions.md`, `rewrite/parity-checklist.md`, `src/core`, `src/store`, `src/platform`, `src/globals.css` and `tailwind.config.js` in this checkout; never opened ChartDB or `main`; node ran only in docker with this directory mounted |
| 2026-11-07 to 2026-11-08 | Orchestrating AI assistant session (the one that started the sessions below) | yes (counts as has read) | root files rewritten in Phase 0 (`tailwind.config.js`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.app.json`, `eslint.config.mjs`, `components.json`, `index.html`, the two workflows), the briefs, integration and gate fixes, `src/i18n/__tests__/locale-parity.test.ts`, `public/browser-check.js`, `LICENSE`, `NOTICE`, README sections, the records under `rewrite/` | created the read-only worktree of `main` and browsed it in Phase 1; ran the similarity tool against temporary ChartDB clones (deleted after each run); knew the old root files when it rewrote them; copied no code; scan in `provenance-audit/README.md` |
| 2026-11-07 | Phase 3 sessions (6 AI sessions: `a4fed274`, `adfc45ef`, `a89d5093`, `a6d4d1b6`, `a1092b12`, `a9219c7f`) | no (transcripts scanned) | `src/platform/ui` (shadcn CLI output), `src/globals.css`, `src/platform/*`, the i18n loader, `option-select` and small UI pieces, `rewrite/spec/manual-test-script.md` | told not to read `main` or ChartDB; `a1092b12` ran the similarity tool on a temporary read-only clone and opened no file in it |
| 2026-11-07 | Phase 6 sessions (AI: `acfe4909`, `a749c94e`, `a2f79b03`, `ab3b00be`, `ac1abc47`, `a959699b`, `a3e9ad9d`) | no (transcripts scanned) | `src/store`, `src/qbase` adapters, `src/workspace`, the side panel and `src/features/*` forms, dialogs, import, export and settings, the canvas wiring, tests of original QBase rules ported to the canvas, the first browser smoke test | worked from `rewrite/spec/`, the decision records and this tree; told not to read `main` or ChartDB |
| 2026-11-07 | Editor feature sessions (AI: `a313cd50`, `a88d1e10`, `a2ca5365`, `af05a634`, `a5f4298e`) | no (transcripts scanned) | DBML edit and diff (`src/features/dbml-diff`), drag from the side panel, metadata queries (`src/features/import/scripts`), Phase 6 gaps, table colour, edit card controls, DBML export messages | same rules |
| 2026-11-07 | Phase 7 and 8 sessions (AI: `a81f4955`, `ac232fa7`, `a45ac925`, `a94a0ec8`, `a08bafb0`, `adfea824`) | no (transcripts scanned) | English strings through i18n, diagnostics, the `p8-*` tests written from the spec, small fixes the tests found | same rules |
| 2026-11-07 to 2026-11-08 | Translation sessions (11 AI sessions) | no (transcripts scanned) | `src/i18n/locales/` de, fr, ru, zh_CN, zh_TW, ka, it (and 16 more languages, removed on 2026-11-08) | machine translation from our own English text; told not to use any old translation |
| 2026-11-07 to 2026-11-08 | Phase 9 sessions (AI: `a44de209`, `ae598749`, `a05e9acb`, `a6f58376`, `aef71455`, `ae6c5e74`, `a3d5b8f2`, `a4270be3`, `a7cdc3af`, `ad627fda`, `a7177118`, `a2115058`, `a39e88bb`, `ab2e4f63`) | no (transcripts scanned) | cleanup, data-format checks, two code reviews and their fixes, browser flows, performance work, accessibility, live-database checks, introspection and import fidelity, audit files | same rules |
| 2026-11-07 | Peer sessions `qbase-e4` and `qbase-91` (AI) | per the owner's declaration, not seen here | `qbase-91`: `tools/spec-check.mjs`; `qbase-e4`: live walkthrough of the old editor, blocked | their transcripts are not available to the orchestrating session; the owner states (2026-11-08) that their declarations were made; the text is not in this repository, **attach it here** |

### What the branch's first commit holds

The branch has one root commit (`1851687`, 561 files). Its `src/` has 277 files, all original
QBase code (the inventory marks none of them identical, derived or modified), so no session
worked in a tree that held ChartDB-derived source. Of the other files, 11 root files were
derived from ChartDB (`index.html`, `tailwind.config.js`, `eslint.config.mjs`,
`vitest.config.ts`, `tsconfig.app.json`, `vite.config.ts`, `components.json`,
`.dockerignore`, `CODE_OF_CONDUCT.md` and two workflows), 5 were identical tiny config files
(`.nvmrc`, `.prettierignore`, `tsconfig.json`, `tsconfig.node.json`, `public/config.js`) and 4
modified (`package.json`, `CONTRIBUTING.md`, `CLA.md`, one workflow); one GIF came from the
old project. They were replaced or deleted in the following commits. The release is still
planned as a fresh repository, so none of this history is published.

### Evidence

`provenance-audit/README.md` holds the scan of the tool calls of 56 sessions, the method
and its limits.


## Per-module record

Copy a row into `rewrite/log.md` when a module is finished, with the similarity
result and the name of the declaration above.
