# Clean-room rewrite

Everything about replacing the ChartDB-derived editor lives in this folder. Start with
[PLAN.md](PLAN.md); keep [TODO.md](TODO.md) up to date as you work.

| File | What it is |
| --- | --- |
| [PLAN.md](PLAN.md) | The plan: why, measurements, rules, phases with "done when", decisions, risks |
| [TODO.md](TODO.md) | The checklist, including the decisions and open items to do now |
| [provenance.md](provenance.md) | Who has read ChartDB's source, and which modules need a clean author |
| [log.md](log.md) | One row per finished module: similarity result and parity lines |
| [parity-checklist.md](parity-checklist.md) | Behaviours the new editor must match, with keep, change or drop |
| [rewritten.txt](rewritten.txt) | Extra files the similarity check must cover (for example root config files) |
| [similarity-allow.txt](similarity-allow.txt) | Generic files accepted even though they match ChartDB, each with a reason |
| [inventory/src.csv](inventory/src.csv) | Every `src/` text file on `main` with its similarity and status |
| [inventory/other.csv](inventory/other.csv) | The same for tracked files outside `src/` |
| [inventory/third-party-licences.csv](inventory/third-party-licences.csv) | Direct dependencies and their licences |
| `spec/` | Behaviour spec (written in Phase 1) |
| `architecture.md` | Architecture notes (written in Phase 2) |

The tools are in [`tools/`](../tools): `similarity.mjs` measures overlap with ChartDB and is
the CI gate, `licences.mjs` regenerates the dependency licence list.

## Commands

Check the branch the way CI does (`<chartdb>` is a checkout of ChartDB at `ee95448`):

```bash
node tools/similarity.mjs --upstream <chartdb> --src src --src server/src --src shared \
  --check --all --rewritten rewrite/rewritten.txt --allow rewrite/similarity-allow.txt
```

Regenerate the inventory of files outside `src/`:

```bash
node tools/similarity.mjs --upstream <chartdb> --tracked \
  --exclude src/ --exclude server/ --exclude shared/ --exclude Audit/ \
  --exclude rewrite/ --exclude tools/ --csv rewrite/inventory/other.csv
```

Regenerate the dependency licence list: `node tools/licences.mjs`.
