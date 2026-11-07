# QBase build tasks (AI prompts)

Eight tasks, each written as a prompt you can paste into a coding agent. Build them in order; later tasks depend on earlier ones.

Order: 1 Auth → 2 Snapshots → 3 Share links → 4 Comments → 5 Direct import → 6 Re-sync → 7 Drift detection → 8 Schema lint

## Shared context (paste at the top of every task)

```
Project: QBase, an Elastic License 2.0 project ( React 19 + TypeScript + Vite, Tailwind, Radix, @xyflow/react, Dexie/IndexedDB, i18next). The editor is local-first with no backend; we are adding a small self-hosted backend.

Backend stack: Node 24 + TypeScript + Fastify, PostgreSQL, Drizzle ORM, Docker Compose. Everything FOSS and self-hostable. Frontend keeps working offline with Dexie; the backend is optional and enabled by an env flag.

Rules:
- Before writing any code, reply with the proposed folder structure, data model and API list, then wait for my approval.
- Keep responses concise.
- Add tests for every endpoint and every pure function.
- Do not change the existing diagram data model without telling me first.
```

## Task 1. Login and permissions

```
Goal: add accounts and per-diagram permissions to the backend and connect the frontend.

Build:
- Email + password login (argon2), session cookie (httpOnly, SameSite=Lax), logout, change password. First registered user becomes admin; further sign-ups can be turned off with an env flag.
- Tables: users, diagrams (id, owner_id, title, content JSON, updated_at), diagram_members (diagram_id, user_id, role: owner | editor | viewer).
- Endpoints: auth (register, login, logout, me), diagrams (list, create, get, update, delete), members (add, change role, remove).
- Permission middleware used by every later task: owner/editor can write, viewer can read, anyone else gets 404.
- Frontend: login page, account menu, a "Sync to server" option per diagram that uploads the local Dexie diagram, and a members list in the diagram settings.
- Audit log table (user, action, diagram, time) written on create, update, delete, share and role changes.

Acceptance: a viewer cannot edit; a stranger cannot see the diagram; local-only mode still works with the backend off.
Out of scope: OAuth/SSO, live collaboration.
```

## Task 2. Published snapshots

```
Goal: let an editor publish a frozen copy of a diagram. Viewers only ever see published snapshots, never the working copy.

Build:
- Table snapshots (id, diagram_id, version int, content JSON, published_by, published_at, note).
- Endpoints: publish (creates the next version), list versions, get one version. Publishing requires editor or owner.
- Keep every version; no deletion in this task.
- Diagram response includes publishedVersion and unpublishedChanges (true when the working copy differs from the latest snapshot; compare a stable content hash).
- Optional auto-publish on save, controlled by a per-diagram setting.
- Frontend: Publish button with an optional note, status text ("Published v14, 2 changes not published").

Acceptance: editing after publishing does not change what a viewer sees until the next publish. Versions are numbered without gaps.
Out of scope: restore/rollback, diff between versions.
```

## Task 3. Read-only share links

```
Goal: share a published diagram through a link with no account needed.

Build:
- Table share_links (id, diagram_id, token, access: anyone | signed_in | off, expires_at nullable, created_by, revoked_at).
- Tokens: 128-bit random, URL-safe, unguessable; store a hash, not the raw token.
- Public route GET /s/:token returns the latest snapshot as read-only JSON. It respects access mode, expiry and revocation. Never returns the working copy.
- Endpoints for editors: create link, change access/expiry, revoke, regenerate.
- Optional live push: SSE stream /s/:token/events that sends a "new version" message on publish, so open viewers refresh. Per-link toggle.
- Frontend: a Share dialog (access, expiry, copy link, live toggle, revoke) and a read-only viewer page with pan, zoom, search, and click-a-table-to-highlight-its-relations. No edit controls rendered at all.
- Rate limit the public route.

Acceptance: a revoked or expired link returns 404; the viewer page has no way to modify data; published changes reach open viewers within a few seconds when live is on.
```

## Task 4. Comments on shared views (editor-written) — REMOVED

> This feature was built and then removed (migration `0018_drop_comments`). The text below is kept as history; do not build from it.

