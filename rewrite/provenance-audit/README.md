# Transcript audit of the AI sessions

Run on 2026-11-08 over the saved transcripts of every sub-session started by the
orchestrating session (56 sessions). The scan (`scan-transcripts.py`, set
`TRANSCRIPTS` to the folder holding the `agent-*.jsonl` files) reads every tool call
of each session (the command of a shell call, the path of a read, search or edit) and
flags a call when it

- names the `main` branch or the read-only worktree of it (`git show main:`,
  `git diff main`, `../QBase-main`, and similar),
- names ChartDB (the word, or its pinned commit `ee95448`), or
- reads a path outside this repository, the temporary folder, the clean-room checkouts
  and the assistant's own folder.

A second pass (not kept as a script) checked every file a session opened against the
list of files that were derived or identical in the old project, and counted a read only
when the file was still byte-identical to the old snapshot in the branch's first commit.
Result: **no session opened such a file** (0 of the 52 sessions other than the spec
writers; the old source was never in this branch, see `provenance.md`). The spec writers
read `main` itself, which this pass does not cover.

## Result

- The four spec writers read `main` through the worktree. That was their job and is
  declared in `provenance.md`.
- No other session ran a command that opens `main`, a ChartDB checkout or a path outside
  the allowed folders (0 out-of-folder paths in all 56).
- Eleven other sessions were flagged only because the word "ChartDB" appears in text they
  wrote (provenance and log rows, NOTICE and audit edits, greps for old identifiers in
  our own code); none opened ChartDB material.
