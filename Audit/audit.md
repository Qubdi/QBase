# QubdiDB — Audit

**rev** 8 · **date** 2026-10-30
**method** static analysis · whole-tree read · in a `node:24-alpine` container on a clean export: eslint root and `server/` (0 problems), `tsc -b`, server `tsc` typecheck and build (TypeScript 7.0.2), `vite build`, client vitest run (223 files, 2622 tests, all pass) · npm audit root and `server/` · server tests skipped, no Postgres running · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 5 | 0 | 1 | 22 | 0 |
| Repository | 23 | 0 | 1 | 21 | 0 |
| Server | 12 | 0 | 0 | 16 | 0 |
| Client | 19 | 0 | 0 | 19 | 0 |
| **Total** | 59 | 0 | 2 | 78 | 0 |

## Act first

- `REPO-023` — CI's server audit step fails on `main`; run `npm audit fix` in `server/`.
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

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-023 | High | CI server audit fails: high `@azure/msal-node` advisory via `mssql`; moderate `fast-uri` | `.github/workflows/ci.yaml:107` · `server/package-lock.json` | Run `npm audit fix` in `server/` |
| REPO-007 | Med | Server `@types/node` is `^26` against the Node 24 runtime | `server/package.json:36` | Pin `^24`; ignore `@types/node` majors in Dependabot |
| REPO-024 | Med | Root `happy-dom` has two high advisories, including host code execution | `package.json:111` | Bump `happy-dom` to `^21.0.4` |
| REPO-025 | Med | Dependabot npm entries ignore no majors; TS 7, ESLint 10, `@types/node` 26 merged | `.github/dependabot.yml:3` · `TODO.md:11` | Add semver-major `ignore` to both npm entries |
| REPO-028 | Med | README backup writes `qubdidb-backup.sql` into the repo root; not git-ignored | `README.md:267` · `.gitignore` | Dump outside the repo, or ignore `qubdidb-backup.sql` |
| REPO-026 | Low | Root TypeScript 5.9 and server TypeScript 7 both compile `shared/` | `package.json:118` · `server/package.json:38` | Align the TypeScript major across root and server |
| REPO-027 | Low | No release tag or `bootstrap-sha`; first release-please run scans all history | `release-please-config.json` · `.release-please-manifest.json:2` | Tag `v1.20.1` or set `bootstrap-sha` |
| REPO-029 | Low | CI never builds `db/postgres/Dockerfile`; Dependabot digest bumps go unbuilt | `.github/workflows/ci.yaml:124` | Add a `db/postgres` build to the docker job |
| REPO-030 | Low | Postgres image digest duplicated in three files | `db/postgres/Dockerfile:8` · `.github/workflows/ci.yaml:49` · `.github/workflows/publish.yaml:23` | Keep one digest source, or check they match |
| REPO-031 | Low | Tag `verify` job skips CI's npm audit and gitleaks scan | `.github/workflows/publish.yaml:15` | Add audit and secret-scan steps to `verify` |
| REPO-032 | Low | Published images carry no provenance, SBOM or signature | `.github/workflows/publish.yaml:99` | Set `provenance: mode=max` and `sbom: true` |
| REPO-033 | Low | Publish `verify` caches root npm only; server install uncached | `.github/workflows/publish.yaml:43` | Add both lockfiles to `cache-dependency-path` |
| REPO-034 | Low | CONTRIBUTING still links the removed Discord | `CONTRIBUTING.md:60` | Delete the Discord sentence |
| REPO-035 | Low | CONTRIBUTING server test line omits `typecheck`, which CI runs | `CONTRIBUTING.md:49` | Add `npm run typecheck` to the server line |
| REPO-036 | Low | README and build-tasks say React 18; package is React 19 | `README.md:13` · `QubdiDB-build-tasks.md:10` | Change "React 18" to "React 19" |
| REPO-037 | Low | ESLint ignores nonexistent `.eslintrc.cjs` but not `coverage/` | `eslint.config.mjs:25` | Replace `**/.eslintrc.cjs` with `coverage/**` |
| REPO-038 | Low | `components.json` `ui` alias points at missing `src/components/ui` | `components.json:16` | Point `ui` at the real components path |
| REPO-039 | Low | Pre-commit hook fails when `server/node_modules` is absent | `.husky/pre-commit:3` | Skip server lint when server deps are missing |
| REPO-040 | Low | Client image context ships `server/`, `Audit/`, `.github/` | `.dockerignore:17` · `Dockerfile:12` | Add per-Dockerfile ignore files excluding unused trees |
| REPO-041 | Low | `eslint-plugin-react` and `jsx-a11y` lack ESLint 10 peers; forced by overrides | `package.json:122` | Drop overrides once plugins declare ESLint 10 |
| REPO-042 | Low | `eslint-plugin-css-modules` configured; no `*.module.css` files exist | `eslint.config.mjs:36` | Remove `eslint-plugin-css-modules` |
| REPO-043 | Low | `jsx-a11y` plugin registered with zero rules enabled | `eslint.config.mjs:44` | Extend the `jsx-a11y` recommended rules |
| REPO-044 | Low | Vite 8 config still uses `rollupOptions.manualChunks` | `vite.config.ts:26` | Move to `build.rolldownOptions` code-splitting groups |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-017 | Med | Stored-diagram lint returns 500 when a table lacks `fields` | `server/src/lint/routes.ts:122` · `shared/schema-desc.ts:289` | Validate stored content before `lint()`, as `POST /lint` does |
| SRV-018 | Med | Diagram list runs `jsonb_array_length` on every listed row's content | `server/src/diagrams/summary.ts:41` | Store table and relationship counts as columns on save |
| SRV-019 | Med | Publish reads the full previous snapshot and re-hashes content | `server/src/diagrams/service.ts:127` | Select only version and hash; reuse `contentHash` |
| SRV-020 | Low | Drift list and badge load full report rows, including `changes` | `server/src/drift/routes.ts:99` · `server/src/drift/routes.ts:210` | Select only summary columns |
| SRV-021 | Low | Each drift check re-derives its key with blocking `scryptSync` | `server/src/drift/service.ts:197` | Reuse one `CryptoBox` per process |
| SRV-022 | Low | Drift check reconciles a working copy of any size | `server/src/drift/service.ts:227` | Apply the lint `octet_length` cap first |
| SRV-023 | Low | `LOG_LEVEL` unvalidated; a typo throws in pino, not `ConfigError` | `server/src/config.ts:175` | Validate `LOG_LEVEL` against pino levels |
| SRV-024 | Low | Pool sets no `statement_timeout`; a slow query holds a connection | `server/src/db/client.ts:14` | Add `statement_timeout` to the Pool options |
| SRV-025 | Low | Share-link create counts then inserts; parallel creates exceed `MAX_ACTIVE_LINKS` | `server/src/share/routes.ts:137` | Count and insert under a diagram row lock |
| SRV-026 | Low | Link list caps 200 newest; revoked churn hides older active links | `server/src/share/routes.ts:128` | Order active links first in the capped list |
| SRV-027 | Low | Drift check with missing settings or diagram answers 409 `already_running` | `server/src/drift/service.ts:165` · `server/src/drift/routes.ts:190` | Return a distinct reason and status |
| SRV-028 | Low | One failing purge skips every later maintenance step | `server/src/maintenance.ts:142` | Wrap each purge in its own try/catch |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-020 | Med | Share, drift and re-sync call `syncDiagram` without flushing the autosaver | `src/components/qubdi/account-menu.tsx:186` · `src/components/qubdi/drift-dialog.tsx:148` · `src/components/qubdi/resync-dialog.tsx:140` | Call `flushPendingSave()` before each `syncDiagram` |
| CLI-021 | Med | Re-sync, Share and lint Fix offered to viewers and lock losers | `src/components/qubdi/account-menu.tsx:133` · `src/components/qubdi/lint-control.tsx:88` | Gate them on `access.status === 'editor'` |
| CLI-022 | Med | Re-sync swallows a failed save and still toasts success | `src/components/qubdi/resync-dialog.tsx:140` | Surface the save error instead of `.catch(() => undefined)` |
| CLI-023 | Med | Disposed saver's failed final flush sets 'error' after the status reset | `src/components/qubdi/server-autosave.tsx:118` · `src/components/qubdi/server-autosave.tsx:185` | Ignore `onStatus` from a disposed saver |
| CLI-024 | Med | Share-viewer stream has no `error` or `open` handler; a 429 ends live updates | `src/pages/share-viewer-page/share-viewer-page.tsx:79` | Reload on `open`; retry with backoff on `error` |
| CLI-025 | Med | Open dialog and legacy route load every visible diagram unpaged | `src/components/qubdi/project-open-dialog.tsx:56` · `src/components/qubdi/diagram-access.tsx:288` | Filter by project and page on the server |
| CLI-026 | Med | Tooltips render nothing; icon-only toolbar buttons have no accessible name | `src/components/tooltip/tooltip.tsx:15` · `src/pages/editor-page/canvas/toolbar/toolbar.tsx:146` | Add `aria-label` to icon-only buttons |
| CLI-027 | Med | JSON import in server mode creates a diagram outside any project | `src/dialogs/import-diagram-dialog/import-diagram-dialog.tsx:61` | Import into the current project, or hide in workspaces |
| CLI-028 | Med | Editor statically imports `@dbml/core`; 15.7 MB chunk, 2.8 MB gzip | `src/pages/editor-page/side-panel/dbml-section/table-dbml/table-dbml.tsx:25` · `vite build` output | Load DBML import and export with dynamic `import()` |
| CLI-029 | Low | Fade selector scans all nodes and edges per table node per store change | `src/pages/editor-page/canvas/table-node/table-node.tsx:95` | Compute the linked set once in the canvas |
| CLI-030 | Low | Type colours legend text is hard-coded English | `src/pages/editor-page/canvas/table-node/field-type-legend.tsx:38` | Move legend labels to i18n keys |
| CLI-031 | Low | `fieldTypeKind` tints `datetimeoffset`, `datetime64` and `uint*` as text | `src/pages/editor-page/canvas/table-node/field-type-kind.ts:6` | Add them to the TIME and NUMBER patterns |
| CLI-032 | Low | `getWorkspaceId` uses bare `localStorage`; throws when storage is blocked | `src/lib/utils/utils.ts:18` | Use `readStored` and `writeStored` |
| CLI-033 | Low | Move-into-project picker capped at 100 projects | `src/components/qubdi/access-banner.tsx:35` | Use the paged project search picker |
| CLI-034 | Low | `qubdidb.synced-content` entries never pruned when a diagram is unbound | `src/lib/qubdi/remote-map.ts:32` · `src/lib/qubdi/sent-content.ts:94` | Clear the synced fingerprint in `clearRemoteId` |
| CLI-035 | Low | Meta description still advertises the removed Comments feature | `src/helmet/helmet-data.tsx:5` | Drop "comment" from the description |
| CLI-036 | Low | Import rethrows inside FileReader `onload`; unhandled rejection | `src/dialogs/import-diagram-dialog/import-diagram-dialog.tsx:70` | Remove `throw e` after `setError(true)` |
| CLI-037 | Low | Unused `CommandDialog` lacks a DialogTitle | `src/components/command/command.tsx:26` | Delete `CommandDialog` |
| CLI-038 | Low | `qrcode` imported eagerly by the 2FA dialog in the editor nav | `src/components/qubdi/two-factor-dialog.tsx:3` | Load `qrcode` with `import()` at setup |

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
| 5 | 2026-10-20 | 1 fixed |
| 6 | 2026-10-20 | 1 fixed |
| 7 | 2026-10-20 | 1 fixed |
| 8 | 2026-10-30 | Deep pass: 57 new, 0 fixed, REPO-007 reopened; SEC-001 widened to `MSSQL_SA_PASSWORD` |
