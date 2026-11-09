# Phase 8 brief: tests written from the spec

Work in the repository folder on branch `rewrite/clean-room`.
Never read, check out or diff `main` or any ChartDB source. Use this tree and `rewrite/spec/`.
Do not commit, push or switch branches. Several agents work at once, each on its own
slice of rows: edit only test files you create (unique names) and, for real bugs, the
smallest possible fix in the source module involved. Never edit `rewrite/parity-checklist.md`
or `rewrite/log.md`: write results to your own file `rewrite/phase8/<slice>.md`.

For every unticked row (`| [ ] |`) in your slice of `rewrite/parity-checklist.md`:
1. Rows whose decision column starts with `drop` need no test: list them as `dropped`.
2. Look for an existing test that proves the row (grep tests and the spec section). If one
   does, list `ID | covered | path::test name`.
3. Otherwise write a new test (happy-dom, Vitest, Testing Library; look at neighbouring
   tests for helpers such as `src/core/testing`, `src/canvas/test`) that checks the behaviour
   as the spec states it. If the behaviour is not implemented, do not fake it: list
   `ID | missing | what is missing`. If it cannot be tested without a real browser, live
   database or server, list `ID | manual | why` (the manual script is rewrite/spec/manual-test-script.md).
   If the test shows a real bug, fix it minimally and list `ID | fixed | what`.
4. Rows whose spec says `change:` test the new behaviour, not the old.
Output file format: one table line per row, nothing else but a short summary at the top.
Tools: Node via `docker run --rm -u $(id -u) -v "$PWD":/w -w /w -e HOME=/tmp -e NPM_CONFIG_UPDATE_NOTIFIER=false node:24 <cmd>`
(`npx vitest run <files>`, `npx eslint <files> --fix`, `npx tsc -p tsconfig.app.json --noEmit`).
Do not run the whole suite more than twice (others are editing); run only your files. Final gate:
your new tests pass, eslint clean on them, tsc 0 errors for your files. Report counts per class.
