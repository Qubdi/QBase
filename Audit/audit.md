# QBase — Audit

**rev** 24 · **date** 2026-11-06
**method** static analysis · whole-tree read · portable Node 24.22.2 on a clean `git archive` copy in a scratch dir (Docker socket not reachable): root eslint crashes on load, see REPO-056; `server/` eslint (0 problems), `tsc -b` (0 errors), server `tsc` typecheck and `--noUnusedLocals --noUnusedParameters` (0 errors), client vitest run (233 files, 2669 tests, all pass), `vite build` · npm audit root and `server/` (0 vulnerabilities) · server vitest and live DB checks not run: no throwaway Postgres reachable · schema vs migrations diffed by hand: no drift · SEC-001 PR refs not re-counted: GitHub unreachable from this host · dead code by grep fallback (no knip or depcheck installed) · scale table carried from the rev 13 seed, not re-seeded · deep pass: six file-by-file reviews (auth/admin, diagrams/share, introspect/drift/shared, client sync, fork client, infra/CI), each finding re-read at its anchor · portable Postgres for server tests blocked by local permission policy · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 12 | 0 | 2 | 37 | 0 |
| Repository | 7 | 0 | 1 | 59 | 1 |
| Server | 10 | 0 | 0 | 42 | 0 |
| Database | 8 | 0 | 0 | 21 | 3 |
| Client | 11 | 0 | 1 | 59 | 0 |
| Dead code | 1 | 0 | 0 | 7 | 0 |
| **Total** | 49 | 0 | 4 | 225 | 4 |

## Act first

