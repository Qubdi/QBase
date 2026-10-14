# QubdiDB

Database schema diagrams you can keep on your own server. QubdiDB is a fork of
the ChartDB editor (AGPL-3.0) with an optional self-hosted backend. The editor
still works fully offline in the browser; the backend adds accounts, published
versions, share links, comments, live-database import, re-sync, drift detection
and schema lint.

## What is in here

| Part | Where | Stack |
| --- | --- | --- |
| Editor | `src/` | React 18, TypeScript, Vite, Tailwind, `@xyflow/react`, Dexie |
| Backend (optional) | `server/` | Node 22, Fastify, Drizzle, PostgreSQL |
| Shared logic | `shared/` | Pure TypeScript with no dependencies: `reconcile`, drift classification, `lint` |
| Original editor code | `OLD/` | Untouched copy kept for reference |

## Features

1. **Accounts and permissions**: email and password (argon2), owner / editor / viewer per diagram, audit log.
2. **Published snapshots**: viewers only ever see numbered published versions, never the working copy.
3. **Read-only share links**: unguessable tokens (only a hash is stored), expiry, revoke, live updates over SSE, rate limited.
4. **Comments** on tables, fields and relationships; carried forward on publish, orphaned ones are flagged.
5. **Direct import** from PostgreSQL and SQL Server, read-only, with SSRF protection and encrypted saved connections.
6. **Re-sync** a diagram from its database, keeping layout, colours, areas, notes and descriptions; undoable as one step.
7. **Drift detection**: scheduled or manual checks, severity classification, badge, optional webhook.
8. **Schema lint**: 12 rules, per-diagram settings, safe one-click fixes, API endpoint and a CLI for CI.

There are no external services: no analytics, no GitHub integration, no social links.

## Run it

```bash
# 1. database (and optionally the backend) with Docker
docker compose up -d db

# 2. backend
cd server
npm install
CONNECTION_KEY="a-long-random-secret" \
INTROSPECT_ALLOW_HOSTS="" \
npm start                      # http://localhost:3001

# 3. editor (from the repository root)
npm install
VITE_QUBDI_BACKEND_URL=http://localhost:3001 npm run dev
```

Without `VITE_QUBDI_BACKEND_URL` the editor runs in local-only mode and shows no account UI.
Schema lint works either way.

### Backend settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://qubdidb:qubdidb@localhost:5433/qubdidb` | Where QubdiDB stores its own data |
| `PORT` | `3001` | HTTP port |
| `SESSION_SECRET` | dev value | Set this in production |
| `ALLOW_SIGNUP` | `true` | The first account always works and becomes admin; set `false` to close sign-ups after that |
| `CORS_ORIGIN` | unset | Origin of the editor when served from another host |
| `CONNECTION_KEY` | unset | Encrypts saved database passwords. Saving connections and scheduled drift checks need it |
| `INTROSPECT_ALLOW_HOSTS` | empty | Hosts, IPs or IPv4 CIDRs the server may connect to even if private (loopback, `10.x`, ...). Blocked by default |
| `SHARE_RATE_LIMIT` | `60` | Public share requests per minute per IP |

## Tests

```bash
npx vitest run                 # editor and shared logic
cd server && npx vitest run    # backend (needs `docker compose up -d db`)
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
- Schedules are 5-field cron expressions in UTC.
- Drift checks compare the server's copy of the diagram, so the editor syncs it first.

QubdiDB is licensed under the AGPL-3.0, like the project it is forked from.
