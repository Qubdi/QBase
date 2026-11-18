# QBase — Audit

**rev** 52 · **date** 2026-11-18
**method** static analysis · whole-tree read of every in-scope file changed since rev 46 plus all route files · eslint root and server (0 problems, unused-directive report clean) · tsc server 0 errors, client 9 (local `timeago.js` install drift, CLI-116) · client vitest 4108/4109 · server vitest (scratch copy) vs throwaway postgres:18-alpine `aud47-srv` 1256/1257, 15 SQL Server skipped · scratch HTTP probes vs `aud47-srv` · drizzle-kit generate diff in scratch copy (empty) · throwaway SQL Server 2025 `aud47-mssql` (live alias-type checks), throwaway postgres:18-alpine `aud47-db` seeded 20k diagrams, 60k snapshots, 200k pokes, read-only EXPLAIN · npm audit root and server (prod 0; all deps 14 and 11 high, one dev advisory) · gitleaks v8.30.1 via docker on tree, local refs and an origin mirror with pull refs · vite build into scratch · knip/depcheck absent, replaced by scratch scans in `node:24-slim` `aud47-dead` · rev 51 test pass: client vitest 4766 passed, 19 expected fail · server vitest 1406 passed, 2 expected fail, throwaway postgres:18-alpine · browser flows 142/142 in the pinned Playwright image · perf budgets 30/30 · new findings come from the `it.fails` tests and KNOWN BUG flow steps · all containers removed · no secret read
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content; `.claude/skills/` content checked for secrets and licensing only

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 5 | 0 | 0 | 42 | 0 |
| Repository | 3 | 0 | 0 | 64 | 0 |
| Server | 0 | 0 | 0 | 46 | 0 |
| Database | 0 | 0 | 0 | 23 | 1 |
| Client | 0 | 0 | 0 | 130 | 1 |
| Dead code | 0 | 0 | 0 | 45 | 0 |
| **Total** | 8 | 0 | 0 | 350 | 2 |

## Act first

None.

---

## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| SEC-001 | Med | Old SA password in 65 pull refs; old `.env.example` keys in 30 | `.gitleaks.toml:4` | Rotate both; ask GitHub to purge pull refs |
| SEC-036 | Med | Account-wide sign-in lockout checked before password; strangers lock out any account | `server/src/auth/routes.ts:223`, `server/src/auth/guards.ts:41` | Add delay instead of hard 429, or let correct password through |
| SEC-037 | Med | Stolen admin session creates or promotes an admin with no step-up | `server/src/admin/routes.ts:92`, `server/src/admin/routes.ts:389`, `server/src/admin/routes.ts:431` | Require step-up when granting isAdmin or creating an admin |
| SEC-048 | Med | Stolen admin session deletes a project and all its diagrams, no step-up | `server/src/admin/routes.ts:934` | Require `stepUp` before admin project delete |
| SEC-049 | Low | Writer picks `editorId` starting `handoff:`; its lock then refuses every poke | `server/src/diagrams/routes.ts:57`, `server/src/diagrams/poke.ts:68` | Reject `HANDOFF_PREFIX` editor ids in `editorIdSchema` |

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|
| REPO-004 | Med | Publish workflow ships images while TODO says do not publish | `TODO.md:8`, `rewrite/TODO.md:11`, `.github/workflows/publish.yaml:5` | Reconcile TODO with publish; gate publish on rewrite status |
| REPO-006 | Low | Dependabot version updates paused: all five ecosystems have limit 0 | `.github/dependabot.yml:1`, `.github/dependabot.yml:9` | Restore the limits, or record the pause as Accepted |
| REPO-022 | Low | CODEOWNERS lists a personal email, no team; single point of review | `.github/CODEOWNERS:5` | Use a verified `@org/team` owner |

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|

### Database

None.

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|

### Dead code

