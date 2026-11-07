# Phase 8: SHL slice (shell, routes, start-up, dialogs, navbar, settings, languages, titles)

Rows: 115. new tests: 73, covered by existing tests: 22, fixed: 7, missing: 6, manual: 0, dropped: 7.
Fixes made in source: diagram-provider.tsx (no newest-diagram fallback), create-diagram-dialog.tsx (file import only when nothing is open), use-toast.ts (one toast), last-saved.tsx (time-ago languages), language-button.tsx (English names, search), share-viewer-page.tsx (title).
Rows marked new or fixed with "partly" notes list what the test does not reach. Files: p8-shl-*.test.ts(x).

| ID | Class | Where / what |
| --- | --- | --- |
| SHL-001 | covered | src/lib/qubdi/__tests__/config.test.ts::is off (local-only mode) when nothing is set |
| SHL-002 | covered | src/lib/qubdi/__tests__/config.test.ts::reads the run-time value served through /config.js (trailing slash removed; dev value as fallback) |
| SHL-003 | covered | server/test/web.test.ts::points the editor at its own /api, whatever the build holds |
| SHL-004 | new | src/__tests__/p8-shl-page.test.ts::SHL-004 and theme-init.js (3 tests) |
| SHL-005 | new | src/__tests__/p8-shl-page.test.ts::SHL-005 (no inline script, no third-party URL); server CSP itself: server/test/web.test.ts::sends the security headers on pages and files |
| SHL-006 | new | src/__tests__/p8-shl-page.test.ts::SHL-006 |
| SHL-007 | new | src/__tests__/p8-shl-page.test.ts::SHL-007 |
| SHL-008 | dropped | decision drop: build variables change nothing visible |
| SHL-009 | new | src/__tests__/p8-shl-routes.test.tsx::SHL-009 (2 tests) |
| SHL-010 | new | src/__tests__/p8-shl-routes.test.tsx::SHL-010 |
| SHL-011 | covered | src/pages/admin-page/__tests__/admin-page.test.tsx::sends /admin to the default section (and lists every section) |
| SHL-012 | covered | src/__tests__/router.test.tsx::keeps the share viewer and the not-found page in both modes |
| SHL-013 | new | src/__tests__/p8-shl-routes.test.tsx::the 404 page (SHL-013), both modes |
| SHL-014 | covered | server/test/web.test.ts::answers the pages of the editor, share pages included, with index.html |
| SHL-015 | covered | src/lib/qubdi/__tests__/project-path.test.ts::matches ignoring case / encodes slugs that are not plain ASCII |
| SHL-016 | new | src/components/qubdi/__tests__/p8-shl-gate.test.tsx::SHL-016 |
| SHL-017 | new | src/__tests__/p8-shl-page.test.ts::what the first load contains (SHL-017) (2 tests); src/__tests__/p8-shl-routes.test.tsx::every page loads lazily |
| SHL-018 | dropped | decision drop: no examples or templates pages |
| SHL-019 | new | src/workspace/__tests__/p8-shl-start.test.tsx::the first screen waits for the language (SHL-019) (2 tests) |
| SHL-020 | new | src/workspace/__tests__/p8-shl-start.test.tsx::SHL-020 |
| SHL-021 | fixed | src/qbase/diagram-provider.tsx opened the newest diagram when there was no default, so the Open dialog never appeared; the fallback is removed. Test: src/workspace/__tests__/p8-shl-start.test.tsx::SHL-021 (2 tests) |
| SHL-022 | covered | src/workspace/__tests__/providers.test.tsx::with nothing stored it asks for a new diagram and cannot be dismissed |
| SHL-023 | new | src/workspace/__tests__/p8-shl-start.test.tsx::SHL-023 (3 tests) |
| SHL-024 | new | src/workspace/__tests__/p8-shl-start.test.tsx::SHL-024 |
| SHL-025 | new | src/__tests__/p8-shl-page.test.ts::SHL-025: there is no tour, welcome screen or onboarding text |
| SHL-026 | covered | src/components/qubdi/__tests__/forced-password-change.test.tsx::opens over the page and says why / cannot be dismissed |
| SHL-027 | covered | src/persistence/persistence.test.ts::DAT-007 adds rows it does not have, never overwrites, and deletes QubdiDB (+ DAT-008 retry, name QBase) |
| SHL-028 | covered | src/store/store.test.ts::autosave waits for a quiet moment, then saves once and clears the dirty flag (1 s after the last edit) |
| SHL-029 | covered | src/pages/editor-page/top-navbar/__tests__/last-saved.test.tsx::says when the diagram was saved, as plain hover text |
| SHL-030 | fixed | src/pages/editor-page/top-navbar/last-saved.tsx used timeago.js without its language files, so every language read English; the 11 non-English languages are registered. The word "Saved" itself still waits for Phase 7 locale files. Test: src/pages/editor-page/top-navbar/__tests__/p8-shl-saved.test.tsx |
| SHL-031 | new | src/workspace/__tests__/p8-shl-keys.test.tsx::save key (SHL-031) (2 tests): confirms with a toast, never touches the diagram or its modified time |
| SHL-032 | missing | the dialog is one grid of all registered databases (decisions-phase6c: no Transactional/Analytical tabs, no more/fewer toggle); card list tested in src/workspace/__tests__/p8-shl-newdialog.test.tsx::SHL-032 |
| SHL-033 | new | src/workspace/__tests__/p8-shl-newdialog.test.tsx::SHL-033 |
| SHL-034 | fixed | "Open a saved file" was shown even with a diagram open; now only when none is (create-diagram-dialog.tsx). Note: Blank diagram and Continue are never disabled because Generic is preselected, unlike the spec; test src/workspace/__tests__/p8-shl-newdialog.test.tsx::SHL-034 (2 tests) |
| SHL-035 | new | src/workspace/__tests__/p8-shl-newdialog.test.tsx::SHL-035 |
| SHL-036 | new | src/workspace/__tests__/p8-shl-newdialog.test.tsx::SHL-036 |
| SHL-037 | new | src/workspace/__tests__/p8-shl-newdialog.test.tsx::a big metadata script asks which tables to bring (SHL-037) (3 tests) |
| SHL-038 | new | src/workspace/__tests__/p8-shl-newdialog.test.tsx::SHL-038 (2 tests) |
| SHL-039 | new | src/workspace/__tests__/p8-shl-newdialog.test.tsx::SHL-039 |
| SHL-040 | new | src/workspace/__tests__/p8-shl-newdialog.test.tsx::SHL-040 |
| SHL-041 | dropped | decision drop: card to the examples page |
| SHL-042 | missing | no "More Databases"/"Primary Databases" toggle exists to translate (see SHL-032) |
| SHL-043 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-043 |
| SHL-044 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-044 |
| SHL-045 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-045 |
| SHL-046 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-046 |
| SHL-047 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-047 |
| SHL-048 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-048 (2 tests): asks first, deleting the open or last diagram reloads to / |
| SHL-049 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-049 (new behaviour: search box and rename exist); also src/workspace/__tests__/designs-dialogs.test.tsx::filters by the search text, ::rename changes the stored name |
| SHL-050 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-050 (2 tests); Enter, Escape and empty name: src/workspace/__tests__/frame.test.tsx::double-click edits, Enter saves, an empty name is ignored |
| SHL-051 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-051 (2 tests); the hover bubble text is checked as the translation string only (Radix tooltip does not open in happy-dom) |
| SHL-052 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-052; also src/workspace/__tests__/p8-edt-b-menus.test.tsx::asks first, with Delete and Cancel |
| SHL-053 | new | src/workspace/__tests__/p8-shl-open.test.tsx::SHL-053 (2 tests); owner-only item: src/workspace/__tests__/p8-edt-b-menus.test.tsx::is offered locally and to project owners, hidden for everyone else |
| SHL-054 | covered | src/workspace/__tests__/p8-edt-b-menus.test.tsx::EDT-226 Cancel changes nothing; confirming empties the diagram and the history |
| SHL-055 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-055 (2 tests) |
| SHL-056 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-056 (local mode: save status, lint, language button in order) |
| SHL-057 | new | src/workspace/__tests__/p8-shl-menus.test.tsx::SHL-057 (2 tests) |
| SHL-058 | new | src/workspace/__tests__/p8-shl-menus.test.tsx::SHL-058; order rule: src/workspace/__tests__/menus.test.tsx::puts the diagram own database first and skips it in the standard list |
| SHL-059 | new | src/workspace/__tests__/p8-shl-menus.test.tsx::SHL-059 (3 tests) |
| SHL-060 | new | src/workspace/__tests__/p8-shl-menus.test.tsx::SHL-060 |
| SHL-061 | covered | src/workspace/__tests__/menus.test.tsx::Undo and Redo are off with nothing to undo, and Undo works after an edit; ::Clear is off in a read-only diagram; confirmation: p8-edt-b-menus.test.tsx::EDT-226 |
| SHL-062 | new | src/workspace/__tests__/p8-shl-menus.test.tsx::SHL-062 (2 tests); sidebar item: menus.test.tsx::the side panel item follows the panel and calls the toggle |
| SHL-063 | new | src/workspace/__tests__/p8-shl-menus.test.tsx::SHL-063 (3 tests); Show views and zoom on scroll are a switch and a two-item radio list, not On/Off submenus; theme radio list: p8-edt-b-menus.test.tsx::offers System, Light and Dark and applies the choice |
| SHL-064 | dropped | decision drop: Backup menu removed |
| SHL-065 | new | src/workspace/__tests__/p8-shl-keys.test.tsx::the shell shortcuts (SHL-065) (2 tests); platform logic: src/workspace/__tests__/shortcuts.test.ts |
| SHL-066 | new | src/workspace/__tests__/p8-shl-keys.test.tsx::fit all (SHL-066) (constants: 0.5 s, 10% padding, 0.8 max zoom; theme key in a text box) |
| SHL-067 | new | src/workspace/__tests__/p8-shl-keys.test.tsx::Open key with a server (SHL-067) (2 tests) |
| SHL-068 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-068 |
| SHL-069 | covered | src/workspace/__tests__/mobile.test.tsx::the save status and the menus are on the phone too (SHL-069) |
| SHL-070 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-070 |
| SHL-071 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-071 (2 tests) |
| SHL-072 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-072 |
| SHL-073 | missing | the drawer title and description are English strings (editor.workspace.drawer.*); no translation exists because every locale file is empty until Phase 7 |
| SHL-074 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-074 (2 tests) |
| SHL-075 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-075 |
| SHL-076 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::SHL-076 |
| SHL-077 | new | src/workspace/__tests__/p8-shl-shell.test.tsx::side panel (SHL-077) (3 tests); sizes: src/workspace/__tests__/mobile.test.tsx::side panel width (spec A7) |
| SHL-078 | covered | src/pages/editor-page/side-panel/side-panel.test.tsx::loads the DBML section on demand (EDT-238); static: src/__tests__/p8-shl-page.test.ts::the editor page itself does not pull in the DBML parser either |
| SHL-079 | covered | src/store/store.test.ts::opens the panel on Tables with the entity expanded (A7); src/canvas/entity.test.tsx::EDT-079 the header buttons open the table in the side panel |
| SHL-080 | new | src/context/local-config-context/__tests__/p8-shl-settings.test.tsx::SHL-080 |
| SHL-081 | new | src/context/local-config-context/__tests__/p8-shl-settings.test.tsx::SHL-081 (4 tests) |
| SHL-082 | new | src/context/local-config-context/__tests__/p8-shl-settings.test.tsx::SHL-081 and SHL-082 come back after a reload (field attributes persisted) |
| SHL-083 | new | src/context/local-config-context/__tests__/p8-shl-settings.test.tsx::SHL-083; also src/context/local-config-context/__tests__/stored.test.tsx |
| SHL-084 | covered | src/lib/qubdi/__tests__/local-data.test.ts::removes the qbase.* keys from both storages and keeps the rest (interface settings are not qbase.* keys) |
| SHL-085 | new | src/context/local-config-context/__tests__/p8-shl-settings.test.tsx::theme (SHL-085, SHL-086) (3 tests) |
| SHL-086 | new | src/workspace/__tests__/p8-shl-keys.test.tsx::theme key (SHL-086) (2 tests) |
| SHL-087 | fixed | src/platform/toast/use-toast.ts showed up to 3 toasts; now one, a new toast replaces the old. Test: src/platform/toast/__tests__/p8-shl-toast.test.tsx::SHL-087 (2 tests) |
| SHL-088 | new | src/platform/toast/__tests__/p8-shl-toast.test.tsx::SHL-088 (closes after about 5 s) |
| SHL-089 | new | src/platform/toast/__tests__/p8-shl-toast.test.tsx::SHL-089 (App mounts the Toaster at its root; a toast outlives a route change) |
| SHL-090 | new | src/platform/toast/__tests__/p8-shl-toast.test.tsx::confirm dialog (SHL-090) (3 tests) |
| SHL-091 | dropped | decision drop: examples page |
| SHL-092 | dropped | decision drop: templates |
| SHL-093 | fixed | the dropdown showed only the native name; now "Français (French)" (language-button.tsx). Test: src/workspace/__tests__/p8-shl-lang.test.tsx::SHL-093; list of 22: src/i18n/__tests__/i18n.test.ts::lists the 22 languages the editor offers |
| SHL-094 | new | src/workspace/__tests__/p8-shl-lang.test.tsx::which language starts (SHL-094) (3 tests) |
| SHL-095 | covered | src/i18n/__tests__/i18n.test.ts::starts with English only; ::fetches a language when it is chosen; ::serves a regional code from its base language file; ::falls back to English for a language it has no file for |
| SHL-096 | fixed | the language dropdown had no search; a search box was added (language-button.tsx, string editor.workspace.navbar.searchLanguage). Test: src/workspace/__tests__/p8-shl-lang.test.tsx::SHL-096 (2 tests) |
| SHL-097 | covered | src/i18n/__tests__/i18n.test.ts::reads right to left in Arabic and left to right in the others; ::writes a locale code with an underscore the way HTML expects it; src/workspace/__tests__/p8-shl-lang.test.tsx::SHL-096 checks document lang |
| SHL-098 | missing | every locale file is empty until Phase 7, so editor texts are not complete per language; the completeness check cannot pass yet |
| SHL-099 | missing | compact tables label, drawer title, "Saved", more-databases toggle and 404 page: locale files are empty until Phase 7; the 404 page text is hard-coded English (src/platform/router/not-found-page.tsx) |
| SHL-100 | new | src/helmet/__tests__/p8-shl-title.test.tsx::default title and description (SHL-100) (2 tests) |
| SHL-101 | new | src/helmet/__tests__/p8-shl-title.test.tsx::the editor title (SHL-101) |
| SHL-102 | fixed | the share viewer page set no title; it now sets the translated qubdi.viewerPage.pageTitle (share-viewer-page.tsx). Test: src/helmet/__tests__/p8-shl-title.test.tsx::titles of the other pages (SHL-102) (home, viewer, admin strings) |
| SHL-103 | missing | no stand-ins for structured copy, at() or Object.hasOwn exist (tsconfig target ES2022, no polyfill); the decision is only to keep them if Safari 15 is supported, so this is an owner choice |
| SHL-104 | dropped | decision drop: old-Safari markdown workaround |
| SHL-105 | covered | src/pages/home-page/__tests__/project-list.test.tsx::shows the projects the server returns, with role and diagram count; ::asks for a page of nine and nothing else on first load; ::pages through many projects; ::searches the server and shows what matches |
| SHL-106 | new | src/pages/home-page/__tests__/p8-shl-home.test.tsx::the page frame (SHL-106, SHL-107) (sign-in prompt, session-ended notice, needs a server); empty states: project-list.test.tsx::tells a member with no projects to ask an admin, ::sends an admin with no projects to the admin panel |
| SHL-107 | new | src/pages/home-page/__tests__/p8-shl-home.test.tsx::the page frame (SHL-106, SHL-107) (3 tests) |
| SHL-108 | new | src/pages/home-page/__tests__/p8-shl-home.test.tsx::admins land on the admin panel once per session (SHL-108) (2 tests); src/lib/qubdi/__tests__/admin-landing.test.ts |
| SHL-109 | covered | src/components/qubdi/__tests__/project-open-dialog.test.tsx (list, filter, New diagram for editors only, Cancel) and project-diagrams.test.tsx::offers "Get latest" only when this browser has a copy; ::offers Delete to admins only; ::asks before deleting |
| SHL-110 | new | src/components/qubdi/__tests__/p8-shl-new-diagram.test.tsx::New diagram in a project (SHL-110) (5 tests) |
| SHL-111 | new | src/components/qubdi/__tests__/p8-shl-gate.test.tsx::SHL-111 (4 tests) |
| SHL-112 | new | src/components/qubdi/__tests__/p8-shl-banner.test.tsx::the read-only banner (SHL-112) (9 tests); lock case: src/components/qubdi/__tests__/access-banner.test.tsx::offers to get the latest version and edit, asking first |
| SHL-113 | new | src/components/qubdi/__tests__/p8-shl-gate.test.tsx::an old /diagrams/<id> link (SHL-113) (2 tests) |
| SHL-114 | new | src/components/qubdi/__tests__/p8-shl-account.test.tsx::account menu (SHL-114) (8 tests) |
| SHL-115 | new | src/__tests__/p8-shl-page.test.ts::one image serves everything (SHL-115) (Dockerfile); server side: server/test/web.test.ts (hashed assets cached a year, precompressed .br/.gz, /api prefix). Building and running the real image was not done here (manual-test-script.md) |
