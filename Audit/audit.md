# QubdiDB — Audit

**rev** 7 · **date** 2026-10-14
**method** static analysis · whole-tree read · eslint, tsc -b, vitest run (154 files, 1395 tests), npm audit · server tests run against Postgres (27 files, 466 tests, SQL Server tests skipped) · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 12 | 0 | 1 | 3 | 0 |
| Repository | 14 | 0 | 2 | 1 | 0 |
| Server | 0 | 0 | 0 | 19 | 0 |
| Client | 0 | 0 | 0 | 5 | 1 |
| **Total** | 26 | 0 | 3 | 28 | 1 |

## Act first

- `SEC-001` — `/auth/login` and `/auth/register` accept unlimited guesses.
- `REPO-001` — CI never builds or tests `server/`.
- `REPO-002` — `.dockerignore` lets host `server/node_modules` into the server image.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | High | No rate limit or lockout on `/auth/login` and `/auth/register` | `server/src/app.ts:48` | Add per-IP and per-email rate limit to auth routes |
| SEC-004 | Med | Any signed-in user can open DB connections via `/introspect`, no project role | `server/src/introspect/routes.ts:216` | Require project writer role for inline connections |
| SEC-005 | Med | Session cookie has no `secure` flag | `server/src/auth/routes.ts:35` | Set `secure` behind HTTPS via a config flag |
| SEC-006 | Med | Login skips argon2 for unknown emails; timing reveals registered accounts | `server/src/auth/routes.ts:89` | Verify against a dummy hash when the user is missing |
| SEC-007 | Med | No CSP, `X-Frame-Options` or `nosniff` headers from nginx or Fastify | `default.conf.template:1` | Add security headers in nginx and the server |
| SEC-008 | Med | Compose defaults the DB password and `change-me` secret; ports bind all interfaces | `docker-compose.yml:7` | Bind ports to `127.0.0.1`; require secrets in `.env` |
| SEC-009 | Med | Audit log omits login, failed login, password change and connection events | `server/src/audit/audit.ts:4` | Add actions; emit them from auth and introspect routes |
| SEC-010 | Med | Audit rows carry no target user, project or connection id | `server/src/audit/audit.ts:36` | Add a `targetId` column; fill it in admin routes |
| SEC-012 | Low | `SESSION_SECRET` defaults to a known value and signs nothing | `server/src/config.ts:20` | Delete the setting, or fail startup when unset |
| SEC-013 | Low | Server image runs as root | `server/Dockerfile:15` | Add `USER node` |
| SEC-014 | Low | Google Fonts request leaks visitor IPs; README claims no external services | `index.html:9` | Self-host the fonts |
| SEC-015 | Low | Net guard classifies 6to4 and Teredo IPv6 ranges as public | `server/src/introspect/net-guard.ts:102` | Classify `2002::/16` and `2001::/32` as reserved |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-001 | High | CI never typechecks or tests `server/`; backend changes merge untested | `.github/workflows/ci.yaml:30` | Add server `tsc` and vitest job with a Postgres service |
| REPO-002 | High | `.dockerignore` misses `server/node_modules` and `server/.env`; both enter the server image | `.dockerignore:2` | Use `**/node_modules` and `**/.env*` patterns |
| REPO-003 | Med | ESLint ignores `server/**`; backend is never linted | `eslint.config.mjs:25` | Lint `server/` with its own config |
| REPO-004 | Med | Publish workflow builds only the UI image; server has no image or release | `.github/workflows/publish.yaml:62` | Add a server image build and push |
| REPO-005 | Med | Client has 24 high and 3 critical npm advisories incl. `react-router-dom`, `vitest` | `package.json:69` | Run `npm audit fix`; upgrade `react-router-dom` |
| REPO-006 | Med | Server `drizzle-orm` carries a high npm advisory | `server/package.json:19` | Upgrade `drizzle-orm`; rerun `npm audit` |
| REPO-007 | Med | Workflow actions pinned to mutable tags, not commit SHAs | `.github/workflows/ci.yaml:13` | Pin every `uses:` to a full SHA |
| REPO-008 | Med | No update bot config, `SECURITY.md` or `CODEOWNERS` | `.github/` | Add Dependabot config, `SECURITY.md`, `CODEOWNERS` |
| REPO-009 | Med | CI runs no `npm audit`, secret scan or Docker build | `.github/workflows/ci.yaml:1` | Add audit, gitleaks and `docker build` steps |
| REPO-010 | Low | README lists `OLD/`, which does not exist; configs still ignore it | `README.md:16` | Remove it from README, eslint and vitest configs |
| REPO-012 | Low | Node 24 in `.nvmrc` and CI; Node 22 in server image and README | `server/Dockerfile:15` | Align on one Node version |
| REPO-013 | Low | `public/sitemap.xml` lists placeholder `qubdi.example` while robots blocks all | `public/sitemap.xml:4` | Delete the sitemap or set the real host |
| REPO-014 | Low | Root version 1.20.1 and server 0.1.0 disagree; release-please bumps root only | `.github/workflows/release.yaml:20` | Version both packages together |
| REPO-015 | Low | UI image bakes the backend URL at build; compose uses `localhost:3001` | `docker-compose.yml:40` | Serve backend URL through runtime `config.js` |

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|
| SEC-002 | Security & secrets | `/config.js` served `OPENAI_API_KEY` to every visitor; AI feature removed |
| SEC-003 | Security & secrets | `VITE_OPENAI_API_KEY` baked into the JS bundle; build args removed |
| SEC-011 | Security & secrets | Cross-dialect SQL export sent the schema to an external LLM; AI export removed |
| REPO-011 | Repository | README denied GitHub integration while UI linked GitHub; links removed |
| SRV-001 | Server | `PUT /diagrams/:id` was last-write-wins; a save on an older copy now gets 409 |
| SRV-002 | Server | Version fetch loaded every snapshot; now filtered in SQL |
| SRV-003 | Server | No snapshot retention; `SNAPSHOT_KEEP` prunes at publish and on a timer |
| SRV-004 | Server | 50 MB limit on every route; now 1 MiB, diagram routes keep 50 MB, content shape-checked |
| SRV-005 | Server | `/lint` ran unbounded input; now capped at 5 MiB and rate-limited per user |
| SRV-006 | Server | Introspect and drift-check routes had no limit; now one per-user allowance |
| SRV-007 | Server | Drift runs were claimed per process; now claimed in SQL with a lease |
| SRV-008 | Server | SSE viewers uncapped; now capped per link, one shared link re-check per publish |
| SRV-009 | Server | Pg pool had no error handler, size or timeouts; all set |
| SRV-010 | Server | Logger disabled; now on (`LOG_LEVEL`), 500 errors logged with request id |
| SRV-011 | Server | No SIGTERM handler; now stops scheduler, closes streams and pool |
| SRV-012 | Server | No `trustProxy`; `TRUST_PROXY` setting added |
| SRV-013 | Server | Last-admin guard raced; admin changes now run under an advisory lock |
| SRV-014 | Server | Viewer list ran a snapshot query per row; now one query |
| SRV-015 | Server | Expired sessions never deleted; purged hourly |
| SRV-016 | Server | Unused `member.*` audit actions removed |
| SRV-017 | Server | Production ran through `tsx`; now compiled and run with `node` |
| SRV-018 | Server | Any editor could change others' comments; now author or owner only |
| SRV-019 | Server | `audit_log` had no index, read route or retention; all three added |
| CLI-001 | Client | Autosave serialised the whole diagram on every change; now compares a revision number |
| CLI-002 | Client | Leave-page save used plain `fetch`; now sent with `keepalive` |
| CLI-003 | Client | SQL import validators for MySQL, SQLite and SQL Server were stubs; now implemented |
| CLI-004 | Client | Star-us dialog and its GIF were never opened; deleted with i18n keys |
| CLI-005 | Client | Hard-coded `qubdi.example` in template pages; host now from `VITE_HOST_URL` |

---

## Accepted

| ID | Lens | Finding | Why |
|----|------|---------|-----|
| CLI-006 | Client | 10 lint suppressions remain in app code: parser AST typing, hook deps, third-party classes | Each has a stated reason; removing them risks behaviour |

---

## Dropped

| ID | Finding | Reason |
|----|---------|--------|

---

## Changelog

| Rev | Date | Change |
|-----|------|--------|
| 1 | 2026-10-14 | First pass: 55 new, 0 fixed, 0 dropped |
| 2 | 2026-10-14 | 0 new, 6 fixed, 0 dropped; 5 findings re-anchored or recounted |
| 3 | 2026-10-14 | 0 new, 1 fixed, 0 dropped |
| 4 | 2026-10-14 | 0 new, 1 fixed, 0 dropped |
| 5 | 2026-10-14 | 0 new, 0 fixed, 1 accepted (CLI-006 cut from 27 suppressions and 12 casts to 10) |
| 6 | 2026-10-14 | 0 new, 1 fixed, 0 dropped |
| 7 | 2026-10-14 | 0 new, 19 fixed, 0 dropped; 2 findings re-anchored |
