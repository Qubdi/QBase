# QubdiDB TODO

Open work, newest first. Tick an item when it ships and note the commit.

## Dependency upgrades (client)

Checked 2026-10-19 with `npm outdated` and `npm audit --omit=dev`: no known vulnerabilities, the
server and runtime images (Node 24, PostgreSQL 18, nginx stable) are current. The client is behind
on a few major versions. None of this is a security fix; it keeps later upgrades from getting
harder. One PR per step, with `npx vitest run` and `npm run build` (includes lint) green before it is ticked.
Let Dependabot's minor and patch PRs merge as they come; take majors here, on purpose.

1. [x] **zod 3.25 → 4 on the client.** Small, and puts the client on the same major as the server
   (already zod 4). Watch for changed error formatting (`.format()`/`.flatten()`, `message` →
   `error`) and `.default()`/`.optional()` behaviour in form and import schemas.
2. [x] **React 18.3 → 19, in one PR together with the libraries that follow it:**
   react-helmet-async 2 → 3, vaul 0.9 → 1, framer-motion 12 → 14. Before starting, scan for what
   React 19 removed: `defaultProps` on function components, string refs, legacy context,
   `ReactDOM.render`/`findDOMNode`, and `@types/react` 19 type changes (`useRef` needs an
   argument, `JSX` namespace). Check Radix, xyflow, monaco and cmdk still render and behave.
3. [x] **@dbml/core and @dbml/parse 3.x/5.x → 10.x, only when there is a reason** (newer DBML
   syntax or a parser fix we need). It is the core of DBML import/export; run the `dbml-export`
   cases and the import tests, and compare the output of the existing cases before and after.
4. [x] **Only when needed or when step 2 forces it:** react-resizable-panels 2 → 4 (API changed),
   @dnd-kit/sortable 8 → 10, nanoid 5 → 6.
5. [x] **tailwind-merge 2 → 3 only together with a Tailwind 4 move**, not on its own.

## React Compiler lint rules

`eslint-plugin-react-hooks` 7 adds rules from the React Compiler. The existing
components were written before them (about 80 places reset state in an effect or
read a ref while rendering), so `eslint.config.mjs` keeps these four off until
those places are migrated. Turn each on, fix what it reports, then remove its
line from the config.

1. [ ] `react-hooks/set-state-in-effect`
2. [ ] `react-hooks/refs`
3. [ ] `react-hooks/preserve-manual-memoization`
4. [ ] `react-hooks/use-memo`
