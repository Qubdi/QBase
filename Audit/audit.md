# QubdiDB — Audit

**rev** 4 · **date** 2026-10-20
**method** static analysis · whole-tree read · eslint, tsc -b, `npm run build`, client vitest run (218 files, 2197 tests, all pass), server vitest run against the dev Postgres's `qubdidb_test` database (57 files, 875 tests, 13 skipped for SQL Server, all pass) · npm audit root and `server/` (0 vulnerabilities) · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 1 | 0 | 1 | 22 | 0 |
| Repository | 1 | 0 | 0 | 21 | 0 |
| Server | 0 | 0 | 0 | 16 | 0 |
| Client | 2 | 0 | 0 | 17 | 0 |
| **Total** | 4 | 0 | 1 | 76 | 0 |

## Act first

- `SEC-001` — the old `POSTGRES_PASSWORD` and `CONNECTION_KEY` are in git history and `.env`; rotate both.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | High | Old `POSTGRES_PASSWORD` and `CONNECTION_KEY` values remain in git history and local `.env` | `.env.example` history | Rotate both; the example file is blank now |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-016 | Low | No CODEOWNERS file | `.github/` | Add `.github/CODEOWNERS` covering workflows and Dockerfiles |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-007 | Med | Qubdi and admin UI strings hard-coded English; 0 files use `useTranslation` | `src/components/qubdi/`, `src/pages/admin-page/` | Move strings to locale keys under `qubdi.` |
| CLI-008 | Low | Lock release on `pagehide` waits behind the final-save promise | `src/components/qubdi/use-edit-lock.ts:59` | Send the keepalive release synchronously in the handler |

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
| REPO-007 | Repository | Server `@types/node` is `^26` against the Node 24 runtime |
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
| 3 | 2026-10-20 | 74 fixed; SEC-001 and REPO-016 narrowed to what is left |
| 4 | 2026-10-20 | 1 fixed |
