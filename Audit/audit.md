# QBase — Audit

**rev** 19 · **date** 2026-11-03
**method** static analysis · whole-tree read · in a `node:24-alpine` container on a clean export: eslint root and `server/` (0 problems), `tsc -b` (0 errors), server `tsc` typecheck and `--noUnusedLocals --noUnusedParameters` (0 errors), client vitest run (233 files, 2668 tests: 2667 pass, 1 timing failure that passes alone, see CLI-046), `vite build` · npm audit root (17 moderate) and `server/` (11 moderate), all `minimatch` in the ESLint dev chain · server vitest against a throwaway `postgres:18-alpine` container (66 files, 948 tests: introspection fixture needs port 5433, see SRV-038; rerun through a 5433 forward, 2 wrong-credential tests fail because the stock image trusts loopback, as before) · `drizzle-kit generate` in a scratch copy: no schema changes · dead code by grep fallback (no knip or depcheck installed) · scale table carried from the rev 13 seed, not re-seeded · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 3 | 0 | 1 | 28 | 0 |
| Repository | 11 | 0 | 1 | 43 | 1 |
| Server | 10 | 0 | 0 | 28 | 0 |
| Database | 7 | 0 | 0 | 14 | 3 |
| Client | 4 | 0 | 1 | 42 | 0 |
| Dead code | 6 | 0 | 0 | 0 | 0 |
| **Total** | 41 | 0 | 3 | 155 | 4 |

## Act first

