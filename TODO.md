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

Steps 1 to 7 shipped (model review `0015_model_review`, audit `meta` and sign-in tracking
`0016_audit_meta_and_sign_in_tracking`, left-sidebar shell, Activity, Overview, Diagrams and
sharing, stronger user management). Their notes and measurements are in `git log` and
`Audit/todo.html`. What is left:

- [ ] **Every step ends with**: server and frontend tests, lint, type check and the full suite in
      a container, light and dark screenshots for UI steps, the database checklist at the top of
      this file when there is a migration, a Docker rebuild, then a commit.

Left for later, from the shipped steps:

- Activity: filter by the person an admin acted on (not only who acted).
- Overview: change against the previous week, and figures per project.
- Diagrams: revoke every link of a diagram in one click. Add an `updated_at` index or a small
  recency table only past about 200,000 diagrams (an index containing it stops autosaves from
  being in-place updates).
- Users: ticking across pages ("all 4,000 matching"); forcing a password change (see the
  password-rules plan).
- Share links: add a partial index on active links only if `EXPLAIN` shows it is needed.

Open questions:

- [ ] Should admins be able to release a stuck editing lock from the Diagrams section?
- [ ] Should the Activity list be exportable (CSV)?
- [ ] The old comments feature: the `comments` table, its enum and the server routes are no longer
      used by the editor. Drop them (a migration, after exporting any stored comments), or keep
      them for the read-only share viewer?

## Leftovers from the table-drag fix (optional)

- [ ] A fast drag that reaches the viewport edge (auto-pan) is still slower than the original
      on the 89-table monica template (300-500 ms frames vs 130-220 ms).
- [ ] The line disappears for one frame right after a table is dropped (edges are rebuilt
      after the drag ends).
- Keep: under reduced motion the rule is `transition: none !important` (a test guards it).
