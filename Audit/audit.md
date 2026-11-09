# QBase — Audit

**rev** 14 · **date** 2026-11-09
**method** static analysis · whole-tree read · eslint, tsc --noEmit, client vitest run (node:24-slim, scratch copy) · server vitest run vs srvaudit-pg throwaway db `qbase_test` (scratch copy) · srvaudit-pg read-only EXPLAIN and catalog · gitleaks v8.30.1 (CI pin) · npm audit · vite build to scratch · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 33 | 0 | 0 | 0 | 0 |
| Repository | 46 | 0 | 1 | 11 | 0 |
| Server | 36 | 0 | 4 | 0 | 0 |
| Database | 8 | 0 | 0 | 10 | 1 |
| Client | 40 | 0 | 2 | 54 | 0 |
| Dead code | 11 | 0 | 0 | 29 | 0 |
| **Total** | 174 | 0 | 7 | 104 | 1 |

## Act first

- `REPO-005` — CI secret scan fails on main; publish `verify` job blocked
- `SRV-001` — Auth runs in preHandler, so anonymous 50 MB bodies are read and parsed first
- `SRV-002` — Error handler logs Drizzle error whose message embeds all query params
- `SRV-021` — Quadratic regex on field type name hangs event loop; 100k chars takes 9 s
- `SRV-031` — Quadratic drift rename pairing blocks event loop 8 s at 4000 tables
- `CLI-001` — No error boundary or route `errorElement`; a render or chunk-load error blanks the app
- `CLI-101` — Import dialog hangs on metadata with more than 50 tables

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | Med | Old remote history still holds a literal SQL Server SA password | `.gitleaks.toml:4` | Delete stale remote refs and purge their objects |
| SEC-002 | Med | MFA lockout never checked before enable, disable, recovery-renew code guesses | `server/src/auth/mfa-routes.ts:188`, `server/src/auth/mfa-routes.ts:274` | Call `locked()` on the `mfa:` key before checking codes |
| SEC-003 | Med | Introspection connections default to plaintext (`ssl` false) | `server/src/introspect/routes.ts:46`, `server/src/introspect/postgres.ts:354`, `server/src/introspect/sqlserver.ts:469` | Default `ssl` to true; require explicit opt-out |
| SEC-004 | Med | Cookie `Secure` stays off behind TLS proxy unless TRUST_PROXY is set | `server/src/config.ts:222`, `server/src/auth/routes.ts:82`, `docker-compose.yml:74` | Warn at start when COOKIE_SECURE=auto without TRUST_PROXY |
| SEC-005 | Med | No rate limit on authenticated routes (50 MB saves, share, admin) | `server/src/app.ts:120` | Add global per-user rate limit with route overrides |
| SEC-006 | Low | Fastify sets no requestTimeout or connectionTimeout (slow-body hold) | `server/src/app.ts:84` | Set requestTimeout and connectionTimeout in Fastify options |
| SEC-007 | Low | Disabled account answers 403 after correct password, confirming it | `server/src/auth/routes.ts:229` | Return generic 401 for disabled accounts |
| SEC-008 | Low | Lockout key includes address; spread guesses on one account unthrottled | `server/src/auth/routes.ts:199` | Add per-account failure counter across addresses |
| SEC-009 | Low | MFA lockout key has no address; password holder locks victim's second step | `server/src/auth/mfa-routes.ts:98` | Key second-step lockout by account and address |
| SEC-010 | Low | Unkeyed sha256 recovery-code hashes still accepted | `server/src/auth/mfa.ts:167`, `server/src/auth/totp.ts:172` | Migrate legacy hashes, then drop legacy lookup |
| SEC-011 | Low | Encryption keys accept any 16 characters; scrypt salt is fixed | `server/src/config.ts:128`, `server/src/introspect/crypto-box.ts:11` | Require 32+ chars; add per-value random salt |
| SEC-012 | Low | Legacy shared-key fallback lets any purpose box open unpurposed ciphertext | `server/src/introspect/crypto-box.ts:81` | Re-seal legacy values, then remove fallback |
| SEC-013 | Low | Read-only guard is a denylist missing `pg_read_binary_file`, `sp_executesql`, `xp_dirtree` | `server/src/introspect/readonly-guard.ts:15` | Allowlist query ids instead of keyword denylist |
| SEC-014 | Low | SQL Server session not read-only; `readOnlyIntent` is only a routing hint | `server/src/introspect/sqlserver.ts:473` | Document least-privilege login; refuse `db_owner` logins |
| SEC-016 | Low | `user.create` audit omits whether the new account was made admin | `server/src/admin/routes.ts:344` | Add `isAdmin` to `user.create` audit meta |
| SEC-017 | Low | Lockouts and MFA secret setup leave no audit row | `server/src/auth/routes.ts:71`, `server/src/auth/mfa-routes.ts:153`, `server/src/audit/audit.ts:18` | Add `auth.locked` and `mfa.setup` audit actions |
| SEC-018 | Low | Admin can reset another admin's password and MFA with no step-up | `server/src/admin/routes.ts:368`, `server/src/admin/routes.ts:593` | Require admin password and code for reset actions |
| SEC-019 | Low | First-run register open to any caller who reaches an empty server | `server/src/auth/routes.ts:130`, `server/src/auth/routes.ts:142` | Require a setup token printed in server log |
| SEC-020 | Low | Viewers can list every project member's email | `server/src/members/routes.ts:23`, `server/src/diagrams/routes.ts:140`, `server/src/diagrams/routes.ts:544` | Return member emails to writers only |
| SEC-021 | Low | INTROSPECT_ALLOW_HOSTS accepts `0.0.0.0/0` and junk entries unchecked | `server/src/config.ts:241`, `server/src/introspect/net-guard.ts:136` | Validate entries; reject `/0` to `/7` ranges |
| SEC-022 | Low | Editor CSP allows inline styles (`style-src 'unsafe-inline'`) | `server/src/web.ts:16` | Move inline styles to nonce or hashed styles |
| SEC-023 | Low | App container lacks `no-new-privileges`, `cap_drop`, `read_only` | `docker-compose.yml:50` | Add `security_opt`, `cap_drop: [ALL]`, `read_only: true` |
| SEC-024 | Low | Compose default image tag `latest`, unpinned | `docker-compose.yml:54` | Require QBASE_VERSION; drop the `latest` default |
| SEC-025 | Low | `.gitignore` lacks key and certificate patterns (`*.pem`, `*.key`) | `.gitignore:70` | Ignore `*.pem`, `*.key`, `*.p12`, `*.pfx` |
| SEC-026 | Low | Load stack hard-codes DB password, encryption key and admin password | `server/load/docker-compose.yml:65`, `server/load/docker-compose.yml:66`, `server/load/seed.mjs:10` | Generate load-test secrets per run |
| SEC-027 | Med | Lint rate limit keyed by raw cookie at onRequest; rotating junk cookies bypasses it | `server/src/lib/rate-key.ts:14`, `server/src/lint/routes.ts:53` | Count in preHandler after session lookup, like sharedUserLimit |
| SEC-028 | Low | No Strict-Transport-Security header on API or editor responses | `server/src/web.ts:14`, `server/src/lib/security-headers.ts:6` | Send HSTS when cookies are secure or request is https |
| SEC-029 | Low | CORS_ORIGIN unvalidated; `*` or trailing slash silently breaks credentialed requests | `server/src/config.ts:210` | Require exact origin; reject `*` and paths at startup |
| SEC-030 | Low | Session cookie lacks `__Host-` prefix | `server/src/auth/routes.ts:97`, `server/src/auth/sessions.ts:7` | Rename to `__Host-` cookie when secure |
| SEC-031 | Low | Driver error text and address class returned; refused, timeout, private-host answers map networks | `server/src/introspect/routes.ts:224`, `server/src/introspect/routes.ts:231`, `server/src/introspect/net-guard.ts:192` | Return fixed error codes; log driver text server-side only |
| SEC-032 | Low | Webhooks reuse INTROSPECT_ALLOW_HOSTS; a database allow-list also permits internal HTTP POSTs | `server/src/drift/service.ts:359`, `server/src/drift/webhook.ts:85` | Add a separate WEBHOOK_ALLOW_HOSTS list for webhooks |
| SEC-033 | Low | Webhook accepts plain `http:`; token-bearing URL and drift details sent unencrypted | `server/src/drift/webhook.ts:60` | Require https unless host is allow-listed |
| SEC-034 | Low | API responses lack `Cache-Control: no-store`; GET share-links returns live tokens | `server/src/lib/security-headers.ts:6`, `server/src/share/routes.ts:141` | Add `cache-control: no-store` to API_SECURITY_HEADERS |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-001 | Med | `bootstrap-sha` commit is not an ancestor of main | `release-please-config.json:4` | Set bootstrap-sha to a commit in main |
| REPO-002 | Med | `latest` tag moves on every `v*` tag, including prereleases | `.github/workflows/publish.yaml:134`, `run.sh:84` | Tag latest only for non-prerelease versions |
| REPO-003 | Med | Similarity check runs only on `rewrite/clean-room`, never on main | `.github/workflows/similarity.yaml:11`, `.github/workflows/similarity.yaml:13` | Add main to similarity triggers |
| REPO-004 | Med | Publish workflow ships images while TODO says do not publish | `TODO.md:7`, `rewrite/TODO.md:11`, `.github/workflows/publish.yaml:5` | Reconcile TODO with publish; gate publish on rewrite status |
| REPO-005 | High | CI gitleaks v8.30.1 fails on main: share-token test key fingerprints not ignored | `.gitleaksignore:3`, `server/test/share-token-copy.test.ts:25`, `.github/workflows/ci.yaml:118`, `.github/workflows/publish.yaml:87` | Regenerate ignore fingerprints from main history; rerun scan |
| REPO-006 | Med | npm version updates paused; both npm entries have limit 0 | `.github/dependabot.yml:11`, `.github/dependabot.yml:25` | Restore limit to 5 or document accepted pause |
| REPO-013 | Low | Playwright npm package installed at run time without a lockfile | `tools/e2e/run-smoke.sh:18` | Install Playwright from a committed lockfile |
| REPO-015 | Low | 1.1 MB `audit-ui-differences.html` tracked, not an owned audit file | `Audit/audit-ui-differences.html:1` | Untrack or move out of Audit/ |
| REPO-020 | Low | Workflows set no `timeout-minutes` or `concurrency` | `.github/workflows/ci.yaml:14`, `.github/workflows/publish.yaml:17` | Add timeout-minutes and concurrency groups |
| REPO-021 | Low | Publish does not check tag matches package.json version | `.github/workflows/publish.yaml:5` | Add step comparing tag to package.json |
| REPO-022 | Low | CODEOWNERS lists a personal email, no team; single point of review | `.github/CODEOWNERS:5` | Use a verified `@org/team` owner |
| REPO-023 | Low | `.gitignore` carries unused Next, Nuxt, Gatsby, vuepress, Firebase entries | `.gitignore:77`, `.gitignore:81`, `.gitignore:86`, `.gitignore:119` | Trim to ecosystems this repo uses |
| REPO-024 | Low | `.prettierrc.json` closing brace indented 2 spaces; `.editorconfig` says 4 | `.prettierrc.json:7`, `.editorconfig:9` | Reindent closing brace to match editorconfig |
| REPO-025 | Low | e2e tools in `tools/e2e` run in no workflow and appear in no doc | `tools/e2e/run-smoke.sh:1`, `README.md:316` | Document e2e scripts or add CI job |
| REPO-026 | Low | Husky pre-commit skips server lint silently when server deps absent | `.husky/pre-commit:4` | Fail, or run server lint in CI only |
| REPO-027 | Med | Load run.sh never fails on a k6 threshold; README says it gates CI | `server/load/run.sh:58`, `server/load/run.sh:69`, `server/load/README.md:18` | Return k6run status from run_one |
| REPO-028 | Med | README feature line says only a share-token hash is stored; code also encrypts token | `README.md:21`, `server/src/share/routes.ts:167` | Reword feature line to hash plus encrypted token |
| REPO-029 | Low | Postgres digest check passes when one file has no pin at all | `.github/scripts/check-postgres-digest.sh:9` | Fail when any listed file lacks a pin |
| REPO-030 | Low | Missing `--rewritten` or `--allow` file or path is silently ignored | `tools/similarity.mjs:273`, `tools/similarity.mjs:385` | Error on missing list file or listed path |
| REPO-031 | Low | Empty upstream index still reports "No checked file is over the limits" | `tools/similarity.mjs:344` | Exit 1 when upstream index has zero runs |
| REPO-032 | Low | Non-numeric `--threshold`, `--max-run`, `--run` become NaN and checks pass | `tools/similarity.mjs:117`, `tools/spec-check.mjs:94` | Reject NaN option values |
| REPO-033 | Low | owner-decisions links `spec/...` resolve to rewrite/spec/spec/ and break | `rewrite/spec/owner-decisions.md:105` | Drop the `spec/` prefix from the four links |
| REPO-034 | Low | TODO says EDT-250 is open; parity checklist ticks it, browser-driven | `rewrite/TODO.md:70`, `rewrite/TODO.md:84`, `rewrite/parity-checklist.md:389` | Update TODO counts to 684 ticked, 3 partial |
| REPO-035 | Low | TODO says seven languages ship; only en, de, fr, it, ru exist | `rewrite/TODO.md:64` | Correct language list or add ka and zh |
| REPO-036 | Low | Rewrite docs cite audit IDs REPO-005, REPO-069, REPO-045 that now mean other things | `rewrite/TODO.md:80`, `rewrite/TODO.md:85`, `rewrite/PLAN.md:300` | Drop audit IDs from rewrite docs |
| REPO-037 | Low | TODO forbids changing licence while Elastic-2.0 is already applied | `rewrite/TODO.md:11`, `rewrite/TODO.md:78` | Reword line 7 to match applied licence |
| REPO-038 | Low | NOTICE and allow-list name separator.tsx, which no longer exists | `NOTICE:36`, `rewrite/similarity-allow.txt:34` | Remove separator from both lists |
| REPO-039 | Low | PLAN says branch does not build; TODO says build, lint, tests pass | `rewrite/PLAN.md:74`, `rewrite/PLAN.md:143` | Mark build-state notes as history |
| REPO-041 | Low | e2e visual scripts hard-code `/home/qubdi/ui-reference` output path | `tools/e2e/visual/run.mjs:24`, `tools/e2e/visual/run-new.sh:10`, `tools/e2e/visual/run-run.sh:11` | Default to a temp or `$HOME` path |
| REPO-042 | Low | Committed briefs and specs embed an absolute personal home path | `rewrite/phase8-brief.md:3`, `rewrite/translation-brief.md:3`, `rewrite/spec/visual-shell.md:10`, `rewrite/spec/visual-canvas.md:8`, `rewrite/provenance-audit/README.md:145`, `rewrite/provenance-audit/scan-transcripts.py:3` | Use repo-relative wording |
| REPO-043 | Low | run-new.sh waits a fixed 4 s for vite preview instead of polling | `tools/e2e/visual/run-new.sh:17` | Poll BASE_URL until it answers |
| REPO-044 | Low | `.dockerignore` omits rewrite/, tools/, server/load; 1.7 MB enters build context | `.dockerignore:26`, `Dockerfile:15` | Ignore rewrite/, tools/ and server/load/ |
| REPO-045 | Low | licences.mjs treats any parenthesised licence expression as permissive | `tools/licences.mjs:46` | Match explicit SPDX ids inside parentheses |
| REPO-046 | Low | package.json lacks repository, bugs and homepage fields | `package.json:2` | Add repository, bugs and homepage |
| REPO-048 | Low | `server/load` scripts ignored by both eslint configs; never linted | `server/eslint.config.mjs:5`, `eslint.config.mjs:60` | Lint load/ in the server eslint config |
| REPO-049 | Low | Eslint comment cites TODO.md for React Compiler migration; TODO.md lists none | `eslint.config.mjs:51`, `TODO.md:5` | Add migration item to TODO.md or drop reference |
| REPO-050 | Low | Dockerfile says .dockerignore drops tests; 74 co-located `*.test.ts(x)` still copied | `Dockerfile:20`, `.dockerignore:27` | Add `**/*.test.ts` and `**/*.test.tsx` to .dockerignore |
| REPO-051 | Low | Licence inventory marks runtime dep `@fastify/static` NOT INSTALLED, unreviewed | `rewrite/inventory/third-party-licences.csv:80` | Rerun tools/licences.mjs with server deps installed |
| REPO-052 | Low | NOTICE limits ChartDB content to allow-list; 22 copied logo PNGs not listed | `NOTICE:12`, `NOTICE:72`, `rewrite/similarity-allow.txt:1` | List copied logos in allow-list and NOTICE acknowledgement |
| REPO-053 | Low | Docs say other test DB credentials fail; TEST_PG_USER and TEST_PG_PASSWORD override them | `CONTRIBUTING.md:52`, `README.md:320`, `server/test/helpers.ts:11` | Document TEST_PG_USER and TEST_PG_PASSWORD |
| REPO-054 | Low | Load compose always passes VUS=50, DURATION=2m; script defaults and README disagree | `server/load/docker-compose.yml:114`, `server/load/docker-compose.yml:115`, `server/load/share-read.js:7`, `server/load/README.md:70` | Align compose, script and README defaults |
| REPO-055 | Low | Load README cites README section "Run one server process"; no such section | `server/load/README.md:63` | Point at README "Notes" and "Scaling" |
| REPO-056 | Low | index.html says container writes config.js at start; server answers it per request | `index.html:13`, `server/src/web.ts:39` | Reword comment: server serves /config.js |
| REPO-057 | Low | run-server-flows reuses any existing `qbtest-app` image, testing stale code | `tools/e2e/run-server-flows.sh:40` | Rebuild the image on every run |
| REPO-058 | Low | `.env.example` says remove db service from compose; README uses `--no-deps app` | `.env.example:42`, `README.md:150` | Point .env.example at README Option B |
| REPO-059 | Low | README claims PostgreSQL 16+ support; CI tests only PostgreSQL 18 | `README.md:109`, `.github/workflows/ci.yaml:51` | Add a PostgreSQL 16 leg to the server CI job |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-001 | High | Auth runs in preHandler, so anonymous 50 MB bodies are read and parsed first | `server/src/diagrams/routes.ts:115`, `server/src/diagrams/routes.ts:252`, `server/src/diagrams/routes.ts:341`, `server/src/config.ts:219` | Check session cookie in onRequest before body parsing |
| SRV-002 | High | Error handler logs Drizzle error whose message embeds all query params | `server/src/app.ts:188` | Log err.cause and query name only, never params |
| SRV-003 | Med | Audit insert after committed write throws, returning 500 for a done action | `server/src/audit/audit.ts:152`, `server/src/diagrams/routes.ts:428`, `server/src/auth/routes.ts:244`, `server/src/share/routes.ts:187` | Write audit in same transaction or swallow and log |
| SRV-004 | Med | Link revoke/update emits live-viewer event after audit; audit failure leaves viewers connected | `server/src/share/routes.ts:277`, `server/src/share/routes.ts:289`, `server/src/share/routes.ts:248`, `server/src/share/routes.ts:254`, `server/src/admin/routes.ts:711`, `server/src/admin/routes.ts:722` | Emit link event before audit, or in finally |
| SRV-006 | Med | LISTEN connection has no TCP keepalive; a silently dropped link is never noticed | `server/src/events.ts:108` | Set keepAlive true on the pg.Client |
| SRV-007 | Med | No rate limit on publish; each call stores a snapshot up to 50 MB | `server/src/diagrams/routes.ts:509` | Add perUserLimit to /:id/publish |
| SRV-008 | Med | Limiters, lockout, viewer caps and drift-running guard are per process, not per cluster | `server/src/lib/rate-key.ts:53`, `server/src/lib/failure-throttle.ts:15`, `server/src/share/routes.ts:346`, `server/src/share/routes.ts:348`, `server/src/drift/service.ts:74` | Move counters and running guard to Postgres or advisory locks |
| SRV-009 | Med | Default 50 MB diagram body parsed by zod and hashed synchronously on event loop | `server/src/config.ts:219`, `server/src/diagrams/routes.ts:281`, `server/src/diagrams/routes.ts:384` | Lower default limit or hash in worker thread |
| SRV-010 | Low | Share link PATCH answers too_many_links when link vanished instead of 404 | `server/src/share/routes.ts:245` | Return 404 when update returns no row |
| SRV-011 | Low | No unhandledRejection or uncaughtException handler; crash skips graceful shutdown | `server/src/server.ts:77`, `server/src/server.ts:78` | Add handlers that log and call shutdown |
| SRV-012 | Low | /health answers ok without touching the database | `server/src/app.ts:116` | Run select 1 in /health with short timeout |
| SRV-013 | Low | Unpaged lists: members, one project's diagrams, admin members, saved connections | `server/src/members/routes.ts:29`, `server/src/diagrams/routes.ts:231`, `server/src/admin/routes.ts:891`, `server/src/introspect/routes.ts:303` | Add limit to each list |
| SRV-014 | Low | Save-audit throttle is check-then-insert; concurrent saves write duplicate rows | `server/src/audit/audit.ts:167`, `server/src/audit/audit.ts:184` | Insert conditionally in one statement |
| SRV-015 | Low | MFA enable replaces codes and sets enabled_at in separate statements | `server/src/auth/mfa.ts:177`, `server/src/auth/mfa.ts:178` | Wrap both writes in one transaction |
| SRV-016 | Low | Drift webhook sent before report insert; insert failure resends next check | `server/src/drift/service.ts:343`, `server/src/drift/service.ts:375` | Insert report first, then send webhook |
| SRV-017 | Low | Introspection connection errors and UnsafeSqlError are replied without being logged | `server/src/introspect/routes.ts:226`, `server/src/introspect/routes.ts:229` | Call req.log.error before replying |
| SRV-018 | Low | Drift dismiss writes audit row even when nothing was dismissed | `server/src/drift/routes.ts:290`, `server/src/drift/routes.ts:296` | Audit only when an update changed a row |
| SRV-019 | Low | Publishes during a LISTEN outage are never replayed to live viewers | `server/src/events.ts:33`, `server/src/events.ts:97` | Send current version in each heartbeat ping |
| SRV-020 | Low | No test references reseal.ts, snapshot-cache.ts or server.ts | `server/src/drift/reseal.ts:13`, `server/src/share/snapshot-cache.ts:15`, `server/src/server.ts:1` | Add unit tests for reseal and snapshot cache |
| SRV-021 | High | Quadratic regex on field type name hangs event loop; 100k chars takes 9 s | `shared/schema-desc.ts:95`, `shared/schema-desc.ts:315` | Strip trailing `[]` with a loop, not `(\[\])+$` |
| SRV-022 | Low | Same quadratic `(\[\])+$` on type text returned by remote database | `server/src/introspect/typmod.ts:74` | Strip trailing `[]` with a loop |
| SRV-023 | Med | SSE_HEARTBEAT_SECONDS above 2147483 overflows setInterval to 1 ms ticks | `server/src/config.ts:233`, `server/src/share/routes.ts:511` | Cap SSE_HEARTBEAT_SECONDS at 3600 in `int()` |
| SRV-024 | Low | SESSION_DAYS has no maximum; large value makes expiry Invalid Date, sign-in 500s | `server/src/config.ts:212`, `server/src/auth/sessions.ts:41` | Pass a max, such as 3650, to `int()` |
| SRV-025 | Med | pg.Client for introspection has no error listener; dropped target connection can crash process | `server/src/introspect/postgres.ts:366` | Add `client.on('error', ...)` that ignores or logs |
| SRV-026 | Med | mssql ConnectionPool for introspection has no error listener | `server/src/introspect/sqlserver.ts:458` | Add `pool.on('error', ...)` handler |
| SRV-027 | Low | Lint-config GET and PUT have no rate limit unlike /lint | `server/src/lint/routes.ts:140`, `server/src/lint/routes.ts:152` | Add `...limit` to both routes |
| SRV-028 | Low | SSE writes ignore backpressure; a slow viewer buffers events without bound | `server/src/share/routes.ts:480`, `server/src/share/routes.ts:530` | Close stream when `raw.write` returns false and buffer grows |
| SRV-029 | Low | Session end deletes sessions and locks in separate statements, not one transaction | `server/src/auth/sessions.ts:115`, `server/src/auth/sessions.ts:121` | Wrap delete and lock release in db.transaction |
| SRV-030 | Low | SQL Server tests silently skip when container is absent, so CI never runs them | `server/test/introspect-sqlserver.test.ts:20` | Fail in CI when MSSQL is unreachable |
| SRV-031 | High | Drift rename pairing is quadratic; 4000 vs 4000 tables blocks event loop 8 s | `shared/reconcile.ts:432`, `shared/reconcile.ts:433`, `shared/reconcile.ts:187`, `server/src/drift/service.ts:296` | Bucket rename candidates by column signature; cap pair count |
| SRV-032 | Low | Deeply nested content (10 KB, depth 5000) overflows recursive stableStringify; answers 500 | `server/src/lib/hash.ts:9`, `server/src/diagrams/routes.ts:281` | Cap content nesting depth in zod; map RangeError to 400 |
| SRV-033 | Low | Forged activity cursor with Feb 31 passes Date.parse, Postgres cast fails, 500 | `server/src/audit/activity.ts:40`, `server/src/audit/activity.ts:146` | Round-trip check: `new Date(at).toISOString()` must match input |
| SRV-034 | Low | mfa-reset CLI never loads server/.env; README source-checkout command fails | `server/src/cli/mfa-reset.ts:54`, `server/src/server.ts:11`, `README.md:292` | Call process.loadEnvFile() before loadConfig in the CLI |
| SRV-035 | Low | Lint CLI crashes with TypeError (exit 1) on nameless field or non-array tables | `server/src/cli/lint.ts:113`, `server/src/cli/lint.ts:144` | Validate shape fully; wrap lint call, exit 2 on error |
| SRV-036 | Low | Shutdown awaits running maintenance before closing app; long prune hits forced exit | `server/src/shutdown.ts:38`, `server/src/shutdown.ts:39` | Close app first, or stop maintenance in parallel |
| SRV-037 | Low | `forceCloseConnections: true` destroys in-flight requests on shutdown, not only SSE | `server/src/app.ts:86` | Use `'idle'` and end SSE streams in an onClose hook |

