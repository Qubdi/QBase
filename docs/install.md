# Run QBase

[← Back to the README](../README.md)

QBase is two parts: the **server**, which keeps accounts, projects and diagrams in its own PostgreSQL database, and the **editor**, the web app. Pick one way to run them:

| | Where it runs | Which PostgreSQL |
| --- | --- | --- |
| [**A**](#option-a-everything-in-docker-with-the-bundled-postgresql) | Docker | the one bundled with QBase (simplest) |
| [**B**](#option-b-docker-with-your-own-existing-postgresql) | Docker | one you already run |
| [**C**](#option-c-from-source-for-development) | your machine, from source | either |

With Docker (A and B) the server is always on: the image holds the server and the editor, which the server serves itself, so it needs PostgreSQL and the first account you create becomes the administrator. Only C can run the editor on its own: without `VITE_QUBDI_BACKEND_URL` it is in local-only mode, with the diagrams kept in your browser and no accounts, projects, share links or live-database import.

You need Git for all of them, [Docker](https://docs.docker.com/get-docker/) with Compose v2 for A and B (`docker compose version` should work), and Node 24 for C (the version in `.nvmrc`). Commands are for a Bash shell; in Windows PowerShell `cp` works the same, and Git Bash has `openssl`.

A secret in these steps means a long random string. Make one with `openssl rand -hex 24`, or with Node: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

## Option A: everything in Docker, with the bundled PostgreSQL

1. **Get the code.**

   ```bash
   git clone https://github.com/Qubdi/QBase.git
   cd QBase
   ```

2. **Make your settings and start it.**

   ```bash
   bash run.sh setup        # makes .env with random secrets
   docker compose up -d     # pulls the published image and starts it with the bundled PostgreSQL
   ```

   `bash run.sh setup` makes `.env` from `.env.example` and replaces its two dummy secrets (`POSTGRES_PASSWORD` and `CONNECTION_KEY`) with random values; it never changes a value you have already set. `docker compose up -d` pulls `qubdi/qbase` from Docker Hub (the editor and its API in one, for amd64 and arm64) as `latest`, the newest release; set `QBASE_VERSION` in `.env` to pin another one (such as `1.0.1`). Both need only Docker; on Windows run `run.sh` in Git Bash or WSL.

   Keep `.env`: it holds your passwords and keys, and losing `CONNECTION_KEY` makes saved database connections unreadable. `SECRETS_KEY` is optional: it encrypts authenticator-app secrets for two-factor sign-in (see [Security](security.md#two-factor-sign-in-authenticator-app)).

   **The same by hand**, if you prefer: `cp .env.example .env`, then replace the dummy `POSTGRES_PASSWORD` and `CONNECTION_KEY` in it (each a long random string, e.g. `openssl rand -hex 24`; `CONNECTION_KEY` needs at least 32 characters). Compose starts on the dummy values too, but they are public: change them before the first start, because the database keeps the password it was created with. The server prints a warning while it runs on either. Compose refuses to start if either is left empty.

3. **Or build the image from your checkout** instead of pulling it, to run your own changes:

   ```bash
   bash run.sh start
   ```

   It makes `.env` as above if there is none, builds the image from your checkout, starts QBase with its bundled PostgreSQL, waits until both are healthy, and prints the address and the setup token for the first account. The first build takes a few minutes. By hand: `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build --wait`. If `docker compose up -d` stops with "not found" (a pinned `QBASE_VERSION` that is not published), this is the way to get a working image.

4. **Open the editor** at <http://localhost:8080> and create the first account. It becomes the administrator. The form asks for a *setup token*: the server prints it once in its log (`docker compose logs app`; `bash run.sh start` shows it for you), or it is the `SETUP_TOKEN` you chose. Sign-up then closes: the administrator adds everyone else under *Admin > Users* and gives them access to projects.

5. **Check that it is up** (optional). `db` should be `healthy` and `app` `running` (its health says `starting` for the first half minute).

   ```bash
   docker compose ps
   curl http://localhost:8080/health      # {"ok":true}
   ```

   In PowerShell `curl` is a different command: open <http://localhost:8080/health> in a browser instead.

Day to day:

```bash
docker compose logs -f app        # follow the log
docker compose down               # stop; your data stays in the postgres-data volume
docker compose up -d              # start again
docker compose pull && docker compose up -d   # update (to latest, or to the QBASE_VERSION in .env)
docker compose down -v            # stop AND delete all data
```

To try a change before it is published, build the image from your checkout instead of pulling it. It gets the Docker Hub name, `qubdi/qbase:<QBASE_VERSION>`, so once tested it can be pushed as it is. Use a tag of its own: with no `QBASE_VERSION` the build is tagged `latest`, which hides the published one on this machine until the next `docker compose pull`.

```bash
QBASE_VERSION=1.3.0-rc1 docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
QBASE_VERSION=1.3.0-rc1 docker compose -f docker-compose.yml -f docker-compose.build.yml push app
```

That image is for your machine's platform only; releases from the tag workflow are built for amd64 and arm64.

`bash run.sh` opens a menu of these: `start` (first time: `.env`, build and start), `setup` (only `.env`), `build`, `rebuild`, `up`, `down`, `down -v`, `push` (it asks for the version); `bash run.sh build 1.0.5` runs one directly, and `bash run.sh help` lists them.

To publish an image by hand, `bash run.sh push <version>` pushes the image you built as `qubdi/qbase:<version>` to Docker Hub, and `bash run.sh push <version> --all-platforms` builds it for amd64 and arm64 first (push only the image built for your machine and `latest` would lose the other platform). A stable version also becomes `latest`, replacing the previous one, which stays on Docker Hub under its own version tag (the script prints its digest and the command to put it back); a prerelease such as `1.0.5-rc1` never moves `latest`, and `--no-latest` leaves it alone too. It asks before pushing, and the image is not scanned or signed as the tag workflow's is.

QBase listens on `127.0.0.1` only. To reach it from other machines, set `APP_BIND_IP` in `.env` (or put a reverse proxy in front). The editor and its API share one address, so there is no CORS or backend URL to set; behind a reverse proxy, also set `TRUST_PROXY`. See [Configuration](configuration.md).

## Option B: Docker, with your own existing PostgreSQL

QBase then does not start a database of its own. You need PostgreSQL 16 or newer. CI runs the whole server test suite on both 16 and 18.

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
   bash run.sh setup        # makes .env with random secrets (or: cp .env.example .env, then replace the two dummy secrets)
   ```

4. **Point `.env` at your database.**

   ```bash
   POSTGRES_HOST=host.docker.internal    # or the name or IP from step 2
   POSTGRES_PORT=5432
   POSTGRES_USER=qbase
   POSTGRES_PASSWORD=choose-a-password
   POSTGRES_DB=qbase
   CONNECTION_KEY=<a secret>             # at least 32 characters
   ```

   Use a password of plain letters and digits: Compose pastes it into the connection address as it is, so `@ : / ? # %` would break it.

5. **Start only the server and the editor.** `--no-deps` is what keeps the bundled database from starting. This pulls the published image; to build it from your checkout instead, add `-f docker-compose.build.yml` after `-f docker-compose.yml` and `--build` after `up -d`.

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

7. **Open the editor** at <http://localhost:8080> and create the first account, as in Option A (the setup token is in the server's log).

The Docker setup cannot ask PostgreSQL for SSL, because Compose builds the connection address from the five values above. If your database requires SSL, use Option C with `?sslmode=require` on `DATABASE_URL`.

## Option C: from source, for development

1. **Check Node:** `node -v` should say 24 (`nvm use` reads `.nvmrc`).

2. **Get a database.** Either start the bundled one:

   ```bash
   git clone https://github.com/Qubdi/QBase.git
   cd QBase
   cp .env.example .env              # replace the dummy POSTGRES_PASSWORD and CONNECTION_KEY in it (Compose needs both)
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
   - `CONNECTION_KEY`: a secret of at least 32 characters, e.g. `openssl rand -hex 24` (needed to save database connections).
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

   `.env` from step 2 already has `VITE_QUBDI_BACKEND_URL=http://localhost:3001`. Without that setting the editor runs in local-only mode: it shows no account screens, the diagrams stay in your browser, and accounts, projects, share links and live-database import are not available (schema lint works either way).

5. **Open <http://localhost:5173>** and create the first account: it becomes the administrator. The form asks for a setup token, which `npm run dev` of the server prints once at start (or set `SETUP_TOKEN` in `server/.env`).
