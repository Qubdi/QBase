# QubdiDB TODO

Open work, newest first. Tick an item when it ships and note the commit.

## Rule for all work below: the database model must be clean and follow best practice

This is not a task to finish; it is a gate. **Every migration in every section below must pass this
checklist before its step is ticked.** The first step of the admin plan (the model review) brings
the existing tables up to the same standard before new tables are added.

Conventions the schema already follows, to keep: `uuid` primary keys, `timestamptz` for every time,
`snake_case` names, Postgres enums for closed sets, secrets stored hashed or encrypted (never
plain), `jsonb` only for document-like content, and an explicit `on delete` on every foreign key.

1. **Shape.** One fact in one place: no duplicated or derivable columns, and counts are computed,
   not stored, unless a measurement shows a need. Every table has a primary key. Tables are plural
   `snake_case`, columns `snake_case`, times end in `_at`, indexes `<table>_<columns>_idx`.
2. **Types.** `uuid` for ids; `bigint generated always as identity` (not `serial`) for append-only
   tables that grow without limit; `timestamptz`, never `timestamp`; a Postgres enum or a CHECK for
   any closed set, never free text; `jsonb` only for content we never filter or join on.
3. **Integrity in the database, not only in the app.** `NOT NULL` by default; a foreign key for
   every reference (audit rows are the deliberate exception, so they outlive what they describe);
   CHECKs for invariants (for example `attempts >= 0`); unique constraints for natural keys,
   case-insensitive where the app lowercases (emails).
4. **Foreign keys.** Choose `on delete` on purpose and say why in a comment. Index every foreign key
   column unless the table is tiny (say so), because deletes and cascades scan it otherwise.
5. **Indexes.** Every index is justified by a named query (the endpoint that uses it). Equality
   columns first, then the sort column; a partial index for a hot subset (for example active share
   links); no duplicate or prefix-duplicate indexes; after a load test, check
   `pg_stat_user_indexes` and drop any index that is never used.
6. **Queries.** No `select *` on a table that has a large `jsonb` or `bytea` column; aggregate in
   SQL; no N+1; keyset paging for large or growing lists; a hard cap on `limit`. Run
   `EXPLAIN (ANALYZE, BUFFERS)` on seeded data (for example 100k audit rows, 5k diagrams) and write
   the result in the commit message.
7. **Migrations.** One migration per step, generated with
   `drizzle-kit generate --name <what-it-does>` (eight existing ones have random names such as
   `0012_wakeful_squadron_supreme`; give every new one a meaningful name) and never edited once
   shipped. Safe on a populated database: add a column as nullable, backfill, then set `NOT NULL`
   in a later step if needed. Tested on a database that holds old-shape data, not only an empty
   one, and only on a throwaway Postgres, never the dev database. Drizzle migrates inside a
   transaction, so `create index concurrently` is not possible; note it if a table has grown.
8. **Lifecycle.** Every table that grows has a retention or clean-up rule in `runMaintenance`, with
   a test. Secrets, recovery codes and password hashes are never logged and never returned by the
   API (a test proves it). Store only the personal data a feature needs (no IP addresses).
9. **Explained.** Every new table and non-obvious column gets a one-line comment in `schema.ts`
   saying why it exists, as the current schema does.
10. **Review note.** Each step that has a migration says, in its commit message, what changed, which
    index serves which query, the retention rule, and how the change is undone.

Existing items this rule also picks up: the `comments` table, its enum and its routes are no longer
used by the UI (the Comments panel was removed); decide whether to drop them or keep them
(open question in the admin plan).

## Backlog: editor UI changes

Three small, separate UI tasks. Nothing started yet. None touches the database, so the model
checklist above does not apply.

1. [ ] **UI change for the Tables visuals.** Rework how tables look and are laid out. Read from the
       code: the table on the canvas is `canvas/table-node/table-node.tsx` (with
       `table-node-field.tsx` for each row), the list in the side panel is
       `side-panel/tables-section/tables-section.tsx`, and the display switches are in
       `side-panel/visuals-section/visuals-section.tsx` and the View menu. Light and dark, and
       keep dragging smooth (see the Done item on the relationship lines: the reduced-motion rule
       must stay `transition: none`).
2. [ ] **UI change for the Lint settings.** Rework the Lint settings dialog
       (`components/qubdi/lint-settings-dialog.tsx`, opened from the gear in
       `components/qubdi/lint-control.tsx`). Settings stay in the browser per diagram
       (`lib/qubdi/lint-config-store.ts`), so linting keeps working offline.
3. [x] **Remove "All Databases..." and "New..." from the Actions menu**
       (`pages/editor-page/top-navbar/menu/menu.tsx`, keys `menu.actions.new` and
       `menu.actions.browse` in `i18n/locales/en.ts`). The sidebar's New and Open buttons
       (`editor_sidebar.new_diagram`, `editor_sidebar.browse`) stay, so both are still reachable.
       Remove the two keys from every locale file if a test or the type requires it; check that
       no test looks for the menu entries.

Open questions:

- [ ] Tables visuals: which part, exactly? The table on the canvas, the Tables list in the side
      panel, or the Visuals tab? And what should change (colours, spacing, field rows, a compact
      mode)? A screenshot or a sketch would settle it.
- [ ] Lint settings: what is wrong with the dialog today, and what should it look like?
- [ ] The "Open" keyboard shortcut (`KeyboardShortcutAction.OPEN_DIAGRAM`, shown next to "All
      Databases..."): keep it working with the menu entry gone? (default: yes, it still opens the
      same dialog)

## Backlog: real-time co-editing

Several people edit the same diagram at the same time and see each other's changes live. This is
the **biggest item on the list**: do it last, and start with a short spike. It is optional like the
others: with `REALTIME_ENABLED=false` (the default) the app keeps today's one-editor lock, and the
local-first, offline editor never depends on it. Nothing started yet.

### What the code looks like today (read from the code)

- One editor at a time: `diagram_locks` (one row per diagram, a 90-second lease renewed by the
  open tab; a second tab of the same user counts as another editor).
