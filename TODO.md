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

## Backlog: share links

Three small UI tasks. Nothing started yet. Neither touches the database.

1. [x] **The share-link table must look and sit exactly the same everywhere.** Today the editor's
       Share dialog (`components/qubdi/share-dialog.tsx`, a list of bordered cards) and the admin
       Diagrams "Share links" dialog (`pages/admin-page/diagram-links-dialog.tsx`) show the same links
       in different layouts. Make the table, its columns, its order and its position the same in both
       (one shared component is the safe way), light and dark, desktop and phone.
2. [x] **Every revoked link reads just "Revoked link".** In the Share dialog all revoked links show the
       same grey text, so you cannot tell them apart (and the Activity line says only "revoked a share
       link of <diagram>", `lib/qubdi/activity.ts`, action `share.revoke`). Say which link: for example
       when it was made and by whom, its access, and when it was revoked. The audit row already has
       `meta.linkId` and `meta.access`.
3. [x] **Not duplicated, one reference.** The share-link table (columns, states, the revoke action, the
       status wording) is written once and both dialogs use it, so the two can never drift apart again.
       Today each dialog has its own copy of the markup and the status text (`lib/qubdi/share-links.ts`
       already holds some shared helpers). Remove the second copy; a test renders both dialogs and
       checks they show the same table.

Open questions:

- [ ] Task 1: which two screens must match, exactly? (Reading: the editor's Share dialog and the admin
      "Share links" dialog.) A screenshot of the one to copy would settle it.
- [ ] Task 2: is it the Share dialog list, the Activity log, or both?
- [ ] Task 3: I read "not duplicated reference" as no copied code (one shared component that both
      dialogs reference). If you meant something else, for example that the same link must not be listed
      twice, say so.

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
- Users: ticking across pages ("all 4,000 matching"); a "Temporary password" badge for accounts
  that still have `must_change_password` set.
- Share links: add a partial index on active links only if `EXPLAIN` shows it is needed.

Open questions:

- [ ] Should admins be able to release a stuck editing lock from the Diagrams section?

## Leftovers from the table-drag fix (optional)

- [ ] A fast drag that reaches the viewport edge (auto-pan) is slower than the original on the
      89-table monica template (300-500 ms frames vs 130-220 ms on the reporter's machine).
      Measured again, headless Chrome on the dev build: a frame is 17-83 ms at the median with
      occasional 500 ms spikes, and the numbers move a lot between runs, so a gain of the size
      reported could not be told from noise. What the CPU profile shows: React Flow's per-edge
      position work (`getEdgePosition`, about a fifth of the script time) and painting, not the
      editor's own handlers. Passing no edges at all did not give a consistent gain. On this template
      every edge logs "Couldn't create edge for target handle" (the target handles of the fields that
      are not drawn do not exist), and React Flow retries each of them on every update: worth a look
      before anything else. Needs a profile from the reporter's browser to go further.
- Fixed: the line no longer disappears for a frame after a drop. Cause: saving the new position
  rebuilt every node without its measured size, so React Flow treated all tables as not drawn yet
  and no edge could find its ends until the next measure (`carryMeasured` in `canvas-utils.ts`).
  Checked by sampling every frame after a drop on the airbnb template: 1 frame with no lines before,
  0 in six runs after.
- Keep: under reduced motion the rule is `transition: none !important` (a test guards it).
