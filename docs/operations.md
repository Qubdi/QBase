# Operating QBase

[← Back to the README](../README.md)

## Upgrading the bundled database (PostgreSQL 16 to 18)

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

## Notes

- Drift checks compare the server's copy of the diagram, so the editor syncs it first.
- Besides the limits in [Configuration](configuration.md#backend-settings), one signed-in user is held to 600 calls a minute across the whole API (a fixed ceiling, not a setting; counted in the shared counters like the other limits).
- Several server processes can share one database. Live share updates, the migrations at
  start-up and the hourly clean-up are coordinated through Postgres. So are the counts
  behind the rate limits (per address and per user, including the lint and outbound
  allowances), the sign-in and second-step lockouts, and the guard against two drift checks
  of one diagram at once (a Postgres advisory lock): they hold across all replicas. The
  counts live in the unlogged table `rate_counters`, one small write per limited request;
  the hourly clean-up deletes closed windows. If Postgres cannot answer a count, that
  request is counted in the memory of its own process instead (a warning is logged, at
  most once a minute), so an outage neither turns requests away nor locks people out, and
  the limits hold per process until it passes. The open live-viewer caps per link and per
  address (`SSE_MAX_PER_LINK`, `SSE_MAX_PER_IP`) hold across replicas too: each open stream
  is a row of the unlogged table `live_viewers` (migration `0030`), renewed on every
  heartbeat and counted for three heartbeats after the last renewal, so a replica that dies
  frees its viewers by itself; the hourly clean-up deletes the expired rows. Opening a
  stream takes one short transaction under a Postgres advisory lock, and each heartbeat
  adds one small write per viewer.
- The first start after upgrading to a version with the diagram-list columns (migration
  `0022`) rewrites the whole `diagrams` table under an exclusive lock: about 11 seconds for
  320 MB of diagrams here, and reads and writes of diagrams wait meanwhile. Start the new
  version in a quiet moment on a large installation.
- Migration `0028` turns those diagram-list columns into plain ones that the server writes
  itself (a save no longer makes the database parse the whole diagram a second time) and adds
  the same columns to snapshots, so the viewer list reads columns, not each snapshot's
  content. It only changes the catalog and adds empty columns, so it takes milliseconds on
  any size, and it builds five small indexes (on the `created_by`, `owner_id`, `updated_by`
  and `user_id` columns that point at users), each under a short lock on a small table; the
  migrator runs in one transaction, so they are not built `CONCURRENTLY`. Rows written before
  it have no stored size (and a snapshot no stored numbers) until the hourly clean-up has
  worked them out, 50 rows at a time (about 10 s of work per 20,000 small diagrams on the
  test machine); until then a read takes them from the content, so no answer changes, only
  its cost. The size limits for lint and drift checks use the stored size of the content as
  compact JSON, a little under the length Postgres gives the text of a jsonb.
- Upgrading from a version older than migration `0015` rewrites the whole `audit_log` table
  under an exclusive lock (its `id` becomes a `bigint`) and builds its indexes without
  `CONCURRENTLY`, so every action that writes an audit row (saves, sign-ins, admin changes)
  waits meanwhile. The time grows with the number of rows.
  It happens once; do it in a quiet moment, and lower `AUDIT_RETENTION_DAYS` and let the
  clean-up run first if the log is very large.

- Languages: the editor and the screens that talk to the server (sign-in, projects, members,
  share links, connections, drift, admin) are translated into German, French, Italian and Russian.
- The default `DIAGRAM_BODY_LIMIT_MB` went from 50 to 25. A diagram body is parsed, checked and
  written on the server's single event loop (about 0.9 s at 40 MB), and reading one back costs
  the parse again in the database driver. An installation that saves diagrams over 25 MB (a
  save of one answers 413) sets `DIAGRAM_BODY_LIMIT_MB` in its `.env` to keep them.
- DBML import reads at most 2,000,000 characters (a few thousand tables): the parser it uses slows
  down faster than the input grows (10k tables take about 12 s). Split a larger file.

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
  **Keep `CONNECTION_KEY` (and `SECRETS_KEY`, if you set it) with the backup, in a separate
  secret store, not inside the dump.** The dump holds saved database passwords, share-link
  tokens and authenticator secrets only in encrypted form. Restored with a different key,
  saved connections and share-link URLs cannot be read and people with two-factor on cannot
  sign in. After a restore, start the server with the same values.
