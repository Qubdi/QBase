# QubdiDB

Database schema diagrams you can keep on your own server. QubdiDB is an AGPL-3.0
diagram editor with an optional self-hosted backend. The editor
still works fully offline in the browser; the backend adds accounts, published
versions, share links, comments, live-database import, re-sync, drift detection
and schema lint.

## What is in here

| Part | Where | Stack |
| --- | --- | --- |
| Editor | `src/` | React 18, TypeScript, Vite, Tailwind, `@xyflow/react`, Dexie |
| Backend (optional) | `server/` | Node 24, Fastify, Drizzle, PostgreSQL |
| Shared logic | `shared/` | Pure TypeScript with no dependencies: `reconcile`, drift classification, `lint` |

## Features

1. **Accounts and permissions**: email and password (argon2), owner / editor / viewer per diagram, audit log.
2. **Published snapshots**: viewers only ever see numbered published versions, never the working copy.
3. **Read-only share links**: unguessable tokens (only a hash is stored), expiry, revoke, live updates over SSE, rate limited.
4. **Comments** on tables, fields and relationships, shown read-only on shared views; carried forward on publish, orphaned ones are hidden. The editor has no way to write them.
5. **Direct import** from PostgreSQL and SQL Server, read-only, with SSRF protection and encrypted saved connections.
6. **Re-sync** a diagram from its database, keeping layout, colours, areas, notes and descriptions; undoable as one step.
7. **Drift detection**: check a diagram against its live database on demand, severity classification, badge, optional webhook.
8. **Schema lint**: 12 rules, per-diagram settings, safe one-click fixes, API endpoint and a CLI for CI.

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
| `CONNECTION_KEY` | unset | Encrypts saved database passwords (at least 16 characters). Saving connections, and with them drift checks and re-syncs, need it |
| `INTROSPECT_ALLOW_HOSTS` | empty | Hosts, IPs or IPv4 CIDRs the server may connect to even if private (loopback, `10.x`, ...). Blocked by default |
| `SHARE_RATE_LIMIT` | `60` | Public share requests per minute per IP |
| `COOKIE_SECURE` | `auto` | The session cookie's `Secure` flag: `true`, `false`, or `auto` (only on requests that arrived over HTTPS; behind a proxy also set `TRUST_PROXY`) |
| `AUTH_RATE_LIMIT` | `20` | Sign-in, sign-up and change-password calls per minute per client address |
| `AUTH_MAX_FAILURES` | `10` | Failed sign-ins (or wrong current passwords) before an account is locked |
| `AUTH_LOCKOUT_MINUTES` | `15` | How long a locked account waits. Locking is per account, so someone who knows an email can lock it out for this long |

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
