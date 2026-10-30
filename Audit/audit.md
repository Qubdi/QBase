# QubdiDB — Audit

**rev** 14 · **date** 2026-10-30
**method** static analysis · whole-tree read · in a `node:24-alpine` container on a clean export: eslint root and `server/` (0 problems), `tsc -b`, server `tsc` typecheck (TypeScript 6.0.2), client vitest run (233 files, 2662 tests, all pass), `vite build` · npm audit root and `server/` (0 vulnerabilities, installed from the lockfiles) · server vitest run against a throwaway Postgres (61 files, 920 tests: 905 pass, 13 skipped for SQL Server, 2 wrong-credential tests fail because the stock image trusts loopback) · database lens measured on a seeded throwaway Postgres 18 with every migration applied · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 3 | 0 | 2 | 26 | 0 |
| Repository | 4 | 0 | 0 | 43 | 1 |
| Server | 1 | 0 | 0 | 28 | 0 |
| Database | 17 | 0 | 2 | 0 | 0 |
| Client | 0 | 0 | 0 | 42 | 0 |
| **Total** | 25 | 0 | 4 | 139 | 1 |

## Act first

- `SEC-001` — old `POSTGRES_PASSWORD`, `CONNECTION_KEY` and `MSSQL_SA_PASSWORD` are in git history; rotate all three.
- `SEC-028` — a hostile SQL Server can reroute introspection to any internal host.
- `DB-001` — viewer diagram list slows linearly with snapshot versions; 2 s at 50.
- `DB-002` — live share updates break as soon as a second API replica runs.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | High | Old `POSTGRES_PASSWORD`, `CONNECTION_KEY` and `MSSQL_SA_PASSWORD` values remain in git history | `.env.example` · `server/.env.example` history | Rotate all three; the example files are blank now |
| SEC-028 | High | SQL Server login reroute dials any host unchecked; net guard bypassed | `server/src/introspect/sqlserver.ts:361` · tedious `connection.js:1301` | Pass a tedious `connector` that dials only the vetted address |
| SEC-029 | Low | Blocked-target error returns the private IP a hostname resolves to | `server/src/introspect/net-guard.ts:189` · `server/src/introspect/routes.ts:218` | Drop the resolved address from the client-facing message |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-045 | Med | No upstream name, copyright or modification notice for the AGPL fork | `README.md:322` · `LICENSE` | Add a NOTICE naming upstream, its copyright and changes |
| REPO-046 | Low | Gitleaks comment cites compose profile `mssql`, which no longer exists | `.gitleaks.toml:2` | Reword: value allowlisted for history only |
| REPO-047 | Low | Bug template says the version is in the footer; UI shows none | `.github/ISSUE_TEMPLATE/bug_report.md:18` | Point to `package.json` only |
| REPO-048 | Low | PR checklist omits server `typecheck`, which CI runs | `.github/pull_request_template.md:8` | Add `npm --prefix server run typecheck` |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-029 | Med | Outbound limiter scans its whole map per request; junk cookies grow it unbounded | `server/src/lib/rate-key.ts:49` · `server/src/introspect/routes.ts:234` | Key after authentication; use a bounded store |

