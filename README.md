# QubdiDB

Database schema diagrams you can keep on your own server. QubdiDB is an AGPL-3.0
diagram editor with an optional self-hosted backend. The editor
still works fully offline in the browser; the backend adds accounts, published
versions, share links, live-database import, re-sync, drift detection
and schema lint.

## What is in here

| Part | Where | Stack |
| --- | --- | --- |
| Editor | `src/` | React 18, TypeScript, Vite, Tailwind, `@xyflow/react`, Dexie |
| Backend (optional) | `server/` | Node 24, Fastify, Drizzle, PostgreSQL |
| Shared logic | `shared/` | Pure TypeScript with no dependencies: `reconcile`, drift classification, `lint` |

## Features

1. **Accounts and permissions**: email and password (argon2, with [password rules](#passwords)), owner / editor / viewer per diagram, audit log.
2. **Published snapshots**: viewers only ever see numbered published versions, never the working copy.
3. **Read-only share links**: unguessable tokens (only a hash is stored), expiry, revoke, live updates over SSE, rate limited.
4. **Direct import** from PostgreSQL and SQL Server, read-only, with SSRF protection and encrypted saved connections.
5. **Re-sync** a diagram from its database, keeping layout, colours, areas, notes and descriptions; undoable as one step.
6. **Drift detection**: check a diagram against its live database on demand, severity classification, badge, optional webhook.
7. **Schema lint**: 12 rules, per-diagram settings, safe one-click fixes, API endpoint and a CLI for CI.

There are no external services: no analytics, no GitHub integration, no social links.

## Run it

```bash
# 1. database (and optionally the backend) with Docker. Compose needs a
#    POSTGRES_PASSWORD in .env (copy .env.example and fill it in); services
#    listen on 127.0.0.1 unless you set a *_BIND_IP
cp .env.example .env
docker compose up -d db

# 2. backend
cd server
npm install
CONNECTION_KEY="a-long-random-secret" \
INTROSPECT_ALLOW_HOSTS="" \
npm start                      # compiles to dist/, then runs it: http://localhost:3001
                               # (npm run dev restarts on file changes instead)

# 3. editor (from the repository root)
npm install
cp .env.example .env           # VITE_QUBDI_BACKEND_URL=http://localhost:3001
npm run dev
```

Without `VITE_QUBDI_BACKEND_URL` the editor runs in local-only mode and shows no account UI.
Schema lint works either way.

### Configuration

All settings live in `.env` files, none are hard-coded. `.env` is git-ignored.

- Repository root `.env` (copy `.env.example`): read by `docker compose` and by the editor build. It holds the core database credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`), where it runs (`POSTGRES_HOST`, `POSTGRES_PORT`; point them at another machine to use an existing Postgres), the secrets, and the bind address and port of each service (`*_BIND_IP`, `*_PUBLISH_PORT` / `*_PORT`), and the editor's `QUBDI_BACKEND_URL` (read in the browser at run time, so changing it needs no rebuild; `VITE_QUBDI_BACKEND_URL` is the same setting for `npm run dev`) and `VITE_HOST_URL` (public URL for canonical links; unset = none).
- `server/.env` (copy `server/.env.example`): read by the backend when run outside Docker.

### Backend settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://qubdidb:qubdidb@localhost:5433/qubdidb` | Where QubdiDB stores its own data |
| `HOST` | `0.0.0.0` | Interface the server listens on |
| `PORT` | `3001` | HTTP port |
| `CORS_ORIGIN` | unset | Origin of the editor when served from another host |
| `CONNECTION_KEY` | unset | Encrypts saved database passwords and the tokens of active share links (at least 16 characters). Saving connections, and with them drift checks and re-syncs, need it; without it a share link's URL is shown only once, when it is created or regenerated |
| `SECRETS_KEY` | unset | Encrypts the secrets of authenticator apps (two-factor sign-in), at least 16 characters. Unset = `CONNECTION_KEY` is used; with neither, two-factor sign-in is not offered. Do not lose it: people who turned it on could not sign in |
| `MFA_ENABLED` | `true` | `false` removes two-factor sign-in completely: no endpoints, no screens |
| `MFA_WINDOW_STEPS` | `1` | 30-second steps a code is accepted either side of now (0 to 5) |
| `INTROSPECT_ALLOW_HOSTS` | empty | Hosts, IPs or IPv4 CIDRs the server may connect to even if private (loopback, `10.x`, ...). Blocked by default |
| `SHARE_RATE_LIMIT` | `60` | Public share requests per minute per IP |
| `COOKIE_SECURE` | `auto` | The session cookie's `Secure` flag: `true`, `false`, or `auto` (only on requests that arrived over HTTPS; behind a proxy also set `TRUST_PROXY`) |
| `AUTH_RATE_LIMIT` | `20` | Sign-in, sign-up and change-password calls per minute per client address |
| `AUTH_MAX_FAILURES` | `10` | Failed sign-ins (or wrong current passwords) before an account is locked |
| `AUTH_LOCKOUT_MINUTES` | `15` | How long a locked account waits. Locking is per account, so someone who knows an email can lock it out for this long |
| `PASSWORD_MIN_LENGTH` | `12` | Fewest characters of a new password. Cannot be set below 8. Applies when a password is set, never at sign-in |

### Passwords

A password that is being **set** (the first admin's sign-up, changing your own, an admin creating a user or resetting one) must have:

- at least `PASSWORD_MIN_LENGTH` characters (12 unless you change it; never fewer than 8) and at most 200,
- a capital letter, a number and a symbol (any character that is not a letter, a number or a space; spaces are allowed but do not count). Letters and digits from other alphabets count, so a Georgian or Cyrillic capital works,
- nothing that is the account's email address or contains the part before the `@` (a part shorter than 3 characters is not compared),
- and, when changing it, not the same as the current password.

The forms show these as a checklist while you type; the server checks them again and answers `400 { "error": "weak_password", "rules": [...] }` listing what is missing.

Signing in does not apply the rules, so people who chose a password before they existed keep working, and nobody is asked to change one. Passwords are stored only as argon2 hashes.

An admin who creates a user or resets a password is choosing a **temporary** password: the person is asked to choose their own at their next sign-in and can do nothing else until they have (the API answers `403 password_change_required`). Signing out is always possible.

### Two-factor sign-in (authenticator app)

After the password, a person can be asked for the 6-digit code their authenticator app shows. It is the standard TOTP of RFC 6238 (SHA-1, 6 digits, 30 seconds), so Google Authenticator, Microsoft Authenticator, Authy, 1Password and any other TOTP app work, by scanning a QR code or typing a key. It is **not** "sign in with Google or Microsoft": nothing is sent to a third party.

- **Optional, and it works offline.** It is off for everyone until a person turns it on (account menu, *Two-factor authentication*); anyone who never does keeps signing in with the password only. Codes are calculated on the phone from a shared secret and the clock, and checked the same way by the server, so neither side needs the internet. The QR code is drawn in the browser by a library bundled with the editor: no CDN, no external request.
- **Turn it on for the server:** set `SECRETS_KEY` (or `CONNECTION_KEY`, which is used when `SECRETS_KEY` is unset), at least 16 characters, and keep it safe. With no key the entry is not shown and nothing is an error. `MFA_ENABLED=false` removes the feature completely. In local-only mode (no server) there are no accounts, so there is no two-factor either.
- **The server's clock must be right.** A code is accepted within about 30 seconds either side of now (`MFA_WINDOW_STEPS`, default 1). On an offline or air-gapped machine keep the clock correct (NTP, or set it by hand); a clock that is minutes out rejects every code.
- **How it works:** after a correct password the server answers `{ "mfaRequired": true, "challenge": "..." }` and sets no cookie; `POST /auth/login/mfa` with the ticket and a code (or a recovery code) then starts the session. A ticket lasts 5 minutes and dies after 5 wrong codes, wrong codes also count against the account's lockout (`AUTH_MAX_FAILURES`), and a code can be used only once. The secret is stored encrypted (AES-256-GCM) and never returned after set-up; the 10 recovery codes are stored as hashes and shown once. Turning it off, making new recovery codes and changing the password need the password and/or a code.
- **A lost phone:** use a recovery code (each works once). Otherwise an admin opens *Admin > Users* and chooses *Reset two-factor* for that person, who is signed out everywhere and can sign in with the password alone. If the only admin is locked out, run on the server `npm run mfa:reset -- person@example.com` (from `server/`), or in Docker `docker compose exec server node dist/server/src/cli/mfa-reset.js person@example.com`.
- **Activity log:** `mfa.enable`, `mfa.disable`, `mfa.reset`, `mfa.recovery_used`, `mfa.recovery_renew` and `mfa.failed`.

## Tests

```bash
npx vitest run                 # editor and shared logic
cd server && npx vitest run    # backend (needs the database up with POSTGRES_PASSWORD=qubdidb:
                               # the tests connect as qubdidb/qubdidb on port 5433)
```

The SQL Server tests need the optional container and skip cleanly without it:

```bash
docker compose --profile mssql up -d mssql
```

## Schema lint in CI

```bash
cd server
npm run lint:diagram -- path/to/diagram.json --fail-on error
# options: --config lint.json  --format json  --fail-on error|warning|info|never  --database-type <type>
```

Exit code `0` means nothing at or above `--fail-on`, `1` means findings, `2` means bad input.
The same engine is available as `POST /lint` and `GET /diagrams/:id/lint`.

## Notes

- Read-only import: every introspection query is a fixed catalog `SELECT`, checked by a guard
  before it is sent, and PostgreSQL runs inside a read-only transaction. SQL Server has no
  read-only transaction, so use a login that only has read access.
- Drift checks compare the server's copy of the diagram, so the editor syncs it first.
- Run one server process. Rate limits, the per-link live-viewer cap, the shared lint and outbound
  allowances and the guard against two drift checks of one diagram at once are kept in the memory
  of each process. Behind several processes (or replicas) each one counts on its own, so the
  effective limits multiply and two drift checks can overlap. Scale the database, not the server,
  or put a limiter in front of it. Edit locks, sessions and everything else are in Postgres and
  are safe to share.

QubdiDB is licensed under the AGPL-3.0, like the project it is forked from.