- A save is a whole-diagram request with a version check. A stale save gets `409`, and the UI
  offers "Overwrite with mine".
- A diagram is one `jsonb` document and everything in it has an id (tables, fields, relationships,
  areas, notes, types), so a change can be addressed by id. That helps.
- Push already exists but is one-way and in memory: share viewers get "new version" over SSE from
  an `EventEmitter` inside the server process. It does not work across several server processes,
  and the project has no WebSocket or CRDT library.
- The editor is local-first (IndexedDB) with undo and redo stacks; all of that must keep working.
- The UI's nginx only serves files and the browser talks to the API directly, so any proxy in
  front of the API has to allow WebSocket upgrades.

### Design

Settle this in the spike: prototype both on tables only and keep whichever is simpler to make
correct.

- **A. Server-ordered operations.** Small operations ("set this field's type") addressed by id,
  applied by the server in order and broadcast; last writer wins per property. Simple and fits the
  id-based model, but every editor action has to become an operation.
- **B. A CRDT (Yjs).** The diagram is a shared document. It merges edits even after being offline,
  which suits the local-first design, but it is heavier: every editor change moves onto the shared
  document and the bundle grows.

Either way:

- **Transport:** WebSocket (`@fastify/websocket`), authenticated by the session cookie on the
  handshake with an `Origin` check. Editors only: viewers keep seeing published versions.
- **Presence:** who is in the diagram, a colour per person, their selection, an optional cursor
  and "follow".
- **Keep `diagrams.content` current.** Publish, share, lint, drift and the admin lists all read
  it, so the server writes it back from the live document (debounced, and when the last editor
  leaves). None of those features change.
- **Database (if Yjs):** an append-only `diagram_updates (diagram_id, seq bigint identity, update
  bytea, created_at)` indexed on `(diagram_id, seq)`, compacted into `diagram_docs (diagram_id
  primary key, state bytea, seq)` by the hourly maintenance. List queries never select `content`
  or `state`.
- **Several server processes:** replace the in-process bus with Postgres `LISTEN/NOTIFY` (no new
  service), or document that one process is required.
- **Undo and redo** only undo your own changes.
- **Conflict cases to design:** a table deleted while someone edits one of its fields, two renames
  at once, an editor who goes offline and comes back.
- **Limits:** a cap on editors per diagram (for example 10), limits on update size and rate,
  reconnect with backoff, idle connections dropped.
- **Locks:** when real-time is on, `diagram_locks` becomes a "who is here" list, and the admin
  Diagrams page lists collaborators instead of one lock holder.
- **Audit:** record a person joining or leaving a session, not every edit.

### Steps (tick when shipped, note the commit)

0. [ ] **Spike:** both approaches on tables only; write the decision and the reasons here.
1. [ ] **Presence only:** the WebSocket channel, who is here and selection highlights, with the
       lock still in force. Low risk and useful on its own.
2. [ ] **Shared document and persistence**, written back to `content`; migration.
3. [ ] **Move every editor action onto it**, with per-user undo and redo.
4. [ ] **Conflict cases, reconnect and resync, returning from offline.**
5. [ ] **Lock policy switch and the admin Diagrams update.**
6. [ ] **Tests:** several simulated clients converge (including a randomized test), reconnect, the
       limits, and a load test at the number of editors we promise.
7. [ ] **Docs:** `REALTIME_ENABLED`, proxy settings for WebSocket, the several-process note.
8. [ ] **Every step ends with:** tests, lint, type check and the full suite in a container,
       screenshots for UI steps, the database checklist at the top of this file when there is a
       migration, a Docker rebuild, then a commit.

Open questions:

- [ ] How many people should be able to edit one diagram at once?
- [ ] Is it fine to require WebSocket through any proxy in front of the API?
- [ ] Keep it behind the switch, off by default, until it has proven itself? (default: yes)
- [ ] Operations or CRDT: decided by the spike.

## Backlog: password rules

A password that is being set must have a capital letter, a number, a symbol and a minimum length.
Nothing started yet.

### What the code looks like today (read from the code)

- A password is only checked for 8 to 200 characters. Four server places set one: first-admin
  sign-up and change-password (`auth/routes.ts`), admin create user and admin reset
  (`admin/routes.ts`).
- The `credentials` schema (email and password, minimum 8) is **shared by register and login**.
  Putting the new rules there would reject existing users at sign-in and lock them out. Sign-in
  must only check "not empty, at most 200".
- Four inputs hard-code `minLength={8}` and "min 8" text: the sign-in dialog, the change-password
  dialog, admin Create user and admin Reset password.
- Many server and frontend tests create users with `password123`, which will fail the new rules.

### Rules

They apply when a password is **set**, never when it is checked at sign-in.

- At least `PASSWORD_MIN_LENGTH` characters: default **12**, and the setting cannot go below 8 (the
  minimum today). The maximum stays 200.
- At least one **capital letter**, one **number** and one **symbol**. Defined with Unicode classes
  so non-English letters work: capital = `\p{Lu}`, number = `\p{Nd}`, symbol = any character that is
  not a letter, a number or whitespace (spaces are allowed but do not count).
- Not the account's email, and not containing the part before the `@`; on a change, not the same
  as the current password.
- A blocklist of common passwords is a separate nice-to-have.

### Design

- One pure function `checkPassword(password, { minLength, email? })` in `shared/` (like the lint
  rules) that returns the list of broken rules. The server is the authority; the client uses the
  same function for live feedback.
- **Server:** split the schemas into `signIn` (not empty, at most 200) and `newPassword` (the
  rules), used by the four places above. A weak password gets
  `{ error: 'weak_password', rules: [...] }` so the UI can say exactly what is missing.
- **Client:** one `PasswordField` with a live checklist (a tick or cross per rule) used by the four
  dialogs, replacing the hard-coded `minLength={8}` and placeholders.