None.

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|
| SEC-016 | Security & secrets | `user.create` audit omits whether the new account was made admin |
| SEC-021 | Security & secrets | INTROSPECT_ALLOW_HOSTS accepts `0.0.0.0/0` and junk entries unchecked |
| SEC-025 | Security & secrets | `.gitignore` lacks key and certificate patterns (`*.pem`, `*.key`) |
| SRV-047 | Server | NUL character in a diagram title or content answers 500, not 400 |
| SRV-046 | Server | Admin project delete never tells open share streams their links died |
| SRV-045 | Server | Release tells requester `left` even when the handoff insert lost the race |
| SRV-044 | Server | Lock stream reads missed pokes only at open; a LISTEN gap loses them |
| SRV-042 | Server | Lock event streams uncapped per user; probe opened 60 for one user |
| SRV-043 | Server | Server test fails: `project.delete` audit meta now has `diagrams`, test lacks it |
| SRV-009 | Server | Default diagram body limit 50 MB blocked the event loop about 0.9 s at 40 MB; now 25 MB, set with `DIAGRAM_BODY_LIMIT_MB` |
| SRV-008 | Server | Live-viewer caps count per process; held in Postgres by `live_viewers`, shared by all replicas |
| SRV-030 | Server | SQL Server tests skip in CI: `ci.yaml` has no SQL Server service |
| SRV-038 | Server | PATCH on a revoked share link returns 200, emits event, logs `share.update` |
| SRV-039 | Server | Password reset and change commit before sessions are destroyed; failure leaves old sessions valid |
| SRV-040 | Server | Raw Drizzle errors logged outside the handler; messages embed query params |
| SRV-041 | Server | Sign-in email has no max length; it goes into a rate-counter key |
| SRV-028 | Server | SSE writes ignore backpressure; a slow viewer buffers events without bound |
| SRV-036 | Server | Shutdown awaits running maintenance before closing app; long prune hits forced exit |
| SRV-032 | Server | Deeply nested content (10 KB, depth 5000) overflows recursive stableStringify; answers 500 |
| SRV-033 | Server | Forged activity cursor with Feb 31 passes Date.parse, Postgres cast fails, 500 |
| SRV-034 | Server | mfa-reset CLI never loads server/.env; README source-checkout command fails |
| SRV-035 | Server | Lint CLI crashes with TypeError (exit 1) on nameless field or non-array tables |
| SRV-010 | Server | Share link PATCH answers too_many_links when link vanished instead of 404 |
| SRV-011 | Server | No unhandledRejection or uncaughtException handler; crash skips graceful shutdown |
| SRV-012 | Server | /health answers ok without touching the database |
| SRV-013 | Server | Unpaged lists: members, one project's diagrams, admin members, saved connections |
| SRV-014 | Server | Save-audit throttle is check-then-insert; concurrent saves write duplicate rows |
| SRV-015 | Server | MFA enable replaces codes and sets enabled_at in separate statements |
| SRV-016 | Server | Drift webhook sent before report insert; insert failure resends next check |
| SRV-017 | Server | Introspection connection errors and UnsafeSqlError are replied without being logged |
| SRV-018 | Server | Drift dismiss writes audit row even when nothing was dismissed |
| SRV-022 | Server | Same quadratic `(\[\])+$` on type text returned by remote database |
| SRV-024 | Server | SESSION_DAYS has no maximum; large value makes expiry Invalid Date, sign-in 500s |
| SRV-027 | Server | Lint-config GET and PUT have no rate limit unlike /lint |
| SRV-029 | Server | Session end deletes sessions and locks in separate statements, not one transaction |
| REPO-083 | Repository | README never mentions the tracked `.claude/skills/` and `design/` folders |
| REPO-082 | Repository | TODO says four React Compiler rules are off; eslint has them on |
| REPO-081 | Repository | Dev advisory GHSA-fc5q-39xc-vjpf (picomatch) unseen; CI audits prod only |
| REPO-080 | Repository | 34 of 36 commits since 2026-11-14 not Conventional; release-please skips them |
| REPO-074 | Repository | Publish pushes to Docker Hub and GHCR with no environment gate or main-ancestry check |
| REPO-070 | Repository | Full-history gitleaks fails: two test keys missing from `.gitleaksignore` |
| REPO-071 | Repository | Dependabot header says npm updates paused; both entries have limit 5 |
| REPO-072 | Repository | `INTROSPECT_ALLOW_PRIVILEGED` read outside `config.ts`, absent from compose and `.env.example` |
| REPO-073 | Repository | `WEB_DIR` read in `config.ts` but absent from `server/.env.example` |
| REPO-075 | Repository | CI builds the image but never starts it or checks `/health` |
| REPO-076 | Repository | Published images are not signed or vulnerability-scanned; only provenance and SBOM |
| REPO-039 | Repository | PLAN says branch does not build; TODO says build, lint, tests pass |
| REPO-041 | Repository | e2e visual scripts hard-code `/home/qubdi/ui-reference` output path |
| REPO-042 | Repository | Committed briefs and specs embed an absolute personal home path |
| REPO-043 | Repository | run-new.sh waits a fixed 4 s for vite preview instead of polling |
| REPO-044 | Repository | `.dockerignore` omits rewrite/, tools/, server/load; 1.7 MB enters build context |
| REPO-045 | Repository | licences.mjs treats any parenthesised licence expression as permissive |
| REPO-046 | Repository | package.json lacks repository, bugs and homepage fields |
| REPO-048 | Repository | `server/load` scripts ignored by both eslint configs; never linted |
| REPO-049 | Repository | Eslint comment cites TODO.md for React Compiler migration; TODO.md lists none |
| REPO-050 | Repository | Dockerfile says .dockerignore drops tests; 74 co-located `*.test.ts(x)` still copied |
| REPO-051 | Repository | Licence inventory marks runtime dep `@fastify/static` NOT INSTALLED, unreviewed |
| REPO-052 | Repository | NOTICE limits ChartDB content to allow-list; 22 copied logo PNGs not listed |
| REPO-053 | Repository | Docs say other test DB credentials fail; TEST_PG_USER and TEST_PG_PASSWORD override them |
| REPO-054 | Repository | Load compose always passes VUS=50, DURATION=2m; script defaults and README disagree |
| REPO-055 | Repository | Load README cites README section "Run one server process"; no such section |
| REPO-056 | Repository | index.html says container writes config.js at start; server answers it per request |
| REPO-057 | Repository | run-server-flows reuses any existing `qbtest-app` image, testing stale code |
| REPO-058 | Repository | `.env.example` says remove db service from compose; README uses `--no-deps app` |
| REPO-020 | Repository | Workflows set no `timeout-minutes` or `concurrency` |
| REPO-021 | Repository | Publish does not check tag matches package.json version |
| REPO-023 | Repository | `.gitignore` carries unused Next, Nuxt, Gatsby, vuepress, Firebase entries |
| REPO-024 | Repository | `.prettierrc.json` closing brace indented 2 spaces; `.editorconfig` says 4 |
| REPO-025 | Repository | e2e tools in `tools/e2e` run in no workflow and appear in no doc |
| REPO-029 | Repository | Postgres digest check passes when one file has no pin at all |
| REPO-030 | Repository | Missing `--rewritten` or `--allow` file or path is silently ignored |
| REPO-031 | Repository | Empty upstream index still reports "No checked file is over the limits" |
| REPO-032 | Repository | Non-numeric `--threshold`, `--max-run`, `--run` become NaN and checks pass |
| REPO-033 | Repository | owner-decisions links `spec/...` resolve to rewrite/spec/spec/ and break |
| REPO-034 | Repository | TODO says EDT-250 is open; parity checklist ticks it, browser-driven |
| REPO-035 | Repository | TODO says seven languages ship; only en, de, fr, it, ru exist |
| REPO-036 | Repository | Rewrite docs cite audit IDs REPO-005, REPO-069, REPO-045 that now mean other things |
| REPO-037 | Repository | TODO forbids changing licence while Elastic-2.0 is already applied |
| REPO-038 | Repository | NOTICE and allow-list name separator.tsx, which no longer exists |
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
| REPO-001 | Repository | `bootstrap-sha` commit is not an ancestor of main |
| REPO-002 | Repository | `latest` tag moves on every `v*` tag, including prereleases |
| REPO-003 | Repository | Similarity check runs only on `rewrite/clean-room`, never on main |
| REPO-005 | Repository | CI gitleaks v8.30.1 fails on main: share-token test key fingerprints not ignored |
| REPO-013 | Repository | Playwright npm package installed at run time without a lockfile |
| REPO-015 | Repository | 1.1 MB `audit-ui-differences.html` tracked, not an owned audit file |
| REPO-027 | Repository | Load run.sh never fails on a k6 threshold; README says it gates CI |
| REPO-028 | Repository | README feature line says only a share-token hash is stored; code also encrypts token |
| REPO-059 | Repository | CI tests only PostgreSQL 18, though README says 16 or newer |
| DB-006 | Database | SQL Server alias types arrive as column domain; metadata format has no custom-type slot |
| DB-025 | Database | Diagram insert racing admin project delete hits restrict FK; answers 500 |
| DB-009 | Database | Audit rows are written after, not inside, the transaction of the change |
| DB-001 | Database | Snapshot and drift prune deletes are unbatched; a big backlog hits the 120s timeout |
| DB-002 | Database | Viewer list reads each snapshot's full jsonb for five stats; snapshots lack stored stat columns |
| DB-003 | Database | Size checks serialise whole jsonb with `octet_length(content::text)`; 50 MB costs about 0.8 s |
| DB-007 | Database | Five FKs lack an index; diagram_locks.user_id is scanned on every sign-in and sign-out |
| DB-012 | Database | Generated stat columns re-parse whole jsonb on every content autosave |
| DB-021 | Database | Drift check holds a pooled connection for its whole run; 10 concurrent checks starve the pool |
| DB-004 | Database | SQL Server index query returns columnstore, XML and spatial indexes; verified against SQL Server 2025 |
| DB-019 | Database | SQL Server collation returned only when it differs from the default; verified against SQL Server 2025 |
| DB-022 | Database | Migration tests end the pool with no error listener, then drop DB with force; 57P01 unhandled |
| DB-023 | Database | Activity group filter with cursor walks `audit_log_at_id_idx`: 144 ms, 100k rows filtered |
| DB-024 | Database | Stats backfill selects null stat rows with no index; seq-scans 503k snapshots hourly |
| DB-008 | Database | One pending MFA ticket per account is not enforced; concurrent logins leave two |
| DB-010 | Database | Backups section omits saving CONNECTION_KEY and SECRETS_KEY with the dump |
| DB-011 | Database | View definition spliced unquoted into CREATE VIEW; odd schema or view names break the text |
| DB-014 | Database | Migration 0015 rewrites audit_log under exclusive lock to widen id to bigint |
| DB-015 | Database | FK query lacks `conparentid = 0`; FKs to partitioned tables repeat per partition |
| DB-016 | Database | Recovery-code renewals unserialised; concurrent renews leave both code sets valid |
| DB-017 | Database | Postgres introspection skips foreign tables; SQL Server lists external tables |
| DB-018 | Database | Materialized views reported as plain views; definition rebuilt as CREATE VIEW |
| DB-020 | Database | Index query keeps invalid indexes (failed CONCURRENTLY builds) as real ones |
| CLI-138 | Client | Orphan-table lint rule scans every relationship once per table |
| CLI-137 | Client | Cross-dialect SQL export is O(n²): 455 ms at 4000 tables |
| CLI-136 | Client | File uploader nests an `<input>` inside a `<button>`; invalid HTML |
| CLI-135 | Client | Database cards ignore arrow keys; every card is its own Tab stop |
| CLI-134 | Client | Lint findings and rule text not translated in de, fr, it, ru |
| CLI-133 | Client | Table picker lists a blank schema, same value as All schemas |
| CLI-132 | Client | Patching `generatedStored` alone wipes the computed column expression |
| CLI-131 | Client | Long shell flags such as `--no-data` coloured as comments |
| CLI-130 | Client | Round trip drops a named single-column unique index |
| CLI-128 | Client | Quoted commas and backslashes in PostgreSQL array defaults mis-split on conversion |
| CLI-127 | Client | `text ARRAY` imports as type "text array", not an array |
| CLI-125 | Client | Unterminated `[name` gives a misleading skipped-statement warning, no error |
| CLI-124 | Client | SQL Server `]]` escape in a name reported as unclosed parenthesis |
| CLI-115 | Client | Poke request dialog title drops requester name during close animation |
| CLI-114 | Client | Admin nav scroll test asserts synchronously; fails in full parallel run |
| CLI-113 | Client | Toggle buttons flip `aria-label` while also setting `aria-pressed` |
| CLI-129 | Client | MySQL backslash-escaped default blocks the MySQL export |
| CLI-126 | Client | MySQL `CONSTRAINT x KEY idx (...)` loses the constraint or its columns |
| CLI-123 | Client | MySQL double-quoted string refused as unterminated text |
| CLI-122 | Client | PostgreSQL E-string with an escaped quote refused as unterminated |
| CLI-121 | Client | Dollar tag with a digit not recognised; function body imported as real tables |
| CLI-120 | Client | SQL Server `GO <count>` silently drops the next batch |
| CLI-119 | Client | Nested block comment drops the next table; validator still counts it |
| CLI-118 | Client | pg_dump COPY row with an apostrophe blocks the whole SQL import |
| CLI-117 | Client | Local autosave loses edits made in the last second before a reload or tab close |
| CLI-112 | Client | Taken banner status region re-announces its countdown every second |
| CLI-019 | Client | Four bare `exhaustive-deps` disables give no reason |
| CLI-110 | Client | Navbar publish, account, drift, lint and all `qubdi.*` screens show English in de, fr, it, ru |
| CLI-111 | Client | Locale parity test skips `qubdi.*`, so missing translations pass CI |
| CLI-103 | Client | Failed autosave (5xx, 429, network) never retries without a new edit |
| CLI-106 | Client | Qubdi UI keys (907 of 1586) are English-only in de, fr, it, ru; documented in README |
| CLI-109 | Client | DBML import is superlinear in `@dbml/core` Parser.parse; text over 2 MB refused |
| CLI-102 | Client | `INVALID_JSON_MESSAGE` has no diagnostic rule or i18n key; shown English-only |
| CLI-104 | Client | Viewer puts unvalidated table colour into a CSS `backgroundImage` string |
| CLI-105 | Client | `clearRemoteId` leaves sync-state behind; connection details linger in localStorage |
| CLI-107 | Client | `readJsonMap` accepts arrays and inherits `Object.prototype` on lookup |
| CLI-108 | Client | Share dialog saves the diagram captured at render, after awaiting the flush |
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
| DEAD-046 | Dead code | Two relative-time setups: timeago lang files beside i18n `ago.*` words |
| DEAD-045 | Dead code | Exports used only by tests: `initialFilter`, `defaultIntrospectorFactory` |
| DEAD-044 | Dead code | Lock-events SSE handshake duplicates the share SSE handshake |
| DEAD-043 | Dead code | Error text for four codes the server never sends, in five locales |
| DEAD-037 | Dead code | JSON-map localStorage reader still copied beside shared `readJsonMap` |
| DEAD-042 | Dead code | `isCurrentFormat` exported; zero references in src, server, shared, tools, CI |
| DEAD-022 | Dead code | Unused en keys: canvas.entity openInPanel, narrow; region.colour; memo.colour; clipboard.failed |
| DEAD-023 | Dead code | `qubdi.workspace.typeLegend` block unused; type legend reads `canvas.legend` |
| DEAD-028 | Dead code | `postcss` devDependency redundant; `@tailwindcss/postcss` already depends on it, no import |
| DEAD-035 | Dead code | Server tsconfig `@/*` path alias unused; no server file imports `@/` |
| DEAD-036 | Dead code | Root `preview` script has no caller; e2e tools run `npx vite preview` |
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
| DEAD-001 | Dead code | `VITE_HOST_URL`, `VITE_APP_URL` baked at build, no reader; README claims they work |
| DEAD-002 | Dead code | `qubdi.viewerPage.pageTitle` missing from en; title shows raw key, test asserts same key |
| DEAD-007 | Dead code | Unused en key `menu.actions.save`; read only by i18n tests |
| DEAD-011 | Dead code | Exports referenced only by tests; production-dead |
| DEAD-025 | Dead code | `GET /diagrams/:id/versions` and `/versions/:version` have no client caller; now documented as public API |
| DEAD-026 | Dead code | `GET /:id/drift/reports` list has no client caller; now documented as public API |
| DEAD-027 | Dead code | `GET /lint/rules` has no client caller and no README mention; now documented |
| DEAD-029 | Dead code | Three rewrite briefs referenced by no file or tool |
| DEAD-032 | Dead code | Unused en keys `editor.sidePanel`: common.more/rename, tables.color, fields.foreignKey, visuals.colour, hover.*, clipboard copied/pasted |
| DEAD-024 | Dead code | Test-only reset hooks exported from production modules: resetCustomColorsForTests, resetPasswordMinLength, resetToasts, forgetClipboard |
| DEAD-033 | Dead code | Unused UI component bodies: DropdownMenu SubTrigger/SubContent/CheckboxItem/RadioItem, SelectLabel/Separator, TableFooter/Caption, MenubarCheckboxItem |
| SEC-038 | Security & secrets | Rate limits and lockouts key on raw `req.ip`; no IPv6 /64 masking |
| SEC-039 | Security & secrets | Over https the plain-named session cookie is still accepted, defeating `__Host-` |
| SEC-040 | Security & secrets | Disabling or deleting a user leaves their share links live |
| SEC-041 | Security & secrets | `share.update` audit omits expiry and live changes; only access recorded |
| SEC-042 | Security & secrets | Anonymous `/auth/logout` and `/auth/setup-status` have no rate limit |
| SEC-043 | Security & secrets | Read-only guard quote scanner desyncs on `$$` and `E'\''`; multi-statement text passes |
| SEC-044 | Security & secrets | Read-only guard denylist misses side-effect and DoS functions (`set_config`, `pg_terminate_backend`) |
| SEC-045 | Security & secrets | `classifyIp` returns public for `100::/64`, `5f00::/16`, `3fff::/20`, `192.88.99.0/24` |
| SEC-046 | Security & secrets | Sealed values carry no AAD; ciphertext moves between rows and decrypts |
| SEC-047 | Security & secrets | SSE head and web-mode `/api` 404 omit HSTS and `Vary: Origin` |
| SEC-006 | Security & secrets | Fastify sets no requestTimeout or connectionTimeout (slow-body hold) |
| SEC-007 | Security & secrets | Disabled account answers 403 after correct password, confirming it |
| SEC-008 | Security & secrets | Lockout key includes address; spread guesses on one account unthrottled |
| SEC-009 | Security & secrets | MFA lockout key has no address; password holder locks victim's second step |
| SEC-017 | Security & secrets | Lockouts and MFA secret setup leave no audit row |
| SEC-020 | Security & secrets | Viewers can list every project member's email |
| SEC-028 | Security & secrets | No Strict-Transport-Security header on API or editor responses |
| SEC-029 | Security & secrets | CORS_ORIGIN unvalidated; `*` or trailing slash silently breaks credentialed requests |
| SEC-032 | Security & secrets | Webhooks reuse INTROSPECT_ALLOW_HOSTS; a database allow-list also permits internal HTTP POSTs |
| SEC-033 | Security & secrets | Webhook accepts plain `http:`; token-bearing URL and drift details sent unencrypted |
| SEC-034 | Security & secrets | API responses lack `Cache-Control: no-store`; GET share-links returns live tokens |
| SEC-002 | Security & secrets | MFA lockout never checked before enable, disable, recovery-renew code guesses |
| SEC-004 | Security & secrets | Cookie `Secure` stays off behind TLS proxy unless TRUST_PROXY is set |
| SEC-005 | Security & secrets | No rate limit on authenticated routes (50 MB saves, share, admin) |
| SEC-023 | Security & secrets | App container lacks `no-new-privileges`, `cap_drop`, `read_only` |
| SEC-026 | Security & secrets | Load stack hard-codes DB password, encryption key and admin password |
| SEC-027 | Security & secrets | Lint rate limit keyed by raw cookie at onRequest; rotating junk cookies bypasses it |
| SEC-030 | Security & secrets | Session cookie lacks `__Host-` prefix |
| SEC-003 | Security & secrets | Introspection connections default to plaintext (`ssl` false) |
| SEC-010 | Security & secrets | Unkeyed sha256 recovery-code hashes still accepted |
| SEC-011 | Security & secrets | Encryption keys accept any 16 characters; scrypt salt is fixed |
| SEC-012 | Security & secrets | Legacy shared-key fallback lets any purpose box open unpurposed ciphertext |
| SEC-013 | Security & secrets | Read-only guard is a denylist missing `pg_read_binary_file`, `sp_executesql`, `xp_dirtree` |
| SEC-014 | Security & secrets | SQL Server session not read-only; `readOnlyIntent` is only a routing hint |
| SEC-018 | Security & secrets | Admin can reset another admin's password and MFA with no step-up |
| SEC-019 | Security & secrets | First-run register open to any caller who reaches an empty server |
| SEC-022 | Security & secrets | Editor CSP allows inline styles (`style-src 'unsafe-inline'`) |
| SEC-024 | Security & secrets | Compose default image tag `latest`, unpinned |
| SEC-031 | Security & secrets | Driver error text and address class returned; refused, timeout, private-host answers map networks |
| SRV-037 | Server | `forceCloseConnections: true` destroys in-flight requests on shutdown, not only SSE |
| SRV-001 | Server | Auth runs in preHandler, so anonymous 50 MB bodies are read and parsed first |
| SRV-002 | Server | Error handler logs Drizzle error whose message embeds all query params |
| SRV-003 | Server | Audit insert after committed write throws, returning 500 for a done action |
| SRV-004 | Server | Link revoke/update emits live-viewer event after audit; audit failure leaves viewers connected |
| SRV-006 | Server | LISTEN connection has no TCP keepalive; a silently dropped link is never noticed |
| SRV-007 | Server | No rate limit on publish; each call stores a snapshot up to 50 MB |
| SRV-019 | Server | Publishes during a LISTEN outage are never replayed to live viewers |
| SRV-020 | Server | No test references reseal.ts, snapshot-cache.ts or server.ts |
| SRV-021 | Server | Quadratic regex on field type name hangs event loop; 100k chars takes 9 s |
| SRV-023 | Server | SSE_HEARTBEAT_SECONDS above 2147483 overflows setInterval to 1 ms ticks |
| SRV-025 | Server | pg.Client for introspection has no error listener; dropped target connection can crash process |
| SRV-026 | Server | mssql ConnectionPool for introspection has no error listener |
| SRV-031 | Server | Drift rename pairing is quadratic; 4000 vs 4000 tables blocks event loop 8 s |
| CLI-001 | Client | No error boundary or route `errorElement`; a render or chunk-load error blanks the app |
| CLI-002 | Client | Startup `api.me()` failure of any kind (timeout, 5xx) shows user as signed out |
| CLI-003 | Client | "Overwrite" conflict action swallows fetch errors; click does nothing visibly |
| CLI-020 | Client | Type-declaration regex backtracks cubically; 200 spaces take 1.5 s, 800 take 32 s |
| CLI-021 | Client | CRLF DBML skips array and check preparation because `.` stops at `\r` |
| CLI-022 | Client | DBML array and check keys use table name only; same-named tables in two schemas collide |
| CLI-023 | Client | Any `name(...)` default passes as function call; `;` and extra statements emitted verbatim |
| CLI-024 | Client | CHECK, generated and WHERE expressions written raw into DDL, no statement-break guard |
| CLI-050 | Client | Sign-in email and password inputs have placeholder only, no label |
| CLI-052 | Client | Viewer primary-key icon has no accessible name; meaning is icon-only |
| CLI-057 | Client | Dates use browser default locale, not the chosen language, despite `localeTag` |
| CLI-066 | Client | Turning on 2FA in editor refreshes user, remounts gate; one-time recovery codes vanish |
| CLI-067 | Client | Publish badge refetches full diagram content after every autosave |
| CLI-081 | Client | DBML enum with capitalised name not linked; field lower-cased into unknown type |
| CLI-082 | Client | Default text containing identity, autoincrement or nextval treated as numbering; value dropped |
| CLI-085 | Client | PostgreSQL default containing `nextval` written raw; sequence name raw in CREATE SEQUENCE |
| CLI-086 | Client | Column type name written raw into DDL by every writer |
| CLI-101 | Client | Metadata over 50 tables: new default Set each render loops onChange forever; dialog hangs |
| CLI-008 | Client | Native `window.confirm` on sign-out with unsaved changes; not a styled dialog |
| CLI-012 | Client | Diagnostics matched by English message text, not code |
| CLI-013 | Client | Server `detail` text shown raw, bypasses i18n |
| CLI-015 | Client | Favicon is empty `data:,`; no app icon in tabs |
| CLI-018 | Client | No tests import `ProjectCreateDialog`, `NewProjectDialog`, `ProjectSettings` |
| CLI-025 | Client | Index conversion keeps fulltext, spatial, gin without checking column types; DDL fails |
| CLI-026 | Client | Removed-diagram guard lives in one tab; another tab's autosave rewrites the deleted diagram |
| CLI-027 | Client | `save` clears removed flag, so an in-flight autosave resurrects a just-deleted diagram |
| CLI-028 | Client | Layout probe loop scans placed boxes per step; 2000-link hub import takes 7.5 s |
| CLI-045 | Client | Every edit serialises the whole design before section reuse check |
| CLI-054 | Client | Viewer header brand name is hard-coded English |
| CLI-065 | Client | Test waits a fixed 50 ms for a save that must not happen |
| CLI-068 | Client | Editor chunk 2.87 MB (561 kB gzip) bundles full all-dialect node-sql-parser; now 752 kB |
| CLI-071 | Client | No `supportedLngs`; unsupported browser language sets `<html lang>` over English text |
| CLI-087 | Client | MySQL writer keeps quoted defaults verbatim; a backslash escapes the closing quote |
| CLI-093 | Client | Column collation imported and saved but no SQL writer emits it (Oracle writer not covered) |
| CLI-005 | Client | Final-save keepalive silently dropped above 60 KB; larger diagrams rely on beforeunload prompt only |
| CLI-006 | Client | API responses cast `as T`, never validated at runtime |
| CLI-007 | Client | Four React Compiler hook rules disabled repo-wide; refs written during render (one line-level disable remains in `diagram-canvas.tsx`) |
| CLI-039 | Client | Metadata import names primary key after any unique index on same columns |
| CLI-069 | Client | DBML chunk 15.6 MB (2.75 MB gzip) fetched on first DBML view; now 484 kB |