- `SEC-001` — old secrets still reachable through remote PR refs; rotate all three.
- `REPO-030` — Postgres digests disagree; CI's digest check fails and tests run another image.
- `CLI-043` — sign-out deletes unsent edits when the final save fails.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | High | Old `POSTGRES_PASSWORD`, `CONNECTION_KEY`, `MSSQL_SA_PASSWORD` reachable through 65 pre-rewrite remote PR refs | `git ls-remote origin 'refs/pull/*/head'` | Rotate all three; ask GitHub Support to purge PR refs |
| SEC-030 | Med | Admin PATCH on own account sets password without current password or 2FA | `server/src/admin/routes.ts:354` | Refuse self reset; point to `/auth/change-password` |
| SEC-031 | Low | Drift webhook URL stored and returned in plaintext; embedded tokens exposed | `server/src/db/schema.ts:439` | Encrypt with CryptoBox; return only the host |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-030 | High | Postgres digest in `db/postgres/Dockerfile` differs from CI and publish; digest check fails | `db/postgres/Dockerfile:8` · `.github/workflows/ci.yaml:49` · `.github/workflows/publish.yaml:23` | Use one digest in all three files |
| REPO-005 | Med | Merge commits land non-Conventional branch commits on the default branch | `.github/workflows/pr-title.yaml` · merge of PR #66 | Allow squash merges only in repository settings |
| REPO-027 | Med | `bootstrap-sha` names a commit missing from the rewritten history | `release-please-config.json:4` | Point `bootstrap-sha` at the current root commit |
| REPO-045 | Med | NOTICE says developed in-house; upstream name and copyright removed | `NOTICE:5` · `NOTICE:20` | Restore upstream name, copyright and modification notice |
| REPO-049 | Med | NOTICE grants "any later version"; both packages declare `AGPL-3.0-only` | `NOTICE:9` · `package.json:7` · `server/package.json:3` | Make NOTICE and `license` fields name the same terms |
| REPO-050 | Med | CLA licensee "QBase, Inc." differs from copyright holder "Qubdi" | `CLA.md:3` · `NOTICE:2` | Name one legal entity in both files |
| REPO-051 | Med | README cron backup writes `qbase-*.dump`; not git- or docker-ignored | `README.md:350` · `.gitignore:164` · `Dockerfile.dockerignore:56` | Ignore `qbase-*.dump` in `.gitignore` and both dockerignores |
| REPO-052 | Low | Gitleaks allowlist says the password stays in history; history was rewritten | `.gitleaks.toml:2` | Drop the allowlist or reword the comment |
| REPO-053 | Low | PR and issue templates use repo-relative links that break in GitHub bodies | `.github/pull_request_template.md:10` · `.github/ISSUE_TEMPLATE/bug_report.md:22` | Use absolute `github.com/.../blob/...` URLs |
| REPO-054 | Low | SECURITY.md excludes "example values"; example secrets are blank now | `SECURITY.md:34` | Say "left unset or weak" instead |
| REPO-055 | Low | npm audit: 17 root, 11 server moderate `minimatch` advisories via ESLint | `npm audit` root and `server/` | Override `minimatch` to `>=11.0.1` in both packages |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-015 | Med | Links created with `access: "off"` skip `MAX_ACTIVE_LINKS` and are never purged | `server/src/share/routes.ts:159` · `server/src/share/active.ts:14` | Count every unrevoked link against the cap |
| SRV-030 | Low | Link PATCH to `access: "anyone"` reactivates off links past `MAX_ACTIVE_LINKS` | `server/src/share/routes.ts:189` | Recount active links under the create lock |
| SRV-031 | Low | `POST /lint` with two unnamed indexes on one field returns 500 | `server/src/lint/routes.ts:32` · `shared/lint.ts:591` | Require `name` on `lintTable` indexes |
| SRV-032 | Low | `GET /diagrams/:id/versions/2147483648` overflows integer `version`; 500 | `server/src/diagrams/routes.ts:39` | Add `.max(2147483647)` to `versionParam.version` |
| SRV-033 | Low | Dates outside Postgres range, e.g. year -5000, return 500 | `server/src/diagrams/routes.ts:79` · `server/src/audit/activity.ts:71` | Bound coerced dates to the Postgres timestamp range |
| SRV-034 | Low | Diagram create and member set check parent, then insert; concurrent delete 500s | `server/src/diagrams/routes.ts:233` · `server/src/admin/routes.ts:879` | Catch `isForeignKeyViolation` on insert; answer 404 |
| SRV-035 | Low | Saved-connection decrypt outside try; changed `CONNECTION_KEY` returns 500 | `server/src/introspect/routes.ts:171` | Catch decrypt failure; answer 409 `connection_key_changed` |
| SRV-036 | Low | `DB_POOL_MAX=1` accepted; maintenance lock holds the only connection | `server/src/config.ts:211` · `server/src/maintenance.ts:602` | Set `DB_POOL_MAX` minimum to 2 |
| SRV-037 | Low | SSE disconnect during token lookup leaks viewer slots | `server/src/share/routes.ts:360` · `server/src/share/routes.ts:484` | Check `req.raw.destroyed` before hijack; release slots |
| SRV-038 | Low | Introspection test fixture hard-codes port 5433; ignores `TEST_PG_PORT` | `server/test/introspect-pg-fixture.ts:4` | Build fixture URLs from `TEST_PG_PORT` like `helpers.ts` |

