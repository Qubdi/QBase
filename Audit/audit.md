# QBase — Audit

**rev** 2 · **date** 2026-11-09
**method** static analysis · whole-tree read · eslint, tsc --noEmit, client vitest run, npm advisory lookup via registry (no node on host) · server vitest not run (deps missing) · srvaudit-pg throwaway, read-only · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 29 | 0 | 0 | 0 | 0 |
| Repository | 45 | 0 | 0 | 0 | 0 |
| Server | 29 | 0 | 3 | 0 | 0 |
| Database | 14 | 0 | 0 | 0 | 0 |
| Client | 59 | 0 | 1 | 0 | 0 |
| Dead code | 30 | 0 | 0 | 0 | 0 |
| **Total** | 206 | 0 | 4 | 0 | 0 |

## Act first

- `SRV-001` — Auth runs in preHandler, so anonymous 50 MB bodies are read and parsed first
- `SRV-002` — Error handler logs Drizzle error whose message embeds all query params
- `SRV-021` — Quadratic regex on field type name hangs event loop; 100k chars takes 9 s
- `CLI-001` — No error boundary or route `errorElement`; a render or chunk-load error blanks the app

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | Med | Old remote history still holds a literal SQL Server SA password | `.gitleaks.toml:4` | Delete stale remote refs and purge their objects |
| SEC-002 | Med | MFA lockout never checked before enable, disable, recovery-renew code guesses | `server/src/auth/mfa-routes.ts:188`, `server/src/auth/mfa-routes.ts:274` | Call `locked()` on the `mfa:` key before checking codes |
| SEC-003 | Med | Introspection connections default to plaintext (`ssl` false) | `server/src/introspect/routes.ts:46`, `server/src/introspect/postgres.ts:350`, `server/src/introspect/sqlserver.ts:469` | Default `ssl` to true; require explicit opt-out |
| SEC-004 | Med | Cookie `Secure` stays off behind TLS proxy unless TRUST_PROXY is set | `server/src/config.ts:222`, `server/src/auth/routes.ts:82`, `docker-compose.yml:73` | Warn at start when COOKIE_SECURE=auto without TRUST_PROXY |
| SEC-005 | Med | No rate limit on authenticated routes (50 MB saves, share, admin) | `server/src/app.ts:120` | Add global per-user rate limit with route overrides |
| SEC-006 | Low | Fastify sets no requestTimeout or connectionTimeout (slow-body hold) | `server/src/app.ts:84` | Set requestTimeout and connectionTimeout in Fastify options |
| SEC-007 | Low | Disabled account answers 403 after correct password, confirming it | `server/src/auth/routes.ts:229` | Return generic 401 for disabled accounts |
| SEC-008 | Low | Lockout key includes address; spread guesses on one account unthrottled | `server/src/auth/routes.ts:199` | Add per-account failure counter across addresses |
| SEC-009 | Low | MFA lockout key has no address; password holder locks victim's second step | `server/src/auth/mfa-routes.ts:98` | Key second-step lockout by account and address |
| SEC-010 | Low | Unkeyed sha256 recovery-code hashes still accepted | `server/src/auth/mfa.ts:164`, `server/src/auth/totp.ts:172` | Migrate legacy hashes, then drop legacy lookup |
| SEC-011 | Low | Encryption keys accept any 16 characters; scrypt salt is fixed | `server/src/config.ts:128`, `server/src/introspect/crypto-box.ts:11` | Require 32+ chars; add per-value random salt |
| SEC-012 | Low | Legacy shared-key fallback lets any purpose box open unpurposed ciphertext | `server/src/introspect/crypto-box.ts:81` | Re-seal legacy values, then remove fallback |
| SEC-013 | Low | Read-only guard is a denylist missing `pg_read_binary_file`, `sp_executesql`, `xp_dirtree` | `server/src/introspect/readonly-guard.ts:15` | Allowlist query ids instead of keyword denylist |
| SEC-014 | Low | SQL Server session not read-only; `readOnlyIntent` is only a routing hint | `server/src/introspect/sqlserver.ts:473` | Document least-privilege login; refuse `db_owner` logins |
| SEC-016 | Low | `user.create` audit omits whether the new account was made admin | `server/src/admin/routes.ts:346` | Add `isAdmin` to `user.create` audit meta |
| SEC-017 | Low | Lockouts and MFA secret setup leave no audit row | `server/src/auth/routes.ts:71`, `server/src/auth/mfa-routes.ts:153`, `server/src/audit/audit.ts:18` | Add `auth.locked` and `mfa.setup` audit actions |
| SEC-018 | Low | Admin can reset another admin's password and MFA with no step-up | `server/src/admin/routes.ts:370`, `server/src/admin/routes.ts:593` | Require admin password and code for reset actions |
| SEC-019 | Low | First-run register open to any caller who reaches an empty server | `server/src/auth/routes.ts:130`, `server/src/auth/routes.ts:142` | Require a setup token printed in server log |
| SEC-020 | Low | Viewers can list every project member's email | `server/src/members/routes.ts:23` | Return member emails to writers only |
| SEC-021 | Low | INTROSPECT_ALLOW_HOSTS accepts `0.0.0.0/0` and junk entries unchecked | `server/src/config.ts:241` | Validate entries; reject `/0` to `/7` ranges |
| SEC-022 | Low | Editor CSP allows inline styles (`style-src 'unsafe-inline'`) | `server/src/web.ts:16` | Move inline styles to nonce or hashed styles |
| SEC-023 | Low | App container lacks `no-new-privileges`, `cap_drop`, `read_only` | `docker-compose.yml:49` | Add `security_opt`, `cap_drop: [ALL]`, `read_only: true` |
| SEC-024 | Low | Compose default image tag `latest`, unpinned | `docker-compose.yml:53` | Require QBASE_VERSION; drop the `latest` default |
| SEC-025 | Low | `.gitignore` lacks key and certificate patterns (`*.pem`, `*.key`) | `.gitignore:70` | Ignore `*.pem`, `*.key`, `*.p12`, `*.pfx` |
| SEC-026 | Low | Load stack hard-codes DB password, encryption key and admin password | `server/load/docker-compose.yml:62`, `server/load/docker-compose.yml:63`, `server/load/seed.mjs:10` | Generate load-test secrets per run |
| SEC-027 | Med | Lint rate limit keyed by raw cookie at onRequest; rotating junk cookies bypasses it | `server/src/lib/rate-key.ts:19`, `server/src/lint/routes.ts:53` | Count in preHandler after session lookup, like sharedUserLimit |
| SEC-028 | Low | No Strict-Transport-Security header on API or editor responses | `server/src/web.ts:426`, `server/src/lib/security-headers.ts:235` | Send HSTS when cookies are secure or request is https |
| SEC-029 | Low | CORS_ORIGIN unvalidated; `*` or trailing slash silently breaks credentialed requests | `server/src/config.ts:210` | Require exact origin; reject `*` and paths at startup |
| SEC-030 | Low | Session cookie lacks `__Host-` prefix | `server/src/auth/routes.ts:80`, `server/src/auth/sessions.ts:7` | Rename to `__Host-` cookie when secure |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-001 | Med | `bootstrap-sha` commit is not an ancestor of main | `release-please-config.json:4` | Set bootstrap-sha to a commit in main |
| REPO-002 | Med | `latest` tag moves on every `v*` tag, including prereleases | `.github/workflows/publish.yaml:134`, `run.sh:84` | Tag latest only for non-prerelease versions |
| REPO-003 | Med | Similarity check runs only on `rewrite/clean-room`, never on main | `.github/workflows/similarity.yaml:11`, `.github/workflows/similarity.yaml:13` | Add main to similarity triggers |
| REPO-004 | Med | Publish workflow ships images while TODO says do not publish | `TODO.md:7`, `rewrite/TODO.md:7`, `.github/workflows/publish.yaml:5` | Reconcile TODO with publish; gate publish on rewrite status |
| REPO-005 | Med | Gitleaks ignore fingerprint names a commit absent from main history | `.gitleaksignore:3` | Regenerate fingerprint from main history commit |
| REPO-006 | Med | npm version updates paused; both npm entries have limit 0 | `.github/dependabot.yml:11`, `.github/dependabot.yml:25` | Restore limit to 5 or document accepted pause |
| REPO-008 | Low | Dependabot ignore comments cite TODO.md for majors; TODO.md lists none | `.github/dependabot.yml:16`, `.github/dependabot.yml:30` | List pending majors in TODO.md or drop reference |
| REPO-009 | Low | PLAN calls main the read-only ChartDB reference; main now holds the rewrite | `rewrite/PLAN.md:3`, `rewrite/TODO.md:9` | Update rewrite docs to current branch roles |
| REPO-010 | Low | Clean-checkout script hard-requires branch `rewrite/clean-room` | `tools/make-clean-checkout.sh:23` | Drop or update branch guard |
| REPO-011 | Low | Manual `run.sh push` bypasses verify gate; compose says tag workflow only | `run.sh:14`, `docker-compose.yml:2` | Remove push from run.sh or fix comment |
| REPO-012 | Low | Load-test compose pins no digest: postgres, node, `grafana/k6:latest` | `server/load/docker-compose.yml:12`, `server/load/docker-compose.yml:40`, `server/load/docker-compose.yml:104` | Pin images by digest |
| REPO-013 | Low | Playwright image tag unpinned by digest; npm installs at run time | `tools/e2e/run-smoke.sh:16`, `tools/e2e/run-smoke.sh:17` | Pin image digest and playwright via lockfile |
| REPO-014 | Low | Audit prompt scope names files that do not exist | `Audit/Prompt.md:32`, `Audit/Prompt.md:33`, `Audit/Prompt.md:130` | Remove server/Dockerfile, default.conf.template, entrypoint.sh, db/postgres |
| REPO-015 | Low | 1.1 MB `audit-ui-differences.html` tracked, not an owned audit file | `Audit/audit-ui-differences.html:1` | Untrack or move out of Audit/ |
| REPO-016 | Low | CONTRIBUTING omits CONNECTION_KEY that `docker compose up -d db` requires | `CONTRIBUTING.md:49`, `docker-compose.yml:63` | Add CONNECTION_KEY to the test setup note |
| REPO-017 | Low | README licence paragraph has no heading, sits inside Scaling | `README.md:385` | Add a `## License` heading |
| REPO-018 | Low | Code of Conduct enforcement contact is not actionable | `CODE_OF_CONDUCT.md:62` | Name an email address for reports |
| REPO-019 | Low | QBase-build-tasks says hashed share tokens and keep-all versions; both differ now | `QBase-build-tasks.md:62`, `QBase-build-tasks.md:46`, `README.md:237` | Mark tasks as history or update them |
| REPO-020 | Low | Workflows set no `timeout-minutes` or `concurrency` | `.github/workflows/ci.yaml:14`, `.github/workflows/publish.yaml:17` | Add timeout-minutes and concurrency groups |
| REPO-021 | Low | Publish does not check tag matches package.json version | `.github/workflows/publish.yaml:5` | Add step comparing tag to package.json |
| REPO-022 | Low | CODEOWNERS lists a personal email, no team; single point of review | `.github/CODEOWNERS:5` | Use a verified `@org/team` owner |
| REPO-023 | Low | `.gitignore` carries unused Next, Nuxt, Gatsby, vuepress, Firebase entries | `.gitignore:77`, `.gitignore:81`, `.gitignore:86`, `.gitignore:119` | Trim to ecosystems this repo uses |
| REPO-024 | Low | `.prettierrc.json` indents 2 spaces; `.editorconfig` says 4 | `.prettierrc.json:3`, `.editorconfig:9` | Reindent prettierrc to 4 spaces |
| REPO-025 | Low | e2e tools in `tools/e2e` run in no workflow and appear in no doc | `tools/e2e/run-smoke.sh:1`, `README.md:316` | Document e2e scripts or add CI job |
| REPO-026 | Low | Husky pre-commit skips server lint silently when server deps absent | `.husky/pre-commit:4` | Fail, or run server lint in CI only |
| REPO-027 | Med | Load run.sh never fails on a k6 threshold; README says it gates CI | `server/load/run.sh:58`, `server/load/run.sh:69`, `server/load/README.md:18` | Return k6run status from run_one |
| REPO-028 | Med | README says only a share-token hash is stored; code also stores encrypted token | `README.md:21`, `README.md:237`, `server/src/share/routes.ts:168` | Reword feature line to hash plus encrypted token |
| REPO-029 | Low | Postgres digest check passes when one file has no pin at all | `.github/scripts/check-postgres-digest.sh:9` | Fail when any listed file lacks a pin |
| REPO-030 | Low | Missing `--rewritten` or `--allow` file or path is silently ignored | `tools/similarity.mjs:273`, `tools/similarity.mjs:385` | Error on missing list file or listed path |
| REPO-031 | Low | Empty upstream index still reports "No checked file is over the limits" | `tools/similarity.mjs:344` | Exit 1 when upstream index has zero runs |
| REPO-032 | Low | Non-numeric `--threshold`, `--max-run`, `--run` become NaN and checks pass | `tools/similarity.mjs:117`, `tools/spec-check.mjs:94` | Reject NaN option values |
| REPO-033 | Low | owner-decisions links `spec/...` resolve to rewrite/spec/spec/ and break | `rewrite/spec/owner-decisions.md:105` | Drop the `spec/` prefix from the four links |
| REPO-034 | Low | TODO says EDT-250 is open; parity checklist ticks it, browser-driven | `rewrite/TODO.md:66`, `rewrite/TODO.md:80`, `rewrite/parity-checklist.md:389` | Update TODO counts to 684 ticked, 3 partial |
| REPO-035 | Low | TODO says seven languages ship; only en, de, fr, it, ru exist | `rewrite/TODO.md:60` | Correct language list or add ka and zh |
| REPO-036 | Low | Rewrite docs cite audit IDs REPO-005, REPO-069, REPO-045 that now mean other things | `rewrite/TODO.md:76`, `rewrite/TODO.md:81`, `rewrite/PLAN.md:295` | Drop audit IDs from rewrite docs |
| REPO-037 | Low | TODO forbids changing licence while Elastic-2.0 is already applied | `rewrite/TODO.md:7`, `rewrite/TODO.md:74` | Reword line 7 to match applied licence |
| REPO-038 | Low | NOTICE and allow-list name separator.tsx, which no longer exists | `NOTICE:36`, `rewrite/similarity-allow.txt:34` | Remove separator from both lists |
| REPO-039 | Low | PLAN says branch does not build; TODO says build, lint, tests pass | `rewrite/PLAN.md:69`, `rewrite/PLAN.md:138` | Mark build-state notes as history |
| REPO-040 | Low | make-clean-checkout comment cites rewrite/clean-author-brief.md, which does not exist | `tools/make-clean-checkout.sh:15` | Point at clean-author-brief-phase*.md |
| REPO-041 | Low | e2e visual scripts hard-code `/home/qubdi/ui-reference` output path | `tools/e2e/visual/run.mjs:24`, `tools/e2e/visual/run-new.sh:10`, `tools/e2e/visual/run-run.sh:11` | Default to a temp or `$HOME` path |
| REPO-042 | Low | Committed briefs and specs embed an absolute personal home path | `rewrite/phase8-brief.md:3`, `rewrite/translation-brief.md:3`, `rewrite/spec/visual-shell.md:10` | Use repo-relative wording |
| REPO-043 | Low | run-new.sh waits a fixed 4 s for vite preview instead of polling | `tools/e2e/visual/run-new.sh:17` | Poll BASE_URL until it answers |
| REPO-044 | Low | `.dockerignore` omits rewrite/, tools/, server/load; 1.7 MB enters build context | `.dockerignore:25`, `Dockerfile:15` | Ignore rewrite/, tools/ and server/load/ |
| REPO-045 | Low | licences.mjs treats any parenthesised licence expression as permissive | `tools/licences.mjs:46` | Match explicit SPDX ids inside parentheses |
| REPO-046 | Low | package.json lacks repository, bugs and homepage fields | `package.json:2` | Add repository, bugs and homepage |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-001 | High | Auth runs in preHandler, so anonymous 50 MB bodies are read and parsed first | `server/src/diagrams/routes.ts:115`, `server/src/diagrams/routes.ts:252`, `server/src/diagrams/routes.ts:341`, `server/src/config.ts:219` | Check session cookie in onRequest before body parsing |
| SRV-002 | High | Error handler logs Drizzle error whose message embeds all query params | `server/src/app.ts:188` | Log err.cause and query name only, never params |
| SRV-003 | Med | Audit insert after committed write throws, returning 500 for a done action | `server/src/audit/audit.ts:152`, `server/src/diagrams/routes.ts:428`, `server/src/auth/routes.ts:244`, `server/src/share/routes.ts:187` | Write audit in same transaction or swallow and log |
| SRV-004 | Med | Link revoke/update emits live-viewer event after audit; audit failure leaves viewers connected | `server/src/share/routes.ts:277`, `server/src/share/routes.ts:289`, `server/src/share/routes.ts:248`, `server/src/share/routes.ts:254`, `server/src/admin/routes.ts:711`, `server/src/admin/routes.ts:722` | Emit link event before audit, or in finally |
| SRV-006 | Med | LISTEN connection has no TCP keepalive; a silently dropped link is never noticed | `server/src/events.ts:108` | Set keepAlive true on the pg.Client |
| SRV-007 | Med | No rate limit on publish; each call stores a snapshot up to 50 MB | `server/src/diagrams/routes.ts:506` | Add perUserLimit to /:id/publish |
| SRV-008 | Med | Limiters, lockout, viewer caps and drift-running guard are per process, not per cluster | `server/src/lib/rate-key.ts:53`, `server/src/lib/failure-throttle.ts:15`, `server/src/share/routes.ts:346`, `server/src/share/routes.ts:348`, `server/src/drift/service.ts:74` | Move counters and running guard to Postgres or advisory locks |
| SRV-009 | Med | Default 50 MB diagram body parsed by zod and hashed synchronously on event loop | `server/src/config.ts:219`, `server/src/diagrams/routes.ts:281`, `server/src/diagrams/routes.ts:384` | Lower default limit or hash in worker thread |
| SRV-010 | Low | Share link PATCH answers too_many_links when link vanished instead of 404 | `server/src/share/routes.ts:245` | Return 404 when update returns no row |
| SRV-011 | Low | No unhandledRejection or uncaughtException handler; crash skips graceful shutdown | `server/src/server.ts:77`, `server/src/server.ts:78` | Add handlers that log and call shutdown |
| SRV-012 | Low | /health answers ok without touching the database | `server/src/app.ts:116` | Run select 1 in /health with short timeout |
| SRV-013 | Low | Unpaged lists: members, one project's diagrams, admin members, saved connections | `server/src/members/routes.ts:29`, `server/src/diagrams/routes.ts:231`, `server/src/admin/routes.ts:891`, `server/src/introspect/routes.ts:303` | Add limit to each list |
| SRV-014 | Low | Save-audit throttle is check-then-insert; concurrent saves write duplicate rows | `server/src/audit/audit.ts:167`, `server/src/audit/audit.ts:184` | Insert conditionally in one statement |
| SRV-015 | Low | MFA enable replaces codes and sets enabled_at in separate statements | `server/src/auth/mfa.ts:174`, `server/src/auth/mfa.ts:175` | Wrap both writes in one transaction |
| SRV-016 | Low | Drift webhook sent before report insert; insert failure resends next check | `server/src/drift/service.ts:343`, `server/src/drift/service.ts:375` | Insert report first, then send webhook |
| SRV-017 | Low | Introspection connection errors and UnsafeSqlError are replied without being logged | `server/src/introspect/routes.ts:226`, `server/src/introspect/routes.ts:229` | Call req.log.error before replying |
| SRV-018 | Low | Drift dismiss writes audit row even when nothing was dismissed | `server/src/drift/routes.ts:290`, `server/src/drift/routes.ts:296` | Audit only when an update changed a row |
| SRV-019 | Low | Publishes during a LISTEN outage are never replayed to live viewers | `server/src/events.ts:33`, `server/src/events.ts:97` | Send current version in each heartbeat ping |
| SRV-020 | Low | No test references reseal.ts, snapshot-cache.ts or server.ts | `server/src/drift/reseal.ts:13`, `server/src/share/snapshot-cache.ts:15`, `server/src/server.ts:1` | Add unit tests for reseal and snapshot cache |
| SRV-021 | High | Quadratic regex on field type name hangs event loop; 100k chars takes 9 s | `shared/schema-desc.ts:95`, `shared/schema-desc.ts:315` | Strip trailing `[]` with a loop, not `(\[\])+$` |
| SRV-022 | Low | Same quadratic `(\[\])+$` on type text returned by remote database | `server/src/introspect/typmod.ts:74` | Strip trailing `[]` with a loop |
| SRV-023 | Med | SSE_HEARTBEAT_SECONDS above 2147483 overflows setInterval to 1 ms ticks | `server/src/config.ts:233`, `server/src/share/routes.ts:511` | Cap SSE_HEARTBEAT_SECONDS at 3600 in `int()` |
| SRV-024 | Low | SESSION_DAYS has no maximum; large value makes expiry Invalid Date, sign-in 500s | `server/src/config.ts:212`, `server/src/auth/sessions.ts:41` | Pass a max, such as 3650, to `int()` |
| SRV-025 | Med | pg.Client for introspection has no error listener; dropped target connection can crash process | `server/src/introspect/postgres.ts:362` | Add `client.on('error', ...)` that ignores or logs |
| SRV-026 | Med | mssql ConnectionPool for introspection has no error listener | `server/src/introspect/sqlserver.ts:458` | Add `pool.on('error', ...)` handler |
| SRV-027 | Low | Lint-config GET and PUT have no rate limit unlike /lint | `server/src/lint/routes.ts:140`, `server/src/lint/routes.ts:152` | Add `...limit` to both routes |
| SRV-028 | Low | SSE writes ignore backpressure; a slow viewer buffers events without bound | `server/src/share/routes.ts:480`, `server/src/share/routes.ts:530` | Close stream when `raw.write` returns false and buffer grows |
| SRV-029 | Low | Session end deletes sessions and locks in separate statements, not one transaction | `server/src/auth/sessions.ts:115`, `server/src/auth/sessions.ts:121` | Wrap delete and lock release in db.transaction |
| SRV-030 | Low | SQL Server tests silently skip when container is absent, so CI never runs them | `server/test/introspect-sqlserver.test.ts:20` | Fail in CI when MSSQL is unreachable |