### Database

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DB-001 | Med | Snapshot and drift prune deletes are unbatched; a big backlog hits the 120s timeout | `server/src/maintenance.ts:100`, `server/src/maintenance.ts:116`, `server/src/server.ts:38` | Batch both deletes like purgeAuditLog |
| DB-002 | Med | Viewer list reads each snapshot's full jsonb for five stats; snapshots lack stored stat columns | `server/src/diagrams/service.ts:58`, `server/src/diagrams/summary.ts:51` | Add generated stat columns to snapshots, as diagrams have |
| DB-003 | Med | Size checks serialise whole jsonb with `octet_length(content::text)`; 50 MB costs about 0.8 s | `server/src/lint/routes.ts:95`, `server/src/lint/routes.ts:116`, `server/src/drift/service.ts:236` | Use pg_column_size or a stored size column |
| DB-004 | Med | SQL Server introspection drops columnstore, XML and spatial indexes; import maps them | `server/src/introspect/sqlserver.ts:105`, `src/formats/metadata/load.ts:41` | Drop key_ordinal filter for non-key index types |
| DB-006 | Low | SQL Server returns no custom types; PostgreSQL returns enums and composites | `server/src/introspect/sqlserver.ts:380` | Read alias types from sys.types where is_user_defined |
| DB-007 | Low | Five FKs lack an index; diagram_locks.user_id is scanned on every sign-in and sign-out | `server/src/db/schema.ts:273`, `server/src/db/schema.ts:169`, `server/src/db/schema.ts:373`, `server/src/db/schema.ts:401`, `server/src/db/schema.ts:446`, `server/src/auth/sessions.ts:50` | Index diagram_locks.user_id; index the rest if tables grow |
| DB-012 | Low | Generated stat columns re-parse whole jsonb on every content autosave | `server/src/db/migrations/0022_diagram_stats.sql:2` | Compute stats in app; store as plain columns |
| DB-019 | Low | SQL Server returns collation on every text column; Postgres only non-default ones | `server/src/introspect/sqlserver.ts:53`, `server/src/introspect/postgres.ts:69` | Return collation only when it differs from database default |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-001 | High | No error boundary or route `errorElement`; a render or chunk-load error blanks the app | `src/app.tsx:17`, `src/platform/router/router.tsx:18` | Add root error boundary and route errorElement with reload |
| CLI-002 | Med | Startup `api.me()` failure of any kind (timeout, 5xx) shows user as signed out | `src/context/qubdi-context/qubdi-provider.tsx:69` | Only clear user on 401; keep state and retry otherwise |
| CLI-003 | Med | "Overwrite" conflict action swallows fetch errors; click does nothing visibly | `src/components/qubdi/server-autosave.tsx:105` | Surface failure through setSaveStatus error state |
| CLI-005 | Med | Final-save keepalive silently dropped above 60 KB; larger diagrams rely on beforeunload prompt only | `src/lib/qubdi/api.ts:455` | Use sendBeacon or chunked fallback for large final saves |
| CLI-006 | Med | API responses cast `as T`, never validated at runtime | `src/lib/qubdi/api.ts:476` | Parse responses with zod schemas per endpoint |
| CLI-007 | Med | Four React Compiler hook rules disabled repo-wide; refs written during render | `eslint.config.mjs:52`, `src/components/qubdi/server-autosave.tsx:49` | Migrate components; re-enable rules |
| CLI-008 | Low | Native `window.confirm` on sign-out with unsaved changes; not a styled dialog | `src/context/qubdi-context/qubdi-provider.tsx:120` | Replace with AlertDialog |
| CLI-012 | Low | Diagnostics matched by English message text, not code | `src/features/export/export-sql-dialog.tsx:85`, `src/features/import/import-box.tsx:299` | Add `code` field to diagnostics; compare codes |
| CLI-013 | Low | Server `detail` text shown raw, bypasses i18n | `src/lib/qubdi/api.ts:948`, `src/lib/qubdi/api.ts:953` | Map server codes to translated strings only |
| CLI-015 | Low | Favicon is empty `data:,`; no app icon in tabs | `index.html:8` | Link real favicon from public/ |
| CLI-018 | Low | No tests import `ProjectCreateDialog`, `NewProjectDialog`, `ProjectSettings` | `src/components/qubdi/project-create-dialog.tsx:1` | Add unit tests for the three dialogs |
| CLI-019 | Low | Eslint-disable `exhaustive-deps` count 13 in src; two files carry `no-explicit-any` file-wide | `src/canvas/diagram-canvas.tsx:330`, `src/core/wire/wire.test.ts:1` | Narrow suppressions; type fixtures |
| CLI-020 | Med | Type-declaration regex backtracks cubically; 200 spaces take 1.5 s, 800 take 32 s | `src/core/model/type-declaration.ts:31` | Rewrite regex without overlapping space classes; cap input length |
| CLI-021 | Med | CRLF DBML skips array and check preparation because `.` stops at `\r` | `src/formats/dbml/prepare.ts:67` | Split on `/\r?\n/` |
| CLI-022 | Med | DBML array and check keys use table name only; same-named tables in two schemas collide | `src/formats/dbml/import-dbml.ts:177`, `src/formats/dbml/prepare.ts:79` | Key by schema plus table plus field |
| CLI-023 | Med | Any `name(...)` default passes as function call; `;` and extra statements emitted verbatim | `src/dialects/shared/defaults.ts:27` | Reject top-level `;` and unbalanced parentheses |
| CLI-024 | Med | CHECK, generated and WHERE expressions written raw into DDL, no statement-break guard | `src/dialects/postgresql/write.ts:262`, `src/dialects/mysql/write.ts:196`, `src/dialects/sql-server/write.ts:180`, `src/dialects/sqlite/write.ts:210`, `src/dialects/oracle/write.ts:117` | Run `checkExpression` before writing; refuse unbalanced text |
| CLI-025 | Med | Index conversion keeps fulltext, spatial, gin without checking column types; DDL fails | `src/dialects/convert/convert-index.ts:84`, `src/dialects/convert/convert-index.ts:96` | Call `methodProblem` with column kinds before keeping type |
| CLI-026 | Med | Removed-diagram guard lives in one tab; another tab's autosave rewrites the deleted diagram | `src/persistence/dexie-adapter.ts:84` | Check store row or broadcast removals across tabs |
| CLI-027 | Low | `save` clears removed flag, so an in-flight autosave resurrects a just-deleted diagram | `src/persistence/dexie-adapter.ts:69` | Keep flag; clear it only on explicit create |
| CLI-028 | Med | Layout probe loop scans placed boxes per step; 2000-link hub import takes 7.5 s | `src/formats/shared/layout.ts:89` | Use spatial grid or per-column cursor for hub neighbours |
| CLI-039 | Low | Metadata import names primary key after any unique index on same columns | `src/formats/metadata/load.ts:177` | Use primary flag from metadata, not column match |
| CLI-045 | Low | Every edit serialises the whole design before section reuse check | `src/qbase/diagram-convert.ts:83` | Serialise only changed sections |
| CLI-050 | Med | Sign-in email and password inputs have placeholder only, no label | `src/components/qubdi/auth-dialog.tsx:210`, `src/components/qubdi/auth-dialog.tsx:219` | Add aria-label matching the placeholder |
| CLI-052 | Med | Viewer primary-key icon has no accessible name; meaning is icon-only | `src/pages/share-viewer-page/viewer-table-node.tsx:118` | Add aria-label or visually hidden text |
| CLI-054 | Low | Viewer header brand name is hard-coded English | `src/pages/share-viewer-page/share-viewer-page.tsx:280` | Use a translated string or shared logo |
| CLI-057 | Med | Dates use browser default locale, not the chosen language, despite `localeTag` | `src/lib/qubdi/when.ts:23`, `src/lib/qubdi/diagram-summary.ts:23`, `src/components/qubdi/drift-dialog.tsx:359`, `src/components/qubdi/resync-dialog.tsx:195`, `src/pages/admin-page/activity-panel.tsx:326`, `src/pages/admin-page/overview-panel.tsx:257` | Pass localeTag(i18n.language) to formatters |
| CLI-065 | Low | Test waits a fixed 50 ms for a save that must not happen | `src/qbase/p8-qbs-contract.test.tsx:189` | Use fake timers past the autosave delay |
| CLI-066 | Med | Turning on 2FA in editor refreshes user, remounts gate; one-time recovery codes vanish | `src/components/qubdi/two-factor-dialog.tsx:142`, `src/context/qubdi-context/qubdi-provider.tsx:151`, `src/components/qubdi/diagram-access.tsx:190`, `src/components/qubdi/diagram-access.tsx:220` | Key gate effects on `user?.id`, not the user object |
| CLI-067 | Med | Publish badge refetches full diagram content after every autosave | `src/components/qubdi/publish-control.tsx:70`, `src/components/qubdi/publish-control.tsx:89` | Return publish status from summary or save reply |
| CLI-068 | Med | Editor chunk 2.87 MB (561 kB gzip) bundles full all-dialect node-sql-parser | `src/formats/metadata/view-sources.ts:1`, `vite.config.ts:16` | Import per-dialect parser build lazily inside metadata import |
| CLI-069 | Low | DBML chunk 15.6 MB (2.75 MB gzip) fetched on first DBML view | `src/formats/dbml/import-dbml.ts:1`, `vite.config.ts:16` | Split @dbml/core parser; load exporter without importer |
| CLI-071 | Low | No `supportedLngs`; unsupported browser language sets `<html lang>` over English text | `src/i18n/i18n.ts:50`, `src/i18n/i18n.ts:70` | Set supportedLngs and nonExplicitSupportedLngs in init |
| CLI-081 | Med | DBML enum with capitalised name not linked; field lower-cased into unknown type | `src/formats/dbml/import-dbml.ts:192`, `src/formats/shared/design-builder.ts:194` | Match user types case-insensitively before lower-casing type name |
| CLI-082 | Med | Default text containing identity, autoincrement or nextval treated as numbering; value dropped | `src/dialects/convert/convert-default.ts:37`, `src/dialects/shared/defaults.ts:53`, `src/dialects/sql-server/write.ts:96` | Test markers on unquoted text only, anchored |
| CLI-085 | Med | PostgreSQL default containing `nextval` written raw; sequence name raw in CREATE SEQUENCE | `src/dialects/postgresql/write.ts:51`, `src/dialects/postgresql/write.ts:394` | Anchor nextval form; quote sequence name as identifier |
| CLI-086 | Med | Column type name written raw into DDL by every writer | `src/dialects/postgresql/write.ts:92`, `src/dialects/mysql/write.ts:84`, `src/dialects/sql-server/write.ts:61`, `src/dialects/oracle/write.ts:38`, `src/dialects/sqlite/write.ts:87` | Refuse type text outside word, space, parentheses, digits, comma |
| CLI-087 | Low | MySQL writer keeps quoted defaults verbatim; a backslash escapes the closing quote | `src/dialects/mysql/write.ts:108` | Re-quote string defaults with MySQL `asStringLiteral` |
| CLI-093 | Low | Column collation imported and saved but no SQL writer emits it | `src/formats/metadata/load.ts:141`, `src/dialects/postgresql/write.ts:151` | Write COLLATE in same-dialect export; note it in conversion |
| CLI-101 | High | Metadata over 50 tables: new default Set each render loops onChange forever; dialog hangs | `src/features/import/import-box.tsx:209`, `src/features/import/import-box.tsx:225`, `src/dialogs/import-database-dialog/import-database-dialog.tsx:45` | Memoise defaultSelection(rows) with useMemo on rows |