### Database

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DB-018 | Med | Boot migrations set no `lock_timeout`; a queued DDL lock stalls table traffic | `server/src/db/client.ts:93` · `server/src/server.ts:26` | Set `lock_timeout` on the migration pool; retry on timeout |
| DB-019 | Low | App pool sets no `idle_in_transaction_session_timeout` | `server/src/db/client.ts:16` | Add `idle_in_transaction_session_timeout` to the pool config |
| DB-020 | Low | Diagram create `.returning()` reads full content back from Postgres | `server/src/diagrams/routes.ts:241` | Return listed columns; reuse body content in response |
| DB-021 | Low | Unauthenticated `/auth/setup-status` counts every user row per call | `server/src/auth/routes.ts:110` | Use `select exists(select 1 from users)` |
| DB-022 | Low | Version list has no LIMIT; `SNAPSHOT_KEEP=0` makes it unbounded | `server/src/diagrams/routes.ts:455` · `server/src/config.ts:191` | Add a LIMIT or paging to `/versions` |
| DB-023 | Low | Diagram list `offset` has no upper bound; deep pages scan and discard | `server/src/diagrams/routes.ts:31` | Cap `offset` or switch to a keyset cursor |
| DB-024 | Low | README backup uses `pg_dump -Fc`; no `pg_restore` step documented | `README.md:350` | Document the `pg_restore` command for the dump |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-043 | High | Sign-out deletes the local copy even when the final flush failed | `src/context/qubdi-context/qubdi-provider.tsx:109` · `src/lib/qubdi/save-status-store.ts:44` | Abort or confirm sign-out while `hasUnsavedChanges()` |
| CLI-044 | Med | Side-panel icon-only buttons have no accessible name | `src/pages/editor-page/side-panel/refs-section/refs-section.tsx:178` · `src/pages/editor-page/side-panel/tables-section/table-list/table-list-item/table-list-item-header/table-list-item-header.tsx:317` | Add `aria-label` to every icon-only side-panel button |
| CLI-045 | Med | Failed legacy DB move is silent; first new diagram blocks every retry | `src/lib/qubdi/local-data.ts:67` · `src/lib/qubdi/local-data.ts:95` | Retry while legacy exists; merge missing ids |
| CLI-046 | Low | Import test asserts navigation synchronously; fails under full-suite load | `src/dialogs/import-diagram-dialog/__tests__/import-diagram-dialog.test.tsx:140` | Wrap the navigation assertion in `waitFor` |

### Dead code

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DEAD-001 | Med | 10 exports referenced only by their defining line | `server/src/drift/service.ts:68`, `src/hooks/use-mfa-available.ts:20`, `src/lib/colors.ts:23`, `src/lib/data/sql-export/cross-dialect/convert/render-type.ts:505`, `src/lib/data/sql-export/export-per-type/common.ts:95`, `src/lib/data/sql-import/common.ts:143`, `src/lib/data/sql-import/validators/postgresql-validator.ts:257`, `src/lib/domain/diff/diff.ts:99`, `src/lib/qubdi/api.ts:248`, `src/pages/editor-page/side-panel/custom-types-section/custom-type-list/custom-type-list-item/custom-type-list-item-content/composite-fields/composite-field.tsx:9` | Delete unused functions; drop `export` from unused types |
| DEAD-002 | Med | About 36 fork i18n keys in `en` never looked up | `src/i18n/locales/en.ts:13`, `:43`, `:54`, `:106`, `:124`, `:194`, `:263`, `:304`, `:402`, `:482`, `:497` | Delete the keys from every locale |
| DEAD-003 | Med | `.gradient-background` and two rainbow keyframes unused but shipped | `src/globals.css:157`, `src/globals.css:188`, `src/globals.css:196`, `src/globals.css:210` | Delete the class, hover rule and keyframes |
| DEAD-004 | Low | `test:ui` and `test:coverage` scripts called nowhere | `package.json:17`, `package.json:18` | Document both scripts or remove them with their devDeps |
| DEAD-005 | Low | Four helpers duplicated with identical bodies | `src/lib/data/sql-export/cross-dialect/common.ts:1`, `src/lib/data/sql-export/export-per-type/common.ts:51`, `server/src/auth/sessions.ts:27`, `server/src/share/tokens.ts:6`, `src/lib/data/sql-export/cross-dialect/convert/convert-schema.ts:119`, `src/lib/data/sql-export/foreign-keys.ts:21`, `src/lib/data/sql-import/dialect-importers/mysql/mysql-common.ts:185`, `src/lib/data/sql-import/dialect-importers/postgresql/postgresql-common.ts:217` | Keep one copy of each; import it elsewhere |
| DEAD-006 | Low | Commented-out code blocks of three or more lines | `src/lib/data/data-types/postgres-data-types.ts:24`, `:45`, `:80`, `src/components/tree-view/tree-view.tsx:260`, `eslint.config.mjs:50` | Delete the commented-out code |

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
| CLI-034 | Client | `qbase.synced-content` entries never pruned when a diagram is unbound |
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
| REPO-028 | Repository | README backup writes `qbase-backup.sql` into the repo root; not git-ignored |
| REPO-026 | Repository | Root TypeScript 5.9 and server TypeScript 7 both compile `shared/` |
| REPO-029 | Repository | CI never builds `db/postgres/Dockerfile`; Dependabot digest bumps go unbuilt |
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
| CLI-041 | Client | Templates `og:image` points at missing `/qbase.png`; tags a nonexistent `@QBase` |
| CLI-042 | Client | `clearLocalUserData` reads storage globals outside its try; blocked storage aborts sign-out |
| DB-001 | Database | Viewer list computes stats on every snapshot version, not only the latest |
| DB-002 | Database | Share live events use an in-process EventEmitter; other replicas never receive them |
| DB-003 | Database | Every replica runs boot migrations without an advisory lock; the loser crashes |
| DB-005 | Database | Auto-publish stores a full snapshot per autosave; 200-copy cap hit in 35 minutes |
| DB-006 | Database | Save `.returning()` sends full content back; Node parses then discards it |
| DB-007 | Database | Publish copies content through Node while holding the diagram row lock |
| DB-008 | Database | One `audit_log` row per autosave; 5 index writes each, kept 365 days |
| DB-009 | Database | Unscoped `GET /diagrams` reads and sorts every diagram; only project lists were bounded |
| DB-010 | Database | Pool of 10 per replica against stock `max_connections` 100; Postgres untuned |
| DB-012 | Database | Each publish makes every live viewer re-read the full snapshot content |
| DB-013 | Database | Maintenance runs in every replica, repeating full-table prune scans |
| DB-015 | Database | Role check takes 3 round trips and re-reads `users.is_admin` |
| DB-016 | Database | Drift check loads the full previous report to compare its signature |
| DB-017 | Database | DB container keeps default 64 MB `/dev/shm`; backups are manual only |
| SEC-028 | Security & secrets | SQL Server login reroute dials any host unchecked; net guard bypassed |
| SEC-029 | Security & secrets | Blocked-target error returns the private IP a hostname resolves to |
| REPO-046 | Repository | Gitleaks comment cites compose profile `mssql`, which no longer exists |
| REPO-047 | Repository | Bug template says the version is in the footer; UI shows none |
| REPO-048 | Repository | PR checklist omits server `typecheck`, which CI runs |
| SRV-029 | Server | Outbound limiter scans its whole map per request; junk cookies grow it unbounded |

