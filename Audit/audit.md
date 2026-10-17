# QubdiDB — Audit

**rev** 11 · **date** 2026-10-17
**method** static analysis · whole-tree read · eslint, tsc -b, vitest run (197 files, 2024 tests, all pass), vite build · server lint, typecheck, build, vitest (665 pass, 13 skipped) in a node:24 container on a throwaway Postgres · npm audit root and `server/` · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 16 | 1 | 1 | 4 | 0 |
| Repository | 20 | 0 | 0 | 13 | 0 |
| Server | 14 | 0 | 0 | 19 | 0 |
| Client | 0 | 0 | 0 | 27 | 1 |
| **Total** | 50 | 1 | 1 | 63 | 1 |

## Act first

- `SEC-016` — Note Markdown renders raw HTML; any editor can run script as an admin.
- `SEC-001` — `/auth/login`, `/auth/register` and `/auth/change-password` accept unlimited guesses.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-016 | Crit | Note Markdown renders raw HTML via `rehype-raw`, unsanitised; stored XSS reaches admins | `src/pages/editor-page/canvas/note-node/note-node.tsx:200` | Add `rehype-sanitize` after `rehype-raw`, or drop `rehype-raw` |
| SEC-001 | High | No rate limit or lockout on `/auth/login`, `/auth/register`, `/auth/change-password` | `server/src/auth/routes.ts:92` | Add per-IP and per-email rate limit to auth routes |
| SEC-004 | Med | Any signed-in user can open DB connections via `/introspect`, no project role | `server/src/introspect/routes.ts:132` | Require project writer role for inline connections |
| SEC-005 | Med | Session cookie has no `secure` flag | `server/src/auth/routes.ts:44` | Set `secure` behind HTTPS via a config flag |
| SEC-006 | Med | Login skips argon2 for unknown emails; timing reveals registered accounts | `server/src/auth/routes.ts:99` | Verify against a dummy hash when the user is missing |
| SEC-007 | Med | No CSP, `X-Frame-Options` or `nosniff` headers from nginx or Fastify | `default.conf.template:1` | Add security headers in nginx and the server |
| SEC-008 | Med | Compose defaults the DB password and `change-me` secret; ports bind all interfaces | `docker-compose.yml:7` | Bind ports to `127.0.0.1`; require secrets in `.env` |
| SEC-009 | Med | Audit log omits sign-in, failed sign-in, own password change, saved-connection changes | `server/src/audit/audit.ts:4` | Add actions; emit them from auth and connection routes |
| SEC-017 | Med | Editor can repoint a saved connection's host and receive its stored password | `server/src/introspect/routes.ts:376` | Require password re-entry when host, port or dialect changes |
| SEC-020 | Med | Logout leaves the previous user's local diagram copies and id maps | `src/context/qubdi-context/qubdi-provider.tsx:73` | Clear Dexie diagrams and `qubdidb.*` keys on logout |
| SEC-012 | Low | `SESSION_SECRET` defaults to a known value and signs nothing | `server/src/config.ts:64` | Delete the setting, or fail startup when unset |
| SEC-013 | Low | Server image runs as root | `server/Dockerfile:15` | Add `USER node` |
| SEC-014 | Low | Google Fonts request leaks visitor IPs; README claims no external services | `index.html:9` | Self-host the fonts |
| SEC-015 | Low | Net guard classifies 6to4, Teredo and `::a.b.c.d` IPv6 as public | `server/src/introspect/net-guard.ts:102` | Classify `2002::/16`, `2001::/32`, `::/96` as reserved |
| SEC-018 | Low | Concurrent first-run `/auth/register` calls can create several admins | `server/src/auth/routes.ts:60` | Count and insert under an advisory lock |
| SEC-019 | Low | Error handler returns raw `err.message` for 5xx statuses other than 500 | `server/src/app.ts:98` | Hide the message for every status >= 500 |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-012 | Med | Images on EOL Node 25; CI, `.nvmrc`, `engines` and README say 24 | `Dockerfile:1` | Return both images to `node:24-alpine`; ignore odd Node majors |
| REPO-008 | Med | No `CODEOWNERS` file | `.github/` | Add `.github/CODEOWNERS` with the maintainers' GitHub handle |
| REPO-017 | Med | `framer-motion`, `timeago.js`, `@dnd-kit/core`, `@dnd-kit/utilities` imported but undeclared | `src/components/tree-view/tree-view.tsx:8` | Declare the four packages in `package.json` |
| REPO-019 | Med | Compose passes 6 of 19 server settings; `TRUST_PROXY`, `LOG_LEVEL` unreachable | `docker-compose.yml:26` | Pass the remaining server env vars through |
| REPO-020 | Med | Publish runs on any `v*` tag with no tests or CI gate | `.github/workflows/publish.yaml:3` | Run tests or require CI success before pushing images |
| REPO-011 | Low | GitHub star iframe from `ghbtns.com` contradicts README; leaks visitor IPs | `src/pages/templates-page/templates-page.tsx:49` | Remove the iframe |
| REPO-016 | Low | Monaco pins `dompurify` 3.4.15 with a low XSS advisory; CI gates only critical | `package.json:60` | Override `dompurify` to a fixed release; gate CI audit at high |
| REPO-018 | Low | `@radix-ui/react-collapsible`, `@uidotdev/usehooks`, `motion`, `timeago-react` never imported | `package.json:30` | Remove the four dependencies |
| REPO-021 | Low | UI publish job grants unused `id-token: write` | `.github/workflows/publish.yaml:18` | Remove `id-token: write` |
| REPO-022 | Low | CONTRIBUTING has a Discord invite and a broken Email link | `CONTRIBUTING.md:21` | Remove the Discord link; fix the Email link |
| REPO-023 | Low | `.env.example` omits `VITE_*` keys and `LINT_RATE_LIMIT`, `OUTBOUND_RATE_LIMIT` | `server/src/config.ts:69` | Document the keys, or delete the dead ones |
| REPO-024 | Low | Node 22 drift in server `@types/node` and the build-tasks doc | `server/package.json:34` | Bump `@types/node` to ^24; update the doc |
| REPO-025 | Low | Empty CLA allowlist fails Dependabot PRs | `.github/workflows/cla.yaml:33` | Allowlist `dependabot[bot]` |
| REPO-026 | Low | `tailwindcss-animate` in dependencies pulls Tailwind into the production audit | `package.json:77` | Move `tailwindcss-animate` to devDependencies |
| REPO-027 | Low | Container images pinned by tag; compose images outside Dependabot | `docker-compose.yml:4` | Pin digests; add compose images to Dependabot |
| REPO-028 | Low | Pre-commit hook lints only the editor, not the server | `.husky/pre-commit:2` | Also run server lint in the hook |
| REPO-029 | Low | CI lints the editor twice (Lint step and `build` script) | `.github/workflows/ci.yaml:27` | Drop one of the two lint runs |
| REPO-030 | Low | Root vitest `exclude` replaces the defaults | `vitest.config.ts:14` | Spread `configDefaults.exclude` into `exclude` |
| REPO-032 | Low | TODO lists a removed `CommentMarker`; finished workspace URLs still "In progress" | `TODO.md:699` | Drop the stale leftover; mark the section done |
| REPO-033 | Low | `drizzle-kit` pulls old esbuild: 4 moderate dev advisories in `server/` | `server/package.json:36` | Override nested esbuild to >= 0.25, or upgrade `drizzle-kit` |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SRV-020 | Med | Async SSE listeners reject unhandled on a DB error and exit the process | `server/src/share/routes.ts:367` | Wrap listener bodies in try/catch |
| SRV-021 | Med | Every save reads the full latest snapshot and returns the full content | `server/src/diagrams/service.ts:16` | Select snapshot metadata only; drop `content` from the PUT reply |
| SRV-022 | Med | `GET /diagrams` is unpaged and loads full snapshot content for viewer stats | `server/src/diagrams/routes.ts:96` | Page the list; compute viewer stats in SQL |
| SRV-023 | Med | `drift_reports` has no retention; the report list loads full `jsonb` | `server/src/maintenance.ts:53` | Prune old drift reports per diagram in `runMaintenance` |
| SRV-024 | Med | Rate limits, SSE caps and drift guard are per process; undocumented | `server/src/lib/rate-key.ts:43` | Document single-process deployment, or move state to Postgres |
| SRV-031 | Med | Editor comment CRUD routes still registered and writable; no client calls them | `server/src/comments/routes.ts:133` | Unregister editor comment routes; keep the public viewer read |
| SRV-025 | Low | Check-then-insert on unique names returns 500 when two requests race | `server/src/admin/routes.ts:259` | Map unique violation `23505` to 409 |
| SRV-026 | Low | Audit purge is one unbatched DELETE returning every deleted id | `server/src/maintenance.ts:27` | Delete in batches; return the row count only |
| SRV-027 | Low | Editor share-link revoke can write the audit row twice | `server/src/share/routes.ts:171` | Add `isNull(revokedAt)` to the UPDATE; audit only on change |
| SRV-028 | Low | Overview counts distinct diagram ids over every snapshot on each load | `server/src/admin/stats.ts:105` | Count with `exists` per diagram |
| SRV-029 | Low | Lint routes load the full diagram row to read `lintConfig` | `server/src/lint/routes.ts:68` | Select `lintConfig` only; `content` only when needed |
| SRV-030 | Low | Editor share-link list uncapped; expired locks and dead links never purged | `server/src/share/routes.ts:102` | Cap the list; purge expired locks and dead links |
| SRV-032 | Low | Version-history and drift-list endpoints have no client | `server/src/diagrams/routes.ts:345` | Remove them, or wire them to a UI |
| SRV-033 | Low | No test covers the maintenance stop or SIGTERM shutdown | `server/src/server.ts:34` | Test `startMaintenance` stop and the shutdown path |