### Database

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DB-001 | Med | Snapshot and drift prune deletes are unbatched; a big backlog hits the 120s timeout | `server/src/maintenance.ts:100`, `server/src/maintenance.ts:116`, `server/src/server.ts:38` | Batch both deletes like purgeAuditLog |
| DB-002 | Med | Viewer list reads each snapshot's full jsonb for five stats; snapshots lack stored stat columns | `server/src/diagrams/service.ts:58`, `server/src/diagrams/summary.ts:51` | Add generated stat columns to snapshots, as diagrams have |
| DB-003 | Med | Size checks serialise whole jsonb with `octet_length(content::text)`; 50 MB costs about 0.8 s | `server/src/lint/routes.ts:95`, `server/src/lint/routes.ts:116`, `server/src/drift/service.ts:236` | Use pg_column_size or a stored size column |
| DB-004 | Med | SQL Server introspection drops columnstore, XML and spatial indexes; import maps them | `server/src/introspect/sqlserver.ts:105`, `src/formats/metadata/load.ts:41` | Drop key_ordinal filter for non-key index types |
| DB-005 | Low | SQL Server introspection has no database-level read-only guard; only the text check | `server/src/introspect/sqlserver.ts:473`, `server/src/introspect/sqlserver.ts:246` | Check login lacks write rights via HAS_PERMS_BY_NAME |
| DB-006 | Low | SQL Server returns no custom types; PostgreSQL returns enums and composites | `server/src/introspect/sqlserver.ts:380` | Read alias types from sys.types where is_user_defined |
| DB-007 | Low | Five FKs lack an index; diagram_locks.user_id is scanned on every sign-in and sign-out | `server/src/db/schema.ts:272`, `server/src/db/schema.ts:168`, `server/src/db/schema.ts:372`, `server/src/db/schema.ts:400`, `server/src/db/schema.ts:445`, `server/src/auth/sessions.ts:50` | Index diagram_locks.user_id; index the rest if tables grow |
| DB-008 | Low | One pending MFA ticket per account is not enforced; concurrent logins leave two | `server/src/db/schema.ts:119`, `server/src/auth/mfa.ts:207` | Make mfa_challenges_user_idx unique; upsert on conflict |
| DB-009 | Low | Audit rows are written after, not inside, the transaction of the change | `server/src/admin/routes.ts:481`, `server/src/admin/routes.ts:572`, `server/src/diagrams/routes.ts:497` | Insert the audit row inside the same transaction |
| DB-010 | Low | Backups section omits saving CONNECTION_KEY and SECRETS_KEY with the dump | `README.md:378` | Add key backup to backup and restore steps |
| DB-011 | Low | View definition spliced unquoted into CREATE VIEW; odd schema or view names break the text | `server/src/introspect/postgres.ts:249` | Quote schema and view names as identifiers |
| DB-012 | Low | Generated stat columns re-parse whole jsonb on every content autosave | `server/src/db/migrations/0022_diagram_stats.sql:2` | Compute stats in app; store as plain columns |
| DB-013 | Low | Migrations build audit_log indexes without CONCURRENTLY, blocking audit writes | `server/src/db/migrations/0012_wakeful_squadron_supreme.sql:1`, `server/src/db/migrations/0015_model_review.sql:63` | Create large-table indexes CONCURRENTLY outside transaction |
| DB-014 | Low | Migration 0015 rewrites audit_log under exclusive lock to widen id to bigint | `server/src/db/migrations/0015_model_review.sql:33` | Document downtime; batch-copy into new table for big logs |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-001 | High | No error boundary or route `errorElement`; a render or chunk-load error blanks the app | `src/app.tsx:17`, `src/platform/router/router.tsx:15` | Add root error boundary and route errorElement with reload |
| CLI-002 | Med | Startup `api.me()` failure of any kind (timeout, 5xx) shows user as signed out | `src/context/qubdi-context/qubdi-provider.tsx:66` | Only clear user on 401; keep state and retry otherwise |
| CLI-003 | Med | "Overwrite" conflict action swallows fetch errors; click does nothing visibly | `src/components/qubdi/server-autosave.tsx:105` | Surface failure through setSaveStatus error state |
| CLI-005 | Med | Final-save keepalive silently dropped above 60 KB; larger diagrams rely on beforeunload prompt only | `src/lib/qubdi/api.ts:455` | Use sendBeacon or chunked fallback for large final saves |
| CLI-006 | Med | API responses cast `as T`, never validated at runtime | `src/lib/qubdi/api.ts:476` | Parse responses with zod schemas per endpoint |
| CLI-007 | Med | Four React Compiler hook rules disabled repo-wide; refs written during render | `eslint.config.mjs:52`, `src/components/qubdi/server-autosave.tsx:49` | Migrate components; re-enable rules |
| CLI-008 | Low | Native `window.confirm` on sign-out with unsaved changes; not a styled dialog | `src/context/qubdi-context/qubdi-provider.tsx:119` | Replace with AlertDialog |
| CLI-009 | Low | Logout ignores failed `api.logout()` and wipes local data anyway | `src/context/qubdi-context/qubdi-provider.tsx:125` | Report failure; keep session state consistent |
| CLI-010 | Low | `refreshUser` failure after forced password change swallowed; dialog stays with no feedback | `src/components/qubdi/forced-password-change.tsx:17` | Show error or retry on refresh failure |
| CLI-011 | Low | Timers without cleanup: fake 1 s repair delay, focus delay, URL revoke at 0 ms | `src/features/import/import-box.tsx:262`, `src/components/qubdi/lint-control.tsx:150`, `src/lib/qubdi/save-blob.ts:11` | Clear on unmount; revoke URL after delay |
| CLI-012 | Low | Diagnostics matched by English message text, not code | `src/features/export/export-sql-dialog.tsx:85`, `src/features/import/import-box.tsx:296` | Add `code` field to diagnostics; compare codes |
| CLI-013 | Low | Server `detail` text shown raw, bypasses i18n | `src/lib/qubdi/api.ts:948` | Map server codes to translated strings only |
| CLI-014 | Low | Dialog has no Description; Radix warns, no aria-describedby | `src/features/links/create-link-dialog.tsx:94` | Add DialogDescription or `aria-describedby={undefined}` |
| CLI-015 | Low | Favicon is empty `data:,`; no app icon in tabs | `index.html:8` | Link real favicon from public/ |
| CLI-016 | Low | Share viewer reloads full share on every `version` event, no debounce | `src/pages/share-viewer-page/share-viewer-page.tsx:100` | Debounce load on version events |
| CLI-017 | Low | Every save fingerprints full content several times (sorted-key stringify each) | `src/lib/qubdi/sent-content.ts:30` | Fingerprint once per save; reuse result |
| CLI-018 | Low | No tests import `createRevisionTracker`, `CodeField`, `ListPager`, `SearchInput`, `ProjectCreateDialog`, `NewProjectDialog`, `ProjectSettings`, `NotFoundPage`, `RouteFallback` | `src/lib/qubdi/revision.ts:1`, `src/components/qubdi/list-pager.tsx:1` | Add unit tests, revision tracker first |
| CLI-019 | Low | Eslint-disable `exhaustive-deps` count 14 in src; two files carry `no-explicit-any` file-wide | `src/canvas/diagram-canvas.tsx:330`, `src/core/wire/wire.test.ts:1` | Narrow suppressions; type fixtures |
| CLI-020 | Med | Type-declaration regex backtracks cubically; 400 spaces take 1.3 s, 2000 never finish | `src/core/model/type-declaration.ts:31` | Rewrite regex without overlapping space classes; cap input length |
| CLI-021 | Med | CRLF DBML skips array and check preparation because `.` stops at `\r` | `src/formats/dbml/prepare.ts:67` | Split on `/\r?\n/` |
| CLI-022 | Med | DBML array and check keys use table name only; same-named tables in two schemas collide | `src/formats/dbml/import-dbml.ts:177`, `src/formats/dbml/prepare.ts:79` | Key by schema plus table plus field |
| CLI-023 | Med | Any `name(...)` default passes as function call; `;` and extra statements emitted verbatim | `src/dialects/shared/defaults.ts:27` | Reject top-level `;` and unbalanced parentheses |
| CLI-024 | Med | CHECK, generated and WHERE expressions written raw into DDL, no statement-break guard | `src/dialects/postgresql/write.ts:257`, `src/dialects/mysql/write.ts:196` | Run `checkExpression` before writing; refuse unbalanced text |
| CLI-025 | Med | Index conversion keeps fulltext, spatial, gin without checking column types; DDL fails | `src/dialects/convert/convert-index.ts:84`, `src/dialects/convert/convert-index.ts:96` | Call `methodProblem` with column kinds before keeping type |
| CLI-026 | Med | Removed-diagram guard lives in one tab; another tab's autosave rewrites the deleted diagram | `src/persistence/dexie-adapter.ts:81` | Check store row or broadcast removals across tabs |
| CLI-027 | Low | `save` clears removed flag, so an in-flight autosave resurrects a just-deleted diagram | `src/persistence/dexie-adapter.ts:66` | Keep flag; clear it only on explicit create |
| CLI-028 | Med | Layout probe loop scans all placed boxes per step; hub with many links is cubic | `src/formats/shared/layout.ts:88` | Use spatial grid or per-column cursor for hub neighbours |
| CLI-029 | Low | Builder copies neighbour array per link; hub table is quadratic | `src/formats/shared/design-builder.ts:402` | Push into the existing array |
| CLI-030 | Low | `hasTable` and `resolveTable` scan all tables per call; import is quadratic | `src/formats/shared/design-builder.ts:122` | Index tables by lower-cased schema and name |
| CLI-031 | Low | DBML export finds tables and columns by linear scan per link | `src/formats/dbml/export-dbml.ts:123` | Build id-to-name maps once |
| CLI-032 | Low | Bulk remove still does `indexOf` and `splice` per table and link | `src/core/commands/apply.ts:597`, `src/core/commands/apply.ts:609` | Compute positions in one pass with a Set |
| CLI-033 | Low | `setZoom(NaN)` stores NaN; clamp passes it through | `src/store/editor-store.ts:303` | Ignore non-finite zoom |
| CLI-034 | Low | DBML export strips backticks from defaults and checks, corrupting MySQL expressions | `src/formats/dbml/export-dbml.ts:58`, `src/formats/dbml/export-dbml.ts:234` | Escape backticks instead of removing them |
| CLI-035 | Low | DBML export writes many-to-many link as `<`, silently becoming one-to-many | `src/formats/dbml/export-dbml.ts:66` | Add diagnostic or emit `<>` |
| CLI-036 | Low | Builder drops duplicate column names silently, no diagnostic | `src/formats/shared/design-builder.ts:180` | Push warning naming table and column |
| CLI-037 | Low | Many-to-many cardinality silently coerced to one-to-many on import | `src/formats/shared/design-builder.ts:379` | Warn when coercing |
| CLI-038 | Low | Array default conversion swaps every `'` for `"`, mangling items with quotes | `src/dialects/convert/convert-default.ts:47` | Parse list items; re-quote per target |
| CLI-039 | Low | Metadata import names primary key after any unique index on same columns | `src/formats/metadata/load.ts:178` | Use primary flag from metadata, not column match |
| CLI-040 | Low | Unknown-key capture assigns `__proto__` as prototype; extras inherit attacker keys then drop | `src/core/wire/record-reader.ts:88` | Use `Object.create(null)` or skip `__proto__` |
| CLI-041 | Low | Link-pair lookup uses `includes` per pair; hub arrange is quadratic | `src/canvas/auto-arrange.ts:45` | Use Set per tile |
| CLI-042 | Low | `Math.min(...array)` spreads overflow the stack on very large diagrams | `src/canvas/geometry.ts:100`, `src/formats/image/export-options.ts:98` | Use `reduce` loops |
| CLI-043 | Low | File import reads whole file with no size cap before parse | `src/lib/export-import-utils.ts:17` | Refuse files above a set byte limit |
| CLI-044 | Low | Settings write reads then puts outside a transaction; tabs lose updates | `src/persistence/dexie-adapter.ts:124` | Wrap in `db.transaction('rw', config)` |
| CLI-045 | Low | Every edit serialises the whole design before section reuse check | `src/qbase/diagram-convert.ts:83` | Serialise only changed sections |
| CLI-050 | Med | Sign-in email and password inputs have placeholder only, no label | `src/components/qubdi/auth-dialog.tsx:210`, `src/components/qubdi/auth-dialog.tsx:219` | Add aria-label matching the placeholder |
| CLI-051 | Low | Current-password input has placeholder only, no accessible name | `src/components/qubdi/change-password-dialog.tsx:113` | Add aria-label to the input |
| CLI-052 | Med | Viewer primary-key icon has no accessible name; meaning is icon-only | `src/pages/share-viewer-page/viewer-table-node.tsx:118` | Add aria-label or visually hidden text |
| CLI-053 | Low | Viewer NOT NULL marker is a 4 px dot with tooltip only | `src/pages/share-viewer-page/viewer-table-node.tsx:155` | Use visible text and aria-label |
| CLI-054 | Low | Viewer header brand name is hard-coded English | `src/pages/share-viewer-page/share-viewer-page.tsx:272` | Use a translated string or shared logo |
| CLI-055 | Low | Viewer search box fixed at 16 rem; crowds the header on phones | `src/pages/share-viewer-page/share-viewer-page.tsx:285` | Use responsive width such as w-full sm:w-64 |
| CLI-056 | Low | Viewer loading text is not a live region; error and loading unannounced | `src/pages/share-viewer-page/share-viewer-page.tsx:210` | Add role="status" or role="alert" |
| CLI-057 | Med | Dates use browser default locale, not the chosen language, despite `localeTag` | `src/lib/qubdi/when.ts:23`, `src/lib/qubdi/diagram-summary.ts:23` | Pass localeTag(i18n.language) to formatters |
| CLI-058 | Low | Numbers hard-coded to en-US in admin tiles and chart table | `src/lib/qubdi/overview.ts:46`, `src/pages/admin-page/activity-chart.tsx:242` | Format with the active language's locale |
| CLI-059 | Low | Share dialog load effect has no cancel; late reply from old diagram overwrites links | `src/components/qubdi/share-dialog.tsx:62` | Add stale flag cleared in effect cleanup |
| CLI-060 | Low | "Copied" label swap is not announced to screen readers | `src/components/qubdi/share-dialog.tsx:173`, `src/components/qubdi/two-factor-dialog.tsx:359` | Add aria-live region for copy confirmation |
| CLI-061 | Low | Share and 2FA copy bypass `copyText`; no unsupported-clipboard message | `src/components/qubdi/share-dialog.tsx:108`, `src/components/qubdi/two-factor-dialog.tsx:173` | Use copyText helper for both |
| CLI-062 | Low | Open-failed screen offers only "back to projects"; no retry for transient errors | `src/components/qubdi/diagram-access.tsx:66`, `src/components/qubdi/diagram-access.tsx:232` | Add Retry button for failed state |
| CLI-064 | Low | index.html has no noscript fallback; JS-off users see blank page | `index.html:15` | Add translated noscript notice in main |
| CLI-065 | Low | Tests wait on fixed timers (600 ms, 50 ms) instead of conditions | `src/canvas/review-ui.test.tsx:115`, `src/qbase/p8-qbs-contract.test.tsx:189` | Use waitFor or fake timers |

