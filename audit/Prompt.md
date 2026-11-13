# Audit Agent — Prompt

Paste the block below as the agent's task. It re-audits the whole repo, rewrites
`audit/audit.md` (source of truth), and regenerates the HTML lens files from it.

---

## ROLE

You audit the **QBase** repository and maintain its audit files.
You report findings. You do **not** fix code unless explicitly asked.

## FILES YOU OWN

| File | Role |
|------|------|
| `audit/audit.md` | Source of truth. Every finding lives here. You edit this first. |
| `audit/audit-security.html` | Rendered view — Security & secrets lens |
| `audit/audit-repository.html` | Rendered view — Repository & governance lens |
| `audit/audit-server.html` | Rendered view — Server (Fastify API, drift) lens |
| `audit/audit-database.html` | Rendered view — Database & scale (schema, queries, migrations) lens |
| `audit/audit-client.html` | Rendered view — Client (React editor) lens |
| `audit/audit-deadcode.html` | Rendered view — Dead code (unused files, exports, vars, deps) lens |
| `audit/audit.html` | Rendered index — summary + links to the six lenses |
| `audit/audit-shared.css` | **Read-only. Never edit.** |

HTML is generated *from* `audit.md`. Never put a finding in HTML that is not in `audit.md`.

## SCOPE

In scope: `server/`, `shared/`, `src/` (except the data folders below), `public/`, `.github/`,
`.husky/`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `.nvmrc`, build and lint config
(`package.json`, `server/package.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`,
`tsconfig*.json`), `README.md`, `CONTRIBUTING.md`, `TODO.md`, `QBase-build-tasks.md`.

Out of scope: `node_modules/`, `.git/` internals, `stats/` (ignored build output),
`src/templates-data/` and `src/i18n/locales/` content (data, not logic — presence and wiring
still count), `server/src/db/migrations/meta/` (generated), upstream package contents.

Never print or store a secret value. Never run anything that mutates the tree or writes outside
`audit/`. Read-only checks that are allowed: `eslint`, `tsc`, `vitest run` (client), `npm audit`
(advisory lookup only), `knip` / `depcheck` only if already in `node_modules/.bin`.
Server tests and the database lens's live checks need a live Postgres; run them only against a
throwaway instance (container or one already up), never a shared or production database, and
say which in `method`. Live DB checks are read-only: `EXPLAIN`, catalog queries, `pg_stat_*`.
`EXPLAIN ANALYZE` only on `SELECT`.

## PASS WORKFLOW

1. **Read** `audit/audit.md`. If missing, start from the template below.
2. **Re-verify every Open finding** against the current tree. Each becomes exactly one of:
   `Open` (still reproduces) · `Fixed` (evidence it is gone) · `Accepted` (deliberate
   trade-off) · `Dropped` (out of scope or was wrong — say so in one clause).
3. **Re-verify every Fixed finding** did not regress. If it did, move it back to Open, same ID.
4. **Sweep for new findings** using the checklist below.
5. **Rewrite** `audit.md` — bump `rev`, update the date. Never record a branch name or a
   commit sha anywhere in the audit: findings are anchored to `path:line`, not to history.
6. **Regenerate** the seven HTML files from `audit.md`.
7. **Report** in chat: `rev N — X open (a crit / b high), Y fixed this pass, Z new`.
   Do not paste the tables back into chat.

## EVIDENCE RULE

A finding needs a concrete anchor: `path:line`, a config key, or the output of a read-only
command. No speculation, no "may be", no "consider whether". If you cannot point at it,
it is not a finding. Before marking anything Fixed, open the current file and confirm.
Take line numbers from `grep -n` on the single file, never from a multi-file `cat -n`.

## WRITING RULES — enforce these hard

- **Finding: ≤ 15 words.** One fragment. State the defect, not its history.
- **Fix: ≤ 12 words, imperative.** The smallest change that closes it.
- **No prose paragraphs anywhere.** No background, no narrative, no scoring essays.
- No em-dash chains, no "note that", no restating the finding inside the fix.
- Tables only. If something truly needs more than a row, it needs its own doc.

Bad — `The login route currently performs no throttling of any kind, which means an attacker
can submit unlimited password guesses against any account and this was noticed during…`

Good — Finding: `No rate limit or lockout on /auth/login and /auth/register`
Fix: `Add per-IP and per-email rate limit to auth routes`

## ID RULES

- IDs are permanent. Never renumber, never reuse a retired ID.
- Preserve every existing ID verbatim.
- New findings only: `SEC-` security · `REPO-` repository/governance · `SRV-` server ·
  `DB-` database · `CLI-` client · `DEAD-` dead code. Three digits, continuing from the highest
  existing number in that prefix.
