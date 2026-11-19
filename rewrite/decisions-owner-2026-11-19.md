# Owner decision, 2026-11-19: licence changed to Apache 2.0

The owner decided that QBase is licensed under the **Apache License, Version 2.0**, replacing the Elastic
License 2.0 chosen on 2026-11-08 (see `decisions-owner-2026-11-08.md`). Reason: wide use and
contribution, including by companies that offer the software as a service, which the Elastic
License 2.0 does not allow.

Checked before the change:

- **Copyright holders:** every commit in the history is by the owner or by the `Qubdi` identity; there is
  no outside contributor whose consent would be needed.
- **Clean-room rewrite:** the editor is written from scratch; `rewrite/similarity-allow.txt` lists the only
  generic files shared with ChartDB (AGPL-3.0), none of which is ChartDB's creative work. The database
  logos are the owners' trademarks, shown only to name the products, and are not covered by the licence
  (stated in `NOTICE`).
- **Dependencies:** all 154 production packages of the editor and 165 of the server are permissive
  (MIT, ISC, BSD, Apache-2.0, 0BSD, ...) apart from three SIL OFL 1.1 fonts, bundled unmodified under their
  own licence (listed in `NOTICE`).

Changed: `LICENSE` (the canonical text, SHA-256 cfc7749b...3d30), `NOTICE`, the `license` fields of both
`package.json` and lock files (`Apache-2.0`), `README.md`, `CLA.md`, `CONTRIBUTING.md`, `TODO.md`,
`QBase-build-tasks.md`, and the Dockerfile (the image carries `LICENSE` and `NOTICE` and the
`org.opencontainers.image.licenses` label).

Versions published earlier under the Elastic License 2.0, if any, stay under it for those who received
them.
