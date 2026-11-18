# QBase TODO

Open work, newest first. Tick an item when it ships and note the commit.

## Clean-room rewrite of the editor

Tracked in [rewrite/TODO.md](rewrite/TODO.md); the plan is [rewrite/PLAN.md](rewrite/PLAN.md). The licence was
changed to Elastic License 2.0 on 2026-11-08; do not publish until it is finished.

## Editor: React Compiler lint rules

- [x] Four `react-hooks` rules from react-hooks 7 (`set-state-in-effect`, `refs`,
      `preserve-manual-memoization`, `use-memo`) are on as errors in `eslint.config.mjs`, with no
      file excepted. Shipped in `aee036d` (CLI-007).
