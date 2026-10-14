# QubdiDB TODO

Open work, newest first. Tick an item when it ships and note the commit.

## In progress: project workspace URLs

Choosing a project goes straight to its workspace, `/<project>/diagrams/`, with no
UUID and no separate project page. Diagrams are created inside the workspace.

- [x] Server: project slug (unique ignoring case, reserved paths rejected) + migration
- [x] Server: `projectId` on diagram responses
- [x] Client: `slug` on project types, `project-path` helpers (tested)
- [x] Client: `ensureLocalCopy` (open a server diagram as a local copy)
- [x] Workspace gate: resolve `/<project>/diagrams[/<server diagram id>]`, check role, 404 for
      another project's diagram
- [x] Routes: `/:projectSlug/diagrams`, `/:projectSlug/diagrams/:diagramId`; redirect old
      `/diagrams/<localId>` links; remove `/projects/:id` and the project page
- [x] Editor: loader, autosave and access gate read the diagram from the workspace
- [x] Editor: project-aware Open and Create dialogs (list the project's server diagrams, create
      on the server, import from database) replace the local ones
- [x] Home and admin panel link to `/<slug>/diagrams`
- [ ] Rebuild Docker and smoke-test

## Backlog: admin panel and home page

1. **Lists grow without limit.** In the admin panel the Projects and Users lists keep
   growing and make the page taller. The same happens on the home page (`/`).
   - Add pagination (page size ~10 to 20) to the admin Users list, the admin Projects list and
     the home project list, and keep the page height stable (the list area scrolls or pages;
     the page itself does not grow).
   - Prefer server-side paging (`?page=&limit=` with a total count) so it scales.
2. **Search bars.** Search users (by email) and projects (by name) in the admin panel.
   - Server-side `?q=` so search works across pages; debounce the input.
3. **User status.** Users can be non-active.
   - Add a status (active / disabled) to users; show it in the admin Users list and let an
     admin toggle it.
   - A disabled user cannot sign in, their existing sessions are revoked, and they cannot use
     the API. Their diagrams and project assignments stay.
   - Guard rails: an admin cannot disable themselves, and the last active admin cannot be
     disabled.
   - Audit log entries for disable and enable. Optionally filter the list by status.
4. **Home page (`/`).**
   - Same unbounded growth as item 1, so paginate it and add the search bar.
   - Users only see the projects they are assigned to. The server already filters
     `GET /projects` for non-admins; add a test that proves it and check the UI never shows
     others. Open question: should admins also see only assigned projects here, or all
     (current behaviour)?
5. **Dropdown UI.** The dropdowns look inconsistent and need a design pass.
   - Native `<select>` elements are used in the admin panel (role pickers, "user to assign"),
     the new-diagram dialog (database type), the access banner (move into project) and the
     members dialog. Replace them with the app's styled Select (Radix) so they match both
     themes and the rest of the UI.
   - Review the account menu and other dropdown menus for spacing, hover and focus states.
   - To confirm with the user: which dropdowns bother them most.
