# QBase — Audit

**rev** 0 · **date** –
**method** none yet: no audit pass has been run
**scope** whole repo except `node_modules/`, `stats/`, `src/templates-data/`, `src/i18n/locales/` content

| Lens | Open | Crit | High | Fixed | Accepted |
|------|-----:|-----:|-----:|------:|---------:|
| Security & secrets | 0 | 0 | 0 | 0 | 0 |
| Repository | 0 | 0 | 0 | 0 | 0 |
| Server | 0 | 0 | 0 | 0 | 0 |
| Database | 0 | 0 | 0 | 0 | 0 |
| Client | 0 | 0 | 0 | 0 | 0 |
| Dead code | 0 | 0 | 0 | 0 | 0 |
| **Total** | 0 | 0 | 0 | 0 | 0 |


## Open

### Security & secrets

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|

### Repository

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|

### Server

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|

### Database

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|

### Client

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|

### Dead code

| ID | Sev | Finding | Where | Fix |
|----|-----|---------|-------|-----|

---

## Fixed

| ID | Lens | Finding |
|----|------|---------|

---

## Accepted

| ID | Lens | Finding | Why |
|----|------|---------|-----|

---

## Dropped

| ID | Finding | Reason |
|----|---------|--------|

---

## Database scale check

### Measured

| Item | Value |
|------|-------|
| Seed | users 10k · projects 500 · diagrams 20k (321 MB) · snapshots 50k (726 MB) · `audit_log` 5M (1.3 GB) |
| Autosave (pgbench, 4 clients, before the audit throttle) | 5.4 ms avg · 738 tps · 21 KB WAL per save · 98.75% HOT |
| Viewer list, 103 diagrams | 136 ms at 3 versions · 1,968 ms at 50 · 31 ms with LATERAL |
| Admin unpaged list, 20k rows | seq scan + 2.6 MB on-disk sort · 20 ms |
| Migration 0022, 321 MB | 10.8 s under ACCESS EXCLUSIVE |
| Viewer list after fix, 100 diagrams × 50 versions | 48 ms, was 2,055 ms on the same data |
| 43 MB diagram in Node | `JSON.parse` 122 ms · `JSON.stringify` 137 ms |
| Stock Postgres | `max_connections` 100 · `shared_buffers` 128MB · `work_mem` 4MB |

### Verified fine

| Area | Result | Where |
|------|--------|-------|
| Session lookup | One PK join, 0.6 ms; `last_seen_at` written at most every 5 min | `server/src/auth/sessions.ts:74` |
| HOT autosave | Holds: 1,975 of 2,000 diagram updates HOT | `server/src/db/schema.ts:254` |
| Member diagram list | Index path, 120 rows in 2.6 ms | `server/src/diagrams/routes.ts:150` |
| Audit log reads | Every filter and keyset cursor index-driven, under 1 ms | `server/src/audit/activity.ts:150` |
| Admin stats and diagrams | One statement 24 ms; top-N page 4–6 ms | `server/src/admin/stats.ts:79` |
| Transactions | Short; no pool client held across remote I/O or SSE | `server/src/drift/service.ts:263` |
| Write races | Lock upsert, link advisory lock, compare-and-write save | `server/src/diagrams/lock.ts:25` |
| Retention | Every growing table pruned | `server/src/maintenance.ts:141` |
| Keys and FKs | `bigint` audit ids; FK indexes on large cascades | `server/src/db/schema.ts:312` |
| Schema vs migrations | `drizzle-kit generate`: no changes; journal 0000–0024 in order | `server/src/db/migrations/meta/_journal.json` |
| Unindexed FKs | 5, all user-delete `SET NULL`/`CASCADE` on small tables | `server/src/db/schema.ts:167` |

---

## Changelog

| Rev | Date | Change |
|-----|------|--------|
