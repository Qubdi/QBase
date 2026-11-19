# Schema lint in CI and the API

[← Back to the README](../README.md)

## Schema lint in CI

```bash
cd server
npm run lint:diagram -- path/to/diagram.json --fail-on error
# options: --config lint.json  --format json  --fail-on error|warning|info|never  --database-type <type>
```

Exit code `0` means nothing at or above `--fail-on`, `1` means findings, `2` means bad input.
The same engine is available as `POST /lint` and `GET /diagrams/:id/lint`; `GET /lint/rules` lists the rules and their defaults.

## Read-only history endpoints

Paths are relative to the API root (`/api` when the server also serves the editor). The editor does not call these; they are for scripts and CI.

| Endpoint | Who | Answer |
|----------|-----|--------|
| `GET /diagrams/:id/versions` | any member | Published versions, newest first: `version`, `note`, `publishedAt`, `publishedBy` (null for viewers). Capped by `SNAPSHOT_KEEP` |
| `GET /diagrams/:id/versions/:version` | any member | One published version with its content |
| `GET /diagrams/:id/drift/reports?limit=` | editors and owner | Past drift reports, newest first (`limit` 1 to 100, default 20): `id`, `runAt`, `status`, `trigger`, `counts`, `worst`, `error`, `dismissedAt`. Capped by `DRIFT_REPORT_KEEP` |