### Dead code

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DEAD-001 | Med | `VITE_HOST_URL`, `VITE_APP_URL` baked at build, no reader; README claims they work | `.env.example:87`, `.env.example:91`, `Dockerfile:10`, `Dockerfile:11`, `Dockerfile:18`, `docker-compose.build.yml:18`, `docker-compose.build.yml:19`, `run.sh:92`, `run.sh:93`, `src/vite-env.d.ts:5`, `src/vite-env.d.ts:6`, `README.md:224` | Remove both variables and README sentence |
| DEAD-002 | Med | `t('qubdi.viewerPage.pageTitle')` key missing from en; share page title shows raw key | `src/pages/share-viewer-page/share-viewer-page.tsx:343`, `src/i18n/qubdi/workspace.ts` | Use `qubdi.workspace.viewerPage.pageTitle` in the page |
| DEAD-003 | Low | Unused i18n keys in `qubdi.sidePanel` (whole object); no `t()` reader | `src/i18n/qubdi/side-panel.ts:3`, `src/i18n/locales/en.ts:6`, `src/i18n/locales/en.ts:38` | Delete file and its en.ts wiring |
| DEAD-004 | Low | Unused en keys: workspace frame placeholders, link errors, examples menu | `src/i18n/editor/workspace.ts:39`, `src/i18n/editor/workspace.ts:40`, `src/i18n/editor/workspace.ts:63`, `src/i18n/editor/workspace.ts:64`, `src/i18n/editor/workspace.ts:65`, `src/i18n/editor/workspace.ts:88` | Delete keys |
| DEAD-005 | Low | Unused en keys: examplesSize, showAllShort, pasteHint | `src/i18n/editor/designs.ts:22`, `src/i18n/editor/side-panel.ts:230`, `src/i18n/editor/side-panel.ts:249` | Delete keys |
| DEAD-006 | Low | Unused en keys: canvas fullScreen, exitFullScreen, widen, keys.mod, keys.modMac | `src/i18n/canvas-strings.ts:35`, `src/i18n/canvas-strings.ts:36`, `src/i18n/canvas-strings.ts:55`, `src/i18n/canvas-strings.ts:137` | Delete keys |
| DEAD-007 | Low | Unused en keys: editorToasts incompatible/alreadyConnected/deleteDiagramFailed; `menu.actions.save` | `src/i18n/qubdi/workspace.ts:57`, `src/i18n/qubdi/workspace.ts:60`, `src/i18n/qubdi/workspace.ts:63`, `src/i18n/locales/en.ts:24` | Delete keys |
| DEAD-008 | Low | `persistence/local-data.ts` and `custom-colours.ts` imported only by tests; production-dead | `src/persistence/local-data.ts:1`, `src/persistence/custom-colours.ts:1`, `src/persistence/persistence.test.ts:9` | Delete both files and their tests |
| DEAD-009 | Low | Exports with zero references anywhere | `src/core/commands/command.ts` (CommandType), `src/core/model/key.ts` (methodsOfFamily), `src/core/model/lookup.ts` (hasEntity), `src/canvas/geometry.ts` (boxOf, enclosing), `src/platform/config/backend.ts:4` (BACKEND_URL), `src/qbase/diagram-types.ts` (DBFieldType, DBCheckConstraint, DBDependency, DBCustomType), `src/dialects/registry.ts` (writableDialects), `src/dialects/shared/export-model.ts` (joinedColumnNames) | Delete exports |
| DEAD-010 | Low | Eight selectors in `selectors.ts` have zero references | `src/store/selectors.ts` (selectDesignId, selectEntities, selectLinks, selectUi, selectSelection, selectFocus, selectSession, selectLocation) | Delete unused selectors |
| DEAD-011 | Low | Exports referenced only by tests; production-dead | `src/core/commands/plan-visual.ts` (planMove), `src/core/model/ids.ts` (looksLikeGeneratedId), `src/canvas/geometry.ts` (snapTo, overlappingIds, toggledWidth), `src/formats/image/export-options.ts` (outputSize), `src/features/filters/filter-tree.ts` (isFilterActive), `src/lib/export-import-utils.ts` (diagramToJSONOutput), `src/lib/custom-colors.ts:58` (readSavedColors), `src/lib/qubdi/diagram-summary.ts` (toDatabaseType, toDatabaseEdition), `src/lib/qubdi/project-path.ts` (findProjectBySlug), `src/lib/qubdi/local-data.ts` (adoptLegacyLocalData), `src/store/selectors.ts` (selectDirty, selectVisibleEntities), `src/qbase/diagram-types.ts` (databasesWithSchemas), `src/qbase/sql-adapters.ts` (exportDiagramSql), `src/dialects/registry.ts` (listDialects), `shared/reconcile.ts:575`, `shared/reconcile.ts:578` (isEmpty, countByKind) | Delete exports and their tests |
| DEAD-013 | Low | Script `test:watch` has no caller or doc reference | `package.json` (scripts) | Remove script or document it |
| DEAD-030 | Low | `droppedUnique` is always false and never read | `src/dialects/convert/convert-index.ts:14` | Remove field and its assignments |
| DEAD-031 | Low | `plural` helper in overview.ts has no production caller, English-only suffix | `src/lib/qubdi/overview.ts:53` | Delete it and its test |
| DEAD-014 | Low | Tailwind keyframes/animations accordion-down, accordion-up, scale, scale-2, blink never used | `tailwind.config.js:27`, `tailwind.config.js:32`, `tailwind.config.js:75`, `tailwind.config.js:83`, `tailwind.config.js:85`, `tailwind.config.js:91` | Delete keyframes, animations, pulseOnce, radixHeight |
| DEAD-015 | Low | Tailwind `subtitle` colour and `--subtitle` variable have no consumer | `tailwind.config.js:56`, `src/globals.css:29`, `src/globals.css:72` | Delete colour and both variables |
| DEAD-016 | Low | Sidebar tokens primary, primary-foreground, accent-foreground, border, ring unused by any class | `tailwind.config.js:18`, `tailwind.config.js:19`, `tailwind.config.js:21`, `tailwind.config.js:22`, `tailwind.config.js:23`, `src/globals.css:46`, `src/globals.css:47`, `src/globals.css:49`, `src/globals.css:50`, `src/globals.css:51`, `src/globals.css:85`, `src/globals.css:86`, `src/globals.css:88`, `src/globals.css:89`, `src/globals.css:90` | Delete five tokens and variables in both themes |
| DEAD-017 | Low | Tailwind `container` theme block unused; no `container` class in src | `tailwind.config.js:39` | Delete container block |
| DEAD-018 | Low | Unused re-exported UI primitives: Trigger, Close, Anchor, Group, Sub, Portal, RadioGroup, Shortcut | `src/platform/ui/alert-dialog.tsx:10`, `src/platform/ui/dialog.tsx:14`, `src/platform/ui/dialog.tsx:18`, `src/platform/ui/popover.tsx:10`, `src/platform/ui/select.tsx:10`, `src/platform/ui/dropdown-menu.tsx:8`, `src/platform/ui/dropdown-menu.tsx:9`, `src/platform/ui/dropdown-menu.tsx:10`, `src/platform/ui/dropdown-menu.tsx:11`, `src/platform/ui/dropdown-menu.tsx:151` | Delete unused primitives and export entries |
| DEAD-019 | Low | `applyTo` alias exported by test fixtures, imported by no test | `src/canvas/test/fixtures.ts:130` | Delete alias export |
| DEAD-020 | Low | `src/router.ts` re-export shim imported only by tests; app uses platform/router | `src/router.ts:2`, `src/app.tsx:9` | Point tests at platform/router; delete shim |
| DEAD-021 | Low | `lib/data/import-metadata/import` shim files imported only by one test | `src/lib/data/import-metadata/import/index.ts:1`, `src/lib/data/import-metadata/import/relationships.ts:1`, `src/formats/metadata/load.test.ts:3` | Import formats/metadata directly; delete both shims |
| DEAD-022 | Low | Unused en keys: canvas.entity openInPanel, narrow; region.colour; memo.colour; clipboard.failed | `src/i18n/canvas-strings.ts:54`, `src/i18n/canvas-strings.ts:56`, `src/i18n/canvas-strings.ts:96`, `src/i18n/canvas-strings.ts:101`, `src/i18n/canvas-strings.ts:134` | Delete keys |
| DEAD-023 | Low | `qubdi.workspace.typeLegend` block unused; type legend reads `canvas.legend` | `src/i18n/qubdi/workspace.ts:215`, `src/canvas/type-legend.tsx:65` | Delete typeLegend object |
| DEAD-024 | Low | Test-only reset hooks exported from production modules: resetCustomColorsForTests, resetPasswordMinLength, resetToasts, forgetClipboard | `src/hooks/use-custom-colors.ts:55`, `src/hooks/use-password-min-length.ts:24`, `src/platform/toast/use-toast.ts:88`, `src/canvas/clipboard.ts:23` | Move resets into test helpers |
| DEAD-025 | Low | `GET /diagrams/:id/versions` and `/versions/:version` have no client caller | `server/src/diagrams/routes.ts:532`, `server/src/diagrams/routes.ts:551` | Remove routes or document as public API |
| DEAD-026 | Low | `GET /:id/drift/reports` list has no client caller; client fetches one report | `server/src/drift/routes.ts:253`, `src/lib/qubdi/api.ts:923` | Remove route or document as public API |
| DEAD-027 | Low | `GET /lint/rules` has no client caller and no README mention | `server/src/lint/routes.ts:62` | Remove route or document it |
| DEAD-028 | Low | `postcss` devDependency redundant; `@tailwindcss/postcss` already depends on it, no import | `package.json:93`, `postcss.config.js:1` | Remove postcss devDependency |
| DEAD-029 | Low | Phase notes under `rewrite/` referenced by no file or tool | `rewrite/phase7`, `rewrite/phase8`, `rewrite/phase9`, `rewrite/review`, `rewrite/phase8-brief.md`, `rewrite/translation-brief.md`, `rewrite/decisions-phase6a.md` | Delete unreferenced notes or archive off tree |

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
| CLI-063 | `plural` helper in overview.ts has no production caller, English-only suffix | Dead code; moved to DEAD-031 |
| REPO-007 | Gitleaks config cites SEC-001 which does not exist at rev 0 | SEC-001 now exists; reference valid |
| SEC-015 | Audit row written after commit, outside the action's transaction | Duplicate of DB-009 |
| SRV-005 | MFA disable, enable and recovery renew never check the mfa lockout key | Duplicate of SEC-002 |
| DEAD-012 | `similarity.yaml` triggers only on `rewrite/clean-room`; never runs on main | Duplicate of REPO-003 |
| CLI-004 | Vitest: 4 files fail, `fake-indexeddb` declared but missing from node_modules; tsc reports 4 errors | Local install gap, not a repo defect |