- `SEC-001` — old secrets still reachable through remote PR refs; rotate all three.
- `REPO-056` — root `npm run lint` crashes; CI, publish and pre-commit all fail.
- `SEC-032` — `.env.example` ships working secrets; blank them before anyone copies it.
- `CLI-050` — Publish and auto-publish toggle always fail with 423; send `editorId`.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | High | Old `POSTGRES_PASSWORD`, `CONNECTION_KEY`, `MSSQL_SA_PASSWORD` reachable through 65 pre-rewrite remote PR refs | `git ls-remote origin 'refs/pull/*/head'` | Rotate all three; ask GitHub Support to purge PR refs |
| SEC-032 | High | `.env.example` sets `POSTGRES_PASSWORD`, `CONNECTION_KEY`, `MSSQL_SA_PASSWORD`; copying it bypasses Compose `:?` guards | `.env.example:11` · `.env.example:25` · `.env.example:65` | Blank all three values again |
| SEC-033 | Med | Webhook URLs saved before encryption stay plaintext at rest | `server/src/drift/webhook.ts:28` | Re-seal plaintext `webhook_url` rows at boot or in a migration |
| SEC-034 | Med | `drift.configure` audit row omits webhook set, change or clear | `server/src/drift/routes.ts:181` | Record webhook host and change flag in audit meta |
| SEC-036 | Med | In-session wrong passwords share the `mfa:` lock key; stolen session locks owner out | `server/src/auth/mfa-routes.ts:243` · `server/src/auth/mfa-routes.ts:98` · `server/src/auth/routes.ts:306` | Count in-session password failures under a separate key |
| SEC-037 | Med | SQL export never escapes quote characters in identifiers; names inject DDL | `src/lib/data/sql-export/export-sql-script.ts:119` · `src/lib/data/sql-export/export-per-type/postgresql.ts:254` · `src/lib/data/sql-export/export-per-type/mssql.ts:108` | Double the dialect quote character, as `quoteName` does |
| SEC-038 | Med | Introspection results unbounded; a hostile DB server can exhaust process memory | `server/src/introspect/postgres.ts:148` · `server/src/introspect/sqlserver.ts:234` | Cap rows per query; abort over a byte budget |
| SEC-039 | Low | Link revoke within 2 s of a publish reuses cached check; streams stay open | `server/src/share/routes.ts:357` | Skip the recheck cache on link-change events |
| SEC-040 | Low | Heartbeat session check uses link access captured at stream open | `server/src/share/routes.ts:496` | Re-read link access before each heartbeat check |
| SEC-041 | Low | Failed sign-in audit insert runs only for real emails; timing reveals accounts | `server/src/auth/routes.ts:209` | Write the audit row after replying |
| SEC-047 | Low | UI image runs nginx master as root; no `USER` line | `Dockerfile:20` | Base on `nginx-unprivileged`; add a non-root `USER` |
| SEC-049 | Low | Gitleaks allowlist stores the old SA password as a literal | `.gitleaks.toml:10` | Allowlist by fingerprint, not the literal password |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-005 | Med | Merge commits and direct pushes land non-Conventional commits on `main` | `.github/workflows/pr-title.yaml:7` · `.github/workflows/release.yaml:3` | Protect `main`: require PRs, allow squash merges only |
| REPO-045 | Med | NOTICE says developed in-house; upstream name and copyright removed | `NOTICE:5` · `NOTICE:20` | Restore upstream name, copyright and modification notice |
| REPO-056 | High | Global `minimatch >=11.0.1` override crashes root ESLint on load | `package.json:124` · `server/package.json:47` | Scope the override to vulnerable consumers; keep `^3` for ESLint plugins |
| REPO-062 | Med | No `restart:` policy on db, server or ui; reboot leaves QBase down | `docker-compose.yml:5` | Add `restart: unless-stopped` to all three services |
| REPO-065 | Low | UI image and ui service have no healthcheck | `Dockerfile:27` | Add a `HEALTHCHECK` fetching `/config.js` |
| REPO-066 | Low | `listen [::]:80` fails on IPv6-less hosts; custom entrypoint skips nginx's check | `default.conf.template:16` | Drop the IPv6 listen or make it conditional |
| REPO-067 | Low | SPA fallback answers missing `/assets/*` with `index.html` | `default.conf.template:34` | Add `location /assets/` with `try_files $uri =404` |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-039 | Med | Undecryptable stored webhook skipped silently; no report note, UI shows none | `server/src/drift/service.ts:326` | Set `webhookNote` when the stored URL fails to open |
| SRV-040 | Low | Signed-in user on temporary password gets 403 on public `/s/<token>` | `server/src/app.ts:43` · `server/src/app.ts:163` | Exempt `/s/` paths from the temporary-password hook |
| SRV-041 | Low | Diagram deleted mid-request makes lint routes throw TypeError; 500 | `server/src/lint/routes.ts:102` · `server/src/lint/routes.ts:109` · `server/src/lint/routes.ts:143` | Return 404 when the row select is empty |
| SRV-042 | Med | Drift check scans every catalog row once per table; quadratic on big schemas | `shared/schema-desc.ts:168` | Group metadata rows by table once before mapping |
| SRV-043 | Med | Share SSE sends no `X-Accel-Buffering: no`; proxied live events stall | `server/src/share/routes.ts:421` | Send `X-Accel-Buffering: no` on the event stream |
| SRV-045 | Low | `COOKIE_SECURE`, `MFA_WINDOW_STEPS`, `MFA_ENABLED` typos fall back silently | `server/src/config.ts:87` · `server/src/config.ts:92` · `server/src/config.ts:222` | Raise `ConfigError` on unrecognised values |
| SRV-046 | Low | Diagram delete never closes its share links' live streams | `server/src/diagrams/routes.ts:436` | Emit link-changed for the diagram's links on delete |
| SRV-047 | Low | Diagram deleted mid-request: GET, lock, save and link create return 500 | `server/src/diagrams/routes.ts:288` · `server/src/share/routes.ts:163` | Return 404 on empty select or FK violation |
| SRV-048 | Low | Manual publish noted "Auto-published on save" is overwritten by next autosave | `server/src/diagrams/service.ts:250` | Flag auto snapshots in a column, not by note text |
| SRV-049 | Low | Webhook timeout is idle-only; a trickling server holds the drift check | `server/src/drift/webhook.ts:102` | Add an overall deadline to the request |