- One defect, one ID. Unused code in a security path stays `SEC-`; a query defect stays `DB-`,
  not `SRV-`. `DEAD-` is only for code, config or deps that nothing uses.

## SEVERITY

`Crit` exploitable now or data loss · `High` breaks on next deploy, or real exposure ·
`Med` drift, missing guard rail · `Low` polish, cosmetic.

## SWEEP CHECKLIST

**Security** — auth and session handling (rate limits, cookie flags, timing, lockout);
authorization on every route (role checks, 404 vs 403, cross-project access); SSRF guards
(`net-guard`, webhooks); read-only SQL guard; secrets in tracked files, `.gitignore` coverage of
`.env*`; default credentials in compose and `.env.example`; `0.0.0.0` bindings; security
headers; keys that reach the browser (`config.js`, `VITE_*`); audit-log coverage; encryption at
rest (`crypto-box`); third-party requests from the client.

**Repository** — README and docs vs the actual tree; dead paths and stale config; CI coverage
(lint, build, client tests, server tests, audit, secret scan, image build); workflow action pins
and permissions; release and publish workflows; `.dockerignore` effect on each image; Node
version agreement; `npm audit` for root and `server/`; CODEOWNERS, SECURITY.md, update bot.

**Server** — every route in `server/src/**/routes.ts`: validation (zod), body limits, auth hook,
rate limits; queries that load more than they return; transactions and races (check-then-write);
scheduler and in-process state vs multiple replicas; pool config and shutdown; logging; migrations
vs `schema.ts`; retention of sessions, snapshots, audit and drift rows; test coverage per module.

**Database** — migrations vs `server/src/db/schema.ts` (run `drizzle-kit generate` in a scratch
copy only, or diff by hand; an empty diff is the pass); migration journal order, gaps, edited
applied migrations; destructive or locking DDL (`DROP`, `ALTER TYPE`, non-concurrent index on a
big table, `NOT NULL` without default); boot migration run under an advisory lock; every FK has
an index and an explicit `ON DELETE`; unique constraints behind every check-then-write; `jsonb`
columns that grow per save; queries in `server/src/**` — `SELECT *` or full-content loads for
lists, N+1 loops, missing `LIMIT`/pagination, `.returning()` of large columns, filters on
unindexed columns (confirm with `EXPLAIN` on seeded data); transaction scope and isolation for
multi-row writes; pool size vs replicas vs `max_connections`, statement and idle timeouts;
retention and cleanup of sessions, snapshots, audit, drift rows (job exists, bounded, indexed);
growth per user action, measured on a seeded throwaway instance; introspection drivers
(`server/src/introspect/`) — read-only guard, timeouts, Postgres and SQL Server parity;
Postgres image pin in compose and CI; backup and restore documented.

**Client** — autosave and sync (`src/lib/qubdi/`, `src/components/qubdi/`); API error and 401
handling; stubs and dead features left from the fork; hard-coded hosts; lint/TS suppressions
and `any`; bundle weight; accessibility of dialogs; `eslint`, `tsc -b`, `vitest run` results.

**Dead code** — run every tool below; a finding needs a tool hit *and* a grep that confirms
zero references (including dynamic `import()`, string routes, `package.json` scripts, tests,
config files, Dockerfiles, CI workflows).

| Target | How to detect |
|--------|---------------|
| Unused locals, params, imports | `tsc -b` (client has `noUnusedLocals`); `npx tsc -p server --noEmit --noUnusedLocals --noUnusedParameters`; `eslint` `no-unused-vars` |
| Unused exports | `knip` if installed; else per export `grep -rn "\b<name>\b" src server shared` — only the defining line means unused |
| Unused files / modules | file never imported: `grep -rln "<basename>"` returns only itself; not an entry in `vite.config.ts`, `server/package.json` scripts, `index.html` |
| Unused deps | `knip` / `depcheck` if installed; else each `dependencies` key with no `import`/`require` hit outside `node_modules/` |
| Deps in wrong section | runtime import from a `devDependencies` package, or build-only tool in `dependencies` |
| Unused env vars and config keys | key in `.env.example` / `server/src/config.ts` / `public/config.js` with no reader, or read but never documented |
| Unused DB objects | table, column, index or enum in `schema.ts` that no query touches; `pg_stat_user_indexes.idx_scan = 0` after the test suite |
| Unused i18n keys | key in `src/i18n/locales/en` with no `t('<key>')` hit; key used but missing from `en` |
| Unused assets | file in `public/` not referenced by `index.html`, source, or nginx config |
| Unused CSS / Tailwind | custom class in CSS with no hit in `src/` |
| Dead branches | `if (false)`, constant feature flags, unreachable code after `return`, `TODO remove` stubs from the fork |
| Commented-out code | blocks of ≥ 3 commented code lines |
| Suppressions | `eslint-disable`, `@ts-ignore`, `@ts-expect-error` with nothing left to suppress (`--report-unused-disable-directives`) |
| Unused scripts and CI | `package.json` scripts never called; workflow steps or jobs that do nothing |
| Duplicates | two helpers with the same body; keep one, list both paths in Where |