### Database

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DB-001 | High | Viewer list computes stats on every snapshot version, not only the latest | `server/src/diagrams/service.ts:47` · `server/src/diagrams/summary.ts:53` | Pick latest per diagram with LATERAL `limit 1` |
| DB-002 | High | Share live events use an in-process EventEmitter; other replicas never receive them | `server/src/events.ts:4` · `README.md:319` | Carry publish and link events over Postgres LISTEN/NOTIFY |
| DB-003 | Med | Every replica runs boot migrations without an advisory lock; the loser crashes | `server/src/server.ts:25` | Wrap `runMigrations` in `pg_advisory_lock` |
| DB-004 | Med | Migration 0022 rewrites all of `diagrams` under ACCESS EXCLUSIVE | `server/src/db/migrations/0022_diagram_stats.sql:2` | Use plain columns with batched backfill before first release |
| DB-005 | Med | Auto-publish stores a full snapshot per autosave; 200-copy cap hit in 35 minutes | `server/src/diagrams/routes.ts:338` · `server/src/config.ts:187` | Throttle auto snapshots to one per N minutes |
| DB-006 | Med | Save `.returning()` sends full content back; Node parses then discards it | `server/src/diagrams/routes.ts:319` | Return only id, title, updatedAt, autoPublish |
| DB-007 | Med | Publish copies content through Node while holding the diagram row lock | `server/src/diagrams/service.ts:125` | Use `insert into snapshots … select from diagrams` |
| DB-008 | Med | One `audit_log` row per autosave; 5 index writes each, kept 365 days | `server/src/diagrams/routes.ts:335` | Record at most one `diagram.update` per diagram per hour |
| DB-009 | Med | Editor fetches the diagram list unpaged; admins sort the whole table | `src/lib/qubdi/api.ts:541` · `server/src/diagrams/routes.ts:144` | Page the editor list; make `limit` required |
| DB-010 | Med | Pool of 10 per replica against stock `max_connections` 100; Postgres untuned | `server/src/db/client.ts:18` · `docker-compose.yml:9` | Ship tuned `postgresql.conf`; document replica cap or PgBouncer |
| DB-011 | Med | Rate limits, lockouts, SSE caps and drift guard live in process memory | `server/src/lib/rate-key.ts:46` · `server/src/drift/service.ts:76` | Move counters and guards to Postgres or Redis |
| DB-012 | Med | Each publish makes every live viewer re-read the full snapshot content | `server/src/share/routes.ts:342` | Cache latest snapshot per diagram and version |
| DB-013 | Low | Maintenance runs in every replica, repeating full-table prune scans | `server/src/server.ts:38` | Take `pg_try_advisory_lock` around each maintenance run |
| DB-014 | Low | Drift size check casts whole content jsonb to text | `server/src/drift/service.ts:219` | Use `pg_column_size(content)` |
| DB-015 | Low | Role check takes 3 round trips and re-reads `users.is_admin` | `server/src/diagrams/permissions.ts:70` | Resolve role in one join; use `req.user.isAdmin` |
| DB-016 | Low | Drift check loads the full previous report to compare its signature | `server/src/drift/service.ts:149` | Select only status, signature and dismissedAt |
| DB-017 | Low | DB container keeps default 64 MB `/dev/shm`; backups are manual only | `docker-compose.yml:9` · `README.md:268` | Set `shm_size`; document scheduled dumps or WAL archiving |

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|
| SRV-009 | Server | `POST /lint` with a table lacking `fields` throws TypeError, returns 500 |
| SEC-002 | Security & secrets | Session end or user switch keeps previous user's IndexedDB copies and id maps |
| SEC-003 | Security & secrets | Share-link tokens in `/s/<token>` URLs written to Fastify request log |
| SEC-004 | Security & secrets | Share-viewer `/s/<token>` paths written to nginx access log |
| SEC-005 | Security & secrets | Connection edit keeps stored password when user, database or ssl change |
| SEC-006 | Security & secrets | No Origin check on mutating requests; CSRF defence is SameSite=Lax alone |
| SEC-007 | Security & secrets | Introspection with typed-in credentials writes no audit row |
| SEC-008 | Security & secrets | Lockout keyed on email alone; anyone can keep any account locked |
| SEC-009 | Security & secrets | `currentPassword` has no max length; argon2 hashes up to 1 MB |
| SEC-010 | Security & secrets | Wrong current password on change-password logged as `user.sign_in_failed` |
| SEC-011 | Security & secrets | Self sign-out writes no audit row |
| SEC-012 | Security & secrets | Sessions have no idle timeout, only absolute 30-day expiry |
| SEC-013 | Security & secrets | GCM decipher does not enforce 16-byte auth tag length |
| SEC-014 | Security & secrets | Public share JSON sent without `Cache-Control: no-store` |
| SEC-015 | Security & secrets | SSE viewer cap is per link only; one IP can take all slots |
| SEC-016 | Security & secrets | SSE stream response skips CSP and frame security headers |
| SEC-017 | Security & secrets | Disabled user's `signed_in` SSE stream stays open until next event |
| SEC-018 | Security & secrets | Net guard treats `::ffff:0:0/96` and `64:ff9b:1::/48` as public |
| SEC-019 | Security & secrets | Recovery codes stored as unsalted sha256 |
| SEC-020 | Security & secrets | Server defaults `HOST` to `0.0.0.0` outside Docker |
| SEC-021 | Security & secrets | Default core-DB credential hard-coded as `DATABASE_URL` fallback |
| SEC-022 | Security & secrets | Compose gives `MSSQL_SA_PASSWORD` a hard-coded default |
| SEC-023 | Security & secrets | nginx `server_tokens` left on; version disclosed |
| REPO-001 | Repository | CI runs on pull requests only; direct pushes to `main` unchecked |
| REPO-002 | Repository | README step 3 repeats `cp .env.example .env`, overwriting step 1 edits |
| REPO-003 | Repository | README server command keeps default `DATABASE_URL`, not chosen `POSTGRES_PASSWORD` |
| REPO-004 | Repository | `SECURITY.md` names `SESSION_SECRET`, which exists nowhere in code |
| REPO-005 | Repository | release-please needs Conventional Commits; 2 of 426 commits follow them |
| REPO-006 | Repository | `VITE_APP_URL` documented but never passed as Docker build arg |
| REPO-009 | Repository | ESLint comment points to `TODO.md`, which is empty |
| REPO-010 | Repository | Build-tasks doc still specifies the removed Comments feature |
| REPO-011 | Repository | `test:coverage` needs `@vitest/coverage-v8`, which is not installed |
| REPO-012 | Repository | Preload plugin matches `logo-*.png`; only `qubdi-logo-*.svg` exist |
| REPO-013 | Repository | Rollup `external` regex `/__test__/` matches nothing |
| REPO-014 | Repository | `.dockerignore` comment claims `server/` has its own; none exists |
| REPO-015 | Repository | gitleaks and CI Postgres service images pinned by tag only |
| REPO-017 | Repository | Broken maintainer mail link; no CLA, setup or test sections |
| REPO-018 | Repository | CLA cites "Section 1"; its sections are unnumbered |
| REPO-019 | Repository | Neither package declares a `license` field |
| REPO-020 | Repository | Publish job builds client on host, then Docker rebuilds it |
| REPO-021 | Repository | nginx not `exec`'d; shell stays PID 1, SIGTERM not forwarded |
| REPO-022 | Repository | Release workflow grants `GITHUB_TOKEN` write yet acts with `OSS_RELEASE` PAT |
| SRV-001 | Server | `GET /diagrams` loads every visible diagram, then sorts and pages in JS |
| SRV-002 | Server | `/admin/stats` fires 9 parallel queries at a 10-connection pool |
| SRV-003 | Server | Every MFA operation re-derives its key with blocking `scryptSync` |
| SRV-004 | Server | Numeric env values unvalidated; NaN disables lockout or 500s later |
| SRV-005 | Server | `SECRETS_KEY` under 16 chars accepted at boot; MFA requests then 500 |
| SRV-006 | Server | Stored-diagram lint runs on up to 50 MB, bypassing 5 MB cap |
| SRV-007 | Server | Drift signature ignores change details; a second type change stays dismissed |
| SRV-008 | Server | `pairUp` guesses when two left items share one right key |
| SRV-010 | Server | Project delete checks emptiness then deletes; concurrent create hits FK 500 |
| SRV-011 | Server | Sign-up hashes the password before checking sign-up is closed |
| SRV-012 | Server | Link regenerate update lacks `revokedAt` guard; races a concurrent revoke |
| SRV-013 | Server | Writer GET and PUT hash full diagram content synchronously |
| SRV-014 | Server | No image HEALTHCHECK; forced exit equals Docker's 10 s stop grace |
| SRV-015 | Server | Share links per diagram unbounded; listing caps at 200 |
| SRV-016 | Server | CORS `onRequest` hook has no tests |
| CLI-001 | Client | Reopen reuses browser copy without checking server `updatedAt`; viewers see stale diagram |
| CLI-002 | Client | Publish syncs outside the autosaver; both send same base and conflict |
| CLI-003 | Client | Publish and drift controls render for viewers and lock losers |
| CLI-004 | Client | Tab close can drop edits: 10 s debounce, no `beforeunload` guard |
| CLI-005 | Client | Monaco imported eagerly via `config.ts`, defeating the lazy editor |
| CLI-006 | Client | All 22 locales imported statically into the main bundle |
| CLI-009 | Client | After a 423, cleanup flush sends another PUT bound to fail |
| CLI-010 | Client | Activity CSV export bypasses `request()`; its 401 does not end session |
| CLI-011 | Client | 401 from `/auth/mfa` or `/auth/change-password` does not end session |
| CLI-012 | Client | Share fetch has no timeout; one failed reload stops live updates |
| CLI-013 | Client | Opening a workspace fetches the full unpaged diagram list |
| CLI-014 | Client | Access banner project lookup stops at 100 projects |
| CLI-015 | Client | Local-config `localStorage` reads and writes lack try/catch |
| CLI-016 | Client | Fork templates and examples routes still ship in server mode |
| CLI-017 | Client | Drift badge polls every 60 s while the tab is hidden |
| CLI-018 | Client | 3 `exhaustive-deps` suppressions in Qubdi code |
| CLI-019 | Client | Arabic registered but document `dir` never set to RTL |
| REPO-008 | Repository | README says forked but never names the upstream project |
| CLI-007 | Client | Qubdi and admin UI strings hard-coded English; 0 files use `useTranslation` |
| REPO-016 | Repository | No CODEOWNERS file |
| CLI-008 | Client | Lock release on `pagehide` waits behind the final-save promise |
| CLI-020 | Client | Share, drift and re-sync call `syncDiagram` without flushing the autosaver |
| CLI-021 | Client | Re-sync, Share and lint Fix offered to viewers and lock losers |
| CLI-022 | Client | Re-sync swallows a failed save and still toasts success |
| CLI-023 | Client | Disposed saver's failed final flush sets 'error' after the status reset |
| CLI-024 | Client | Share-viewer stream has no `error` or `open` handler; a 429 ends live updates |
| CLI-025 | Client | Open dialog and legacy route load every visible diagram unpaged |
| CLI-026 | Client | Tooltips render nothing; icon-only toolbar buttons have no accessible name |
| CLI-027 | Client | JSON import in server mode creates a diagram outside any project |
| CLI-028 | Client | Editor statically imports `@dbml/core`; 15.7 MB chunk, 2.8 MB gzip |
| CLI-029 | Client | Fade selector scans all nodes and edges per table node per store change |
| CLI-030 | Client | Type colours legend text is hard-coded English |
| CLI-031 | Client | `fieldTypeKind` tints `datetimeoffset`, `datetime64` and `uint*` as text |
| CLI-032 | Client | `getWorkspaceId` uses bare `localStorage`; throws when storage is blocked |
| CLI-033 | Client | Move-into-project picker capped at 100 projects |
| CLI-034 | Client | `qubdidb.synced-content` entries never pruned when a diagram is unbound |
| CLI-035 | Client | Meta description still advertises the removed Comments feature |
| CLI-036 | Client | Import rethrows inside FileReader `onload`; unhandled rejection |
| CLI-037 | Client | Unused `CommandDialog` lacks a DialogTitle |
| CLI-038 | Client | `qrcode` imported eagerly by the 2FA dialog in the editor nav |
| SRV-017 | Server | Stored-diagram lint returns 500 when a table lacks `fields` |
| SRV-018 | Server | Diagram list runs `jsonb_array_length` on every listed row's content |
| SRV-019 | Server | Publish reads the full previous snapshot and re-hashes content |
| SRV-020 | Server | Drift list and badge load full report rows, including `changes` |
| SRV-021 | Server | Each drift check re-derives its key with blocking `scryptSync` |
| SRV-022 | Server | Drift check reconciles a working copy of any size |
| SRV-023 | Server | `LOG_LEVEL` unvalidated; a typo throws in pino, not `ConfigError` |
| SRV-024 | Server | Pool sets no `statement_timeout`; a slow query holds a connection |
| SRV-025 | Server | Share-link create counts then inserts; parallel creates exceed `MAX_ACTIVE_LINKS` |
| SRV-026 | Server | Link list caps 200 newest; revoked churn hides older active links |
| SRV-027 | Server | Drift check with missing settings or diagram answers 409 `already_running` |
| SRV-028 | Server | One failing purge skips every later maintenance step |
| REPO-023 | Repository | CI server audit fails: high `@azure/msal-node` advisory via `mssql`; moderate `fast-uri` |
| REPO-007 | Repository | Server `@types/node` is `^26` against the Node 24 runtime |
| REPO-024 | Repository | Root `happy-dom` has two high advisories, including host code execution |
| REPO-025 | Repository | Dependabot npm entries ignore no majors; TS 7, ESLint 10, `@types/node` 26 merged |
| REPO-028 | Repository | README backup writes `qubdidb-backup.sql` into the repo root; not git-ignored |
| REPO-026 | Repository | Root TypeScript 5.9 and server TypeScript 7 both compile `shared/` |
| REPO-027 | Repository | No release tag or `bootstrap-sha`; first release-please run scans all history |
| REPO-029 | Repository | CI never builds `db/postgres/Dockerfile`; Dependabot digest bumps go unbuilt |
| REPO-030 | Repository | Postgres image digest duplicated in three files |
| REPO-031 | Repository | Tag `verify` job skips CI's npm audit and gitleaks scan |
| REPO-032 | Repository | Published images carry no provenance, SBOM or signature |
| REPO-033 | Repository | Publish `verify` caches root npm only; server install uncached |
| REPO-034 | Repository | CONTRIBUTING still links the removed Discord |
| REPO-035 | Repository | CONTRIBUTING server test line omits `typecheck`, which CI runs |
| REPO-036 | Repository | README and build-tasks say React 18; package is React 19 |
| REPO-037 | Repository | ESLint ignores nonexistent `.eslintrc.cjs` but not `coverage/` |
| REPO-038 | Repository | `components.json` `ui` alias points at missing `src/components/ui` |
| REPO-039 | Repository | Pre-commit hook fails when `server/node_modules` is absent |
| REPO-040 | Repository | Client image context ships `server/`, `Audit/`, `.github/` |
| REPO-042 | Repository | `eslint-plugin-css-modules` configured; no `*.module.css` files exist |
| REPO-043 | Repository | `jsx-a11y` plugin registered with zero rules enabled |
| REPO-044 | Repository | Vite 8 config still uses `rollupOptions.manualChunks` |
| SEC-024 | Security & secrets | `TRUST_PROXY=true` trusts client `X-Forwarded-For`; per-IP limits, lockout and SSE cap bypassable |
| SEC-025 | Security & secrets | `/mfa/setup` and `/mfa/enable` need no password; stolen session can lock owner out |
| SEC-026 | Security & secrets | Wrong password on 2FA disable or code renewal logged as `user.sign_in_failed` |
| SEC-027 | Security & secrets | Tracked server example `DATABASE_URL` carries a working default password |
| CLI-039 | Client | Three `jsx-a11y` rules are off: 51 hits in autofocus and mouse-target code |
| CLI-040 | Client | Sign-out ends the session before the autosave flush, then deletes the local copy |
| CLI-041 | Client | Templates `og:image` points at missing `/qubdidb.png`; tags a nonexistent `@QubdiDB` |
| CLI-042 | Client | `clearLocalUserData` reads storage globals outside its try; blocked storage aborts sign-out |