- **Existing users keep their passwords.** No forced reset for them.
- **Temporary passwords:** an admin creates users with one, so add
  `users.must_change_password boolean not null default false`. It is set when an admin creates a
  user or resets a password and cleared when the person sets their own. While it is true, the API
  answers `403 password_change_required` to everything except change-password, `me` and logout,
  and the UI opens the change-password dialog.
- **Config:** `PASSWORD_MIN_LENGTH` (default 12), listed in `.env.example`.

### Steps (tick when shipped, note the commit)

1. [ ] **`checkPassword` in `shared/`**, with tests for every rule and the Unicode cases.
2. [ ] **Server:** split the schemas, use them in the four places, the error shape; update the test
       helpers to a compliant password.
3. [ ] **Client:** `PasswordField` with the checklist in the four dialogs.
4. [ ] **`must_change_password`:** migration, the admin create and reset set it, the forced-change
       flow.
5. [ ] **Docs:** the rules and `PASSWORD_MIN_LENGTH` in `README` and `.env.example`.
6. [ ] **Every step ends with:** tests, lint, type check and the full suite in a container,
       screenshots for UI steps, the database checklist at the top of this file when there is a
       migration, a Docker rebuild, then a commit.

Tests to include: each rule fails on its own and all together pass; Unicode capitals and symbols;
sign-in still works with an old weak password; the four endpoints reject weak passwords with the
list of rules; changing to the same password is rejected; the `must_change_password` flow; the
client checklist.

Open questions:

- [ ] Minimum length: 12 (default), or another number?
- [ ] Force a password change at first sign-in for users an admin created? (default: yes)
- [ ] Ask existing users with a weak password to change it at their next sign-in? (default: no)

## Backlog: two-factor sign-in with an authenticator app (Google or Microsoft Authenticator)

After the password, the person types the 6-digit code their authenticator app shows. This is the
standard **TOTP** (RFC 6238: SHA-1, 6 digits, 30 seconds), so Google Authenticator, Microsoft
Authenticator, Authy, 1Password and any other TOTP app all work, by scanning a QR code or typing a
key. It is not "sign in with Google or Microsoft" (SSO); nothing is sent to a third party.

**Optional, and it works offline.** The app must keep working with no internet and with no MFA:

- Codes are calculated on the phone from a shared secret and the clock. The server checks them
  the same way with its own clock. Neither side contacts Google, Microsoft or any other service,
  and the phone needs no signal when the code is typed.
- Off by default for every user. Anyone who never turns it on keeps signing in with the password
  only. A server switch, `MFA_ENABLED=false`, removes the feature completely (no endpoints, no UI).
- No encryption key configured means no "set up" button, not an error.
- The local-only mode (no server at all) has no accounts, so MFA does not exist there.
- The QR code is drawn by a library bundled inside the app: no CDN, no external request.
- The one thing an offline or air-gapped install must get right is the **server clock**: a code is
  accepted within about 30 seconds either way. Say so in the docs, and make the window a setting
  (`MFA_WINDOW_STEPS`, default 1).

Nothing started yet.

### What the code looks like today (read from the code)

- `POST /auth/login` checks the email and the argon2 password, then `createSession` sets the
  cookie. That is the only place a session is created after sign-in, so the second step goes
  between the password check and `createSession`.
- `createSession` keeps one live session per user, so every new sign-in asks for a code.
- `CryptoBox` (AES-256-GCM, `v1:` prefix so the format can be versioned) encrypts the secret, but
  its key is `CONNECTION_KEY`, which is optional today and switches saved connections off when
  unset.
- Nothing rate-limits `/auth/*`. A 6-digit code has only a million values, so attempt limits are
  a hard requirement, not a nice-to-have.
- The admin Users page and `server/src/cli` are where "reset MFA" and the lost-device
  command-line fallback belong.

### Design

- **Library:** a maintained TOTP library (`otplib`) for the codes. The QR image is drawn in the
  browser (`qrcode`), so the secret never goes through anyone else's service. The server sends
  only the `otpauth://` address.
- **Database:**
  - `users.mfa_secret_enc` (nullable, AES-256-GCM), `users.mfa_enabled_at` (null = off or
    still being set up) and `users.mfa_last_step bigint` (the last 30-second step accepted, so a
    code cannot be used twice).
  - `mfa_recovery_codes (id, user_id → users on delete cascade, code_hash, used_at, created_at)`:
    10 random codes, stored hashed (sha256 is enough for high-entropy random codes), unique on
    `(user_id, code_hash)`, index on `user_id`.
  - `mfa_challenges (id = hash of the ticket, user_id → users on delete cascade, expires_at,
    attempts smallint CHECK attempts >= 0)`, index on `expires_at`, purged by the existing hourly
    maintenance. Stateful on purpose: it gives one-time use and an attempt counter.
  - Nothing is stored in plain text, and the secret is never returned again after setup.
- **Sign-in:** after a correct password, a user with MFA gets `{ mfaRequired: true, challenge }`
  and **no cookie**. `POST /auth/login/mfa { challenge, code }` (or `{ challenge, recoveryCode }`)
  accepts the current step ±1 (about 30 seconds of clock drift), compares in constant time,
  rejects a step that is not newer than `mfa_last_step`, then calls `createSession`. A challenge
  lasts 5 minutes and dies after 5 wrong tries, so the person starts again from the password.
- **Setting it up** (signed in): `POST /auth/mfa/setup` (new secret stored as pending, returns the
  `otpauth://` address and the key for manual entry), `POST /auth/mfa/enable { code }` (checks a
  real code first, then switches it on and returns the recovery codes **once**),
  `POST /auth/mfa/disable { password, code | recoveryCode }`, and
  `POST /auth/mfa/recovery-codes { password, code }` to make new ones. `GET /auth/me` gains
  `mfaEnabled`.
- **Lost phone:** recovery codes (each works once), then an admin reset
  (`POST /admin/users/:id/mfa/reset` clears the secret and codes and signs that user out), then,
  for the only admin, a command-line reset (`npm run mfa:reset -- <email>`), so nobody is locked
  out of a self-hosted install for good.