### Dead code

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DEAD-001 | Med | `VITE_HOST_URL`, `VITE_APP_URL` baked at build, no reader; README claims they work | `.env.example:87`, `.env.example:91`, `Dockerfile:10`, `Dockerfile:11`, `Dockerfile:18`, `docker-compose.build.yml:18`, `docker-compose.build.yml:19`, `run.sh:92`, `run.sh:93`, `src/vite-env.d.ts:5`, `src/vite-env.d.ts:6`, `README.md:224` | Remove both variables and README sentence |
| DEAD-002 | Med | `qubdi.viewerPage.pageTitle` missing from en; title shows raw key, test asserts same key | `src/pages/share-viewer-page/share-viewer-page.tsx:343`, `src/i18n/qubdi/workspace.ts:181`, `src/helmet/__tests__/p8-shl-title.test.tsx:97` | Use `qubdi.workspace.viewerPage.pageTitle` in the page |
| DEAD-007 | Low | Unused en key `menu.actions.save`; read only by i18n tests | `src/i18n/qubdi/workspace.ts:57`, `src/i18n/qubdi/workspace.ts:60`, `src/i18n/qubdi/workspace.ts:63`, `src/i18n/locales/en.ts:24` | Delete keys |
| DEAD-011 | Low | Exports referenced only by tests; production-dead | `src/core/commands/plan-visual.ts:120` (planMove), `src/core/model/ids.ts:49` (looksLikeGeneratedId), `src/canvas/geometry.ts:13` (snapTo), `src/canvas/geometry.ts:49` (overlappingIds), `src/canvas/geometry.ts:88` (toggledWidth), `src/formats/image/export-options.ts:112` (outputSize), `src/features/filters/filter-tree.ts:47` (isFilterActive), `src/lib/export-import-utils.ts:10` (diagramToJSONOutput), `src/lib/custom-colors.ts:58` (readSavedColors), `src/lib/qubdi/diagram-summary.ts:5` (toDatabaseType), `src/lib/qubdi/diagram-summary.ts:12` (toDatabaseEdition), `src/lib/qubdi/project-path.ts:19` (findProjectBySlug), `src/lib/qubdi/local-data.ts:59` (adoptLegacyLocalData), `src/store/selectors.ts:14` (selectDirty), `src/store/selectors.ts:36` (selectVisibleEntities), `src/qbase/diagram-types.ts:222` (databasesWithSchemas), `src/qbase/sql-adapters.ts:16` (exportDiagramSql), `src/dialects/registry.ts:26` (listDialects), `shared/reconcile.ts:575` (isEmpty), `shared/reconcile.ts:578` (countByKind) | Delete exports and their tests |
| DEAD-024 | Low | Test-only reset hooks exported from production modules: resetCustomColorsForTests, resetPasswordMinLength, resetToasts, forgetClipboard | `src/hooks/use-custom-colors.ts:55`, `src/hooks/use-password-min-length.ts:24`, `src/platform/toast/use-toast.ts:88`, `src/canvas/clipboard.ts:23` | Move resets into test helpers |
| DEAD-025 | Low | `GET /diagrams/:id/versions` and `/versions/:version` have no client caller | `server/src/diagrams/routes.ts:535`, `server/src/diagrams/routes.ts:554` | Remove routes or document as public API |
| DEAD-026 | Low | `GET /:id/drift/reports` list has no client caller; client fetches one report | `server/src/drift/routes.ts:253`, `src/lib/qubdi/api.ts:923` | Remove route or document as public API |
| DEAD-027 | Low | `GET /lint/rules` has no client caller and no README mention | `server/src/lint/routes.ts:62` | Remove route or document it |
| DEAD-029 | Low | Three rewrite briefs referenced by no file or tool | `rewrite/phase8-brief.md`, `rewrite/translation-brief.md`, `rewrite/decisions-phase6a.md` | Delete unreferenced notes or archive off tree |
| DEAD-032 | Low | Unused en keys `editor.sidePanel`: common.more/rename, tables.color, fields.foreignKey, visuals.colour, hover.*, clipboard copied/pasted | `src/i18n/editor/side-panel.ts:10`, `src/i18n/editor/side-panel.ts:11`, `src/i18n/editor/side-panel.ts:43`, `src/i18n/editor/side-panel.ts:91`, `src/i18n/editor/side-panel.ts:215`, `src/i18n/editor/side-panel.ts:231`, `src/i18n/editor/side-panel.ts:246`, `src/i18n/editor/side-panel.ts:247`, `src/i18n/editor/side-panel.ts:248`, `src/i18n/editor/side-panel.ts:249` | Delete keys and whole hover block |
| DEAD-033 | Low | Unused UI component bodies: DropdownMenu SubTrigger/SubContent/CheckboxItem/RadioItem, SelectLabel/Separator, TableFooter/Caption, MenubarCheckboxItem | `src/platform/ui/dropdown-menu.tsx:14`, `src/platform/ui/dropdown-menu.tsx:36`, `src/platform/ui/dropdown-menu.tsx:77`, `src/platform/ui/dropdown-menu.tsx:97`, `src/platform/ui/select.tsx:99`, `src/platform/ui/select.tsx:133`, `src/platform/ui/table.tsx:39`, `src/platform/ui/table.tsx:99`, `src/workspace/navbar/menubar-parts.tsx:100` | Delete components and export entries |

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|
| REPO-008 | Repository | Dependabot ignore comments cite TODO.md for majors; TODO.md lists none |
| REPO-009 | Repository | PLAN calls main the read-only ChartDB reference; main now holds the rewrite |
| REPO-010 | Repository | Clean-checkout script hard-requires branch `rewrite/clean-room` |
| REPO-011 | Repository | Manual `run.sh push` bypasses verify gate; compose says tag workflow only |
| REPO-012 | Repository | Load-test compose pins no digest: postgres, node, `grafana/k6:latest` |
| REPO-014 | Repository | Audit prompt scope names files that do not exist |
| REPO-016 | Repository | CONTRIBUTING omits CONNECTION_KEY that `docker compose up -d db` requires |
| REPO-017 | Repository | README licence paragraph has no heading, sits inside Scaling |
| REPO-018 | Repository | Code of Conduct enforcement contact is not actionable |
| REPO-019 | Repository | QBase-build-tasks says hashed share tokens and keep-all versions; both differ now |
| REPO-040 | Repository | make-clean-checkout comment cites rewrite/clean-author-brief.md, which does not exist |
| DB-008 | Database | One pending MFA ticket per account is not enforced; concurrent logins leave two |
| DB-009 | Database | Audit rows are written after, not inside, the transaction of the change |
| DB-010 | Database | Backups section omits saving CONNECTION_KEY and SECRETS_KEY with the dump |
| DB-011 | Database | View definition spliced unquoted into CREATE VIEW; odd schema or view names break the text |
| DB-014 | Database | Migration 0015 rewrites audit_log under exclusive lock to widen id to bigint |
| DB-015 | Database | FK query lacks `conparentid = 0`; FKs to partitioned tables repeat per partition |
| DB-016 | Database | Recovery-code renewals unserialised; concurrent renews leave both code sets valid |
| DB-017 | Database | Postgres introspection skips foreign tables; SQL Server lists external tables |
| DB-018 | Database | Materialized views reported as plain views; definition rebuilt as CREATE VIEW |
| DB-020 | Database | Index query keeps invalid indexes (failed CONCURRENTLY builds) as real ones |
| CLI-038 | Client | Array default conversion swaps every `'` for `"`, mangling items with quotes |
| CLI-091 | Client | SQLite writer drops schema; same-named tables collapse via IF NOT EXISTS silently |
| CLI-094 | Client | DBML export drops views and partial-index WHERE with no diagnostic |
| CLI-095 | Client | Same-dialect SQL export drops views silently; converter path notes them |
| CLI-096 | Client | Multi-line comments flattened to one line in DBML notes and COMMENT ON |
| CLI-009 | Client | Logout ignores failed `api.logout()` and wipes local data anyway |
| CLI-010 | Client | `refreshUser` failure after forced password change swallowed; dialog stays with no feedback |
| CLI-011 | Client | Timers without cleanup: fake 1 s repair delay, focus delay, URL revoke at 0 ms |
| CLI-017 | Client | Every save fingerprints full content several times (sorted-key stringify each) |
| CLI-032 | Client | Bulk remove still does `indexOf` and `splice` per table and link |
| CLI-034 | Client | DBML export strips backticks from defaults and checks, corrupting MySQL expressions |
| CLI-035 | Client | DBML export writes many-to-many link as `<`, silently becoming one-to-many |
| CLI-036 | Client | Builder drops duplicate column names silently, no diagnostic |
| CLI-037 | Client | Many-to-many cardinality silently coerced to one-to-many on import |
| CLI-029 | Client | Builder copies neighbour array per link; hub table is quadratic |
| CLI-030 | Client | `hasTable` and `resolveTable` scan all tables per call; import is quadratic |
| CLI-031 | Client | DBML export finds tables and columns by linear scan per link |
| CLI-041 | Client | Link-pair lookup uses `includes` per pair; hub arrange is quadratic |
| CLI-083 | Client | Array default converted to JSON leaves inner `'` unescaped; literal breaks |
| CLI-084 | Client | Check conversion passes `--`, `/*` and a stray `'` through as safe |
| CLI-092 | Client | Binary length not capped: MySQL BINARY over 255, SQL Server over 8000 |
| CLI-097 | Client | Paste-detect and decimal-repair regexes quadratic: 80k newlines take 4 s |
| CLI-098 | Client | Export filter removes hidden links one by one, copying collection each time |
| CLI-099 | Client | File parse finds source table by linear scan per relationship |
| CLI-058 | Client | Numbers hard-coded to en-US in admin tiles and chart table |
| CLI-060 | Client | "Copied" label swap is not announced to screen readers |
| CLI-062 | Client | Open-failed screen offers only "back to projects"; no retry for transient errors |
| CLI-064 | Client | index.html has no noscript fallback; JS-off users see blank page |
| CLI-072 | Client | `UnpublishedDiagramError` English text shown on open-failed screen |
| CLI-075 | Client | Get latest deletes local copy before discarding autosaver; pending save can still send |
| CLI-088 | Client | `COMMENT ON INDEX` unqualified; fails for index in non-search-path schema |
| CLI-089 | Client | SQL Server index names never deduplicated; empty or repeated labels collide |
| CLI-090 | Client | SQL Server table comment in block comment; nested `/*` swallows rest of script |
| CLI-100 | Client | Mod+0 fit runs before typing and dialog checks; steals key in inputs |
| CLI-042 | Client | `Math.min(...array)` spreads overflow the stack on very large diagrams |
| CLI-043 | Client | File import reads whole file with no size cap before parse |
| CLI-044 | Client | Settings write reads then puts outside a transaction; tabs lose updates |
| CLI-059 | Client | Share dialog load effect has no cancel; late reply from old diagram overwrites links |
| CLI-073 | Client | Editor tab title hard-coded English, bypasses `editor.common.app.title` |
| CLI-074 | Client | Pages render `<main>` inside index.html `<main id="root">`; nested main landmarks |
| CLI-076 | Client | Drift badge refresh has no stale check; old diagram's reply sets badge |
| CLI-077 | Client | Members, connections, drift dialog loads lack cancel; old list shows on reopen |
| CLI-079 | Client | Save status live region holds only an icon; state changes unannounced |
| CLI-080 | Client | Each local save opens a BroadcastChannel; same-tab listener fires twice |
| CLI-014 | Client | Dialog has no Description; Radix warns, no aria-describedby |
| CLI-016 | Client | Share viewer reloads full share on every `version` event, no debounce |
| CLI-033 | Client | `setZoom(NaN)` stores NaN; clamp passes it through |
| CLI-040 | Client | Unknown-key capture assigns `__proto__` as prototype; extras inherit attacker keys then drop |
| CLI-051 | Client | Current-password input has placeholder only, no accessible name |
| CLI-053 | Client | Viewer NOT NULL marker is a 4 px dot with tooltip only |
| CLI-055 | Client | Viewer search box fixed at 16 rem; crowds the header on phones |
| CLI-056 | Client | Viewer loading text is not a live region; error and loading unannounced |
| CLI-070 | Client | Late locale load calls changeLanguage, reverting a newer language pick |
| CLI-078 | Client | Publish note input has placeholder only, no accessible name |
| DEAD-022 | Dead code | Unused en keys: canvas.entity openInPanel, narrow; region.colour; memo.colour; clipboard.failed |
| DEAD-023 | Dead code | `qubdi.workspace.typeLegend` block unused; type legend reads `canvas.legend` |
| DEAD-028 | Dead code | `postcss` devDependency redundant; `@tailwindcss/postcss` already depends on it, no import |
| DEAD-035 | Dead code | Server tsconfig `@/*` path alias unused; no server file imports `@/` |
| DEAD-036 | Dead code | Root `preview` script has no caller; e2e tools run `npx vite preview` |
| DEAD-037 | Dead code | Same localStorage JSON-map reader copied in four modules |
| DEAD-038 | Dead code | Two 25-char id generators; `generateId` duplicates `newId`, modulo-biased; `newDesignId` same body |
| DEAD-039 | Dead code | `timeOf` helper duplicated in two admin panels |
| DEAD-040 | Dead code | `isRecord` guard duplicated in viewer model |
| DEAD-041 | Dead code | Header comment cites `side-panel-register.ts`, which does not exist |
| DEAD-010 | Dead code | Eight selectors in `selectors.ts` have zero references |
| DEAD-013 | Dead code | Server script `test:watch` has no caller or doc reference |
| DEAD-014 | Dead code | Tailwind keyframes/animations accordion-down, accordion-up, scale, scale-2, blink never used |
| DEAD-015 | Dead code | Tailwind `subtitle` colour and `--subtitle` variable have no consumer |
| DEAD-016 | Dead code | Sidebar tokens primary, primary-foreground, accent-foreground, border, ring unused by any class |
| DEAD-017 | Dead code | Tailwind `container` theme block unused; no `container` class in src |
| DEAD-018 | Dead code | Unused re-exported UI primitives: Trigger, Close, Anchor, Group, Sub, Portal, RadioGroup, Shortcut |
| DEAD-019 | Dead code | `applyTo` alias exported by test fixtures, imported by no test |
| DEAD-020 | Dead code | `src/router.ts` re-export shim imported only by tests; app uses platform/router |
| DEAD-021 | Dead code | `lib/data/import-metadata/import` shim files imported only by one test |
| DEAD-003 | Dead code | Unused i18n keys in `qubdi.sidePanel` (whole object); no `t()` reader |
| DEAD-004 | Dead code | Unused en keys: workspace frame placeholders, examples menu |
| DEAD-005 | Dead code | Unused en keys: examplesSize, showAllShort, pasteHint |
| DEAD-006 | Dead code | Unused en keys: canvas fullScreen, exitFullScreen, widen, keys.mod, keys.modMac |
| DEAD-008 | Dead code | `persistence/local-data.ts` and `custom-colours.ts` imported only by tests; production-dead |
| DEAD-009 | Dead code | Exports with zero references anywhere |
| DEAD-030 | Dead code | `droppedUnique` is always false and never read |
| DEAD-031 | Dead code | `plural` helper in overview.ts has no production caller, English-only suffix |
| DEAD-034 | Dead code | `key-value-store.ts` reached only from production-dead DEAD-008 files and tests |