---

## Accepted

| ID | Lens | Finding | Why |
|----|------|---------|-----|
| REPO-041 | Repository | `eslint-plugin-react` and `jsx-a11y` lack ESLint 10 peers; forced by overrides | Latest releases (react 7.37.5, jsx-a11y 6.10.2) still declare up to ESLint 9; the overrides stay until they do |

---

## Dropped

| ID | Finding | Reason |
|----|---------|--------|

---

## Database scale check

### Measured

| Item | Value |
|------|-------|
| Seed | users 10k · projects 500 · diagrams 20k (321 MB) · snapshots 50k (726 MB) · `audit_log` 5M (1.3 GB) |
| Autosave (pgbench, 4 clients) | 5.4 ms avg · 738 tps · 21 KB WAL per save · 98.75% HOT |
| Viewer list, 103 diagrams | 136 ms at 3 versions · 1,968 ms at 50 · 31 ms with LATERAL |
| Admin unpaged list, 20k rows | seq scan + 2.6 MB on-disk sort · 20 ms |
| Migration 0022, 321 MB | 10.8 s under ACCESS EXCLUSIVE |
| 43 MB diagram in Node | `JSON.parse` 122 ms · `JSON.stringify` 137 ms |
| Stock Postgres | `max_connections` 100 · `shared_buffers` 128MB · `work_mem` 4MB |