```
Goal: the editor can attach comments to tables and fields; viewers of a share link can read them but cannot add any.

Build:
- Table comments (id, diagram_id, snapshot_version, target_type: table | field | relationship, target_id, body, author_id, resolved bool, created_at).
- Only owner/editor can create, edit, resolve or delete. Share-link viewers get read-only access to comments on the snapshot they are viewing.
- Comments are tied to a snapshot version and carry forward to the next publish when the target still exists; orphaned ones are flagged, not deleted.
- Endpoints: list (editor view and public view via share token), create, update, resolve, delete.
- Frontend: comment markers on tables and fields in the editor, a comments panel, show/hide toggle; the viewer page shows markers and a read-only panel.

Acceptance: any write attempt through a share token fails with 403; comments survive republishing.
Out of scope: replies from viewers, mentions, notifications.
```

## Task 5. Direct import

```
Goal: connect to a live database, read its schema and create a diagram.

Build:
- Introspection module with one interface and drivers for PostgreSQL and SQL Server (add MySQL later). Read: schemas, tables, columns (type, length, nullability, default), primary keys, unique constraints, indexes, foreign keys (with ON DELETE/UPDATE), comments.
- Normalise output into the existing diagram model (reuse its type mapping per dialect).
- Connection form: host, port, database, user, password, SSL option, schema filter. Credentials are used for the request only, never stored unless the user saves a connection; saved passwords are encrypted with a key from env.
- Read-only by design: use a read-only transaction, run only catalog queries, set a statement timeout.
- Frontend: Import > From database wizard (connect, pick schemas/tables, preview, create diagram).
- Block private/loopback targets unless an env allow-list permits them (SSRF protection).

Acceptance: importing a sample Postgres and a sample SQL Server database produces tables, keys and relationships identical to the catalog; no write statement is ever executed.
```

## Task 6. Re-sync

```
Goal: pull changes from the live database into an existing diagram without losing the layout, colours, notes or areas.

Build:
- A pure function reconcile(diagram, introspected) that matches tables and fields by stable identity: first by a stored source id/name, then by name as a fallback, with rename hints when a table/field disappears and one with the same shape appears.
- Output a change list: added, removed, changed (type, nullability, default, key, index, relationship) and possible renames.
- Applying keeps positions, colours, areas, notes, comments and descriptions for everything that still exists. New tables are placed near related tables.
- Frontend: Re-sync dialog that shows the change list with a checkbox per change, then applies the selected ones. Undoable as one step.
- Store the source connection on the diagram so re-sync is one click.

Acceptance: re-syncing an unchanged database makes no change; adding a column in the database adds exactly that field; layout is untouched.
Depends on: Task 5.
```

## Task 7. Drift detection

```
Goal: tell the user when the live database no longer matches the diagram.

Build:
- Reuse the introspection module and the reconcile function from Task 6 in report-only mode.
- A manual "Check now" per diagram (there is no schedule).
- Table drift_reports (id, diagram_id, run_at, status: clean | drifted | error, changes JSON).
- Classify changes: only-in-database, only-in-diagram, and differing definitions, with severity (breaking: dropped or retyped column; warning: new nullable column; info: comment or default).
- Notify: badge on the diagram, and an optional webhook (generic JSON POST, so it works with ntfy, Slack-compatible tools or n8n).
- Frontend: drift report page with a side-by-side list and buttons to "update diagram from database" (runs Task 6) or dismiss.

Acceptance: a manual change in the database appears in the next check with the right severity; a clean database reports clean; failures are reported as errors, not as drift.
Depends on: Tasks 5 and 6.
```

## Task 8. Schema lint

```
Goal: a rules engine that reviews a diagram and lists problems.

Build:
- Pure, side-effect-free function lint(diagram, config) returning findings: rule id, severity (error | warning | info), target, message, and a suggested fix when one is obvious.
- Rules to start with: table without primary key; foreign key column without an index; foreign key type differs from the referenced column; nullable column inside a unique key; duplicate or overlapping indexes; inconsistent naming (mix of snake_case and camelCase, singular and plural table names); reserved-word names; orphan table with no relationships; missing description on tables (off by default); varchar without length where the dialect needs one.
- Per-diagram config: enable or disable each rule, change severity, naming style.
- Frontend: Lint panel with findings grouped by severity, click a finding to focus the table or field on the canvas, a "fix" button where a fix is safe, and a count badge. Works offline on the client; also exposed as an API endpoint and a CLI command so CI can fail on errors.

Acceptance: each rule has tests with a passing and a failing example; the CLI exits non-zero when errors exist.
```