---

## Accepted

| ID | Lens | Finding | Why |
|----|------|---------|-----|
| DB-013 | Database | Migrations build audit_log indexes without CONCURRENTLY, blocking audit writes | Applied migrations cannot be edited; the one-off lock is documented in README under DB-014 |

---

## Dropped

| ID | Finding | Reason |
|----|---------|--------|
| CLI-061 | Share and 2FA copy bypass `copyText`; no unsupported-clipboard message | Wrong: both catch a missing clipboard and show a tailored copy-failed message |
| CLI-063 | `plural` helper in overview.ts has no production caller, English-only suffix | Dead code; moved to DEAD-031 |
| REPO-007 | Gitleaks config cites SEC-001 which does not exist at rev 0 | SEC-001 now exists; reference valid |
| SEC-015 | Audit row written after commit, outside the action's transaction | Duplicate of DB-009 |
| SRV-005 | MFA disable, enable and recovery renew never check the mfa lockout key | Duplicate of SEC-002 |
| DEAD-012 | `similarity.yaml` triggers only on `rewrite/clean-room`; never runs on main | Duplicate of REPO-003 |
| DB-005 | SQL Server introspection has no database-level read-only guard; only the text check | Duplicate of SEC-014 |
| SEC-035 | Gitleaks flags two TOTP test secrets in two-factor test | CI-pinned gitleaks v8.30.1 does not flag them |
| REPO-047 | Gitleaks flags two-factor test lines; secret scan fails | CI-pinned gitleaks v8.30.1 does not flag them; root cause is REPO-005 |
| CLI-004 | Vitest: 4 files fail, `fake-indexeddb` declared but missing from node_modules; tsc reports 4 errors | Local install gap, not a repo defect |