### Verified fine

| Area | Result | Where |
|------|--------|-------|
| Session lookup | One PK join, 0.6 ms; `last_seen_at` written at most every 5 min | `server/src/auth/sessions.ts:74` |
| HOT autosave | Holds: 1,975 of 2,000 diagram updates HOT | `server/src/db/schema.ts:254` |
| Member diagram list | Index path, 120 rows in 2.6 ms | `server/src/diagrams/routes.ts:150` |
| Audit log reads | Every filter and keyset cursor index-driven, under 1 ms | `server/src/audit/activity.ts:150` |
| Admin stats and diagrams | One statement 24 ms; top-N page 4–6 ms | `server/src/admin/stats.ts:79` |
| Transactions | Short; no pool client held across remote I/O or SSE | `server/src/drift/service.ts:263` |
| Write races | Lock upsert, link advisory lock, compare-and-write save | `server/src/diagrams/lock.ts:25` |
| Retention | Every growing table pruned | `server/src/maintenance.ts:141` |
| Keys and FKs | `bigint` audit ids; FK indexes on large cascades | `server/src/db/schema.ts:312` |

---

## Changelog

| Rev | Date | Change |
|-----|------|--------|
| 1 | 2026-10-19 | First pass on a fresh audit: 80 new, 0 fixed, 0 dropped |
| 2 | 2026-10-19 | 1 fixed |
| 3 | 2026-10-20 | 74 fixed; SEC-001 and REPO-016 narrowed to what is left |
| 4 | 2026-10-20 | 1 fixed |
| 5 | 2026-10-20 | 1 fixed |
| 6 | 2026-10-20 | 1 fixed |
| 7 | 2026-10-20 | 1 fixed |
| 8 | 2026-10-30 | Deep pass: 57 new, 0 fixed, REPO-007 reopened; SEC-001 widened to `MSSQL_SA_PASSWORD` |
| 9 | 2026-10-30 | 19 fixed: CLI-020 to CLI-038 |
| 10 | 2026-10-30 | 12 fixed: SRV-017 to SRV-028 |
| 11 | 2026-10-30 | 22 fixed: REPO-007, REPO-023 to REPO-040, REPO-042 to REPO-044; REPO-041 accepted; 1 new: CLI-039 |
| 12 | 2026-10-30 | 4 fixed: SEC-024 to SEC-027; SEC-001 left open |
| 13 | 2026-10-30 | Deep pass + new Database lens (`DB-` prefix): 27 new, 0 fixed, 0 regressed; SEC-001 widened to `server/.env.example` |
| 14 | 2026-10-30 | 4 fixed: CLI-039 to CLI-042 |