---

## Accepted

| ID | Lens | Finding | Why |
|----|------|---------|-----|
| DB-013 | Database | Migrations build audit_log indexes without CONCURRENTLY, blocking audit writes | Applied migrations cannot be edited; the one-off lock is documented in README under DB-014 |
| CLI-139 | Client | Every part edit copies the whole columns map; 2 ms at 1000 tables | Immutable `Record` maps must be copied per edit; a fix needs a persistent map or per-table split of `Design`, not worth it at 2 ms |
---

## Dropped

| ID | Finding | Reason |
|----|---------|--------|
| REPO-026 | Husky pre-commit skips server lint silently when server deps absent | Wrong: the hook prints a skip notice, and CI runs the server lint |
| CLI-061 | Share and 2FA copy bypass `copyText`; no unsupported-clipboard message | Wrong: both catch a missing clipboard and show a tailored copy-failed message |
| CLI-063 | `plural` helper in overview.ts has no production caller, English-only suffix | Dead code; moved to DEAD-031 |
| REPO-007 | Gitleaks config cites SEC-001 which does not exist at rev 0 | SEC-001 now exists; reference valid |
| SEC-015 | Audit row written after commit, outside the action's transaction | Duplicate of DB-009 |
| SRV-005 | MFA disable, enable and recovery renew never check the mfa lockout key | Duplicate of SEC-002 |
| DEAD-012 | `similarity.yaml` triggers only on `rewrite/clean-room`; never runs on main | Duplicate of REPO-003 |
| DB-005 | SQL Server introspection has no database-level read-only guard; only the text check | Duplicate of SEC-014 |
| SEC-035 | Gitleaks flags two TOTP test secrets in two-factor test | CI-pinned gitleaks v8.30.1 does not flag them |
| REPO-047 | Gitleaks flags two-factor test lines; secret scan fails | CI-pinned gitleaks v8.30.1 does not flag them; root cause is REPO-005 |
| CLI-116 | `timeago.js` range `^4.0.2` admits 4.3.0, whose exports break tsc | Local install gap: node_modules has 4.3.0, lockfile pins 4.0.2 |
| CLI-004 | Vitest: 4 files fail, `fake-indexeddb` declared but missing from node_modules; tsc reports 4 errors | Local install gap, not a repo defect |
| REPO-077 | Vendored skill doc adds two gitleaks hits; CI and publish secret scans fail | Removed from the audit at the owner's request; not fixed |
| REPO-078 | NOTICE omits vendored third-party skills and their MIT and Apache-2.0 licences | Removed from the audit at the owner's request; not fixed |
| REPO-079 | Five vendored skills carry no licence text or source | Removed from the audit at the owner's request; not fixed |

