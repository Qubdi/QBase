# Phase 4 decisions and open points

From the clean author's report (2026-11-07). The author's choices were accepted by the
assistant on the owner's standing instruction to decide small things autonomously; the items
under "Owner to confirm" were not decided for the owner.

## Accepted choices

- Version key in written files: `qbaseFormat: 1` (data-format Q2). Written on every output,
  including server content.
- DAT-034: length is a number or `max` in the model; on the wire it stays text, and `"null"` or
  empty text means none.
- DAT-060: new designs get a plain 25-character id (no browser prefix); old ids open unchanged.
  (`generateDiagramId` in `src/lib/utils/utils.ts` is now unused by the editor and goes when the
  QBase files are moved to the new adapter.)
- EDT-222: history keeps 200 steps; undo is not persisted.
- EDT-139: deleting a column removes the links that use it. EDT-101: changing a table's schema
  touches that table; the schemas stored on its links follow. EDT-194: switching a custom type's
  kind clears the data of the other kind.
- Oracle and ClickHouse designs keep their stored type and are read-only (the model refuses every
  command). Architecture section 5 was corrected.
- Dependencies: load and are written back unchanged; no command creates them; deleting a table
  removes and restores them on undo (avoids dangling records).
- DAT-012: relationships keep their stored order; the one-time migration sorts them by name once.
- Parse drops a link whose table or column is missing and warns (the model needs resolvable links).
- Check-constraint ids: the model keeps one global map; a colliding id is regenerated on load.
- Primary-key index sync runs on edits, not on load (load only repairs a nullable PK column).
- Paste offset: (group width + 40) x (paste number + 1), first paste number 0.
- N:1 and 1:N: one rule for "switch tables": swap tables, columns and schemas; a many/one result
  becomes one/many. Many/one is preserved on load; only many/many is rewritten, with a warning.
- Mixed table order: with no `order` at all, tables before views, then by name; with some `order`
  values, a missing one counts as 0.

## Owner to confirm

1. **Old Dexie layout guess.** Version-1 index lists and "auto-increment primary key" were inferred
   from the spec. If a real `QBase` browser database differs, Dexie may refuse to open it.
   Verify against a real database from a browser that used the old editor (a manual step in
   `rewrite/spec/manual-test-script.md` section on opening old diagrams).
2. **Column-level `check` (DAT-040):** kept as is and written back; or convert it to a table check?
3. **Relationship direction** (data-format Q13): implemented as "source is the referenced side";
   still unverified against the running old editor.
4. **Compatible types short list (EDT-169)** applies to PostgreSQL and MySQL only; should MariaDB and
   CockroachDB inherit it?
5. **Migration noise:** each old many/many row gives one warning; may be noisy for a large legacy
   library.
6. **New dev dependency** `fake-indexeddb` (Apache-2.0, tests only): add to
   `inventory/third-party-licences.csv` (done by `node tools/licences.mjs` in Phase 9).
