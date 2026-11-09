# Load tests

Measure response time and capacity under concurrent users, against a throwaway
QBase and PostgreSQL in Docker. Nothing touches a real database. You need
Docker with Compose v2; k6 and Node run in containers, so nothing else is installed.

```bash
cd server
npm run load                  # every scenario, in turn (about 10 minutes)
npm run load -- mixed         # one: login-storm | mixed | share-read | sse
npm run load -- sizes         # share-read and sse at 5, 35 and 100 tables
npm run load -- down          # remove the stack and the npm cache volume
```

Each scenario starts from a fresh database, so the data one leaves behind
(snapshots, audit rows) does not slow the next. Output is printed and saved in
`results/` (`<scenario>.txt`, plus k6's `<scenario>.json`). The run exits
non-zero when a threshold fails, so it can gate CI.

## Scenarios

| Scenario | What it does | Fails when |
| --- | --- | --- |
| `login-storm` | `RATE` sign-ins per second for a minute, while `/health` is pinged | login p95 > 1.5 s, errors > 1%, or `/health` p95 > 200 ms (hashing starves the server) |
| `mixed` | `VUS` editors: list, open, save 1-3 times, publish now and then, with think time | p95 of list > 500 ms, open > 800 ms, save > 1 s, publish > 1.5 s, errors > 1% |
| `share-read` | `VUS` anonymous viewers hammering `GET /s/<token>` | p95 > 300 ms, p99 > 800 ms |
| `sse` | `VIEWERS` live viewers on one link, `PUBLISHES` publishes: time until each viewer hears of the new version, then the snapshot re-read all of them do at once | a viewer never hears, or p95 > `SSE_P95_MS` (2 s) |

After each scenario the five most expensive queries (`pg_stat_statements`) are
printed, which is where to look first when a threshold fails.

## Settings

Set in the environment, e.g. `VUS=200 DURATION=5m npm run load -- mixed`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VUS` | 50 | concurrent virtual users (`mixed`, `share-read`) |
| `DURATION` | 2m | time at full load |
| `RATE` | 100 | sign-ins per second (`login-storm`) |
| `LOAD_USERS` | max(200, VUS); 10 for `share-read` and `sse` | accounts created; a virtual user needs its own, because signing in ends an account's older session |
| `LOAD_TABLES` | 35 | tables per diagram, a typical model (5 is small, 100 is large) |
| `VIEWERS`, `PUBLISHES`, `SSE_P95_MS` | 500, 5, 2000 | the `sse` scenario |
| `LOAD_APP_CPUS`, `LOAD_APP_MEM` | 2, 1g | what the server container may use |
| `DB_POOL_MAX` | 10 | the server's connection pool, as in production |

The per-address limits (login, share, live viewers) are raised in
`docker-compose.yml`, because all virtual users share one address and the
stock limits would only measure themselves. Capacity settings stay at their
real defaults. Numbers depend on the machine: compare runs on the same one, and
change one setting at a time.

## Reading the results

- **Latency climbs but errors stay at zero**: the server is queueing. Check
  `DB_POOL_MAX` against the slowest queries, and the CPU limit.
- **`/health` slows during `login-storm`**: password hashing is competing with
  request handling. Scaling out or lowering the login rate helps; a cache does not.
- **`sse` viewers miss events**: events are not replayed after a dropped
  listener connection, so this points at the Postgres LISTEN/NOTIFY bridge or
  at a closed stream.
- Run it with 2 replicas behind a proxy before trusting the in-memory rate
  limiters: they are per process (see "Run one server process" in the README).

## Sizes

`npm run load -- sizes` repeats `share-read` and `sse` with 5, 35 and 100 tables
per diagram and writes a comparison to `results/sizes.txt`. Cost grows with the
size of the diagram (it is read, serialised and sent whole), so test with the
size your users have. The `share-read` thresholds are set for the default 100
users; with `VUS=500` and no pause between requests it is a stress test, and
the server's throughput, not the thresholds, is the number to read.