- **Audit:** `mfa.enable`, `mfa.disable`, `mfa.reset`, `mfa.recovery_used`, `mfa.failed`.
- **Rate limits:** per IP and per account on `/auth/login`; the challenge's own attempt cap and a
  per-IP limit on `/auth/login/mfa`; a limit on `/auth/mfa/*`.
- **UI:** the sign-in dialog gets a second step (a 6-digit field with
  `autoComplete="one-time-code"` and numeric keypad, "use a recovery code instead", "back"). The
  account menu gets "Two-factor authentication": off → set up (1 install an app, 2 scan the QR or
  type the key, 3 enter a code, 4 save the recovery codes with copy and download, and the dialog
  cannot be closed until they confirm they saved them); on → shows since when, "make new recovery
  codes", "turn off". Admin Users gets an MFA badge and "Reset MFA".
- **Tests:** the RFC 6238 test vectors; a code is accepted ±1 step and rejected at ±2; replaying
  a code fails; wrong, expired and over-tried challenges; a recovery code works once; turning it
  off needs the password and a code; admin reset; the secret never appears in any response after
  setup; and the dialog flows on the frontend. Also that it stays optional: a user who never set
  it up signs in exactly as before, and with `MFA_ENABLED=false` the endpoints and the UI are
  absent.
- **Documentation:** how to turn it on, the server clock must be right (NTP), the key setting, and
  what to do about a lost phone.

### Steps (tick when shipped, note the commit)

1. [ ] **Rate limit `/auth/*`** (login, change-password), with a per-account lockout. A gap today
       and a prerequisite for the rest.
2. [ ] **Database and config:** the columns and two tables above, the key setting,
       `MFA_ENABLED` and `MFA_WINDOW_STEPS`, migration and tests.
3. [ ] **TOTP core:** pure functions (new secret, `otpauth://` address, verify with the window and
       the replay step, recovery-code generation and hashing) with the RFC 6238 vectors.
4. [ ] **Server:** the two-step sign-in, setup, enable, disable and recovery-code endpoints,
       audit entries and `me.mfaEnabled`, with tests.
5. [ ] **UI:** the sign-in second step and the account-menu dialog with the QR code and the
       recovery codes.
6. [ ] **Admin and recovery:** MFA badge and reset in Users, and the `mfa:reset` command.
7. [ ] **Docs:** `README` / `SECURITY.md` and `.env.example`.
8. [ ] **Every step ends with:** tests, lint, type check and the full suite in a container,
       screenshots for UI steps, the database checklist at the top of this file when there is a
       migration, a Docker rebuild, then a commit.

Open questions:

- [ ] The key that encrypts the authenticator secret: a new `SECRETS_KEY` that falls back to
      `CONNECTION_KEY` (default), or just reuse `CONNECTION_KEY`?
- [ ] Always optional (default). Do you ever want an opt-in setting that requires it for admins
      (`MFA_REQUIRED_FOR_ADMINS`)? It would stay off unless someone sets it.
- [ ] Ask for a code again when changing the password? (default: yes)
- [ ] "Remember this browser for 30 days", so a code is not asked on every sign-in? (default: no;
      it needs another cookie and table)

## Backlog: admin panel redesign and new features

Today `/admin` has two top tabs (Projects, Users). Wanted: a **left sidebar** layout and four new
features, built **one step at a time** (nothing started yet). The database model must be efficient
and follow best practice, so step 1 is a model review, and every step that touches the database
ships a migration and tests.

New sections: **Overview** (dashboard), **Projects** and **Users** (kept, Users gets more),
**Diagrams** (diagrams and sharing oversight), **Activity** (audit log).

### Database model review (findings from `server/src/db/schema.ts` and the migrations)

Read from the code and the migration SQL, not measured on real data. Check with `EXPLAIN` on a
seeded database (for example 100k audit rows and 5k diagrams) before a step is closed.

Missing indexes (none of these exist in migrations `0000` to `0014`):

- `sessions.user_id`: needed to list a user's sessions, to "sign out everywhere", and for the
  cascade when a user is deleted. Also `sessions.expires_at` for the hourly purge.
- `diagrams.project_id`, as `(project_id, updated_at desc)`: every project diagram list and count
  (`/admin/projects`, the workspace list) filters or groups by it.
- `diagrams.owner_id`: the cascade when a user is deleted.
- `share_links.diagram_id`, plus a partial index on active links (`where revoked_at is null`) for
  the overview count and the oversight list.
- `snapshots.published_by` (the biggest table; `set null` when a user is deleted).
- `audit_log`: the Activity filters need `(action, at desc)`, and a `(at desc, id desc)` index
  supports keyset paging (it replaces `audit_log_at_idx`).

Types and constraints:

- `audit_log.id` is `serial` (int4, caps at 2.1 billion). It is the one high-volume append-only
  table, so make it `bigint generated always as identity`.
- `users.email` is unique but case-sensitive. The app lowercases it at input, so it is safe
  today, but the database does not enforce it: add a unique index on `lower(email)`.
- `drift_reports.trigger` is free text: make it an enum or add a CHECK.
- `audit_log` says who, what and when but not **to what** (`project.member_set` does not record
  which user or project). Add a nullable `meta jsonb` (small, for example
  `{ projectId, targetUserId, role }`). Keep it free of foreign keys, since audit rows must
  outlive deleted users and diagrams. Write it from the admin, share and diagram routes.

New columns the features need:

- `users.last_login_at timestamptz`, set at sign-in.
- `sessions.created_at`, `sessions.last_seen_at` (written at most every 5 minutes, not on every
  request) and `sessions.user_agent` (truncated). No IP address: it is personal data we do not need.

Query rules for every new endpoint:

- Never `select *` from `diagrams` or `snapshots`: `content` is a large jsonb. Name the columns.
- Aggregate in SQL (`count(*) filter (where ...)`), one query per figure, no N+1.
- Keyset paging for the activity log (cursor = `(at, id)`); offset paging only for small lists;
  a hard cap on `limit`.
- Drizzle migrates inside a transaction, so `create index concurrently` is not possible. That is
  fine at today's table sizes; say so in the migration if a table has grown by then.