---

## Accepted

| ID | Lens | Finding | Why |
|----|------|---------|-----|
| REPO-041 | Repository | `eslint-plugin-react` and `jsx-a11y` lack ESLint 10 peers; forced by overrides | Latest releases (react 7.37.5, jsx-a11y 6.10.2) still declare up to ESLint 9; the overrides stay until they do |
| DB-004 | Database | Migration 0022 rewrites all of `diagrams` under ACCESS EXCLUSIVE | Applied migration cannot change safely; one-off lock, about 11 s per 320 MB; README warns before upgrading |
| DB-011 | Database | Rate limits, lockouts, SSE caps and drift guard live in process memory | Needs a shared store the stack lacks; README says limit at the proxy or run one process |
| DB-014 | Database | Drift size check casts whole content jsonb to text | Exact logical size feeds the cap; 130 ms at 30 MB, once per manual check |

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
| 15 | 2026-10-30 | 14 fixed: DB-001 to DB-003, DB-005 to DB-010, DB-012, DB-013, DB-015 to DB-017; DB-004, DB-011, DB-014 accepted |
| 16 | 2026-10-30 | 2 fixed: SEC-028, SEC-029; SEC-001 left open |
| 17 | 2026-10-30 | 4 fixed: REPO-045 to REPO-048 |
| 18 | 2026-10-30 | 1 fixed: SRV-029 |
| 19 | 2026-11-03 | Deep pass + new Dead code lens (`DEAD-` prefix): 35 new, 0 fixed, 5 reopened: REPO-005, REPO-027, REPO-030, REPO-045, SRV-015 |
