# Configuration

[← Back to the README](../README.md)

All settings live in `.env` files, none are hard-coded. `.env` is git-ignored.

- Repository root `.env` (copy `.env.example`): read by `docker compose` and by the editor build. `QBASE_VERSION` picks the published image to run (unset = `latest`, the newest release). It holds the core database credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`), where it runs (`POSTGRES_HOST`, `POSTGRES_PORT`; point them at another machine to use an existing Postgres, see Option B), the secrets, and the bind address and port of each service (`*_BIND_IP`, `*_PUBLISH_PORT` / `APP_PORT`), `VITE_QUBDI_BACKEND_URL` (where `npm run dev` finds the backend; the image needs no such setting).
- The backend settings below can also be put in the root `.env`: `docker-compose.yml` passes them to the server, except `DATABASE_URL` (built from the `POSTGRES_*` values), `PORT` (3001 inside the container; `APP_PORT` is the one you choose) and `HOST`, `WEB_DIR` and `CORS_ORIGIN`, which the image sets or does not need.
- The root `.env.example` ships dummy values for the two secrets Compose requires, `POSTGRES_PASSWORD` and `CONNECTION_KEY`, so that QBase starts straight away. They are public: replace them before the first start (`bash run.sh setup` does it for you), because the database keeps the password it was created with. The server prints a warning in its log while it runs on either. Every other key and password in the file is blank.
- `server/.env` (copy `server/.env.example`): read by the backend when run outside Docker. Its keys and passwords are blank.

## Backend settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | none, required | Where QBase stores its own data |
| `HOST` | `127.0.0.1` (`0.0.0.0` in the Docker image) | Interface the server listens on |
| `PORT` | `3001` | HTTP port |
| `WEB_DIR` | unset (set in the Docker image) | Folder holding the built editor. When set, the server serves the editor too and the API moves under `/api`; unset = API only, at the root |
| `CORS_ORIGIN` | unset | One exact origin (`https://editor.example.com`: no path, no trailing slash, no `*`; the server refuses to start otherwise) of the editor when it runs on another host (`npm run dev`); not needed in the image, where editor and API share one address |
| `CONNECTION_KEY` | unset | Encrypts saved database passwords and the tokens of active share links (at least 32 characters; the server refuses a shorter one at start unless `ALLOW_SHORT_KEYS=1`, which keeps an older key of 16 to 31 characters working and is warned about). Saving connections, and with them drift checks and re-syncs, need it; without it a share link's URL is shown only once, when it is created or regenerated |
| `SECRETS_KEY` | unset | Encrypts the secrets of authenticator apps (two-factor sign-in), at least 32 characters (same rule as `CONNECTION_KEY`). Unset = `CONNECTION_KEY` is used; with neither, two-factor sign-in is not offered. Do not lose it: people who turned it on could not sign in |
| `ALLOW_SHORT_KEYS` | unset | `1` or `true` lets the server start with a `CONNECTION_KEY` or `SECRETS_KEY` of 16 to 31 characters (it is warned about at start). Without it such a key stops the server, because the key is the only entropy in every key derived from it. Keys under 16 characters are always refused |
| `SETUP_TOKEN` | unset | The token the first sign-up needs while no account exists, so a stranger who reaches an empty server cannot become its administrator. At least 16 characters. **Required to create the first account**: the server does not make one, and with none set it refuses the first sign-up (`setup_token_required`) and says so in its log. Once an account exists it is no longer asked for |
| `ALLOW_OPEN_BOOTSTRAP` | `false` | `true` lets the first caller become administrator with no setup token. For throwaway local servers only |
| `MFA_ENABLED` | `true` | `false` removes two-factor sign-in completely: no endpoints, no screens |
| `MFA_WINDOW_STEPS` | `1` | 30-second steps a code is accepted either side of now (0 to 5) |
| `INTROSPECT_ALLOW_HOSTS` | empty | Hosts, IPs or IPv4 CIDRs the server may connect to even if private (loopback, `10.x`, ...). Blocked by default. A bad entry stops the server at start, and a range wider than `/8` is refused |
| `INTROSPECT_ALLOW_PRIVILEGED` | unset | `1` lets a SQL Server import log in as a `sysadmin` or `db_owner`; by default such a login is refused. Use a read-only login instead |
| `WEBHOOK_ALLOW_HOSTS` | empty | Same format, for drift webhooks only: hosts, IPs or IPv4 CIDRs a webhook may POST to even if private, and the only hosts that may use plain `http://` (every other webhook must be `https://`). A database allow-list does not open webhook targets, and the other way round |
| `DB_POOL_MAX` | `10` | Most connections one server process opens to its database |
| `DB_STATEMENT_TIMEOUT_SECONDS` | `120` | Seconds a statement may run before the database cancels it; `0` for no limit |
| `SNAPSHOT_KEEP` | `200` | Newest snapshots kept per diagram; `0` keeps them all |
| `AUTO_PUBLISH_COALESCE_SECONDS` | `300` | While auto-publish is on, a save rewrites the person's latest auto snapshot when it is younger than this, instead of adding a copy; `0` adds one every save |
| `AUDIT_SAVE_MINUTES` | `60` | A save is logged once per person and diagram in this many minutes; `0` logs every save |
| `SHARE_RATE_LIMIT` | `60` | Public share requests per minute per IP |
| `COOKIE_SECURE` | `auto` | The session cookie's `Secure` flag: `true`, `false`, or `auto` (only on requests that arrived over HTTPS; behind a proxy also set `TRUST_PROXY`, or the server warns at start that the cookie goes out without `Secure`). A Secure cookie is named `__Host-qbase_session`, otherwise `qbase_session`; either name is accepted |
| `AUTH_RATE_LIMIT` | `20` | Sign-in, sign-up and change-password calls per minute per client address |
| `AUTH_MAX_FAILURES` | `10` | Failed sign-ins (or wrong current passwords) from one address before it is locked out of an account; failures from all addresses together lock the account at five times this |
| `AUTH_LOCKOUT_MINUTES` | `15` | How long a locked address, or a locked account, waits. One address locks only itself. Failures from many addresses together can lock an account for every new address, but an address the person signed in from in the last 30 days still has its password checked, so strangers cannot keep the owner out |
| `PASSWORD_MIN_LENGTH` | `12` | Fewest characters of a new password. Cannot be set below 8. Applies when a password is set, never at sign-in |
| `SESSION_DAYS` | `30` | Longest a session lasts, in days (1 to 3650) |
| `SESSION_IDLE_DAYS` | `14` | A session unused for this many days ends early; `0` = only `SESSION_DAYS` applies |
| `TRUST_PROXY` | unset | Behind a reverse proxy: the number of proxies in front of the server (`1` for one), or their addresses, comma separated. `true` is refused, because any visitor can send `X-Forwarded-For` |
| `LINT_RATE_LIMIT` | `30` | Schema lint calls per minute per user |
| `OUTBOUND_RATE_LIMIT` | `20` | Connections to your databases (import, re-sync, drift checks) per minute per user |
| `BODY_LIMIT_KB` | `1024` | Largest request body on ordinary routes, in KB |
| `DIAGRAM_BODY_LIMIT_MB` | `25` | Largest request body on the routes that carry a whole diagram, in MB. Saving a diagram blocks the server's event loop while it is parsed, checked and written, about 0.9 s at 40 MB and roughly 0.5 s at 25 MB, and every other request waits that long. Raise it only if a diagram of yours is larger |
| `DRIFT_CACHE_SECONDS` | `300` | Opening a diagram reuses a drift report this young while the diagram and its settings are unchanged; `0` always reads the database |
| `DRIFT_REPORT_KEEP` | `50` | Newest drift reports kept per diagram; `0` keeps them all |
| `DEAD_LINK_KEEP_DAYS` | `30` | Share links revoked or expired this many days ago are deleted; `0` keeps them all |
| `AUDIT_RETENTION_DAYS` | `365` | Audit rows older than this many days are deleted; `0` keeps them all |
| `SSE_MAX_PER_LINK` | `100` | Most live viewers one share link may have at once |
| `SSE_MAX_PER_IP` | `20` | Most live viewers one client address may have at once, over all links |
| `SSE_MAX_LOCK_PER_USER` | `20` | Most lock event streams one signed-in user may have open at once (one per editor tab), counted per server process |
| `SSE_HEARTBEAT_SECONDS` | `25` | Seconds between pings on a live stream (1 to 3600); each re-checks a signed-in viewer's session and names the newest version |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
