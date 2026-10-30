<!-- The title follows Conventional Commits, e.g. `fix(server): reject empty names`. -->

## What and why

## How it was checked

- [ ] `npm run lint`, `npx vitest run` and `npm run build` pass (editor)
- [ ] `npm --prefix server run lint`, `npm --prefix server run typecheck` and the server tests pass, if `server/` or `shared/` changed
- [ ] New behaviour has a test; a bug fix has a test that fails without the fix
- [ ] I have signed the [CLA](../CLA.md)