---

## Database scale check

Rows up to Stock Postgres from an earlier pass; last three measured in rev 47 on `aud47-db`.

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
| Rev 47 seed | users 2k · projects 500 · diagrams 20k · snapshots 60k · locks 3k · pokes 200.5k |
| Poke cooldown lookup, 200k pokes | Index Only Scan Backward · 0.08 ms |
| Admin project list, name sort, offset 480 | Incremental sort on index · 5.5 ms |

### Verified fine

| Area | Result | Where |
|------|--------|-------|
| Schema vs migrations | drizzle-kit empty diff; journal 0 to 31 ordered, no gaps | `server/src/db/migrations/meta/_journal.json` |
| Boot migration lock | Session advisory lock, lock_timeout retry, 2-connection pool | `server/src/db/client.ts:111` |
| FK ON DELETE | Every FK states cascade, restrict or set null | `server/src/db/schema.ts:205` |
| Check-then-write | Unique index or lock backs each: email, project, connection, snapshot version, share cap, one pending poke | `server/src/diagrams/service.ts:218` |
| Autosave | Compare-and-write in one UPDATE; content not returned | `server/src/diagrams/routes.ts:396` |
| Lists | Paged, offset capped, content never selected; admin project sorts tie-break on id | `server/src/diagrams/routes.ts:134` |
| Audit reads | Keyset cursor, indexed filters, name lookups by PK | `server/src/audit/activity.ts:140` |
| Audit retention | Batched 5000, indexed on `at` | `server/src/maintenance.ts:71` |
| Pool | max 10 plus 1 listener vs max_connections 200; statement and idle-in-tx timeouts | `server/src/db/client.ts:22` |
| Postgres introspection | READ ONLY transaction, SET LOCAL timeout, 64 MB byte cap, pinned address | `server/src/introspect/postgres.ts:162` |
| Read-only guard | Single SELECT/WITH, denylist after stripping literals | `server/src/introspect/readonly-guard.ts:102` |
| FK coverage | 23 FKs, each indexed and with explicit ON DELETE; 0031 adds 3 cascade FKs | `server/src/db/migrations/0031_lock_pokes.sql:17` |
| Poke and viewer retention | Hourly job, advisory lock; pokes kept 1 day, live viewers by expiry index | `server/src/maintenance.ts:70` |
| Postgres image and backups | Digest-pinned in compose and CI; dump and restore documented | `docker-compose.yml:15` |