---

## Database scale check

Measured in an earlier pass; not re-run in rev 3 (srvaudit-pg holds no seed).

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
| FK ON DELETE | Every FK states cascade, restrict or set null | `server/src/db/schema.ts:205` |
| Check-then-write | Unique index or lock backs each: email, project, connection, snapshot version, share cap; not MFA (DB-008, DB-016) | `server/src/diagrams/service.ts:218` |
| Autosave | Compare-and-write in one UPDATE; content not returned | `server/src/diagrams/routes.ts:388` |
| Lists | Paged, offset capped, content never selected; one project list unpaged (SRV-013) | `server/src/diagrams/routes.ts:126` |
| Audit reads | Keyset cursor, indexed filters, name lookups by PK | `server/src/audit/activity.ts:133` |
| Audit retention | Batched 5000, indexed on `at` | `server/src/maintenance.ts:71` |
| Pool | max 10 plus 1 listener vs max_connections 200; statement and idle-in-tx timeouts | `server/src/db/client.ts:22` |
| Postgres introspection | READ ONLY transaction, SET LOCAL timeout, 64 MB byte cap, pinned address | `server/src/introspect/postgres.ts:162` |
| Read-only guard | Single SELECT/WITH, denylist after stripping literals | `server/src/introspect/readonly-guard.ts:102` |
| Postgres image and backups | Digest-pinned in compose and CI; dump and restore documented | `docker-compose.yml:15` |

