# QBase

Database schema diagrams you can keep on your own server. QBase is a
source-available diagram editor with an optional self-hosted backend. The editor
still works fully offline in the browser; the backend adds accounts, published
versions, share links, live-database import, re-sync, drift detection
and schema lint.

## What is in here

| Part | Where | Stack |
| --- | --- | --- |
| Editor | `src/` | React 19, TypeScript, Vite, Tailwind, `@xyflow/react`, Dexie |
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

QBase is two parts: the **server**, which keeps accounts, projects and diagrams in its own PostgreSQL database, and the **editor**, the web app. Pick one way to run them:

| | Where it runs | Which PostgreSQL |
| --- | --- | --- |
| [**A**](#option-a-everything-in-docker-with-the-bundled-postgresql) | Docker | the one bundled with QBase (simplest) |
| [**B**](#option-b-docker-with-your-own-existing-postgresql) | Docker | one you already run |
| [**C**](#option-c-from-source-for-development) | your machine, from source | either |

You need Git for all of them, [Docker](https://docs.docker.com/get-docker/) with Compose v2 for A and B (`docker compose version` should work), and Node 24 for C (the version in `.nvmrc`). Commands are for a Bash shell; in Windows PowerShell `cp` works the same, and Git Bash has `openssl`.

A secret in these steps means a long random string. Make one with `openssl rand -hex 24`, or with Node: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

### Option A: everything in Docker, with the bundled PostgreSQL

1. **Get the code.**

   ```bash
   git clone https://github.com/Qubdi/QBase.git
   cd QBase
   ```

2. **Create your settings file.**

   ```bash
   cp .env.example .env
   ```

3. **Fill in two values in `.env`.** Docker Compose refuses to start without them.

   ```bash
   POSTGRES_PASSWORD=<a secret>     # the password of the bundled database
   CONNECTION_KEY=<a secret>        # at least 16 characters; encrypts saved database passwords
   ```

   `SECRETS_KEY` is optional: it encrypts authenticator-app secrets for two-factor sign-in (see below). Keep these values; losing `CONNECTION_KEY` makes saved connections unreadable.

4. **Start it.** The first run downloads the published image, `qubdi/qbase` from Docker Hub (the editor and its API in one, for amd64 and arm64). Pin a release with `QBASE_VERSION` in `.env`; unset, it runs `latest`.

   ```bash
   docker compose up -d
   ```

5. **Check that it is up.** `db` should be `healthy` and `app` `running` (its health says `starting` for the first half minute).

   ```bash
   docker compose ps
   curl http://localhost:8080/health      # {"ok":true}
   ```

   In PowerShell `curl` is a different command: open <http://localhost:8080/health> in a browser instead.

6. **Open the editor** at <http://localhost:8080> and create the first account. It becomes the administrator. Sign-up then closes: the administrator adds everyone else under *Admin > Users* and gives them access to projects.

Day to day:

```bash
docker compose logs -f app        # follow the log
docker compose down               # stop; your data stays in the postgres-data volume
docker compose up -d              # start again
docker compose pull && docker compose up -d   # update (to the QBASE_VERSION in .env, or latest)
docker compose down -v            # stop AND delete all data
```

To try a change before it is published, build the image from your checkout instead of pulling it. It gets the Docker Hub name, `qubdi/qbase:<QBASE_VERSION>`, so once tested it can be pushed as it is. Use a tag of its own: building `latest` hides the published one on this machine until the next `docker compose pull`.

```bash
QBASE_VERSION=1.3.0-rc1 docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
QBASE_VERSION=1.3.0-rc1 docker compose -f docker-compose.yml -f docker-compose.build.yml push app
```

That image is for your machine's platform only; releases from the tag workflow are built for amd64 and arm64.

`bash run.sh` opens a menu of these: `build`, `rebuild`, `up`, `down`, `down -v`, `push` (it asks for the version); `bash run.sh build 1.0.5` runs one directly, and `bash run.sh help` lists them.

QBase listens on `127.0.0.1` only. To reach it from other machines, set `APP_BIND_IP` in `.env` (or put a reverse proxy in front). The editor and its API share one address, so there is no CORS or backend URL to set; behind a reverse proxy, also set `TRUST_PROXY`. See [Configuration](#configuration).

### Option B: Docker, with your own existing PostgreSQL

QBase then does not start a database of its own. You need PostgreSQL 16 or newer.

1. **Create an empty database and a role that owns it**, on your PostgreSQL:

   ```sql
   CREATE ROLE qbase LOGIN PASSWORD 'choose-a-password';
   CREATE DATABASE qbase OWNER qbase;
   ```

   That is all it needs. The server creates its own tables when it starts (in `public`, plus a `drizzle` schema that records which migrations ran), so the role does not have to be a superuser and no extension is required.

2. **Make sure the server container can reach it.** Inside a container `localhost` is the container itself, so name the database by an address the container can use:

   - on the same computer as Docker Desktop (Windows, macOS): `host.docker.internal`;
   - on the same Linux computer: the host's address on the Docker network (often `172.17.0.1`), and let PostgreSQL listen on it (`listen_addresses`) and accept it (`pg_hba.conf`);
   - on another machine: its name or IP, with the port open to this machine.

3. **Get the code and create your settings file.**

   ```bash
   git clone https://github.com/Qubdi/QBase.git
   cd QBase
   cp .env.example .env
   ```

4. **Point `.env` at your database.**

   ```bash
   POSTGRES_HOST=host.docker.internal    # or the name or IP from step 2
   POSTGRES_PORT=5432
   POSTGRES_USER=qbase
   POSTGRES_PASSWORD=choose-a-password
   POSTGRES_DB=qbase
   CONNECTION_KEY=<a secret>             # at least 16 characters
   ```

   Use a password of plain letters and digits: Compose pastes it into the connection address as it is, so `@ : / ? # %` would break it.

5. **Start only the server and the editor.** `--no-deps` is what keeps the bundled database from starting.

   ```bash
   docker compose up -d --no-deps app
   ```

6. **Check it.**

   ```bash
   docker compose logs app           # contains: QBase server listening on :3001
   curl http://localhost:8080/health # {"ok":true}
   ```

   If the server stops at start, the reason is in that log:

   | The log says | Usually |
   | --- | --- |
   | `password authentication failed` | wrong `POSTGRES_USER` or `POSTGRES_PASSWORD` |
   | `ECONNREFUSED`, or a timeout | the host or port cannot be reached from the container (step 2, a firewall, `pg_hba.conf`) |
   | `database "qbase" does not exist` | step 1 was skipped, or `POSTGRES_DB` is spelled differently |
   | `permission denied` | the role does not own the database (`ALTER DATABASE qbase OWNER TO qbase;`) |

7. **Open the editor** at <http://localhost:8080> and create the first account, as in Option A.

The Docker setup cannot ask PostgreSQL for SSL, because Compose builds the connection address from the five values above. If your database requires SSL, use Option C with `?sslmode=require` on `DATABASE_URL`.

### Option C: from source, for development

1. **Check Node:** `node -v` should say 24 (`nvm use` reads `.nvmrc`).

2. **Get a database.** Either start the bundled one:

   ```bash
   git clone https://github.com/Qubdi/QBase.git
   cd QBase
   cp .env.example .env              # set POSTGRES_PASSWORD and CONNECTION_KEY in it (Compose needs both)
   docker compose up -d db           # PostgreSQL on localhost:5433
   ```

   or use your own, created as in step 1 of Option B.

3. **Start the server.**

   ```bash
   cd server
   npm install
   cp .env.example .env
   ```

   Edit `server/.env`:

   - `DATABASE_URL`: for the bundled database `postgres://qbase:<POSTGRES_PASSWORD>@localhost:5433/qbase`; for yours, its own address. Write special characters in the password as `%`-escapes, and add `?sslmode=require` if it needs SSL.
   - `CONNECTION_KEY`: a secret of at least 16 characters (needed to save database connections).
   - leave `CORS_ORIGIN=http://localhost:5173`: that is where the editor runs in the next step.

   ```bash
   npm run dev                       # restarts on changes; `npm start` builds and runs once
   curl http://localhost:3001/health # {"ok":true}
   ```

   The server reads `server/.env` itself; a variable set in your shell wins over the file.

4. **Start the editor**, from the repository root in a second terminal:

   ```bash
   npm install
   npm run dev                       # http://localhost:5173
   ```

   `.env` from step 2 already has `VITE_QUBDI_BACKEND_URL=http://localhost:3001`. Without that setting the editor runs in local-only mode and shows no account screens (schema lint works either way).

5. **Open <http://localhost:5173>** and create the first account: it becomes the administrator.

### Configuration

All settings live in `.env` files, none are hard-coded. `.env` is git-ignored.

- Repository root `.env` (copy `.env.example`): read by `docker compose` and by the editor build. `QBASE_VERSION` picks the published image to run (unset = `latest`). It holds the core database credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`), where it runs (`POSTGRES_HOST`, `POSTGRES_PORT`; point them at another machine to use an existing Postgres, see Option B), the secrets, and the bind address and port of each service (`*_BIND_IP`, `*_PUBLISH_PORT` / `APP_PORT`), `VITE_QUBDI_BACKEND_URL` (where `npm run dev` finds the backend; the image needs no such setting), `VITE_HOST_URL` (public URL for canonical links; unset = none) and `VITE_APP_URL` (where "use this template" sends visitors when the editor is on another site; unset = the same site). The two `VITE_*` URLs are baked in when the image is built, so for the published image they are fixed; they take effect in `npm run dev` and in an image you build with `docker-compose.build.yml`.
- The backend settings below can also be put in the root `.env`: `docker-compose.yml` passes them to the server, except `DATABASE_URL` (built from the `POSTGRES_*` values), `PORT` (3001 inside the container; `APP_PORT` is the one you choose) and `HOST`, `WEB_DIR` and `CORS_ORIGIN`, which the image sets or does not need.
- `server/.env` (copy `server/.env.example`): read by the backend when run outside Docker.

### Backend settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | none, required | Where QBase stores its own data |
| `HOST` | `127.0.0.1` (`0.0.0.0` in the Docker image) | Interface the server listens on |
| `PORT` | `3001` | HTTP port |
| `WEB_DIR` | unset (set in the Docker image) | Folder holding the built editor. When set, the server serves the editor too and the API moves under `/api`; unset = API only, at the root |
| `CORS_ORIGIN` | unset | Origin of the editor when it runs on another host (`npm run dev`); not needed in the image, where editor and API share one address |
| `CONNECTION_KEY` | unset | Encrypts saved database passwords and the tokens of active share links (at least 16 characters). Saving connections, and with them drift checks and re-syncs, need it; without it a share link's URL is shown only once, when it is created or regenerated |
| `SECRETS_KEY` | unset | Encrypts the secrets of authenticator apps (two-factor sign-in), at least 16 characters. Unset = `CONNECTION_KEY` is used; with neither, two-factor sign-in is not offered. Do not lose it: people who turned it on could not sign in |
| `MFA_ENABLED` | `true` | `false` removes two-factor sign-in completely: no endpoints, no screens |
| `MFA_WINDOW_STEPS` | `1` | 30-second steps a code is accepted either side of now (0 to 5) |
| `INTROSPECT_ALLOW_HOSTS` | empty | Hosts, IPs or IPv4 CIDRs the server may connect to even if private (loopback, `10.x`, ...). Blocked by default |
| `DB_POOL_MAX` | `10` | Most connections one server process opens to its database |
| `DB_STATEMENT_TIMEOUT_SECONDS` | `120` | Seconds a statement may run before the database cancels it; `0` for no limit |
| `SNAPSHOT_KEEP` | `200` | Newest snapshots kept per diagram; `0` keeps them all |
| `AUTO_PUBLISH_COALESCE_SECONDS` | `300` | While auto-publish is on, a save rewrites the person's latest auto snapshot when it is younger than this, instead of adding a copy; `0` adds one every save |
| `AUDIT_SAVE_MINUTES` | `60` | A save is logged once per person and diagram in this many minutes; `0` logs every save |
| `SHARE_RATE_LIMIT` | `60` | Public share requests per minute per IP |
| `COOKIE_SECURE` | `auto` | The session cookie's `Secure` flag: `true`, `false`, or `auto` (only on requests that arrived over HTTPS; behind a proxy also set `TRUST_PROXY`) |
| `AUTH_RATE_LIMIT` | `20` | Sign-in, sign-up and change-password calls per minute per client address |
| `AUTH_MAX_FAILURES` | `10` | Failed sign-ins (or wrong current passwords) before an account is locked |
| `AUTH_LOCKOUT_MINUTES` | `15` | How long a locked account waits. Locking is per account, so someone who knows an email can lock it out for this long |
| `PASSWORD_MIN_LENGTH` | `12` | Fewest characters of a new password. Cannot be set below 8. Applies when a password is set, never at sign-in |
| `SESSION_DAYS` | `30` | Longest a session lasts, in days |
| `SESSION_IDLE_DAYS` | `14` | A session unused for this many days ends early; `0` = only `SESSION_DAYS` applies |
| `TRUST_PROXY` | unset | Behind a reverse proxy: the number of proxies in front of the server (`1` for one), or their addresses, comma separated. `true` is refused, because any visitor can send `X-Forwarded-For` |
| `LINT_RATE_LIMIT` | `30` | Schema lint calls per minute per user |
| `OUTBOUND_RATE_LIMIT` | `20` | Connections to your databases (import, re-sync, drift checks) per minute per user |
| `BODY_LIMIT_KB` | `1024` | Largest request body on ordinary routes, in KB |
| `DIAGRAM_BODY_LIMIT_MB` | `50` | Largest request body on the routes that carry a whole diagram, in MB |
| `DRIFT_CACHE_SECONDS` | `300` | Opening a diagram reuses a drift report this young while the diagram and its settings are unchanged; `0` always reads the database |
| `DRIFT_REPORT_KEEP` | `50` | Newest drift reports kept per diagram; `0` keeps them all |
| `DEAD_LINK_KEEP_DAYS` | `30` | Share links revoked or expired this many days ago are deleted; `0` keeps them all |
| `AUDIT_RETENTION_DAYS` | `365` | Audit rows older than this many days are deleted; `0` keeps them all |
| `SSE_MAX_PER_LINK` | `100` | Most live viewers one share link may have at once |
| `SSE_MAX_PER_IP` | `20` | Most live viewers one client address may have at once, over all links |
| `SSE_HEARTBEAT_SECONDS` | `25` | Seconds between pings on a live stream; each re-checks a signed-in viewer's session |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |

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
- **How it works:** after a correct password the server answers `{ "mfaRequired": true, "challenge": "..." }` and sets no cookie; `POST /auth/login/mfa` with the ticket and a code (or a recovery code) then starts the session. A ticket lasts 5 minutes and dies after 5 wrong codes, wrong codes also count against the account's lockout (`AUTH_MAX_FAILURES`), and a code can be used only once. The secret is stored encrypted (AES-256-GCM) and never returned after set-up; the 10 recovery codes are stored as hashes and shown once. Turning it on needs the password, so a stolen session cannot lock the owner out with a second factor they do not have. Turning it off, making new recovery codes and changing the password need the password and/or a code.
- **A lost phone:** use a recovery code (each works once). Otherwise an admin opens *Admin > Users* and chooses *Reset two-factor* for that person, who is signed out everywhere and can sign in with the password alone. If the only admin is locked out, run on the server `npm run mfa:reset -- person@example.com` (from `server/`), or in Docker `docker compose exec app node dist/server/src/cli/mfa-reset.js person@example.com`.
- **Activity log:** `mfa.enable`, `mfa.disable`, `mfa.reset`, `mfa.recovery_used`, `mfa.recovery_renew` and `mfa.failed`.

### Upgrading the bundled database (PostgreSQL 16 to 18)

The bundled `db` container now runs PostgreSQL 18 on a new volume, `postgres-data` (`qbase_postgres-data` in `docker volume ls`). A PostgreSQL 16 data folder cannot be opened by 18, so your data moves by a dump and restore. Do it before you pull the new `docker-compose.yml`, or `git stash` it for the first step. Your old volume `qbase-data` is never modified, so you can go back until you delete it yourself.

```bash
# 1. with the OLD setup still running: dump everything (database, users, passwords).
#    The file holds password hashes: keep it private, and delete it when you are done.
docker compose exec -T db pg_dumpall -U qbase > qbase-backup.sql
# 2. stop it, then switch to the new docker-compose.yml (git pull)
docker compose down
docker compose up -d db                      # starts empty on the new volume
# 3. restore, then start the rest
docker compose exec -T db psql -U qbase -d postgres < qbase-backup.sql
#    two "already exists" errors (the qbase role and database) are expected
docker compose up -d app
# 4. when you have checked everything works, remove the old data
docker volume rm qbase_qbase-data        # `docker volume ls` shows the exact name
```

A fresh install needs none of this. If you use your own Postgres (`POSTGRES_HOST`), nothing changes: QBase runs on 16 and newer.

## Tests

```bash
npx vitest run                 # editor and shared logic
cd server && npx vitest run    # backend (needs the database up with POSTGRES_PASSWORD=qbase:
                               # the tests connect as qbase/qbase on port 5433)
```

The SQL Server tests need the optional container and skip cleanly without it. Choose a
password of your own and give it to both the container and the tests:

```bash
export MSSQL_SA_PASSWORD='<a strong password>'
docker compose -f docker-compose.mssql.yml up -d
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
- Several server processes can share one database. Live share updates, the migrations at
  start-up and the hourly clean-up are coordinated through Postgres. Rate limits, the
  per-link live-viewer cap, the shared lint and outbound allowances and the guard against two
  drift checks of one diagram at once are kept in the memory of each process, so with N
  replicas each limit is N times as loose and two drift checks can overlap: keep the limiter at
  the reverse proxy, or run one process (see "Scaling").
- The first start after upgrading to a version with the diagram-list columns (migration
  `0022`) rewrites the whole `diagrams` table under an exclusive lock: about 11 seconds for
  320 MB of diagrams here, and reads and writes of diagrams wait meanwhile. Start the new
  version in a quiet moment on a large installation.

## Scaling

One server process and the bundled database take a team a long way: a save is about 5 ms
and 21 KB of WAL on a laptop. To go further:

- **Connections.** Each process opens up to `DB_POOL_MAX` connections plus one more for the
  live-update listener. Postgres' `max_connections` must cover `replicas x (DB_POOL_MAX + 1)`
  and keep 3 for superusers. The bundled `db` allows 200: about 17 replicas at the default
  pool of 10. Raise `max_connections` (and the memory behind it) before adding more. A
  connection pooler must run in *session* mode: the live-update listener and the advisory
  locks belong to one connection, which transaction pooling would hand to someone else.
- **Memory.** The bundled `db` is tuned for about 2 GB (`shared_buffers=256MB`,
  `effective_cache_size=768MB`, `work_mem=8MB`, 256 MB `/dev/shm`). On a bigger machine raise
  `shared_buffers` to a quarter of the RAM and `effective_cache_size` to three quarters.
- **What grows.** Snapshots (`SNAPSHOT_KEEP` per diagram, full copies), drift reports
  (`DRIFT_REPORT_KEEP`) and the audit log (`AUDIT_RETENTION_DAYS`, and at most one row per
  person, diagram and `AUDIT_SAVE_MINUTES` for saves) are pruned every hour. Lower
  the numbers if the database is large.
- **Backups.** The dump above is a manual step. Run it from cron, for example
  `docker compose exec -T db pg_dump -U qbase -Fc qbase > qbase-$(date +%F).dump`,
  and keep copies off the machine. To restore a dump into an empty database:
  `docker compose exec -T db pg_restore -U qbase -d qbase --no-owner < qbase-2026-01-01.dump`
  (add `--clean --if-exists` to replace what is already there). For point-in-time recovery use WAL archiving
  (`archive_mode`, `archive_command`) or a managed Postgres.

QBase is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE): free for personal and other noncommercial use. Using it in or for a business needs a separate licence from Qubdi.