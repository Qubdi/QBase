# Parity rows: the app shell (SHL) and the QBase integration (QBS)

Rows for `rewrite/parity-checklist.md`. Source of the behaviour: `rewrite/spec/app-shell.md`
(section numbers in brackets). Decision is a recommendation for the owner: keep, change or
drop, with a one-line reason. Status `[ ]` open; Test blank until Phase 8.

| ID | Area | Behaviour (what a person sees) | Decision | Status | Test |
| --- | --- | --- | --- | --- | --- |
| SHL-001 | Config | With no backend URL configured (empty `/config.js`, no dev variable) the app runs in local mode with no account UI [A1] | keep | [ ] | |
| SHL-002 | Config | With a backend URL (runtime `/config.js` value, trailing slash removed, or the dev variable) the app runs in server mode [A1] | keep | [ ] | |
| SHL-003 | Config | The shipped server answers `/config.js` with the value `/api`, so the editor and API share one origin [A1] | keep | [ ] | |
| SHL-004 | Config | Theme is applied before first paint by a separate script file, so no flash of the wrong theme and no inline script [A1] | keep | [ ] | |
| SHL-005 | Config | The app works under the server's content security policy: same-origin scripts, fonts, requests; no CDN or inline script [A1] | keep | [ ] | |
| SHL-006 | Config | Fonts (Inter, JetBrains Mono, Manrope) are bundled; nothing is requested from third parties [A1] | keep | [ ] | |
| SHL-007 | Config | Page is noindex (meta tag and robots.txt disallow all); favicon is empty; viewport is device width [A1] | keep | [ ] | |
| SHL-008 | Config | `VITE_HOST_URL` and `VITE_APP_URL` build variables exist but change nothing visible [A1] | drop | [ ] | |
| SHL-009 | Routes | Server mode: `/` is the project picker; `/<slug>/diagrams` and `/<slug>/diagrams/<id>` are the editor; `/diagrams/<local-id>` is the old bookmark form [A2] | keep | [ ] | |
| SHL-010 | Routes | Local mode: `/` and `/diagrams/<id>` are the editor [A2] | keep | [ ] | |
| SHL-011 | Routes | `/admin` redirects to `/admin/overview`; sections `/admin/{overview,projects,users,diagrams,activity}` are fixed paths [A2] | keep | [ ] | |
| SHL-012 | Routes | `/s/<token>` shows the shared-diagram viewer [A2, A13] | keep | [ ] | |
| SHL-013 | Routes | Unknown path shows a 404 page with "404", "Something's missing." and the footer mark [A2] | keep | [ ] | |
| SHL-014 | Routes | The server returns the app for any extension-less non-API path, so deep links and reloads work [A2] | keep | [ ] | |
| SHL-015 | Routes | Project slug in the URL is case-insensitive and URL-encoded in links [A2] | keep | [ ] | |
| SHL-016 | Routes | A diagram of another project opened through a project URL shows "not found", never the diagram [A2, A8] | keep | [ ] | |
| SHL-017 | Routes | All pages load lazily (first load does not include admin, viewer, DBML parser) [A2] | keep | [ ] | |
| SHL-018 | Routes | `/examples` and `/templates*` pages exist in local mode only [A2, A12] | drop | [ ] | |
| SHL-019 | Start-up | First screen waits briefly for the person's language; a failed language load falls back to English [A3] | keep | [ ] | |
| SHL-020 | Start-up | Local mode, `/` with a remembered default diagram: goes to `/diagrams/<id>` [A3] | keep | [ ] | |
| SHL-021 | Start-up | Local mode, no default but diagrams exist: Open dialog appears and cannot be dismissed [A3] | keep | [ ] | |
| SHL-022 | Start-up | Local mode, no diagrams at all: New diagram dialog appears and cannot be dismissed [A3] | keep | [ ] | |
| SHL-023 | Start-up | Opening `/diagrams/<id>` shows a full-screen spinner, clears undo/redo history, and falls back to the Open dialog if the diagram does not exist [A3] | keep | [ ] | |
| SHL-024 | Start-up | Opening any diagram makes it the remembered default [A3] | keep | [ ] | |
| SHL-025 | Start-up | There is no tutorial, tour, welcome screen or onboarding hint [A3] | keep | [ ] | |
| SHL-026 | Start-up | A forced-password-change dialog blocks the app when the server flags the account [A3, B2 P11] | keep | [ ] | |
| SHL-027 | Local data | Diagrams live in browser IndexedDB `QBase`; the old `QubdiDB` is merged in without overwriting, then deleted, retried each start [A4] | keep | [ ] | |
| SHL-028 | Local data | Every edit is saved immediately in local mode; no save button needed [A4] | keep | [ ] | |
| SHL-029 | Local data | Save icon in the navbar: hover text "Saved <time ago>" plus the exact local date and time on a second line [A4] | keep | [ ] | |
| SHL-030 | Local data | "Time ago" wording is translated for 12 languages, English for the rest; the word "Saved" is English only [A4] | change | [ ] | |
| SHL-031 | Local data | Ctrl/Cmd+S only updates the last-modified time [A4, A6] | change | [ ] | |
| SHL-032 | New dialog | Step 1 shows "Transactional" tab (MySQL, PostgreSQL, MariaDB, SQLite, SQL Server, Oracle, CockroachDB) and "Analytical" tab (ClickHouse) as option cards, 3 per row, 2 rows, with a more/fewer toggle [A5] | keep | [ ] | |
| SHL-033 | New dialog | Picking a database card selects it and goes straight to the import step [A5] | keep | [ ] | |
| SHL-034 | New dialog | Footer: Cancel when a diagram is open, "Import from file" when none is; "Empty diagram" and "Continue" disabled until a type is chosen [A5] | keep | [ ] | |
| SHL-035 | New dialog | "Empty diagram" creates a blank diagram of the chosen type at once [A5] | keep | [ ] | |
| SHL-036 | New dialog | Step 2 offers the import wizard (script, SQL, DBML, edition choice) with Back, "Create empty diagram" and Import [A5] | keep | [ ] | |
| SHL-037 | New dialog | A metadata script with more than 50 tables and views opens a table-selection step before import [A5] | keep | [ ] | |
| SHL-038 | New dialog | Dialog cannot be closed while parsing, and cannot be closed at all when no diagram is open [A5] | keep | [ ] | |
| SHL-039 | New dialog | New diagrams are named "Diagram N" (N = number of diagrams + 1), become the default, and the URL becomes `/diagrams/<id>` [A5] | keep | [ ] | |
| SHL-040 | New dialog | Dialog resets to step 1 with nothing chosen each time it opens [A5] | keep | [ ] | |
| SHL-041 | New dialog | A card links to the examples page [A5, A12] | drop | [ ] | |
| SHL-042 | New dialog | The "More Databases" / "Primary Databases" toggle is English only [A14] | change | [ ] | |
| SHL-043 | Open dialog | Table of diagrams: icon, name, created (hidden on phones), last modified, table count, row menu; newest modified first [A5] | keep | [ ] | |
| SHL-044 | Open dialog | Click selects, double-click opens, Enter/Space opens, Up/Down move between rows [A5] | keep | [ ] | |
| SHL-045 | Open dialog | Footer: Cancel (hidden when not closable), "New database", "Open" (disabled until selection) [A5] | keep | [ ] | |
| SHL-046 | Open dialog | Row menu has Open, Duplicate, Delete (red) [A5] | keep | [ ] | |
| SHL-047 | Open dialog | Duplicate makes a copy with new ids named "<name> (Copy)" and refreshes the list without opening it [A5] | keep | [ ] | |
| SHL-048 | Open dialog | Delete happens with no confirmation; deleting the open or last diagram reloads to `/` [A5] | change | [ ] | |
| SHL-049 | Open dialog | There is no search box and no rename in the local Open dialog [A5] | change | [ ] | |
| SHL-050 | Rename | Double-click the diagram name (or the hover pencil) to edit; Enter, check button or click-away saves; empty name is ignored [A5] | keep | [ ] | |
| SHL-051 | Rename | Tooltip "Double-click to edit"; name truncates at about 300 px; clicking the database icon opens the Open dialog [A5] | keep | [ ] | |
| SHL-052 | Delete | Actions > Delete diagram asks for confirmation; local mode then goes to `/` [A5, A11] | keep | [ ] | |
| SHL-053 | Delete | In a project, Delete diagram is shown to project admins only; the server copy goes first, failure shows a red toast and loses nothing [A5] | keep | [ ] | |
| SHL-054 | Clear | Edit > Clear asks for confirmation then empties the diagram but keeps it [A5] | keep | [ ] | |
| SHL-055 | Navbar | Desktop navbar: logo (links to `/`), menubar, centred diagram icon and name, right-hand controls; right controls hidden under 640 px [A6] | keep | [ ] | |
| SHL-056 | Navbar | Right-hand order: save status, get latest, lint, drift, publish, account menu or Sign in, language button [A6] | keep | [ ] | |
| SHL-057 | Menu Actions | Import submenu: .json, SQL, DBML; SQL and DBML open the import dialog limited to the diagram's database type [A6] | keep | [ ] | |
| SHL-058 | Menu Actions | Export SQL submenu: own type first, then PostgreSQL, MySQL, SQL Server, MariaDB, SQLite, without repeating the own type [A6] | keep | [ ] | |
| SHL-059 | Menu Actions | Export as: PNG and JPG open an options dialog; SVG exports at once (transparent, no dotted background, scale 1); JSON opens the export dialog [A6] | keep | [ ] | |
| SHL-060 | Menu Actions | Delete diagram item at the bottom (server mode: admins only) [A6] | keep | [ ] | |
| SHL-061 | Menu Edit | Undo and Redo with shortcut labels, disabled when empty; Clear with confirmation [A6] | keep | [ ] | |
| SHL-062 | Menu View | Show/Hide sidebar (Ctrl/Cmd+B), cardinality, field attributes, minimap; Compact/Standard tables (English only) [A6] | keep | [ ] | |
| SHL-063 | Menu View | Zoom on scroll submenu On/Off; Show views submenu On/Off; Theme submenu System/Light/Dark with Ctrl/Cmd+M label [A6] | keep | [ ] | |
| SHL-064 | Menu Backup | Backup menu: Export diagram and Restore diagram, same dialogs as the JSON items under Actions [A6] | drop | [ ] | |
| SHL-065 | Shortcuts | Undo Ctrl/Cmd+Z, Redo Ctrl/Cmd+Shift+Z, Open Ctrl/Cmd+O, Save Ctrl/Cmd+S, side panel Ctrl/Cmd+B, fit all Ctrl/Cmd+0, theme Ctrl/Cmd+M, filter Ctrl/Cmd+F; Mac uses Cmd; browser default prevented [A6] | keep | [ ] | |
| SHL-066 | Shortcuts | Fit-all animates 0.5 s with 10% padding and max zoom 0.8; theme shortcut works inside inputs [A6] | keep | [ ] | |
| SHL-067 | Shortcuts | In server mode Ctrl/Cmd+O goes to `/` instead of the Open dialog [A6, A8] | keep | [ ] | |
| SHL-068 | Mobile | Under 768 px: hamburger opens the icon rail as an overlay; navbar shows "QBase", account menu, language button, then menubar and diagram name [A6] | keep | [ ] | |
| SHL-069 | Mobile | Save status, get-latest, lint, drift and publish controls are not shown on phones [A6] | change | [ ] | |
| SHL-070 | Mobile | Side panel is a full-height drawer titled "Manage Diagram" with a section dropdown; starts hidden [A7] | keep | [ ] | |
| SHL-071 | Mobile | The mobile section dropdown lacks DBML and its "Areas" entry shows Custom types [A7] | change | [ ] | |
| SHL-072 | Mobile | Editor uses dynamic viewport units on phones so browser bars do not cut it off [A7, A16] | keep | [ ] | |
| SHL-073 | Mobile | Drawer title and description are English only [A7, A14] | change | [ ] | |
| SHL-074 | Sidebar | Icon rail: New diagram and Browse on top; separator; Tables, DBML, Refs, Custom types (only where supported), Visuals; active item tinted [A7] | keep | [ ] | |
| SHL-075 | Sidebar | Custom types entry appears only for database types that support them (PostgreSQL) [A7] | keep | [ ] | |
| SHL-076 | Sidebar | Visuals opens on the Areas tab; no external links in the rail footer [A7] | keep | [ ] | |
| SHL-077 | Side panel | Resizable: default 25%, minimum 25% and 350 px, up to 99%; hides to zero with a 200 ms animation and no drag handle when hidden [A7] | keep | [ ] | |
| SHL-078 | Side panel | DBML section loads its parser only when first opened [A7] | keep | [ ] | |
| SHL-079 | Side panel | Opening an item from elsewhere (canvas, lint finding) shows the panel, picks the section/tab and expands the item [A7] | keep | [ ] | |
| SHL-080 | Settings | No settings page; View-menu toggles, theme and language are the settings [A10] | keep | [ ] | |
| SHL-081 | Settings | Settings persist in localStorage under `theme`, `scroll_action`, `show_db_views`, `show_cardinality`, `show_field_attributes`, `compact_tables`, `show_minimap_on_canvas` with the defaults listed in A10 [A10] | keep | [ ] | |
| SHL-082 | Settings | Show field attributes is not persisted on main (resets on reload) [A10] | change | [ ] | |
| SHL-083 | Settings | A browser that refuses storage still opens the app with defaults [A10] | keep | [ ] | |
| SHL-084 | Settings | Settings survive sign-out; no diagram data is stored in them [A10] | keep | [ ] | |
| SHL-085 | Theme | Light, Dark and System; System follows the OS live; dark is a class on the root element; whole app follows [A10] | keep | [ ] | |
| SHL-086 | Theme | Toggle by menu or Ctrl/Cmd+M; with System it flips to the opposite of what System resolves to [A6, A10] | keep | [ ] | |
| SHL-087 | Toasts | One toast at a time (new replaces old), title, description, optional action, close button, default and destructive variants [A11] | keep | [ ] | |
| SHL-088 | Toasts | Toasts auto-dismiss after the library default (about 5 s, unverified) [A11] | keep | [ ] | |
| SHL-089 | Toasts | Toaster is mounted only in the editor page on main; mount it at the app root [A11] | change | [ ] | |
| SHL-090 | Alerts | Confirm dialog with title, description, confirm and cancel labels; confirm runs the action then closes; cancel/Escape closes [A11] | keep | [ ] | |
| SHL-091 | Templates | Examples page with 3 shipped example diagrams [A12] | drop | [ ] | |
| SHL-092 | Templates | 50 templates (36 PostgreSQL, 14 MySQL, 22 featured, 16 tags) with list, featured, by-tag, detail and clone pages, 100 thumbnails [A12] | drop | [ ] | |
| SHL-093 | Languages | 22 languages offered, English first, each with native and English name [A14] | keep | [ ] | |
| SHL-094 | Languages | Language chosen by the browser language detector (URL parameter, cookie, localStorage, browser list), remembered in localStorage `i18nextLng` [A14] | keep | [ ] | |
| SHL-095 | Languages | Only English is bundled; other languages load on first use; a regional code uses its base file; unknown codes and missing keys fall back to English [A14] | keep | [ ] | |
| SHL-096 | Languages | Language button (globe, tooltip "Change language") opens a searchable dropdown; change applies at once without reload [A14] | keep | [ ] | |
| SHL-097 | Languages | Document `lang` follows the language; Arabic switches the document to right-to-left [A14] | keep | [ ] | |
| SHL-098 | Languages | Editor texts must be complete per language; QBase texts (`qubdi.*`) may be partial and fall back to English [A14] | keep | [ ] | |
| SHL-099 | Languages | Texts that are English only on main (compact tables label, drawer title, "Saved", more-databases toggle, 404 page) get translated [A14] | change | [ ] | |
| SHL-100 | Title | Default title and og:title "QBase - Database schema diagrams"; description and og:description as in A15 [A15] | keep | [ ] | |
| SHL-101 | Title | In the editor the title is "QBase - <diagram name>" and updates on rename; default while loading [A15] | keep | [ ] | |
| SHL-102 | Title | Home, admin and viewer pages set their own translated titles [A15] | keep | [ ] | |
| SHL-103 | Browser fixes | Safari 15.3 and older: stand-ins for structured copy, `at()` and `Object.hasOwn` installed before anything runs [A16] | change | [ ] | |
| SHL-104 | Browser fixes | Old-Safari workaround that disables extra markdown table features in the templates preview [A16] | drop | [ ] | |
| SHL-105 | Home | Project picker: heading, description, search (shown only when projects exist or a search is active), card grid (3/2/1 columns, 9 per page) with name, role badge, description, diagram count, pager [A9] | keep | [ ] | |
| SHL-106 | Home | Empty and no-match states; admin with no projects is pointed to the admin panel; signed-out shows a sign-in prompt and a "session ended" notice when applicable [A9] | keep | [ ] | |
| SHL-107 | Home | Page frame: 48 px bar with logo, Admin button and email menu (Change password, Sign out); footer "Powered by Qubdi" [A9] | keep | [ ] | |
| SHL-108 | Home | Admins are sent to the admin panel once per browser session when they open `/` [A9, A2] | keep | [ ] | |
| SHL-109 | Project dialogs | In a project, Open lists the project's diagrams with filter, role badge, created by, row menu (Open, Get latest only with a local copy, Delete for admins with confirmation) [A8] | keep | [ ] | |
| SHL-110 | Project dialogs | In a project, New diagram is a small form (optional name up to 200 chars, database type default PostgreSQL, Create, optional Import from database) and cleans up the local copy if the server step fails [A8] | keep | [ ] | |
| SHL-111 | Access | Editor in a project requires sign-in; shows project-not-found, diagram-not-found, open-failed screens with a Back to projects button [A8] | keep | [ ] | |
| SHL-112 | Access | Read-only banner under the navbar explains why (viewer, unbound, lost, error, lock taken) and offers Get latest, Retry or Move to project [A8] | keep | [ ] | |
| SHL-113 | Access | Old `/diagrams/<id>` link redirects to the project URL if bound, otherwise opens read-only with the move banner [A2, A8] | keep | [ ] | |
| SHL-114 | Account menu | Signed-out shows Sign in; signed-in shows Admin button (admins) and an email dropdown with the items listed in A8 [A8] | keep | [ ] | |
| SHL-115 | Build | One image serves the editor and the API under `/api` on port 3001 with long cache for hashed assets and pre-compressed files [A17] | keep | [ ] | |
| QBS-001 | Contract | The editor exposes `useDiagram()` with `currentDiagram`, `tables`, `databaseType`, `readonly`, `addIndex`, `removeIndex`, `updateField`, `updateTable`, `updateDiagramData` [B1 C1] | keep | [ ] | |
| QBS-002 | Contract | Each edit replaces the changed top-level array of the diagram by a new reference; untouched parts keep theirs; `updatedAt` moves on every edit [B1 C1] | keep | [ ] | |
| QBS-003 | Contract | While another diagram loads, `currentDiagram` is an empty placeholder with a different id [B1 C1] | keep | [ ] | |
| QBS-004 | Contract | `DiagramProvider` accepts `readonly`; read-only means nothing is changed or stored and edit controls are inactive [B1 C2] | keep | [ ] | |
| QBS-005 | Contract | `Diagram` type and `diagramSchema` keep the saved shape and stay backward compatible with data already on servers [B1 C3] | keep | [ ] | |
| QBS-006 | Contract | `DatabaseType` and `DatabaseEdition` string values and `DBTable/DBField/DBIndex/DBRelationship/DBCustomType` shapes are not renamed [B1 C4] | keep | [ ] | |
| QBS-007 | Contract | `databaseTypeToLabelMap`, `databasesWithSchemas` and `dataTypeMap` are provided at their paths [B1 C5, C6] | keep | [ ] | |
| QBS-008 | Contract | `useStorage()` offers `addDiagram`, `deleteDiagram`, `listDiagrams`, `getDiagram`; `StorageProvider` also works on the home page [B1 C7] | keep | [ ] | |
| QBS-009 | Contract | The storage provider migrates the legacy `QubdiDB` through `adoptLegacyLocalData` and uses the shared database names [B1 C7] | keep | [ ] | |
| QBS-010 | Contract | History supports a whole-diagram replace as one undo step (`updateDiagramData` with before and after diagrams) and `resetRedoStack` [B1 C8] | keep | [ ] | |
| QBS-011 | Contract | `useLayout()` gives `isSidePanelShowed` and `openTableFromSidebar`; `useFocusOn()` gives `focusOnTable` [B1 C9, C10] | keep | [ ] | |
| QBS-012 | Contract | `LocalConfigProvider`, `LocalConfigContext` and `ThemeProvider` exist at their paths and open with defaults when storage throws [B1 C11, C12] | keep | [ ] | |
| QBS-013 | Contract | `useToast().toast({...})` and `Toaster` keep today's call shape [B1 C13] | keep | [ ] | |
| QBS-014 | Contract | UI primitives used by QBase files (button, input, dialog, alert-dialog, dropdown-menu, popover, table, tabs, checkbox, label, badge, spinner) exist at their paths with compatible props [B1 C14] | keep | [ ] | |
| QBS-015 | Contract | Removed QBase modules are recreated and pass the existing tests: GetLatestControl/Dialog, ProjectDiagrams, emptyDiagram/defaultDiagramName, DiagramLinksDialog, LastSaved [B1 C15] | keep | [ ] | |
| QBS-016 | Contract | `database-metadata` type and zod schema stay at their fixed path; the server and the Docker build depend on it [B1 C16, A17] | keep | [ ] | |
| QBS-017 | Contract | `loadFromDatabaseMetadata` builds a full diagram (tables, fields, indexes, relationships, views, ids, layout) from PostgreSQL and SQL Server metadata [B1 C17] | keep | [ ] | |
| QBS-018 | Contract | `createRelationshipsFromMetadata` returns relationships from foreign key rows and the diagram's tables [B1 C18] | keep | [ ] | |
| QBS-019 | Contract | Sibling modules for the kept SQL import/export files and canvas tests exist under the same names (`exportBaseSQL`, `validateWithRules`, `canvas-utils`, and others) [B1 C19, C20] | keep | [ ] | |
| QBS-020 | Contract | `i18n`, `i18nReady`, `languages` exports work outside React; locale files follow the one-object-per-code shape; English merges the six `qubdi` files [B1 C21] | keep | [ ] | |
| QBS-021 | Contract | `cn`, `generateId` and `area-utils` exist at `@/lib/utils` [B1 C22] | keep | [ ] | |
| QBS-022 | Contract | `EditorPage` provider order: local config, theme, storage, access gate, then editor providers; autosave and toaster rendered once [B1 C23] | keep | [ ] | |
| QBS-023 | Contract | `buildRoutes(backendEnabled)` and `App` composition (QBase provider, forced password change, admin route) are kept [B1 C24] | keep | [ ] | |
| QBS-024 | Plug-in | The access gate wraps the diagram provider and sits inside storage [B2 P1] | keep | [ ] | |
| QBS-025 | Plug-in | A full-width banner row exists between the navbar and content on desktop and mobile [B2 P2] | keep | [ ] | |
| QBS-026 | Plug-in | Navbar save slot shows cloud states in server mode (saved, unsaved with retry, saving, not saved, conflict with Overwrite) and the plain save icon otherwise [B2 P3] | keep | [ ] | |
| QBS-027 | Plug-in | Get latest icon appears only for a signed-in user with a local and a server copy; confirm, replace copy, reload project URL [B2 P4] | keep | [ ] | |
| QBS-028 | Plug-in | Lint button with count badge opens a floating findings panel; show-table opens the side panel and zooms; fixes run through undoable editor operations [B2 P5] | keep | [ ] | |
| QBS-029 | Plug-in | Drift badge polls every 60 s while the tab is visible, checks once on open, and its report can ask for a re-sync through the `qubdi:open-resync` window event [B2 P6, P10] | keep | [ ] | |
| QBS-030 | Plug-in | Publish button shows sync/publish status, dialog takes a note and an auto-publish switch, only for the editor holding the lock [B2 P7] | keep | [ ] | |
| QBS-031 | Plug-in | In a project, the editor's new and open diagram requests open the project dialogs, not the local ones [B2 P9] | keep | [ ] | |
| QBS-032 | Publish | Publish flushes pending autosave, uploads, publishes with an optional note, toasts "Published v<n>" or a red failure with the server message [B3] | keep | [ ] | |
| QBS-033 | Share | Share dialog ensures the diagram is on the server first, then creates links (anyone, signed-in only, off; optional end date; optional live) that open `/s/<token>` [B3] | keep | [ ] | |
| QBS-034 | Share | Admins can list and revoke a diagram's share links from the admin panel, with a second confirmation [B3] | keep | [ ] | |
| QBS-035 | Upload | Upload keeps all ids as they are, sends a conflict base version and the tab's editor id, and re-creates a missing server diagram only when a project is known [B3] | keep | [ ] | |
| QBS-036 | Autosave | Autosave sends 10 seconds after the last change, only for an editor holding the lock [B3] | keep | [ ] | |
| QBS-037 | Autosave | Closing or hiding the page sends the final save with keep-alive; unsent edits trigger the browser's leave-page prompt [B3] | keep | [ ] | |
| QBS-038 | Autosave | After a reload or re-login, an unsent difference from the server version is detected and sent [B3] | keep | [ ] | |
| QBS-039 | Conflict | A 409 shows the conflict text with Overwrite; a save that landed without its reply is not treated as a conflict [B3] | keep | [ ] | |
| QBS-040 | Lock | The editor takes the per-diagram lock on open, renews it every 20 s, releases it after the final save and on page hide; without it the tab opens read-only [A8, B3] | keep | [ ] | |
| QBS-041 | Lock lost | A 423 on save makes the editor read-only with the "taken" banner and drops unsent edits [B3] | keep | [ ] | |
| QBS-042 | Open remote | Opening a project diagram downloads, validates and stores a local copy, refreshes an out-of-date clean copy, and refuses an unpublished diagram for viewers [A8, B3] | keep | [ ] | |
| QBS-043 | Import from DB | "Import from database" in a project's New diagram lists schemas and tables from a saved connection, previews counts, then creates and uploads the diagram [B3] | keep | [ ] | |
| QBS-044 | Re-sync | Re-sync compares the live database with the diagram, shows grouped changes with checkboxes (renames only suggested), applies the chosen ones as one undo step, updates source keys and the server copy [B3] | keep | [ ] | |
| QBS-045 | Drift | Drift detection compares the database with the last published diagram and shows a badge; the dialog can start a re-sync [B3] | keep | [ ] | |
| QBS-046 | Lint | Lint runs offline on the diagram with per-diagram settings mirrored to the server; stale fixes show a red toast and do nothing [B3] | keep | [ ] | |
| QBS-047 | Get latest | Get latest deletes the local copy, hands its sync state to the new copy, and reloads the project URL to download the server version [B3] | keep | [ ] | |
| QBS-048 | Sign-out | Sign-out or a change of account deletes the `QBase` and `QubdiDB` databases and all `qbase.*` storage keys, then reloads; interface settings stay [B3] | keep | [ ] | |
| QBS-049 | Sign-out | The editor stores diagram data nowhere else, so nothing survives a sign-out [B3] | keep | [ ] | |
| QBS-050 | Standalone | The admin page and share viewer use no editor module (no diagram, canvas or storage provider; home uses storage) [A13, B3] | keep | [ ] | |
| QBS-051 | Server | The server needs only the metadata type file and `shared/` from the editor side [B3] | keep | [ ] | |
| QBS-052 | Tests | Existing QBase tests on this branch pass unchanged: server-autosave, get-latest-control, project-diagrams, share-link-list, diagram-links-dialog, last-saved, lib/qubdi tests, stored settings, i18n [B3] | keep | [ ] | |