- Test migrations on a throwaway Postgres, never the dev database.

### Steps (tick when shipped, note the commit)

1. [x] **Model review migration** (`0015_model_review`): the indexes and constraint changes above,
       a migration test and the `EXPLAIN` notes. No behaviour change. Checked on a throwaway
       Postgres seeded with 100k audit rows, 5k diagrams, 15k snapshots and 10k share links, and on
       a copy of the dev data. What differs from the list above, and why:
       - `diagrams` gets `(project_id)`, not `(project_id, updated_at desc)`. Every autosave changes
         `updated_at`, and an index that contains it made 0 of 3,000 saves in-place (HOT) updates;
         without it all 3,000 were. Add an `updated_at` index only when the Diagrams list (step 6)
         needs one, and measure the saves again.
       - No `sessions.expires_at` index (a user has one session, so the table is about one row per
         user and the purge reads it all) and no `diagram_locks.user_id` index (300 rows; a delete
         by user was no faster with one). `sessions.user_id` is indexed as listed, though at 200
         users the planner still chooses a scan: it pays off at thousands of users and for step 7.
       - No partial index on active share links yet. `share_links (diagram_id, created_at desc)`
         serves the per-diagram list and the cascade; add the partial one with the step 5 or 6 query
         that counts active links, if `EXPLAIN` shows it is needed.
       - The audit `meta` column moves to step 2, with the routes that write it.
       - Descending indexes are built `DESC NULLS FIRST`. Drizzle's `desc()` alone makes
         `DESC NULLS LAST`, which Postgres does not use for `order by x desc`
         (use `.desc().nullsFirst()`); `test/model-indexes.test.ts` guards this.
       Measured, before to after: a rare action in the audit list 2.7 ms and 1,893 buffers to 0.04 ms
       and 12; audit page 500 by OFFSET 2,194 to 189 buffers; admin project list with counts 2,283
       to 83 buffers; a diagram's share links 176 to 4; deleting a user with its cascades 8.1 to 3.4 ms;
       an audit insert 0.75 to 0.73 ms (no extra cost from the fifth index).