---

## Changelog

| Rev | Date | Change |
|-----|------|--------|
| 52 | 2026-11-18 | 32 fixed and 1 accepted, no new findings. Client lens: CLI-019, 112 to 115 and 117 to 138 fixed (autosave flush on page leave, lint text translated, SQL reader and writer round trips, lexer and validator quoting, accessibility labels and live regions); CLI-139 accepted as won't-fix (the columns map copy is 2 ms at 1000 tables, a fix needs a persistent map). Server lens: SRV-042 (per-user cap on lock streams, `SSE_MAX_LOCK_PER_USER`), SRV-044, 045, 046, 047 fixed. Each fix has a test, and the matching `it.fails` markers became real tests; 17 open, 0 Crit, 0 High; anchors not remapped |
| 51 | 2026-11-18 | 24 new (CLI-117 to 139: SQL and DBML import, export and highlight defects, local autosave loses the last second of edits, lint text untranslated, cross-dialect export O(n²); SRV-047: NUL in text answers 500); about 700 tests added, known bugs kept as `it.fails`; 50 open, 0 Crit, 0 High; anchors not remapped |
| 50 | 2026-11-18 | 1 fixed (DB-006: alias type is a third custom-type kind with a base type; listed by the SQL Server introspection and both hand-run scripts, carried in the diagram file and shown in the Custom Types panel; verified against throwaway SQL Server 2025 `aud47-mssql`, server suite 1331 passed, client suite 4178 passed); database lens has no open findings; 26 open, 0 Crit, 0 High; anchors not remapped |
| 49 | 2026-11-18 | 3 fixed (DB-009, DB-025: admin project delete locks the project row and writes its audit row inside the transaction, a missing project answers 404, two tests added; SRV-043: audit-meta test expects the diagram count); DB-006 left (needs a third user-type kind in the model and file format); 27 open, 0 Crit, 0 High; anchors not remapped |
| 48 | 2026-11-18 | 4 fixed (dead code lens: DEAD-043 four unused account error texts removed; DEAD-044 one `openEventStream` helper for the lock and share streams; DEAD-045 test-only exports moved into test helpers; DEAD-046 save time uses `ago()`, `words-function.ts` removed); export and import round-trip tests added in `src/formats/export-import-cases.test.ts`; dead code lens has no open findings; 30 open, 0 Crit, 0 High; anchors not remapped |
| 47 | 2026-11-18 | Deep sweep of the lock-poke feature, admin project delete, client rework and vendored skills: 23 new (SEC-048, 049; REPO-077 to 083; SRV-042 to 046; DB-025; CLI-112 to 115; DEAD-043 to 046), 3 regressed (DB-009, CLI-019, REPO-006), 1 dropped (CLI-116), SEC-001 narrowed to pull refs; DB-001, 002, 003, 007, 012 moved from Accepted to Fixed where rev 32 put them; stray table fragment removed; 34 open, 0 Crit, 0 High; anchors remapped for open rows |
| 46 | 2026-11-13 | 2 fixed (CLI-110: all `qubdi.*` text translated into de, fr, it, ru, in `src/i18n/qubdi-locales/`; CLI-111: parity test now covers `qubdi.*`); client lens has no open findings; 8 open, 0 Crit, 0 High; anchors not remapped |
| 45 | 2026-11-13 | 2 new (CLI-110: `qubdi.*` text and the navbar right side are English in de, fr, it, ru, supersedes the README note of CLI-106; CLI-111: parity test skips `qubdi.*`); 10 open, 0 Crit, 0 High; anchors not remapped |
| 44 | 2026-11-10 | 1 fixed (SRV-009: default diagram body limit 50 MB to 25 MB, set with `DIAGRAM_BODY_LIMIT_MB` in .env; blocking at the cap about 0.5 s instead of 0.9 s at 40 MB; a worker thread measured no better); server lens has no open findings; 8 open, 0 Crit, 0 High; anchors not remapped |
| 43 | 2026-11-10 | 1 fixed (SRV-008: live-viewer caps held in Postgres, table `live_viewers`, migration 0030, renewed on each heartbeat); SRV-009 re-measured (see its row): 40 MB body parses in 285 ms on the main thread and a worker hands the object back at 311 ms, so a worker does not help; 9 open, 0 Crit, 0 High; anchors not remapped |
| 42 | 2026-11-10 | 3 fixed (CLI-103: failed autosave retries with capped backoff and jitter, honours Retry-After; CLI-109: DBML text over 2 MB refused; CLI-106: English-only server screens documented in README); client lens has no open findings; 10 open, 0 Crit, 0 High; anchors not remapped |
| 41 | 2026-11-10 | 4 fixed (DB-004, DB-019: SQL Server introspect tests run against SQL Server 2025, 15 of 15 pass; all-schemas filter no longer runs OPENJSON on an empty string; DB-021: at most 3 drift checks at once, a fourth answers 429; SRV-030: SQL Server job added to CI); DB-006 left (metadata format change); 13 open, 0 Crit, 0 High; anchors not remapped |
| 40 | 2026-11-10 | 4 fixed (server low batch: SRV-038, 039, 040, 041); SRV-030 left (SQL Server CI); 17 open, 0 Crit, 0 High; anchors not remapped |
| 39 | 2026-11-10 | 3 fixed (database low batch: DB-022, 023, 024; one migration, 0029); DB-006 and DB-019 left (metadata format change; SQL Server CI); 21 open, 0 Crit, 0 High; anchors not remapped |
| 38 | 2026-11-10 | 5 fixed (client low batch: CLI-102, 104, 105, 107, 108); CLI-109 re-attributed to `@dbml/core` Parser.parse; CLI-106 left (907 keys to translate); 24 open, 0 Crit, 0 High; anchors not remapped |
| 37 | 2026-11-10 | 2 fixed (dead code lens: DEAD-037, DEAD-042); 29 open, 0 Crit, 0 High; anchors not remapped |
| 36 | 2026-11-10 | 5 fixed (repository low batch: REPO-071, 072, 073, 075, 076; REPO-022 needs a team name from the org); 31 open, 0 Crit, 0 High; anchors not remapped |
| 35 | 2026-11-10 | 10 fixed (security low batch: SEC-038 to 047); 36 open, 0 Crit, 0 High; anchors not remapped |
| 34 | 2026-11-10 | 34 new (SEC-036 to 047, REPO-070 to 076, SRV-038 to 041, DB-021 to 024, CLI-103 to 109), SEC-001 widened to branch and pull refs, REPO-060 renumbered REPO-071; 46 open, 0 Crit, 0 High; npm audit clean |
| 33 | 2026-11-10 | 13 total open: 3 new (REPO-060, CLI-102, DEAD-042), 1 regressed (DEAD-037, two of four copies remain), 4 anchors remapped, about 60 Fixed rows spot-checked; migrations and `schema.ts` diff empty; npm audit and gitleaks skipped |
| 32 | 2026-11-10 | 5 fixed (database batch: DB-001, 002, 003, 007, 012), 3 narrowed (DB-004, 006, 019); anchors not remapped |
| 31 | 2026-11-10 | 13 fixed (server batch: SRV-001, 002, 003, 004, 006, 007, 019, 020, 021, 023, 025, 026, 031), 3 narrowed (SRV-008, 009, 030), 4 High cleared; anchors not remapped |
| 30 | 2026-11-10 | 10 fixed (repository batch: REPO-001, 002, 003, 005, 006, 013, 015, 027, 028, 059), 1 High cleared; anchors not remapped |
| 29 | 2026-11-10 | 11 fixed (security batch 3: SEC-003, 010, 011, 012, 013, 014, 018, 019, 022, 024, 031), SEC-001 narrowed; anchors not remapped |
| 28 | 2026-11-10 | 5 fixed (client batch 3: CLI-005, 006, 007, 039, 069); client lens has no open findings; anchors not remapped |
| 27 | 2026-11-10 | 1 fixed (DEAD-024, the three remaining reset hooks removed); anchors not remapped |
| 26 | 2026-11-10 | 7 fixed (security batch 2: SEC-002, 004, 005, 023, 026, 027, 030), 5 narrowed (SEC-003, 011, 013, 014, 031); anchors not remapped |
| 25 | 2026-11-10 | 10 fixed (dead-code batch: DEAD-001, 002, 007, 011, 025, 026, 027, 029, 032, 033), 1 narrowed (DEAD-024); anchors not remapped |
| 24 | 2026-11-10 | 17 fixed (client batch 2: CLI-008, 012, 013, 015, 018, 019, 025, 026, 027, 028, 045, 054, 065, 068, 071, 087, 093), 5 narrowed (CLI-005, 006, 007, 039, 069); anchors not remapped |
| 23 | 2026-11-09 | 18 fixed (client batch 1: CLI-001, 002, 003, 020, 021, 022, 023, 024, 050, 052, 057, 066, 067, 081, 082, 085, 086, 101), 2 High cleared; anchors not remapped |
| 22 | 2026-11-09 | 1 fixed (SRV-037); anchors not remapped |
| 21 | 2026-11-09 | 11 fixed (security low batch 1: SEC-006, 007, 008, 009, 017, 020, 028, 029, 032, 033, 034); anchors not remapped |
| 20 | 2026-11-09 | 3 fixed (SEC-016, SEC-021, SEC-025), anchors remapped |
| 19 | 2026-11-09 | 2 fixed (SRV-028, SRV-036), anchors remapped |
| 18 | 2026-11-09 | 5 fixed (server low batch 2), anchors remapped |
| 17 | 2026-11-09 | 13 fixed (server low batch 1), anchors remapped |
| 16 | 2026-11-09 | 18 fixed, 1 narrowed (REPO-059); repository lens low batch 3, anchors remapped |
| 15 | 2026-11-09 | 15 fixed, 1 dropped (REPO-026); repository lens low batch 2, anchors remapped |
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