### Client

None open.

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|
| SEC-002 | Security & secrets | `/config.js` served `OPENAI_API_KEY` to every visitor; AI feature removed |
| SEC-003 | Security & secrets | `VITE_OPENAI_API_KEY` baked into the JS bundle; build args removed |
| SEC-010 | Security & secrets | Audit rows had no target id; `meta` now carries project, user and link ids |
| SEC-011 | Security & secrets | Cross-dialect SQL export sent the schema to an external LLM; AI export removed |
| REPO-001 | Repository | CI never built or tested `server/`; now lint, typecheck, build and tests on Postgres |
| REPO-002 | Repository | `.dockerignore` let `server/node_modules` and `server/.env` into images; patterns match at any depth |
| REPO-003 | Repository | ESLint ignored `server/`; it now has its own config and `npm run lint` |
| REPO-004 | Repository | Publish workflow built only the UI image; it now also pushes the server image |
| REPO-005 | Repository | 6 high braces advisories in the Tailwind 3 toolchain; migrated to Tailwind 4 |
| REPO-006 | Repository | Server `drizzle-orm` high advisory; upgraded to 0.45.4, vitest to 5 |
| REPO-007 | Repository | Workflow actions pinned to mutable tags; all pinned to full commit SHAs |
| REPO-009 | Repository | CI ran no `npm audit`, secret scan or Docker build; all three added |
| REPO-010 | Repository | README and configs listed a missing `OLD/` folder; removed |
| REPO-013 | Repository | Placeholder `public/sitemap.xml` while robots blocks all; sitemap deleted |
| REPO-014 | Repository | Root and server versions disagreed; release-please now bumps both |
| REPO-015 | Repository | UI image baked the backend URL at build; now served at run time via `/config.js` |
| REPO-031 | Repository | `tailwind.config.js` used CommonJS; now an ES module |
| SRV-001 | Server | `PUT /diagrams/:id` was last-write-wins; a save on an older copy now gets 409 |
| SRV-002 | Server | Version fetch loaded every snapshot; now filtered in SQL |
| SRV-003 | Server | No snapshot retention; `SNAPSHOT_KEEP` prunes at publish and on a timer |
| SRV-004 | Server | 50 MB limit on every route; now 1 MiB, diagram routes keep 50 MB, content shape-checked |
| SRV-005 | Server | `/lint` ran unbounded input; now capped at 5 MiB and rate-limited per user |
| SRV-006 | Server | Introspect and drift-check routes had no limit; now one per-user allowance |
| SRV-007 | Server | Drift runs were claimed per process; scheduler removed, manual checks only |
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
| CLI-007 | Client | A 404 on save cleared the remote id and later saves failed `no_project`; the id is kept unless a project is known to re-create it |
| CLI-008 | Client | Unsent local edits were never uploaded after reload; on open the copy is compared with the server and marked pending |
| CLI-009 | Client | Keepalive size check counted UTF-16 characters; now measured in UTF-8 bytes |
| CLI-010 | Client | A 423 on save retried forever; the editor now goes read-only |
| CLI-011 | Client | API `fetch` had no timeout; every request now aborts after 30 s |
| CLI-012 | Client | Lock release raced the final keepalive save; it now waits for that save to settle |
| CLI-013 | Client | Change-password dialog now has a description; create-relationship opts out with `aria-describedby={undefined}` |
| CLI-014 | Client | Monaco worker imports for TypeScript, CSS and HTML removed (Monaco itself still emits an unused `ts.worker` file) |
| CLI-015 | Client | Vendor chunks for react, xyflow and radix; the bundle visualizer runs only with `ANALYZE=1` |
| CLI-016 | Client | Old cross-dialect PG exporter cluster and its test deleted; `escapeSQLComment` kept |
| CLI-017 | Client | Dead comments API methods and `comments-store` deleted |
| CLI-018 | Client | Members dialog is read-only; the member-write API methods are gone |
| CLI-019 | Client | Unused combobox component deleted |
| CLI-020 | Client | `applyIds` and its test deleted |
| CLI-021 | Client | Unused zod diagram-diff schemas deleted |
| CLI-022 | Client | Unread cloud and analytics flags, their Docker/nginx plumbing and `github_repo_opened` removed |
| CLI-023 | Client | The five exports named (`applyFilterOnDiagram`, `quickValidate`, `getNeighbors`, `listVersions`, `listDriftReports`) removed; the audit did not list the others |
| CLI-024 | Client | Clipboard hook test updated to the side-by-side paste offset |
| CLI-025 | Client | `flex-shrink-0` and `flex-grow` renamed to `shrink-0` and `grow` |
| CLI-026 | Client | `shadow-sm`, `rounded-sm` and `outline-none` renamed to `shadow-xs`, `rounded-xs` and `outline-hidden` |
| CLI-027 | Client | Ctrl+O opens the project list when the server is enabled |
| CLI-028 | Client | Orphaned `menu.actions.new` and `menu.actions.browse` keys deleted from every locale |

---

## Accepted

| ID | Lens | Finding | Why |
|----|------|---------|-----|
| CLI-006 | Client | 7 lint suppressions remain in app code: parser AST `any` typing, hook deps | Each has a stated reason; removing them risks behaviour |

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
| 8 | 2026-10-14 | 0 new, 12 fixed, 0 dropped; 2 findings narrowed |
| 9 | 2026-10-17 | 53 new (1 Crit, 11 dead code), 1 fixed, 1 reopened (REPO-011), 0 dropped; 6 re-anchored |
| 10 | 2026-10-17 | 6 new, 2 fixed, 1 reopened (REPO-012), 0 dropped; REPO-016 narrowed to Low; 5 re-anchored |
| 11 | 2026-10-17 | 0 new, 22 fixed (all open Client findings), 0 dropped; CLI-014 and CLI-023 fixed in part, see their rows |