- One session (`a1092b12`, regenerating the shadcn/ui primitives) cloned ChartDB at the
  pinned commit into its temporary folder, ran the similarity tool against it with the
  clone mounted read-only, printed only the similarity numbers and deleted the clone. The
  transcript shows no file of the clone being opened. Those primitives are allow-listed
  (shadcn/ui is MIT and ChartDB's copies come from the same upstream).

## The orchestrating session

813 tool calls were scanned. It created the read-only worktree of `main` and browsed it
during Phase 1, rewrote the derived root files in Phase 0 knowing the originals, and
ran the similarity tool against temporary ChartDB clones many times (the clone was deleted
after each run). It counts as having read the old code. The scan found no copying; the
similarity gate is what shows that.

## Limits

- Only tool calls were scanned, not the text of results or what a session remembered from
  its prompt. The prompts of the sessions after Phase 1 told them not to read `main` or
  ChartDB.
- Peer sessions that are not sub-sessions of the orchestrator (`qbase-e4`, which was to
  walk through the old editor live, and `qbase-91`, which built `tools/spec-check.mjs`)
  are not in this scan: the orchestrator has no copy of their transcripts. The owner
  should add their declarations.
- Before the context of the orchestrating session was summarised, its earlier tool calls
  are in the same file and were scanned; what it remembered from the old code cannot be
  scanned.

## Sessions

| Session | Started (UTC) | Role | Tool calls | Opened main or ChartDB material |
| --- | --- | --- | --- | --- |
| aa416bfc | 2026-11-06 20:31 | spec writer | 35 | yes, by design (read main) |
| a171bcaa | 2026-11-06 20:31 | spec writer | 70 | yes, by design (read main) |
| a095ccd6 | 2026-11-06 20:31 | spec writer | 77 | yes, by design (read main) |
| a0394aeb | 2026-11-06 20:31 | spec writer | 64 | yes, by design (read main) |
| a4fed274 | 2026-11-06 21:08 | Phase 3: UI primitives | 15 | no |
| adfc45ef | 2026-11-06 21:08 | Phase 3: globals.css, tokens, fonts | 16 | no |
| a89d5093 | 2026-11-06 21:08 | Phase 3: i18n loader | 12 | no |
| a9219c7f | 2026-11-06 21:16 | Phase 1: manual test script | 14 | no |
| a6d4d1b6 | 2026-11-06 21:33 | Phase 3: option-select and small UI pieces | 9 | no |
| a1092b12 | 2026-11-06 21:33 | Phase 3: shadcn regeneration | 17 | no (ran the similarity tool on a temporary clone) |
| a5ddc141 | 2026-11-06 21:43 | clean author, Phase 4 | 98 | no |
| a625d20c | 2026-11-06 22:13 | clean author, Phase 5 | 105 | no |
| acfe4909 | 2026-11-06 22:14 | Phase 6a: store and adapters | 182 | no |
| a749c94e | 2026-11-06 23:37 | Phase 6a: SQL and metadata adapters | 113 | no |
| ad153845 | 2026-11-06 23:47 | clean author, Phase 6 canvas | 166 | no |
| a2f79b03 | 2026-11-06 23:48 | Phase 6c: workspace | 175 | no |
| ab3b00be | 2026-11-06 23:48 | Phase 6d: side panel, forms, clipboard | 97 | no |
| ac1abc47 | 2026-11-07 00:17 | Phase 6: port old tests to the canvas | 33 | no |
| a959699b | 2026-11-07 00:17 | Phase 6f: canvas into the workspace | 88 | no |
| a3e9ad9d | 2026-11-07 00:24 | Phase 6: smoke test and fixes | 143 | no |
| a313cd50 | 2026-11-07 11:16 | DBML edit and diff | 36 | no |
| a88d1e10 | 2026-11-07 11:23 | drag from the side panel | 9 | no |
| a2ca5365 | 2026-11-07 12:18 | metadata queries | 18 | no |
| af05a634 | 2026-11-07 12:18 | Phase 6 gaps | 179 | no |
| ac232fa7 | 2026-11-07 12:31 | Phase 8 tests EDT-a | 54 | no |
| a45ac925 | 2026-11-07 12:31 | Phase 8 tests EDT-b | 52 | no |
| a94a0ec8 | 2026-11-07 12:31 | Phase 8 tests DAT, QBS | 123 | no |
| a08bafb0 | 2026-11-07 12:31 | Phase 8 tests IMP, EXP | 68 | no |
| adfea824 | 2026-11-07 12:31 | Phase 8 tests SHL | 146 | no |
| a81f4955 | 2026-11-07 12:31 | Phase 7: English strings | 105 | no |
| a5f4298e | 2026-11-07 12:56 | missing editor features | 50 | no |
| a44de209 | 2026-11-07 16:12 | Phase 9 cleanup | 28 | no |
| ae598749 | 2026-11-07 16:12 | Phase 9 data checks | 45 | no |
| a6ec74fa | 2026-11-07 16:30 | translation de, fr | 10 | no |
| aac55883 | 2026-11-07 16:30 | translation es, pt_BR (removed) | 13 | no |
| aab9953b | 2026-11-07 16:30 | translation ja, ko (removed) | 26 | no |
| a6a0f2c9 | 2026-11-07 16:30 | translation zh_CN, ru | 20 | no |
| add59b99 | 2026-11-07 16:30 | translation tr, uk (removed) | 24 | no |
| aaec8385 | 2026-11-07 16:39 | translation ar, hi, bn (removed) | 18 | no |
| af121c7c | 2026-11-07 16:39 | translation gu, mr, ne (removed) | 17 | no |
| a65b9b17 | 2026-11-07 16:39 | translation te, hr, id (removed) | 11 | no |
| a48c815b | 2026-11-07 16:39 | translation vi (removed), zh_TW | 15 | no |
| a3d5b8f2 | 2026-11-07 16:39 | browser flows | 135 | no |
| a05e9acb | 2026-11-07 16:39 | review: core, store | 61 | no |
| a6f58376 | 2026-11-07 16:39 | review: UI | 54 | no |
| aef71455 | 2026-11-07 16:47 | fixes: core review | 94 | no |
| ae6c5e74 | 2026-11-07 17:21 | fixes: UI review | 294 | no |
| a4270be3 | 2026-11-07 17:55 | performance | 116 | no |
| a7cdc3af | 2026-11-07 17:55 | accessibility audit | 68 | no |
| ad627fda | 2026-11-07 18:58 | canvas accessibility | 73 | no |
| a7177118 | 2026-11-07 18:58 | side panel windowing | 39 | no |
| a2115058 | 2026-11-07 19:33 | live database checks | 83 | no |
| a39e88bb | 2026-11-07 20:09 | introspection and import fidelity | 222 | no |
| ab2e4f63 | 2026-11-07 20:44 | audit files | 13 | no |
| ad01578e | 2026-11-07 20:50 | translation ka | 11 | no |
| a9425e36 | 2026-11-07 20:50 | translation it | 13 | no |

## Second scan, 2026-11-08 (66 sessions)

The same scan over all 66 sub-sessions, including the ten started after the first audit. The
new sessions are:

| Session | Started (UTC) | Role | Tool calls | Opened main or ChartDB material |
| --- | --- | --- | --- | --- |
| a4207ec7 | 2026-11-07 21:36 | SQL-file import: DESC, partial indexes, generated columns, domains | 100 | no |
| ae974ec2 | 2026-11-07 22:01 | server-mode browser flows and re-sync dialog | 240 | no |
| a192c8c9 | 2026-11-07 22:22 | black-box measurement of the old editor: shell, panels, dialogs, wording | 240 | no: observed the running old editor through a browser only |
| ae6fe04c | 2026-11-07 22:22 | black-box measurement of the old editor: canvas | 189 | no: same |
| a4a47a58 | 2026-11-07 22:25 | dependencies, Highlight Fields, type legend | 145 | no |
| a1ce03c7 | 2026-11-07 22:25 | Oracle, ClickHouse, Backup menu, New dialog tabs | 175 | no |
| a0da0d01 | 2026-11-08 09:04 | canvas restyle from the measured spec | 300 | no |
| a0c3eb03 | 2026-11-08 09:19 | shell restyle from the measured spec | 364 | no (one flag: the word "ChartDB" in its own report) |
| ae001e48 | 2026-11-08 09:19 | side panel restyle from the measured spec | 369 | no |
| aff08dc9 | 2026-11-08 11:51 | repair of the browser scripts for the restored wording | 215 | no |

Notes for this round:

- The two measuring sessions looked at the old editor only from outside, through a browser
  (computed styles, element boxes, screenshots). They did not read its source, its bundles or its
  container files. Their results are in `rewrite/spec/visual-*.md`; the screenshots stay outside
  the repository.
- The three restyling sessions had not seen the old editor's code; they worked from those
  measurements and the screenshots. The only paths outside the repository and the temporary
  folder that any of them touched are `/home/qubdi/ui-reference/` (screenshots of the old and the
  new editor).
- The similarity gate over the result: 883 files checked, none over the limits, 0 identical,
  97.6 percent of lines original.
- A peer interactive session, `qbase-be`, appeared on 2026-11-08 and is not one of the
  orchestrator's sub-sessions: its transcript is not in this scan. The owner should state what it
  did.