---

## Changelog

| Rev | Date | Change |
|-----|------|--------|
| 14 | 2026-11-09 | 11 fixed, 1 narrowed (REPO-013); repository lens low batch 1, anchors remapped |
| 13 | 2026-11-09 | 10 fixed, 1 accepted (DB-013); database lens low batch, anchors remapped |
| 12 | 2026-11-09 | 5 fixed, 2 narrowed (CLI-018, CLI-065); client low batch 6, anchors remapped |
| 11 | 2026-11-09 | 9 fixed (client low batch 5), anchors remapped |
| 10 | 2026-11-09 | 10 fixed (client low batch 4: conversion safety and speed), anchors remapped |
| 9 | 2026-11-09 | 10 fixed, 1 dropped (client low batch 3), anchors remapped |
| 8 | 2026-11-09 | 10 fixed (client low batch 2), anchors remapped through the diff |
| 7 | 2026-11-09 | 10 fixed (client low batch 1), anchors refreshed |
| 6 | 2026-11-09 | 10 fixed (dead-code low batch 3), anchors refreshed |
| 5 | 2026-11-09 | 10 fixed (dead-code low batch 2), anchors refreshed |
| 4 | 2026-11-09 | 9 fixed, 1 narrowed (DEAD-007), anchors refreshed; low dead-code fixes batch 1 |
| 3 | 2026-11-09 | 75 new, 0 fixed, 3 dropped; deep sweep, server tests and gitleaks re-run |
| 2 | 2026-11-09 | 97 new, 0 fixed, 1 dropped; second full sweep |
| 1 | 2026-11-09 | 109 new, 0 fixed, 5 dropped; first full pass |
