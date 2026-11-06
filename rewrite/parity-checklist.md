# Parity checklist

The rewritten editor is done when everything we decide to keep in this list works the same
way as the editor on `main`. Phase 1 fills this in by **using the app on `main`**, not by
reading its code. Each line is one observable behaviour that a person can check.

How to use it:

1. Phase 1: write each behaviour as one line. Mark it **keep**, **change** or **drop**.
   Dropping is a decision for the project owner and is recorded here.
2. Phases 3 to 8: a module is finished when its lines are ticked and each tick points at a
   test (automated where it can be) or a manual step in `rewrite/spec/manual-test-script.md`.
3. Phase 9: every **keep** line must be ticked before the release.

Status: `[ ]` open, `[x]` done and tested, `[~]` done, tested by hand only.

## Feature areas to cover

These are the areas the editor on `main` has today. They are headings only; the lines under
each one are written in Phase 1.

- Diagrams: create, open, rename, duplicate, delete, list, search
- Tables: add, rename, move, colour, comment, delete, drag to reorder
- Fields: add, type, size, nullable, primary key, unique, default, comment, reorder
- Indexes and constraints (including check constraints)
- Relationships: create, change cardinality, delete, show or hide
- Dependencies between tables and views
- Custom types (enums and composite types)
- Areas (groups) and notes
- Canvas: pan, zoom, minimap, select, multi-select, snap, fit to screen, full screen
- Filters and visibility of tables and schemas
- Undo and redo
- Copy and paste of tables
- Import: from SQL (each dialect), from DBML, from a script, from a live database
- Export: SQL (each dialect), DBML, JSON, image
- Diff view between two versions of a diagram
- Templates and examples
- Themes, languages, keyboard shortcuts, settings
- Accounts, projects, publishing, share links, admin, lint, drift detection
  (the QBase server features, already original; they must keep working with the new editor)
- Local-only mode with no server (offline editor)
- Import of diagrams saved by the old editor

## Behaviours

| ID | Area | Behaviour (what a person sees) | Decision | Status | Test |
| --- | --- | --- | --- | --- | --- |
