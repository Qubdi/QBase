# Brief for the clean author: Phase 5, dialects and formats

You are a CLEAN AUTHOR in a clean-room rewrite of a database-diagram editor (QBase). This file
is your CLAUDE.md. Read all of it before doing anything.

## The one rule

You must not read, open, search for or ask about ChartDB's source code, nor the `main` branch
of the QBase repository, nor any copy of either, nor any test fixture or SQL sample from either.
You work only from the files in this checkout. If a file here seems to contain code from another
project, stop and tell the owner. Do not browse outside this directory (no `..`, no other paths
under the owner's home, no `/tmp` scratch folders you did not create, no web search for ChartDB
code). Library documentation for npm packages is fine. If you already know the ChartDB project
from training, do not reproduce its structure, names, algorithms or SQL fixtures; design from
the spec and write your own samples.

## What you write

Phase 5 of `rewrite/architecture.md` (sections 3, 6 and 9). New original code under `src/`:

| Folder | What | Notes |
| --- | --- | --- |
| `src/dialects/` | one folder per dialect (PostgreSQL, MySQL, SQL Server, SQLite; MariaDB and CockroachDB as thin variants) with: id, label, capabilities, type catalogue, default type, default schema, `sql.read`, `sql.write`; `registry.ts` | Oracle and ClickHouse are DROPPED (owner decision); unknown ids resolve to a read-only generic dialect |
| `src/formats/sql/` | `importSql(text, dialectId)` and `exportSql(design, dialectId)` returning a result plus diagnostics (errors, warnings) | uses `node-sql-parser` where it parses, your own handling elsewhere |
| `src/formats/dbml/` | `importDbml`, `exportDbml` | uses `@dbml/core` (Apache-2.0) |
| `src/formats/file/` | the JSON export file (writer, with the new version key) built on `src/core/wire` | the exporter is thin |
| `src/formats/metadata/` | the database-introspection metadata types and loaders, see below | |
| `src/formats/image/` | the pure part of image export (options, file naming, bounds); the DOM capture is Phase 6 | |

Model types, commands and wire parse and serialise already exist in `src/core` (written by an
earlier clean author, Phase 4). Read them, use them, do not change them; if you need a change,
write it in your final message. No React in your folders.

The database-metadata contract: the server and the Docker build import the type and zod schema
`DatabaseMetadata` from the fixed path
`src/lib/data/import-metadata/metadata-types/database-metadata.ts`. Create it there (types from
the shapes in `server/src/introspect` and the metadata section of
`rewrite/spec/import-export.md`), and a loader `loadFromDatabaseMetadata` and
`createRelationshipsFromMetadata` under `src/formats/metadata/` re-exported from
`src/lib/data/import-metadata/import/index.ts` and `.../import/relationships.ts` at the fixed
paths. Nothing else lives in `src/lib/data`.

## What you read

- `rewrite/architecture.md`, `rewrite/spec/import-export.md` (all of it: matrix, flows, mappings,
  sample inputs and exact expected outputs, quirks, open questions), `rewrite/spec/data-format.md`,
  `rewrite/spec/owner-decisions.md`
- `rewrite/parity-checklist.md` rows `IMP-*`, `EXP-*` and `DAT-*`
- `src/core/**` (the model you build designs from)
- `server/src/introspect` (what the server sends)

## How to work

1. Own names, own structure. Dialects are plug-ins behind the registry; nothing outside
   `src/dialects` branches on a dialect id.
2. Tests first or alongside, from the spec rows and the samples. Name each test after the parity
   row it covers (for example `EXP-012`). The sample schemas in the spec section "Samples" are
   invented by the spec writers: use them as your fixtures (they are the expected outputs); add
   your own. Do not search for fixtures anywhere else.
3. The spec says some sample outputs were derived by reading, not by running, the old editor.
   Where the spec marks something "open check", pick the sane behaviour, document it in
   `rewrite/log.md` and list it in your final message. Do not guess at old behaviour beyond the spec.
4. Round trip: for every sample, import then export then import gives the same model; export is
   byte-for-byte as the spec says.
5. Docker for node tooling (see the Phase 4 pattern): `docker run --rm -u $(id -u) -v "$PWD":/w
   -w /w node:24 npx vitest run src/dialects src/formats` (run `npm ci` first if needed).
6. Gates before hand-back: `npx tsc -p tsconfig.app.json --noEmit` clean for your files;
   `npx eslint src/dialects src/formats src/lib/data --max-warnings 0` clean; tests pass.
7. Add a row to `rewrite/provenance.md` (author: "clean author session, phase 5", has read ChartDB
   source: no) before your first commit and one row per finished module to `rewrite/log.md`.
8. Commit to a branch `clean/phase5` in this checkout, small commits, one module each. Never push.

## Order

1. `dialects/registry`, capability matrix, type catalogues, defaults
2. SQL export for PostgreSQL, MySQL, SQL Server, SQLite (then MariaDB and CockroachDB variants)
3. SQL import for the same, with diagnostics; then the round-trip tests
4. DBML import and export
5. metadata types and loaders at the fixed paths, then the JSON file writer, then image options

## Done when

- every IMP and EXP row marked keep or change has a test, or an entry in `rewrite/log.md` saying
  why not
- round trip passes for every sample on every kept dialect
- the fixed-path metadata module exists and `server/` type-checks against it (run the server's
  typecheck in docker)
- gates in step 6 pass
- your final message lists open questions and spec contradictions

## Hand-back

Stop when done and report the branch name. The owner copies your new files out of this checkout
(not a merge) and runs the similarity check against ChartDB. You do not have ChartDB and must not
fetch it.
