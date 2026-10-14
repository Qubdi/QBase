# QubdiDB — Audit

**rev** 2 · **date** 2026-10-14
**method** static analysis · whole-tree read · eslint, tsc -b, vitest run (151 files, 1343 tests), npm audit · server tests not run (no Postgres) · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 12 | 0 | 1 | 3 | 0 |
| Repository | 14 | 0 | 2 | 1 | 0 |
| Server | 19 | 0 | 0 | 0 | 0 |
| Client | 4 | 0 | 0 | 2 | 0 |
| **Total** | 49 | 0 | 3 | 6 | 0 |

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
| SEC-013 | Low | Server image runs as root | `server/Dockerfile:3` | Add `USER node` |
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
| REPO-012 | Low | Node 24 in `.nvmrc` and CI; Node 22 in server image and README | `server/Dockerfile:3` | Align on one Node version |
| REPO-013 | Low | `public/sitemap.xml` lists placeholder `qubdi.example` while robots blocks all | `public/sitemap.xml:4` | Delete the sitemap or set the real host |
| REPO-014 | Low | Root version 1.20.1 and server 0.1.0 disagree; release-please bumps root only | `.github/workflows/release.yaml:20` | Version both packages together |
| REPO-015 | Low | UI image bakes the backend URL at build; compose uses `localhost:3001` | `docker-compose.yml:40` | Serve backend URL through runtime `config.js` |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-001 | Med | `PUT /diagrams/:id` is last-write-wins; concurrent editors silently overwrite | `server/src/diagrams/routes.ts:155` | Require matching `updatedAt`; return 409 on conflict |
| SRV-002 | Med | Version fetch loads every snapshot's content, then filters in JS | `server/src/diagrams/routes.ts:252` | Add `version` to the SQL `WHERE` |
| SRV-003 | Med | Auto-publish stores full content per save; no snapshot retention or cap | `server/src/diagrams/routes.ts:173` | Add a snapshot retention limit |
| SRV-004 | Med | 50 MB body limit on every route; diagram `content` has no schema | `server/src/app.ts:43` | Lower global limit; raise it only on diagram routes |
| SRV-005 | Med | `/lint` runs synchronously on any signed-in user's body | `server/src/lint/routes.ts:38` | Cap input size; rate-limit the route |
| SRV-006 | Med | Introspect and drift-check routes have no rate limit | `server/src/introspect/routes.ts:201` | Add per-user rate limit on outbound connection routes |
| SRV-007 | Med | Drift scheduler runs in-process; `running` set is per process | `server/src/drift/service.ts:58` | Claim runs in SQL with `FOR UPDATE SKIP LOCKED` |
| SRV-008 | Med | SSE connections uncapped; unbounded listeners, one DB query per viewer per publish | `server/src/events.ts:5` | Cap connections per link; cache the link lookup |
| SRV-009 | Med | Pg pool sets no `error` handler, `max` or timeouts | `server/src/db/client.ts:9` | Add pool error handler, size limit and timeouts |
| SRV-010 | Med | Logger disabled; 500 errors return without any log line | `server/src/app.ts:42` | Enable Fastify logger; log errors with request id |
| SRV-011 | Med | No SIGTERM handler; pool, scheduler and SSE streams never drain | `server/src/server.ts:25` | Handle SIGTERM; close app and pool |
| SRV-012 | Low | Share rate limit keys on `req.ip`; no `trustProxy`, so proxies share one bucket | `server/src/share/routes.ts:213` | Add a `trustProxy` setting |
| SRV-013 | Low | Last-admin guard reads then writes; concurrent demotions can leave none | `server/src/admin/routes.ts:155` | Check inside a locking transaction |
| SRV-014 | Low | Viewer diagram list runs one snapshot query per row | `server/src/diagrams/routes.ts:88` | Join the latest snapshot in one query |
| SRV-015 | Low | Expired sessions are never deleted | `server/src/auth/sessions.ts:42` | Purge expired rows on a timer |
| SRV-016 | Low | `AuditAction` lists three `member.*` actions no code emits | `server/src/audit/audit.ts:32` | Remove the unused actions |
| SRV-017 | Low | Production starts through `tsx`; `build` only typechecks | `server/package.json:8` | Compile to JS and run with `node` |
| SRV-018 | Low | Any editor can edit or delete another author's comments | `server/src/comments/routes.ts:177` | Limit update and delete to author or owner |
| SRV-019 | Low | `audit_log` has no read endpoint, index or retention | `server/src/db/schema.ts:138` | Add index, retention job and admin read route |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-001 | Med | Autosave serialises the whole diagram on every change | `src/components/qubdi/server-autosave.tsx:39` | Compare a revision counter instead of JSON |
| CLI-002 | Med | Leave-page save uses plain `fetch`; the browser may cancel it | `src/components/qubdi/server-autosave.tsx:48` | Send with `keepalive` on `pagehide` |
| CLI-003 | Med | SQL import validators for MySQL, SQLite and SQL Server are stubs | `src/lib/data/sql-import/validators/mysql-validator.ts:37` | Implement the validators or remove the stubs |
| CLI-006 | Low | 16 lint suppressions and `any` casts remain in app code | `src/` | Remove them as files are touched |

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|
| SEC-002 | Security & secrets | `/config.js` served `OPENAI_API_KEY` to every visitor; AI feature removed |
| SEC-003 | Security & secrets | `VITE_OPENAI_API_KEY` baked into the JS bundle; build args removed |
| SEC-011 | Security & secrets | Cross-dialect SQL export sent the schema to an external LLM; AI export removed |
| REPO-011 | Repository | README denied GitHub integration while UI linked GitHub; links removed |
| CLI-004 | Client | Star-us dialog and its GIF were never opened; deleted with i18n keys |
| CLI-005 | Client | Hard-coded `qubdi.example` in template pages; host now from `VITE_HOST_URL` |

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
| 1 | 2026-10-14 | First pass: 55 new, 0 fixed, 0 dropped |
| 2 | 2026-10-14 | 0 new, 6 fixed, 0 dropped; 5 findings re-anchored or recounted |