2. [x] **Server groundwork** (`0016_audit_meta_and_sign_in_tracking`): audit `meta` and the routes
       that write it; `users.last_login_at`; the new `sessions` columns with the throttled
       `last_seen_at`. Notes:
       - `meta` holds ids and names, never an email (audit rows outlive the account, so an
         address there would defeat erasing it) and never a token. The table refuses a `meta` that
         is not an object or is over 1 KB. Written by the admin, share and diagram routes:
         `project.create|update|delete` (`projectId`, `name`), `project.member_set` (`projectId`,
         `targetUserId`, `role`), `project.member_remove`, `user.create|delete` (`targetUserId`),
         `user.update|enable|disable` (`targetUserId`, `changed`), `diagram.create|delete`
         (`projectId`, `name`), `diagram.publish` (`version`) and `share.*` (`linkId`, `access`).
         `diagram.update` has no `meta` on purpose: it is a row per save, the most frequent action,
         and `diagram_id` already says it. Step 4 turns these into lines ("Anna published Orders
         v3"): look names up while the project or diagram exists, and fall back to `meta.name`.
       - `GET /admin/audit` now returns `meta` (null for older rows and for saves).
       - `last_seen_at` is written at most every 5 minutes (`LAST_SEEN_SECONDS`), decided by the
         database's clock, and a failed write never fails the request. `user_agent` is cut to 200
         characters; no IP address is kept.
       - Existing sessions show the migration day as `created_at` and `last_seen_at`.
       - Measured (5,000 users and sessions, 100k audit rows): the per-request session lookup is
         0.04 ms and 6 buffers; the `last_seen_at` and `last_login_at` writes were in-place updates
         in 94% and 85% of cases on freshly packed tables; an audit insert costs the same with or
         without `meta` (about 135 bytes when present).
       - `test/auth.test.ts` took "the first user" with `select ... limit 1` and no `order by`;
         sign-in now updates `users`, which moved the row. It orders by `created_at` now.
3. [x] **Admin shell**: left sidebar (Overview, Projects, Users, Diagrams, Activity) that becomes
       a top bar on small screens, routes `/admin/:section`, Projects and Users moved in as they
       are. Notes:
       - The section paths are fixed child routes of `admin` (`adminRoute` in
         `pages/admin-page/admin-route.tsx`), not a `:section` parameter: the editor has a
         `:projectSlug/diagrams` route and a parameter here would tie with it, so `/admin/diagrams`
         could be read as a project called "admin". A test guards this.
       - `/admin` went to Projects until Overview existed; step 5 made it `overview`
         (`DEFAULT_ADMIN_SECTION` in `admin-sections.ts`).
       - Sections not built yet showed "This section is not built yet." and had a `built` flag.
         Steps 4 to 6 built the last three, so the flag and the placeholder were removed; a
         section added to `ADMIN_SECTIONS` without a page is now a type error.
       - On a phone the row of sections scrolls sideways and keeps the current one in view.
       - Checked in headless Chromium against a throwaway stack: light and dark, 1280 and 390 px.
4. [x] **Activity**: `GET /admin/audit` with cursor paging and filters (action group, user,
       diagram, date range); a list with readable lines ("Anna published Orders v3"), load more.
       No migration: the indexes from step 1 serve every query below. Notes:
       - The response is now `{ items, nextCursor }`; `total`, `page` and the count query are gone
         (a count over a log that grows without limit is the slow part, and "load more" does not
         need it). The cursor is the `(at, id)` of the last row, and `at` keeps its microseconds:
         a JavaScript `Date` stops at milliseconds, and a cursor cut there skipped rows (a test
         inserts rows inside one millisecond and proves it). It is opaque base64url; anything the
         server did not issue is a `400`. `limit` defaults to 30, at most 100.
       - Filters: `group` (users, projects, diagrams, sharing, checks, comments; an action is in a
         group by its prefix, see `AUDIT_GROUPS`, and a test fails if a new action fits none),
         `action`, `userId` (who did it), `diagramId`, `from` and `to` (both ends included), and
         `saves=hide`. A save is a row of its own and the most frequent action (every autosave), so
         the page asks for them hidden by default ("Show every save" brings them back); the API
         shows everything unless asked.
       - The server returns the names behind the ids, not sentences: three primary-key lookups
         for the page (users, diagram titles, project names), never `content`. A row whose user,
         diagram or project is gone still reads: the email is null and the name falls back to
         `meta.name` (only on the matching `diagram.*` or `project.*` rows, so a project's name is
         never taken for a diagram's). A `meta` value that is not an id cannot break the page.
         The sentences are built in the browser (`describeActivity` in `lib/qubdi/activity.ts`),
         one per action, with a fallback that shows an action it has no wording for.
       - The page: a row per event under a day heading, the time on the right; choosing a person
         or a diagram in a row narrows the list to it; a person picker, a date range (whole local
         days), a kind-of-activity select, "Load more" (30 at a time) and Refresh.
       - Measured on a throwaway Postgres with 100k generated audit rows (80% of them saves, a
         guess at the mix), 200 people and 5,000 diagrams, `EXPLAIN (ANALYZE, BUFFERS)`: the first
         page 0.12 ms and 34 buffers; the page at row 50,000 also 34 buffers, because the cursor
         is an index condition on `audit_log_at_id_idx` (the OFFSET it replaces reads more the
         deeper it goes: 189 buffers at page 500 in step 1); saves hidden 0.25 ms and 161; one
         rare action 0.2 ms and 38 (`audit_log_action_at_idx`); one person 35 buffers; one
         diagram 41; the sharing group (5% of the rows) 0.46 ms and 534, the worst case seen,
         because it walks the newest rows until it has 30 matches. Re-measure on real data.
       - Left for later: filtering by the person an admin acted on (not only who acted); CSV export
         (open question below).
5. [x] **Overview**: `GET /admin/stats` (users total / active / admins, projects, diagrams,
       published, active share links, editing right now, drift checks in the last 24 hours,
       activity over 7 days); cards plus recent activity.
       No migration: every figure is answered from an index or a small table. Notes:
       - What the figures mean: users *active* can sign in; *admins* is every account with the
         admin flag; *signed in* is people with a live session; a diagram is *published* when it
         has a snapshot; a share link is *open* by the one rule in `share/active.ts` (not
         revoked, not expired, not off); *editing now* is a lock whose lease has not run out.
       - Drift checks in 24 hours are the `drift.check` audit rows. A real check writes one and a
         reused report (the check made on opening a diagram) is not a check and writes none, so
         this equals the number of reports made, and it reads `audit_log_action_at_idx` instead of
         scanning `drift_reports` (no index on `run_at`, and large `jsonb` per row). Revisit if a
         scheduled check (the `schedule` trigger exists but nothing creates it) is ever added:
         it must write the audit row too.
       - The chart is events per day for seven days, saves left out: they are most of the table
         and only say how long a diagram was open. The exclusion is in the query (an `in` list of
         every other action, built from `AUDIT_ACTIONS`, so a new action is counted), which lets it
         use the action index and never walk the saves. A day is the viewer's own: the page sends
         its time zone (`?tz=Asia/Tbilisi`), checked against the list the runtime knows (400
         otherwise), and a zone the database does not know falls back to UTC (the response says
         which was used). Every one of the seven days is in the answer, empty ones as 0.
       - Measured on a throwaway Postgres (2,000 users, 1,500 sessions, 50,000 diagrams, 30,000
         snapshots, 5,000 share links, 300,000 audit rows of which 85% saves),
         `EXPLAIN (ANALYZE, BUFFERS)`: users 0.4 ms; signed in 1.4 ms; projects 0.1 ms;
         diagrams 4.6 ms (index only); published diagrams 7 ms (index only on
         `snapshots_diagram_version_idx`); open links 1.2 ms (a scan of 5,000 rows, so no partial
         index yet: the step 1 note said to add one only if needed); editing now 0.07 ms; drift
         checks 1.7 ms; the chart 16 ms and 2,887 buffers for 10,226 events (counting saves too
         would read 60,426 rows and take 36 ms, and the gap grows with real volume).
       - The page: six tiles that lead to the page with the detail; a column chart of the week
         (one series, so no legend: the title says what it is; thin columns, a hairline grid, the
         busiest day labelled, every day in a tooltip that opens on hover and on keyboard focus,
         and a table view with the same numbers); and the latest eight events as sentences, from
         the Activity endpoint with `saves=hide`, so there is no second endpoint. Refresh keeps
         what is on screen, dimmed, and the figures and the events fail separately.
       - `/admin` now lands on the Overview. All five sections are built, so the `built` flag and
         the "not built yet" placeholder are gone; a section added to `ADMIN_SECTIONS` without a
         page is a type error.
       - Left for later: change against the previous week, and figures per project.
6. [x] **Diagrams and sharing**: `GET /admin/diagrams` (paged, search by title, filter by
       project; title, project, owner, updated, published version, who is editing, active links);
       list and revoke share links.
       No migration. Notes:
       - `GET /admin/diagrams?page&limit&q&projectId`: newest change first (ties by id, so a page
         never repeats a row), at most 100 a page, `q` matches the title with `%` and `_` taken
         literally. Each row has the project's name and address (the title links into the editor),
         the owner, when it changed, the newest published version, who is editing (a lock whose
         lease has not run out) and how many share links are open. It reads named columns only,
         never `content`; the extras come from lookups by id for the page's rows (projects and
         users by primary key, `snapshots_diagram_version_idx`, the lock table and
         `share_links_diagram_idx`), not a join every row pays for.
       - "Open" is one rule, `activeLinkSql` next to `linkStatus` (`share/active.ts`), and a test
         holds it equal to `checkLinkUsable` over every combination of revoked, expired, off and
         who can open it. The Overview counts with the same rule.
       - `GET /admin/diagrams/:id/share-links` gives every link of a diagram, newest first, with its
         state, access, expiry and who made it (null once that account is deleted). It never gives
         the token or its hash: the address is shown once, to its maker, and not stored, so an
         admin can end a link but cannot read where it points. `DELETE .../:linkId` revokes it at
         once and tells anyone watching it live; it needs no project membership, because a leaked
         link is when the owner may not be around. It answers `404` for a link that belongs to
         another diagram, and two admins revoking together record one `share.revoke` row (the
         update is conditional on "not revoked yet", and only the one that wins records it).
       - The page: a title search, a project filter (a searchable list read from the server a page
         at a time, so it works with any number of projects), the table, and a dialog per diagram
         listing its links with Revoke (a second click on the row confirms; revoked links are
         shown muted and cannot be revoked again).
       - Measured on a throwaway Postgres with 50,000 diagrams holding 195 MB of out-of-line
         content (never read: the heap scanned is 16 MB, 2,086 buffers), `EXPLAIN (ANALYZE,
         BUFFERS)`: the count 4.8 ms; page 1 17.7 ms; the last page (2,500) 42.6 ms, because the
         sort spills to disk; a title search 26 ms plus 24.6 ms for its count; one project (250
         diagrams) 1.3 ms; every lookup under 100 buffers.
       - **No `updated_at` index**, as step 1 decided: an index that contains it made none of
         3,000 autosaves an in-place update. At 50,000 diagrams the sort costs 18 ms for the
         first page, which is fine. Re-measure at about 200,000 diagrams; past that, keep the
         recency in a separate small table (one row per diagram) rather than index this column.
       - Left for later: releasing a stuck editing lock from here (open question below), and
         revoking every link of a diagram in one click.
7. [x] **Stronger user management**: last sign-in column; a user's sessions and "sign out
       everywhere" (`DELETE /admin/users/:id/sessions`); bulk enable, disable and delete with
       the existing guard rails (not yourself, never the last active admin).
       No migration: `users.last_login_at` and the `sessions` columns came with step 2, and
       `sessions_user_idx` and `diagrams_owner_idx` from step 1 serve the new queries. Notes:
       - `GET /admin/users` gains `lastLoginAt` and `lastActiveAt` (the last use of the person's
         live session; null means not signed in). The second is one lookup of the page's sessions
         by `user_id`, not a join every row pays for.
       - A person has one live session (`createSession` ends the one before), so "a user's
         sessions" is a list of at most one. `GET /admin/users/:id/sessions` still returns an
         array, so it does not change if that rule ever does. It gives when and which browser
         (`userAgent`), never the session id, which is the hash of the cookie.
       - `DELETE /admin/users/:id/sessions` ends the sessions and lets go of the diagrams the
         person was editing, and answers `{ signedOut }`. It refuses the caller
         (`cannot_sign_out_self`: use the ordinary Sign out), and signing out someone who was not
         signed in writes no audit row. New audit action `user.sign_out`, worded in Activity
         ("anna@corp.io signed bob@corp.io out everywhere").
       - `POST /admin/users/bulk { action: enable | disable | delete, ids }` (1 to 100 ids): all
         or nothing, under the same admin-set lock as the single routes. The caller in a disable
         or delete is `400 cannot_disable_self` / `cannot_delete_self`; a request that would leave
         no active admin is `400 last_admin`; an account already in the wanted state, or gone, is
         counted as `unchanged` and gets no audit row. One audit row per account changed, the same
         actions and `meta` as the single routes. A delete hands the diagrams to the caller, as the
         single delete does (they share `removeUsers`).
       - The caller cannot be in a bulk disable or delete and is an active admin, so "last admin"
         can only come up when another admin turns the caller off while the request waits for the
         lock. The plain two-admins race does not reach the check (the loser has no session left
         and gets `401` first: with the check removed that test still passed), so a test holds the
         lock, turns the caller off meanwhile, and expects `last_admin`. It fails with the check
         removed.
       - The page: a checkbox column with select all on the page (the caller cannot be ticked),
         a bar with Enable (at once), Disable and Delete (each asks first and says what will
         happen), a Last sign-in column ("3 hours ago", the exact time on hover, "Never", and a
         "Signed in" tag), and a Sessions button that opens a dialog (browser as "Chrome on
         Windows", signed in, last active, Sign out everywhere). What is ticked is dropped when the
         page, search or filter changes, so "3 selected" never counts rows out of sight. The delete
         dialog used to say personal diagrams are deleted; they are not, they pass to the admin, so
         the text now says that.
       - Measured on a throwaway Postgres with 5,000 users, 4,750 sessions and 5,000 diagrams,
         `EXPLAIN (ANALYZE, BUFFERS)`: the page of 100 users as before 360 buffers, and the new
         sessions lookup for those 100 people 78; a bulk disable of 100 about 1,400 buffers for
         the update and 173 for the sessions; a bulk delete of 100 with every cascade 19 ms, the
         diagram hand-over using `diagrams_owner_idx` (203 buffers). The planner reads `users` and
         `sessions` whole at this size (about 60 to 80 pages), which is the cheaper plan; the
         indexes take over as they grow.
       - Left for later: ticking across pages ("all 4,000 matching"), and forcing a password
         change (the password-rules plan).
8. [ ] **Every step ends with**: server and frontend tests, lint, type check and the full suite in
       a container, light and dark screenshots for UI steps, the database checklist at the top of
       this file when there is a migration, a Docker rebuild, then a commit.

Open questions:

- [ ] Should admins be able to release a stuck editing lock from the Diagrams section?
- [ ] Should the Activity list be exportable (CSV)?
- [ ] The old comments feature: the `comments` table, its enum and the server routes are no longer
      used by the editor. Drop them (a migration, after exporting any stored comments), or keep
      them for the read-only share viewer?

## In progress: admin Projects page UX

Asked for: "we need better UX for this page" (`/admin/projects`). Done so far (checkpoint):

- The page was one long column: the "New project" form on top, project details next, and the
  members (the job people actually come here for) below the fold. Now the project's pane has a
  header (name, description, address, size, Open workspace) and two tabs, **Members** (opens
  first) and **Settings** (rename, description, delete).
- **New project** is a button that opens a dialog; the first-run page (no projects) invites the
  first one with a button.
- Success toasts for create, add, role change, save and delete; removing a person has an **Undo**
  toast instead of a confirm dialog.
- Delete is disabled, with the reason, while the project still holds diagrams (the server refused
  after the confirm before). Deleting no longer asks for the deleted project's members.
- The list shows each project's description; an error belongs to the project it happened in; on a
  phone, choosing a project scrolls its details into view; Settings fields have visible labels;
  admins are not offered in the "add a person" list (they already have full access).

Still to do / ideas, for the next session:

- [ ] Look at the live page once more (`http://localhost:8080/admin/projects`, light and dark, and
      at phone width) after the last two tweaks (visible labels, admins hidden); the screenshots
      were taken just before them.
- [ ] On a phone the candidate list under "Search users by email" is tall; consider a shorter one.
- [ ] Open question: should an admin be able to move a diagram to another project from here, so
      "delete or move them first" has a way to do it? Today only the editor can.
- [ ] The Users page has the same long-column shape (create form above the table); same treatment?

## ✅ Done: dragging a table froze the relationship lines (`1582178`)

The user reported that while a table was dragged, its relationship line froze and then jumped
to the new spot. The editor was smooth in the same browser before the reduced-motion change.

**Cause:** the reduced-motion CSS in `globals.css` set `transition-duration: 0.01ms` on
every element. The default `transition-property` is `all`, so every element (including each
line's SVG path `d`) got a transition, restarted on every drag step. Chrome painted the
in-between shape, so the line looked frozen. It only showed for people with
"reduce animations" on in Windows; headless test browsers never hit it. The page data was
correct every frame (recorded in the user's own browser); only the paint lagged.

**Fix:** under reduced motion, `transition: none !important` instead of a tiny duration,
with a test that guards the rule. The user confirmed it now works perfectly.

Speed work done along the way (each measured): context menus compare the selection by
content (`d3dbc37`); connection handles mounted only where used (`5ff1ab2`, `6ea5c10`);
lines keep their side unless another is clearly closer (`203e16a`); light static table
shadow (`4b01519`); side panels stop re-rendering on every pan (`afdadce`); stable overlap
debounce and hover reported only while drawing a line (`ebca763`).

Leftovers (optional):

- [ ] A fast drag that reaches the viewport edge (auto-pan) is still slower than the original
      on the 89-table monica template (300–500 ms frames vs 130–220 ms).
- [ ] The line disappears for one frame right after a table is dropped (edges are rebuilt
      after the drag ends).
- [ ] `CommentMarker`: one store subscription per field that re-renders on any comment change;
      select per target instead.

## In progress: project workspace URLs

Choosing a project goes straight to its workspace, `/<project>/diagrams/`, with no
UUID and no separate project page. Diagrams are created inside the workspace.

- [x] Server: project slug (unique ignoring case, reserved paths rejected) + migration
- [x] Server: `projectId` on diagram responses
- [x] Client: `slug` on project types, `project-path` helpers (tested)
- [x] Client: `ensureLocalCopy` (open a server diagram as a local copy)
- [x] Workspace gate: resolve `/<project>/diagrams[/<server diagram id>]`, check role, 404 for
      another project's diagram
- [x] Routes: `/:projectSlug/diagrams`, `/:projectSlug/diagrams/:diagramId`; redirect old
      `/diagrams/<localId>` links; remove `/projects/:id` and the project page
- [x] Editor: loader, autosave and access gate read the diagram from the workspace
- [x] Editor: project-aware Open and Create dialogs (list the project's server diagrams, create
      on the server, import from database) replace the local ones
- [x] Home and admin panel link to `/<slug>/diagrams`
- [x] Rebuild Docker and smoke-test (migration applied to the live DB; URLs are served)

## Backlog: admin panel and home page

1. ✅ **Lists grow without limit.** (done: server paging, fixed page sizes, scrolling table) In the admin panel the Projects and Users lists keep
   growing and make the page taller. The same happens on the home page (`/`).
   - Add pagination (page size ~10 to 20) to the admin Users list, the admin Projects list and
     the home project list, and keep the page height stable (the list area scrolls or pages;
     the page itself does not grow).
   - Prefer server-side paging (`?page=&limit=` with a total count) so it scales.
2. ✅ **Search bars.** (done: users, projects and the assign picker) Search users (by email) and projects (by name) in the admin panel.
   - Server-side `?q=` so search works across pages; debounce the input.
3. ✅ **User status.** (done: server + admin UI; disabled users cannot sign in) Users can be non-active.
   - Add a status (active / disabled) to users; show it in the admin Users list and let an
     admin toggle it.
   - A disabled user cannot sign in, their existing sessions are revoked, and they cannot use
     the API. Their diagrams and project assignments stay.
   - Guard rails: an admin cannot disable themselves, and the last active admin cannot be
     disabled.
   - Audit log entries for disable and enable. Optionally filter the list by status.
4. ✅ **Home page (`/`).** (done: paging, search, tests that members only see assigned projects; admins still see all, tell me if that should change)
   - Same unbounded growth as item 1, so paginate it and add the search bar.
   - Users only see the projects they are assigned to. The server already filters
     `GET /projects` for non-admins; add a test that proves it and check the UI never shows
     others. Open question: should admins also see only assigned projects here, or all
     (current behaviour)?
5. ✅ **Dropdown UI.** (done: all 15 native selects replaced; Select and dropdown menus restyled) The dropdowns look inconsistent and need a design pass.
   - Native `<select>` elements are used in the admin panel (role pickers, "user to assign"),
     the new-diagram dialog (database type), the access banner (move into project) and the
     members dialog. Replace them with the app's styled Select (Radix) so they match both
     themes and the rest of the UI.
   - Review the account menu and other dropdown menus for spacing, hover and focus states.
   - To confirm with the user: which dropdowns bother them most.