### Database

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DB-025 | Low | Shared paging `page` has no upper bound; admin and project list offsets unbounded | `server/src/lib/paging.ts:8` | Cap `page` so the offset stays at most 10,000 |
| DB-026 | Low | Connection edit updates `drift_settings` by unindexed `connection_id` | `server/src/introspect/routes.ts:450` · `server/src/db/schema.ts:428` | Index `drift_settings(connection_id)` |
| DB-027 | Low | Unauthenticated `/auth/register` counts every user row per call | `server/src/auth/routes.ts:138` | Select one `id` with `LIMIT 1`, as `/setup-status` does |
| DB-028 | Med | SQL Server introspection uses `STRING_SPLIT`; fails below compatibility level 130 | `server/src/introspect/sqlserver.ts:17` | Bind one parameter per schema instead of splitting |
| DB-029 | Low | SQL Server schema filter splits on commas; comma names unselectable | `server/src/introspect/sqlserver.ts:232` | Bind one parameter per schema |
| DB-030 | Low | Negative numeric scale (PG 15+) decoded as 2046 | `server/src/introspect/typmod.ts:53` | Sign-extend the 11-bit scale |
| DB-031 | Low | User delete can cascade-delete a diagram the target creates mid-delete | `server/src/admin/routes.ts:147` | Lock target users `FOR UPDATE` before reassigning diagrams |
| DB-032 | Low | Viewer list sorted by working-copy `updated_at` but shows `publishedAt` | `server/src/diagrams/routes.ts:143` | Sort viewer rows by latest snapshot `publishedAt` |

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| CLI-047 | Med | `webhookSaved` key sits under `connections`; drift dialog shows the raw key | `src/i18n/qubdi/database.ts:34` · `src/components/qubdi/drift-dialog.tsx:266` | Move `webhookSaved` into the `drift` block |
| CLI-048 | Low | Saved webhook cannot be cleared as the hint says; field loads empty | `src/components/qubdi/drift-dialog.tsx:114` · `src/i18n/qubdi/database.ts:35` | Add a remove-webhook button; reword the hint |
| CLI-050 | High | Publish and auto-publish PUT omit `editorId`; server answers 423 | `src/components/qubdi/publish-control.tsx:99` · `src/components/qubdi/publish-control.tsx:124` | Send `editorId: getEditorId()`; adopt returned `updatedAt` as base |
| CLI-051 | Med | Drift Check now blanks server scope and sourceKeys without local sync state | `src/components/qubdi/drift-dialog.tsx:169` | Resend the server's saved scope when local state is missing |
| CLI-052 | Med | Share-link expiry shown in UTC but parsed as local time | `src/components/qubdi/share-dialog.tsx:42` | Format with local time parts; commit on blur |
| CLI-053 | Med | Editor id in sessionStorage; a duplicated tab shares the edit lock | `src/lib/qubdi/editor-id.ts:13` | Keep the editor id in memory only |
| CLI-054 | Med | Type picker compiles enum values as regex; `+` or `(` throws | `src/components/select-box/select-box.tsx:411` | Drop the `new RegExp(keyword)` branch |
| CLI-056 | Low | Get latest makes a new local id; sync state and drift scope lost | `src/lib/qubdi/get-latest.ts:20` | Move sync state to the new local id |
| CLI-063 | Low | Lint settings fetched once; failed save swallowed silently | `src/components/qubdi/lint-control.tsx:61` · `src/components/qubdi/lint-control.tsx:85` | Re-read config on open; toast and roll back failures |
| CLI-067 | Low | Lock check unreachable on first ask never retried; editor stays read-only | `src/components/qubdi/use-edit-lock.ts:47` | Offer a retry in the access banner |
| CLI-070 | Low | Hard-coded English toasts and labels in fork editor code | `src/pages/editor-page/canvas/canvas.tsx:847` · `src/pages/editor-page/top-navbar/menu/menu.tsx:90` | Move strings into `en` and call `t()` |

