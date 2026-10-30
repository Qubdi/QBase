# QubdiDB — Audit

**rev** 11 · **date** 2026-10-30
**method** static analysis · whole-tree read · in a `node:24-alpine` container on a clean export: eslint root and `server/` (0 problems), `tsc -b`, server `tsc` typecheck and build (TypeScript 7.0.2), client vitest run (233 files, 2662 tests, all pass), `vite build` · npm audit root and `server/` (0 vulnerabilities, installed from the lockfiles) · server vitest run against a throwaway Postgres (60 files, 901 tests, 13 skipped for SQL Server, all pass) · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 5 | 0 | 1 | 22 | 0 |
| Repository | 0 | 0 | 0 | 43 | 1 |
| Server | 0 | 0 | 0 | 28 | 0 |
| Client | 1 | 0 | 0 | 38 | 0 |
| **Total** | 6 | 0 | 1 | 131 | 1 |

## Act first

- `SEC-001` — old `POSTGRES_PASSWORD`, `CONNECTION_KEY` and `MSSQL_SA_PASSWORD` are in git history; rotate all three.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | High | Old `POSTGRES_PASSWORD`, `CONNECTION_KEY` and `MSSQL_SA_PASSWORD` values remain in git history | `.env.example` history | Rotate all three; the example file is blank now |
| SEC-024 | Med | `TRUST_PROXY=true` trusts client `X-Forwarded-For`; per-IP limits, lockout and SSE cap bypassable | `server/src/config.ts:95` · `server/.env.example:88` | Refuse `true` at boot; require hop count or proxy list |
| SEC-025 | Med | `/mfa/setup` and `/mfa/enable` need no password; stolen session can lock owner out | `server/src/auth/mfa-routes.ts:46` · `server/src/auth/mfa-routes.ts:170` | Require the current password on `/mfa/enable` |
| SEC-026 | Low | Wrong password on 2FA disable or code renewal logged as `user.sign_in_failed` | `server/src/auth/mfa-routes.ts:242` | Log `user.password_check_failed` there |
| SEC-027 | Low | Tracked server example `DATABASE_URL` carries a working default password | `server/.env.example:3` | Blank the password in the example `DATABASE_URL` |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-039 | Low | Three `jsx-a11y` rules are off: 51 hits in autofocus and mouse-target code | `eslint.config.mjs:86` · `TODO.md` | Enable each rule; fix or justify every hit |

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
