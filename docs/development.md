# Development

[← Back to the README](../README.md)

## Tests

```bash
npx vitest run                 # editor and shared logic
cd server && npx vitest run    # backend (needs the database up; by default the tests connect as
                               # qbase/qbase on port 5433: set TEST_PG_PORT, TEST_PG_USER and
                               # TEST_PG_PASSWORD for another port, user or password)
```

The SQL Server tests need the optional container and skip cleanly without it. Choose a
password of your own and give it to both the container and the tests:

```bash
export MSSQL_SA_PASSWORD='<a strong password>'
docker compose -f docker-compose.mssql.yml up -d
```

### Browser checks (not run in CI)

`tools/e2e/` holds real-browser checks of the built app. They run in a pinned Playwright
Docker image, so Node is not needed on the host, and no workflow runs them: run them by hand
before a release.

| Script | What it does |
|--------|--------------|
| `tools/e2e/run-smoke.sh` | Smoke test of the built editor in local-only mode |
| `tools/e2e/run-flows.sh` | Real-browser flows of the built editor (`ONLY=F1,F3` runs some) |
| `tools/e2e/run-server-flows.sh` | Flows of server mode against a throwaway database (needs Docker; builds the image of this checkout) |
| `tools/e2e/run-a11y.sh` | Accessibility audit (axe-core and keyboard checks) |
| `tools/e2e/run-perf.sh` | Timings on large diagrams (`SIZES=50,200`) |

The scripts in `tools/e2e/visual/` compare screens of two running builds side by side; they are
a development aid and run by hand.