Sev for dead code: `Med` when it ships to the browser or image, holds a secret path, or misleads
(stale config, unused route still mounted) · `Low` otherwise. Group trivial hits in one file into
one row; Where lists `path:line` for each, comma-separated.

## audit.md TEMPLATE

````markdown
# QBase — Audit

**rev** N · **date** YYYY-MM-DD
**method** static analysis · whole-tree read · eslint, tsc, vitest run, npm audit · no secret read
**scope** whole repo except data folders and `node_modules/`

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 0 | 0 | 0 | 0 | 0 |
| Repository | 0 | 0 | 0 | 0 | 0 |
| Server | 0 | 0 | 0 | 0 | 0 |
| Database | 0 | 0 | 0 | 0 | 0 |
| Client | 0 | 0 | 0 | 0 | 0 |
| Dead code | 0 | 0 | 0 | 0 | 0 |
| **Total** | 0 | 0 | 0 | 0 | 0 |

## Act first

- `ID` — one line. Only Crit/High that block other work. Omit the section if none.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | High | No rate limit on `/auth/login` | `server/src/app.ts:48` | Add per-IP rate limit |

### Repository
### Server
### Database
### Client
### Dead code

*(same five columns; omit a lens heading when it has no open findings)*

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|

---

## Accepted

| ID | Lens | Finding | Why |
|----|------|---------|-----|

---

## Dropped

| ID | Finding | Reason |
|----|---------|--------|

---

## Changelog

| Rev | Date | Change |
|-----|------|--------|
| N | YYYY-MM-DD | 3 new, 5 fixed, 1 dropped |
````

## HTML RENDER SPEC

Each lens file is a static page, no build step, matching the existing markup contract:

- `<title>`, then `<link rel="stylesheet" href="audit-shared.css">`, the `.skip` link and the
  `#theme-toggle` button, then `<div class="wrap">`.
- `<header>`: `.eyebrow` (lens · rev N), one-line `<h1>` verdict, `.meta-row` with date /
  method. No scores, no essays.
- `.note.crit` + `.pill.crit` "Act first" block, only when Crit/High open findings exist.
- `.split-nav` linking the other five lenses and `audit.html`; the current file gets
  `<span class="here">`.
- Two sections, in this order, each `.section-head` + `.snum` + `<h2>`:
  1. **Open** — `.table-wrap` > `<table>`, columns ID / Sev / Finding / Where / Fix.
     Severity as `.pill.crit` / `.pill.warn` / `.pill.flat`; ID in `.svc-name`.
  2. **Fixed** — same table shape inside `<details><summary>Fixed (N)</summary>`, status
     `.pill.good`. Accepted rows get `.pill.warn` in their own `<details>`.
- Section wrapper class by lens: `.sec-sector` (Security) / `.repo-sector` (Repository) /
  `.dev-sector` (Server) / `.dev-sector` (Database) / `.stg-sector` (Client) /
  `.repo-sector` (Dead code). No new classes: the CSS is read-only.
- Keep the theme-toggle `<script>` verbatim, after the closing `</div>`.
- `audit.html` (index): header, the summary table from `audit.md`, six `.idx-card` links
  (`.idx-card.sec` Security / `.repo` Repository / `.dev` Server / `.dev` Database / `.stg` Client /
  `.repo` Dead code), the changelog table. Nothing else.
- Escape `&`, `<`, `>` in cell text. Wrap paths and keys in `<code>`.

## DONE WHEN

- Every open finding in `audit.md` has an evidence anchor and a one-line fix.
- Every HTML row traces to a row in `audit.md`, and every `audit.md` row is rendered.
- No cell exceeds its word cap.
- Every `DEAD-` finding has a tool hit and a zero-reference grep behind it.
- Every `DB-` finding measured live names the throwaway instance in `method`.
- `audit-shared.css` is untouched.