---

## Database scale check

Measurements below are from an earlier pass and were not re-run in rev 1.

### Measured

| Item | Value |
|------|-------|
| Seed | users 10k · projects 500 · diagrams 20k (321 MB) · snapshots 50k (726 MB) · `audit_log` 5M (1.3 GB) |
| Autosave (pgbench, 4 clients, before the audit throttle) | 5.4 ms avg · 738 tps · 21 KB WAL per save · 98.75% HOT |
| Viewer list, 103 diagrams | 136 ms at 3 versions · 1,968 ms at 50 · 31 ms with LATERAL |
| Admin unpaged list, 20k rows | seq scan + 2.6 MB on-disk sort · 20 ms |
| Migration 0022, 321 MB | 10.8 s under ACCESS EXCLUSIVE |
| Viewer list after fix, 100 diagrams × 50 versions | 48 ms, was 2,055 ms on the same data |
| 43 MB diagram in Node | `JSON.parse` 122 ms · `JSON.stringify` 137 ms |
| Stock Postgres | `max_connections` 100 · `shared_buffers` 128MB · `work_mem` 4MB |

### Verified fine

| Area | Result | Where |
|------|--------|-------|
| Schema vs migrations | drizzle-kit empty diff; journal ordered, no gaps | `server/src/db/migrations/meta/_journal.json` |
| Boot migration lock | Session advisory lock, lock_timeout retry, 2-connection pool | `server/src/db/client.ts:111` |
| FK ON DELETE | Every FK states cascade, restrict or set null | `server/src/db/schema.ts:204` |
| Check-then-write | Unique index or lock backs each: email, project, connection, snapshot version, share cap | `server/src/diagrams/service.ts:218` |
| Autosave | Compare-and-write in one UPDATE; content not returned | `server/src/diagrams/routes.ts:388` |
| Lists | Paged, offset capped, content never selected | `server/src/diagrams/routes.ts:126` |
| Audit reads | Keyset cursor, indexed filters, name lookups by PK | `server/src/audit/activity.ts:133` |
| Audit retention | Batched 5000, indexed on `at` | `server/src/maintenance.ts:71` |
| Pool | max 10 plus 1 listener vs max_connections 200; statement and idle-in-tx timeouts | `server/src/db/client.ts:17` |
| Postgres introspection | READ ONLY transaction, SET LOCAL timeout, 64 MB byte cap, pinned address | `server/src/introspect/postgres.ts:158` |
| Read-only guard | Single SELECT/WITH, denylist after stripping literals | `server/src/introspect/readonly-guard.ts:102` |
| Postgres image and backups | Digest-pinned in compose and CI; dump and restore documented | `docker-compose.yml:15` |

---

## Changelog

| Rev | Date | Change |
|-----|------|--------|
| 2 | 2026-11-09 | 97 new, 0 fixed, 1 dropped; second full sweep |
| 1 | 2026-11-09 | 109 new, 0 fixed, 5 dropped; first full pass |
