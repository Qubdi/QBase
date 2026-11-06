# Phase 6a decisions and open points (store and QBase adapter)

From the Phase 6a report (2026-11-07). Decided by the assistant on the owner's standing
instruction to decide small things autonomously.

## Decisions

1. **Kept `src/lib/data` files** (cross-dialect convert, validators, `foreign-keys`) still import the
   removed `@/lib/domain/*` paths. After Phase 5 lands, edit those imports to `@/qbase/diagram-types`
   (mechanical, like the other QBase files). No re-export shims for the old paths: shims would keep
   the old layout alive.
2. **`provideTypeCatalogue`** (in `@/qbase/type-catalogue`) is called once by whoever wires the
   dialect registry (Phase 5 integration). Until then lint fixes fall back to the made-up type id.
3. **`loadFromDatabaseMetadata` returns the wire-shaped `Diagram`** (C17); convert with
   `designToDiagram` if it returns a model `Design`.
4. **`diagramSchema` is tolerant** (needs id, name, known database type and arrays of objects with
   ids; repairs the rest; drops links to missing tables). Accepted for server content: it matches
   the tolerant parse rule in `architecture.md` section 5.
5. `useDiagram` returns unchanged references for untouched sections (the autosave revision count
   depends on it). `updateDiagramData(..., {resetHistory: false})` records no history; the caller
   adds the single undo step (spec C8); `replaceDiagram` is the one-step version.
6. `DiagramIcon` draws generated data-URI pictures (no database icon assets exist); `alt="database"`
   is fixed because its test requires it. Real icons are a Phase 7 content item.
7. New dependency: zustand 5.1.0 (MIT); recorded in `inventory/third-party-licences.csv` with
   `fake-indexeddb`.

## Still open

- `/:project/diagrams` with no diagram id and a local-mode page with no stored diagram render
  nothing: the project create/open dialog openers (P9) and the empty-state screen come with the
  editor workspace (Phase 6b).
- `lib/qubdi/config.ts` reports "Property 'env' does not exist on Window" although
  `src/window.d.ts` looks right; investigate when the type check reaches zero errors.
