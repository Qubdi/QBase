# QubdiDB — Audit

**rev** 2 · **date** 2026-10-19
**method** static analysis · whole-tree read · eslint, tsc -b, vitest run (211 files, 2140 tests, all pass) in a node:24 container · server eslint and tsc clean · npm audit root and `server/` (0 vulnerabilities) · server tests skipped: only the live dev Postgres was up · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 23 | 0 | 2 | 0 | 0 |
| Repository | 22 | 0 | 0 | 0 | 0 |
| Server | 15 | 0 | 0 | 1 | 0 |
| Client | 19 | 0 | 1 | 0 | 0 |
| **Total** | 79 | 0 | 3 | 1 | 0 |

## Act first

- `SEC-001` — live `POSTGRES_PASSWORD` and `CONNECTION_KEY` pushed in `.env.example`; rotate both.
- `SEC-002` — next user on a browser inherits the previous user's local diagrams.
- `CLI-001` — reopened diagrams show the first-opened version, never the server's latest.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | High | `.env.example` commits live 48-char `POSTGRES_PASSWORD` and `CONNECTION_KEY`, matching local `.env` | `.env.example:11`, `.env.example:24` | Rotate both; blank example values; require `CONNECTION_KEY` via `:?` |
| SEC-002 | High | Session end or user switch keeps previous user's IndexedDB copies and id maps | `src/context/qubdi-context/qubdi-provider.tsx:57` | Store owner user id; clear local data on user change |
| SEC-003 | Med | Share-link tokens in `/s/<token>` URLs written to Fastify request log | `server/src/app.ts:62` | Add req serializer masking `/s/:token` |
| SEC-004 | Med | Share-viewer `/s/<token>` paths written to nginx access log | `default.conf.template:15` | Mask token in `log_format` or disable `access_log` there |
| SEC-005 | Med | Connection edit keeps stored password when user, database or ssl change | `server/src/introspect/routes.ts:374` | Add user, database, ssl, `trustServerCertificate` to `movesTarget` |
| SEC-006 | Med | No Origin check on mutating requests; CSRF defence is SameSite=Lax alone | `server/src/app.ts:85` | Reject mutating requests whose Origin differs from `CORS_ORIGIN` |
| SEC-007 | Med | Introspection with typed-in credentials writes no audit row | `server/src/introspect/routes.ts:227` | Audit `introspect.run` with dialect and host |
| SEC-008 | Low | Lockout keyed on email alone; anyone can keep any account locked | `server/src/auth/routes.ts:178` | Key failures on email plus IP |
| SEC-009 | Low | `currentPassword` has no max length; argon2 hashes up to 1 MB | `server/src/auth/routes.ts:46` | Add `.max(200)` to `currentPassword` |
| SEC-010 | Low | Wrong current password on change-password logged as `user.sign_in_failed` | `server/src/auth/routes.ts:263` | Log a distinct `user.password_check_failed` action |
| SEC-011 | Low | Self sign-out writes no audit row | `server/src/auth/routes.ts:226` | Audit `user.sign_out` on logout |
| SEC-012 | Low | Sessions have no idle timeout, only absolute 30-day expiry | `server/src/auth/sessions.ts:86` | Reject sessions whose `lastSeenAt` exceeds an idle limit |
| SEC-013 | Low | GCM decipher does not enforce 16-byte auth tag length | `server/src/introspect/crypto-box.ts:43` | Pass `authTagLength: 16`; reject other tag sizes |
| SEC-014 | Low | Public share JSON sent without `Cache-Control: no-store` | `server/src/share/routes.ts:299` | Set `cache-control: no-store` on `/s/*` |
| SEC-015 | Low | SSE viewer cap is per link only; one IP can take all slots | `server/src/share/routes.ts:322` | Add per-IP concurrent stream cap |
| SEC-016 | Low | SSE stream response skips CSP and frame security headers | `server/src/share/routes.ts:329` | Add security headers to the SSE `writeHead` |
| SEC-017 | Low | Disabled user's `signed_in` SSE stream stays open until next event | `server/src/share/access.ts:25` | Re-check the session on each heartbeat |
| SEC-018 | Low | Net guard treats `::ffff:0:0/96` and `64:ff9b:1::/48` as public | `server/src/introspect/net-guard.ts:86` | Classify the embedded IPv4 for both prefixes |
| SEC-019 | Low | Recovery codes stored as unsalted sha256 | `server/src/auth/totp.ts:162` | Hash recovery codes with HMAC keyed by `SECRETS_KEY` |
| SEC-020 | Low | Server defaults `HOST` to `0.0.0.0` outside Docker | `server/src/config.ts:107` | Default `HOST` to `127.0.0.1`; set `0.0.0.0` in Dockerfile |
| SEC-021 | Low | Default core-DB credential hard-coded as `DATABASE_URL` fallback | `server/src/config.ts:106` | Remove the fallback; require `DATABASE_URL` |
| SEC-022 | Low | Compose gives `MSSQL_SA_PASSWORD` a hard-coded default | `docker-compose.yml:90` | Require it with `:?` |
| SEC-023 | Low | nginx `server_tokens` left on; version disclosed | `default.conf.template:1` | Add `server_tokens off;` |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-001 | Med | CI runs on pull requests only; direct pushes to `main` unchecked | `.github/workflows/ci.yaml:4` | Add `push: branches: [main]`; protect `main` |
| REPO-002 | Med | README step 3 repeats `cp .env.example .env`, overwriting step 1 edits | `README.md:48` | Drop the second `cp` |
| REPO-003 | Med | README server command keeps default `DATABASE_URL`, not chosen `POSTGRES_PASSWORD` | `README.md:41` | Document setting `DATABASE_URL` for the local server |
| REPO-004 | Med | `SECURITY.md` names `SESSION_SECRET`, which exists nowhere in code | `SECURITY.md:35` | Replace `SESSION_SECRET` with `SECRETS_KEY` |
| REPO-005 | Med | release-please needs Conventional Commits; 2 of 426 commits follow them | `release-please-config.json`; `git log` | Document Conventional Commits; add a PR-title check |
| REPO-006 | Med | `VITE_APP_URL` documented but never passed as Docker build arg | `.env.example:60`; `Dockerfile` | Add `VITE_APP_URL` build arg to `Dockerfile` and compose |
| REPO-007 | Med | Server `@types/node` is `^26` against the Node 24 runtime | `server/package.json:35` | Pin `@types/node` to `^24` |
| REPO-008 | Med | README says forked but never names the upstream project | `README.md:166` | Name and link the upstream project |
| REPO-009 | Low | ESLint comment points to `TODO.md`, which is empty | `eslint.config.mjs:77` | List the disabled rules in `TODO.md` or drop reference |
| REPO-010 | Low | Build-tasks doc still specifies the removed Comments feature | `QubdiDB-build-tasks.md:72` | Mark Task 4 removed |
| REPO-011 | Low | `test:coverage` needs `@vitest/coverage-v8`, which is not installed | `package.json:19` | Add `@vitest/coverage-v8` or remove the script |
| REPO-012 | Low | Preload plugin matches `logo-*.png`; only `qubdi-logo-*.svg` exist | `vite.config.ts:23` | Remove `UnpluginInjectPreload` or match the svg logos |
| REPO-013 | Low | Rollup `external` regex `/__test__/` matches nothing | `vite.config.ts:40` | Delete the `external` rule |
| REPO-014 | Low | `.dockerignore` comment claims `server/` has its own; none exists | `.dockerignore:1` | Fix the comment |
| REPO-015 | Low | gitleaks and CI Postgres service images pinned by tag only | `.github/workflows/ci.yaml:46`, `:110`; `publish.yaml:23` | Pin images by `@sha256` digest |
| REPO-016 | Low | No CODEOWNERS, PR template or issue templates | `.github/` | Add `.github/CODEOWNERS` covering workflows and Dockerfiles |
| REPO-017 | Low | Broken maintainer mail link; no CLA, setup or test sections | `CONTRIBUTING.md:38` | Fix the link; add CLA, setup, test sections |
| REPO-018 | Low | CLA cites "Section 1"; its sections are unnumbered | `CLA.md:17` | Number the sections |
| REPO-019 | Low | Neither package declares a `license` field | `package.json`, `server/package.json` | Add `"license": "AGPL-3.0-only"` to both |
| REPO-020 | Low | Publish job builds client on host, then Docker rebuilds it | `.github/workflows/publish.yaml:89` | Drop the host install, lint and build steps |
| REPO-021 | Low | nginx not `exec`'d; shell stays PID 1, SIGTERM not forwarded | `entrypoint.sh:7` | Use `exec nginx -g "daemon off;"` |
| REPO-022 | Low | Release workflow grants `GITHUB_TOKEN` write yet acts with `OSS_RELEASE` PAT | `.github/workflows/release.yaml:9` | Reduce `permissions` to `contents: read` |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-001 | Med | `GET /diagrams` loads every visible diagram, then sorts and pages in JS | `server/src/diagrams/routes.ts:131` | Use SQL `ORDER BY`, `LIMIT`, `OFFSET` |
| SRV-002 | Med | `/admin/stats` fires 9 parallel queries at a 10-connection pool | `server/src/admin/stats.ts:87` | Merge counts into one query |
| SRV-003 | Med | Every MFA operation re-derives its key with blocking `scryptSync` | `server/src/auth/mfa.ts:71` | Build one `CryptoBox` in `createMfa` and reuse it |
| SRV-004 | Med | Numeric env values unvalidated; NaN disables lockout or 500s later | `server/src/config.ts:121` | Validate numeric config at boot; exit on NaN |
| SRV-005 | Med | `SECRETS_KEY` under 16 chars accepted at boot; MFA requests then 500 | `server/src/config.ts:136` | Check key length in `loadConfig`; exit on failure |
| SRV-006 | Med | Stored-diagram lint runs on up to 50 MB, bypassing 5 MB cap | `server/src/lint/routes.ts:86` | Refuse content over `LINT_BODY_LIMIT` before `lint` |
| SRV-007 | Med | Drift signature ignores change details; a second type change stays dismissed | `shared/drift.ts:132` | Hash each change's fields into the signature |
| SRV-008 | Low | `pairUp` guesses when two left items share one right key | `shared/reconcile.ts:158` | Skip keys held by more than one left item |
| SRV-010 | Low | Project delete checks emptiness then deletes; concurrent create hits FK 500 | `server/src/admin/routes.ts:829` | Catch 23503; return 409 `project_not_empty` |
| SRV-011 | Low | Sign-up hashes the password before checking sign-up is closed | `server/src/auth/routes.ts:129` | Count users before hashing |
| SRV-012 | Low | Link regenerate update lacks `revokedAt` guard; races a concurrent revoke | `server/src/share/routes.ts:228` | Add `isNull(revokedAt)` to the update's where |
| SRV-013 | Low | Writer GET and PUT hash full diagram content synchronously | `server/src/diagrams/service.ts:77` | Store a content hash on save; compare that |
| SRV-014 | Low | No image HEALTHCHECK; forced exit equals Docker's 10 s stop grace | `server/Dockerfile`; `server/src/shutdown.ts:26` | Add HEALTHCHECK on `/health`; set `stop_grace_period: 15s` |
| SRV-015 | Low | Share links per diagram unbounded; listing caps at 200 | `server/src/share/routes.ts:127` | Cap active links per diagram on create |
| SRV-016 | Low | CORS `onRequest` hook has no tests | `server/src/app.ts:85` | Test preflight and credentialed CORS headers |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-001 | High | Reopen reuses browser copy without checking server `updatedAt`; viewers see stale diagram | `src/lib/qubdi/open-remote.ts:69` | Compare server `updatedAt` with stored base; refresh when clean |
| CLI-002 | Med | Publish syncs outside the autosaver; both send same base and conflict | `src/components/qubdi/publish-control.tsx:86` | Flush the autosaver before publishing |
| CLI-003 | Med | Publish and drift controls render for viewers and lock losers | `src/components/qubdi/publish-control.tsx:79` | Render only when access status is `editor` |
| CLI-004 | Med | Tab close can drop edits: 10 s debounce, no `beforeunload` guard | `src/lib/qubdi/autosave.ts:2` | Add `beforeunload` prompt while a save is pending |
| CLI-005 | Med | Monaco imported eagerly via `config.ts`, defeating the lazy editor | `src/components/code-snippet/config.ts:3` | Import `editor.api` and needed languages lazily |
| CLI-006 | Med | All 22 locales imported statically into the main bundle | `src/i18n/i18n.ts:5` | Lazy-load locales by dynamic import |
| CLI-007 | Med | Qubdi and admin UI strings hard-coded English; 0 files use `useTranslation` | `src/components/qubdi/`, `src/pages/admin-page/` | Move strings to locale keys under `qubdi.` |
| CLI-008 | Low | Lock release on `pagehide` waits behind the final-save promise | `src/components/qubdi/use-edit-lock.ts:59` | Send the keepalive release synchronously in the handler |
| CLI-009 | Low | After a 423, cleanup flush sends another PUT bound to fail | `src/components/qubdi/server-autosave.tsx:161` | Discard the saver on lock loss |
| CLI-010 | Low | Activity CSV export bypasses `request()`; its 401 does not end session | `src/lib/qubdi/api.ts:620` | Call `sessionEndedHandler` on 401 in export |
| CLI-011 | Low | 401 from `/auth/mfa` or `/auth/change-password` does not end session | `src/lib/qubdi/api.ts:450` | Exempt only sign-in, register, `me` and setup-status paths |
| CLI-012 | Low | Share fetch has no timeout; one failed reload stops live updates | `src/lib/qubdi/api.ts:745` | Add `AbortSignal.timeout`; keep previous share on error |
| CLI-013 | Low | Opening a workspace fetches the full unpaged diagram list | `src/components/qubdi/diagram-access.tsx:125` | Fetch the one diagram by id |
| CLI-014 | Low | Access banner project lookup stops at 100 projects | `src/components/qubdi/access-banner.tsx:31` | Look up the project by id |
| CLI-015 | Low | Local-config `localStorage` reads and writes lack try/catch | `src/context/local-config-context/local-config-provider.tsx:18` | Wrap storage accessors like `remote-map.ts` |
| CLI-016 | Low | Fork templates and examples routes still ship in server mode | `src/router.tsx:62` | Gate those routes behind `!QUBDI_BACKEND_ENABLED` |
| CLI-017 | Low | Drift badge polls every 60 s while the tab is hidden | `src/components/qubdi/drift-control.tsx:41` | Skip polling while `document.hidden` |
| CLI-018 | Low | 3 `exhaustive-deps` suppressions in Qubdi code | `src/components/qubdi/diagram-access.tsx:166`; `drift-dialog.tsx:131`; `share-dialog.tsx:72` | Add stable deps or move values to refs |
| CLI-019 | Low | Arabic registered but document `dir` never set to RTL | `src/i18n/i18n.ts:27` | Set `document.dir = i18n.dir()` on language change |

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|
| SRV-009 | Server | `POST /lint` with a table lacking `fields` throws TypeError, returns 500 |

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
| 1 | 2026-10-19 | First pass on a fresh audit: 80 new, 0 fixed, 0 dropped |
| 2 | 2026-10-19 | 1 fixed |