### Dead code

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| DEAD-008 | Med | Constant `withExtras`/`withDefault` flags ship dead query branches to the browser | `src/lib/data/import-metadata/scripts/postgres-script.ts:66` · `src/lib/data/import-metadata/scripts/mysql-script.ts:11` · `src/lib/data/import-metadata/scripts/sqlserver-script.ts:3` | Inline the chosen branch; drop the flags |

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|
| CLI-064 | Client | Change-password and Create-link lack busy guards; double click submits twice |
| CLI-057 | Client | Import wizard keeps stale saved-connection id across reopen |
| CLI-058 | Client | DB import leaves an orphan local diagram when server create fails |
| CLI-059 | Client | Get latest does not wait for an in-flight autosave PUT |
| CLI-055 | Client | Lock granted after unmount is never released; held 90 s |
| CLI-061 | Client | Failed autosave not retried when the browser comes back online |
| CLI-060 | Client | Save confirm clears other in-flight fingerprints; false conflict shown |
| CLI-068 | Client | Share viewer keeps a selection whose table a reload removed |
| CLI-062 | Client | Share viewer applies out-of-order reload replies; older version can win |
| CLI-066 | Client | Non-API errors, e.g. corrupt server content, shown as unreachable |
| CLI-065 | Client | 33 API paths interpolate ids without `encodeURIComponent` |
| CLI-069 | Client | Inline-ref regex built from an unescaped field name |
| CLI-049 | Client | Legacy-move doc comment says never merged; code merges missing rows |
| SRV-051 | Server | CLI lint crashes on a table without `fields`; exits 1, not 2 |
| SRV-052 | Server | Composite FK change emits duplicate `relationship_changed` ids |
| SRV-050 | Server | `databaseType` "constructor" makes lint throw TypeError; 500 |
| SRV-044 | Server | `NOTIFY qubdi_events, 'null'` throws in the listener; process exits |
| REPO-063 | Repository | Compose defaults unset `QUBDI_BACKEND_URL` to localhost; documented local-only mode unreachable |
| REPO-064 | Repository | `.env.example` header names only `POSTGRES_PASSWORD` as required |
| REPO-057 | Repository | CONTRIBUTING server test line omits the fixed test DB credentials |
| REPO-061 | Repository | CODEOWNERS ship block omits `/db/`, `.gitleaks.toml`, release-please config |
| REPO-060 | Repository | Root `.dockerignore` lacks `qbase-*.dump`; only `Dockerfile.dockerignore` has it |
| REPO-058 | Repository | MSSQL test fixture hard-codes port 14333; ignores `MSSQL_PORT` |
| REPO-059 | Repository | Fixture-dump script cites removed compose profile `mssql` |
| SEC-046 | Security & secrets | `QUBDI_BACKEND_URL` substituted unescaped into `config.js`, CSP and nginx config |
| SEC-048 | Security & secrets | CI checkouts persist `GITHUB_TOKEN` in a workspace mounted into gitleaks |
| SEC-043 | Security & secrets | `audit.export` row omits which filters were exported |
| SEC-042 | Security & secrets | Audit rows cannot tell an admin grant from a revoke |
| SEC-045 | Security & secrets | Postgres TLS `servername` set even when host is an IP literal |
| SEC-044 | Security & secrets | Net guard treats site-local `fec0::/10` as public |
| SEC-035 | Security & secrets | One fixed scrypt salt for every CryptoBox; MFA and webhooks share one key |
| DEAD-007 | Dead code | `sha256` and `DiffKind` exported but referenced nowhere |
| SEC-031 | Security & secrets | Drift webhook URL stored and returned in plaintext; embedded tokens exposed |
| SEC-030 | Security & secrets | Admin PATCH on own account sets password without current password or 2FA |
| REPO-027 | Repository | `bootstrap-sha` names a commit missing from the rewritten history |
| REPO-030 | Repository | Postgres digest in `db/postgres/Dockerfile` differs from CI and publish; digest check fails |
| REPO-049 | Repository | NOTICE grants "any later version"; both packages declare `AGPL-3.0-only` |
| REPO-050 | Repository | CLA licensee "QBase, Inc." differs from copyright holder "Qubdi" |
| REPO-055 | Repository | npm audit: 17 root, 11 server moderate `minimatch` advisories via ESLint |
| REPO-051 | Repository | README cron backup writes `qbase-*.dump`; not git- or docker-ignored |
| REPO-052 | Repository | Gitleaks allowlist says the password stays in history; history was rewritten |
| REPO-053 | Repository | PR and issue templates use repo-relative links that break in GitHub bodies |
| REPO-054 | Repository | SECURITY.md excludes "example values"; example secrets are blank now |
| CLI-043 | Client | Sign-out deletes the local copy even when the final flush failed |
| CLI-044 | Client | Side-panel icon-only buttons have no accessible name |
| CLI-045 | Client | Failed legacy DB move is silent; first new diagram blocks every retry |
| CLI-046 | Client | Import test asserts navigation synchronously; fails under full-suite load |
| SRV-015 | Server | Links created with `access: "off"` skip `MAX_ACTIVE_LINKS` and are never purged |
| SRV-030 | Server | Link PATCH to `access: "anyone"` reactivates off links past `MAX_ACTIVE_LINKS` |
| SRV-031 | Server | `POST /lint` with two unnamed indexes on one field returns 500 |
| SRV-032 | Server | `GET /diagrams/:id/versions/2147483648` overflows integer `version`; 500 |
| SRV-033 | Server | Dates outside Postgres range, e.g. year -5000, return 500 |
| SRV-034 | Server | Diagram create and member set check parent, then insert; concurrent delete 500s |
| SRV-035 | Server | Saved-connection decrypt outside try; changed `CONNECTION_KEY` returns 500 |
| SRV-036 | Server | `DB_POOL_MAX=1` accepted; maintenance lock holds the only connection |
| SRV-037 | Server | SSE disconnect during token lookup leaks viewer slots |
| SRV-038 | Server | Introspection test fixture hard-codes port 5433; ignores `TEST_PG_PORT` |
| DB-018 | Database | Boot migrations set no `lock_timeout`; a queued DDL lock stalls table traffic |
| DB-019 | Database | App pool sets no `idle_in_transaction_session_timeout` |
| DB-020 | Database | Diagram create `.returning()` reads full content back from Postgres |
| DB-021 | Database | Unauthenticated `/auth/setup-status` counts every user row per call |
| DB-022 | Database | Version list has no LIMIT; `SNAPSHOT_KEEP=0` makes it unbounded |
| DB-023 | Database | Diagram list `offset` has no upper bound; deep pages scan and discard |
| DB-024 | Database | README backup uses `pg_dump -Fc`; no `pg_restore` step documented |
| DEAD-001 | Dead code | 10 exports referenced only by their defining line |
| DEAD-002 | Dead code | About 36 fork i18n keys in `en` never looked up |
| DEAD-003 | Dead code | `.gradient-background` and two rainbow keyframes unused but shipped |
| DEAD-004 | Dead code | `test:ui` and `test:coverage` scripts called nowhere |
| DEAD-005 | Dead code | Four helpers duplicated with identical bodies |
| DEAD-006 | Dead code | Commented-out code blocks of three or more lines |
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
| 20 | 2026-11-04 | 23 fixed: SRV-015, SRV-030 to SRV-038, DB-018 to DB-024, DEAD-001 to DEAD-006 |
| 21 | 2026-11-04 | 9 fixed: SEC-030, REPO-051 to REPO-054, CLI-043 to CLI-046 |
| 22 | 2026-11-05 | 6 fixed: SEC-031, REPO-027, REPO-030, REPO-049, REPO-050, REPO-055 |
| 23 | 2026-11-06 | Full pass: 19 new, 0 fixed, 0 regressed; REPO-005 widened to direct pushes |
| 24 | 2026-11-06 | Deep pass: 59 new, 0 fixed, 0 regressed |
| 25 | 2026-11-06 | 32 fixed: DEAD-007, SEC-035, SEC-044, SEC-045, SEC-042, SEC-043, SEC-048, SEC-046, REPO-059, REPO-058, REPO-060, REPO-061, REPO-057, REPO-064, REPO-063, SRV-044, SRV-050, SRV-052, SRV-051, CLI-049, CLI-069, CLI-065, CLI-066, CLI-062, CLI-068, CLI-060, CLI-061, CLI-055, CLI-059, CLI-058, CLI-057, CLI-064 |
