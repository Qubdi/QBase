# Behaviour spec: the app around the canvas, and the QBase integration contract

Status: draft for owner review. Written 2026-11-07 by reading the editor on `main`
(read-only checkout) and the QBase files on this branch. Nothing here was verified by running
the app in a browser; every statement is "what the code makes a person see". Items I could
not settle are collected in the last section.

Scope: everything except the canvas, tables, fields, relationships, import/export engines and
the data model (those have their own spec files). Part A is the shell a person sees. Part B
is the contract the new editor must keep so the already-original QBase code (accounts,
projects, publishing, sharing, lint, drift, admin) works unchanged. Parity rows are in
`rows-shell.md` (IDs `SHL-` for Part A, `QBS-` for Part B).

Words used: "local mode" = no server configured; "server mode" = a QBase server is
configured. "Project" = a QBase project (a folder of diagrams on the server). "Local copy" =
the copy of a diagram kept in the browser's IndexedDB.

---

## Part A. The shell

### A1. Modes and how the app decides

The app has exactly one switch: whether a backend URL is configured.

- The URL comes from a small script the page loads before the app starts (`/config.js`),
  which may set a global named `env` holding `QUBDI_BACKEND_URL`. When that is missing or
  empty, the build-time variable `VITE_QUBDI_BACKEND_URL` is used (development only). A
  trailing slash is removed. Empty after that means local mode.
- In the shipped image the server answers `/config.js` itself with the value `/api` (so the
  editor and API share one origin, no CORS). In a static deployment `public/config.js` is an
  empty file and the app runs in local mode.
- Two other build-time variables exist (`VITE_HOST_URL`, `VITE_APP_URL`); the Docker build
  writes them to `.env`. Nothing visible depends on them today (see open questions).
- A second tiny script, `/theme-init.js`, runs before first paint: it reads the saved theme
  and adds the dark class to the root element, so there is no flash of the wrong theme. It is
  a separate file (not inline) because the server's content security policy allows only
  same-origin scripts. The new app must keep both scripts as separate files loaded from the
  HTML head.

Content security policy the server sends with every page (the new build must work under it):
scripts same-origin only; styles same-origin plus inline styles; images same-origin, `data:`
and `blob:`; fonts same-origin; network requests same-origin only; web workers same-origin or
`blob:`; no plugins; framing forbidden. Consequences: no CDN fonts or scripts, no inline
`<script>`, fonts must be bundled (today Inter in weights 400/500/600, JetBrains Mono 400/500,
Manrope 500 to 800).

Other page facts: HTML language starts as English; page is marked noindex (meta tag and a
`robots.txt` that disallows everything); the favicon is an empty data URL (no icon file); the
viewport is device width with initial scale 1.

### A2. Routes and URLs

Router: browser history (real paths, not hashes). The server returns the app shell for any
unknown path that is not under `/api` and has no file extension, so deep links work. All
pages are loaded lazily.

Server mode:

| Path | Page |
| --- | --- |
| `/` | Home: the project picker (A9). Admins are sent to the admin panel once per browser session. |
| `/<project-slug>/diagrams` | Editor inside a project, no diagram chosen: the Open dialog opens and cannot be closed. |
| `/<project-slug>/diagrams/<server-diagram-id>` | Editor with that diagram. |
| `/diagrams/<local-id>` | Old bookmark form. If the local diagram is bound to a project, the browser is redirected (replace) to its project URL; if not, it opens read-only with a banner offering to move it into a project. |
| `/admin` | Redirects to `/admin/overview`. |
| `/admin/overview`, `/admin/projects`, `/admin/users`, `/admin/diagrams`, `/admin/activity` | Admin panel sections (fixed paths, not a parameter, so a project called "admin" cannot collide with `/admin/diagrams`). |
| `/s/<token>` | Public read-only viewer of a shared diagram (A13). |
| anything else | 404 page. |

Local mode:

| Path | Page |
| --- | --- |
| `/` and `/diagrams/<local-id>` | The editor. |
| `/examples`, `/templates`, `/templates/featured`, `/templates/tags/<tag>`, `/templates/<slug>`, `/templates/clone/<slug>` | Example and template pages (A12; recommendation: drop). |
| `/admin`, `/s/<token>` | Still routed, but with no API they can only show "needs a server" style messages. |
| anything else | 404 page. |

A project slug is matched case-insensitively and is URL-encoded in links. The project
workspace never shows a diagram that belongs to another project: it behaves as "not found".

The 404 page: large "404", the text "Something's missing." and a sentence saying the page
cannot be found, then the footer line "Powered by Qubdi". It is English only today.

### A3. Start-up flow

1. The HTML loads `theme-init.js` and `config.js`, then the app bundle.
2. The app waits briefly for the person's language to load (so the first screen is never
   shown in English first). If loading fails it falls back to English and starts anyway.
3. Providers wrap the router: page titles, tooltips, the QBase account/session provider, and,
   next to the router, a "forced password change" dialog that appears when the server says the
   signed-in account must change its password before doing anything else.
4. The router renders the page for the URL.

Editor start-up, local mode:

1. A saved "default diagram id" lives in the local database (a one-row config table).
2. At `/` with a default id that still exists: the app navigates to `/diagrams/<id>`.
3. At `/` with no usable default: if at least one local diagram exists, the Open dialog
   opens; if none exists, the New diagram dialog opens. In both cases the dialog cannot be
   dismissed (no close button, Escape and outside click ignored) because there is nothing
   behind it.
4. At `/diagrams/<id>`: a full-screen spinner shows while it loads; undo and redo history is
   cleared; if the diagram does not exist the Open dialog opens (not dismissable).
5. Opening a diagram (by any route) saves it as the new default.

Editor start-up, server mode: the diagram is resolved through the project (A8). While the
session is being checked, or the edit lock is being requested, a centred spinner covers the
screen. Signed out: a centred logo plus a "sign in to open this diagram" prompt.

There is no first-run tutorial, tour, welcome screen or onboarding hint anywhere. The only
guidance is tooltips (for example "Double-click to edit" on the diagram name) and empty-state
text.

### A4. Local-only mode (no server)

- All data is in the browser: IndexedDB database named `QBase` (an older name, `QubdiDB`, is
  migrated into it on start, merging without overwriting, then deleted; retried every start
  while it exists). The table layout and versions are a data format and belong in the
  data-format spec; the shell only needs to know that `diagrams`, per-diagram collections
  (tables, relationships, dependencies, areas, custom types, notes), saved filters, and a
  one-row `config` exist, currently at schema version 14. The store names on main are
  `diagrams`, `db_tables`, `db_relationships`, `db_dependencies`, `areas`, `db_custom_types`,
  `notes`, `diagram_filters` and `config`.
- Saving is automatic and immediate (every edit is written). The navbar shows a small save
  icon whose hover text says "Saved <time ago>" (for example "Saved 5 minutes ago") and, on
  a second line, the exact local date and time. The "time ago" wording is translated for 12
  languages (en, es, fr, de, hi, ja, ko, ru, zh-CN, zh-TW, pt-BR, bn) and falls back to
  English for the others. The word "Saved" itself is English only today.
- Ctrl/Cmd+S only refreshes the diagram's "last modified" time (there is nothing to flush).
- The first-ever visit shows the New diagram dialog (A5).
- Signing in does not exist in local mode; the account menu is hidden entirely.
- The "Open" keyboard shortcut opens the Open dialog (in server mode it goes to `/`).

### A5. Diagram list, open, create, rename, duplicate, delete, search (local mode)

**New diagram dialog (local mode).** Two steps, wide dialog (about 900 px).

1. "Select database": tabs "Transactional" and "Analytical". Transactional lists MySQL,
   PostgreSQL, MariaDB, SQLite, SQL Server, Oracle, CockroachDB as option cards, three per
   row, two rows visible; a "More Databases" / "Primary Databases" button toggles to the next
   or previous row. Analytical lists ClickHouse. Choosing a card selects the type and
   immediately moves to step 2. Footer: if a diagram is already open, a Cancel button;
   otherwise a ghost button "Import from file" (opens the JSON import dialog). On the right,
   "Empty diagram" (creates a blank diagram of the chosen type right away) and "Continue".
   Both are disabled until a type is chosen. A card points to the examples page (dropped by
   recommendation).
2. "Import your database": the import wizard (script, SQL DDL, DBML; edition choice such as
   Supabase or Timescale for PostgreSQL, 5.7 for MySQL, 2016-and-below for SQL Server,
   Cloudflare D1 for SQLite), with Back, "Create empty diagram" and Import. For a metadata
   script that returns more than 50 tables and views, a third step lets the person pick
   which tables to import. Parsing runs asynchronously; the dialog cannot be closed while
   parsing. The import methods themselves are specified in the import spec.

New diagrams are named "Diagram N" where N is the current number of diagrams plus one (for
DBML imports that come with the importer's default name, also "Diagram N"). After creation
the diagram becomes the default and the URL changes to `/diagrams/<id>`.
The dialog resets (back to step 1, generic type, nothing chosen) every time it opens. With no
diagram open the dialog cannot be closed and shows no close button.

**Open diagram dialog (local mode).** A table in a dialog about 30 rem tall, 80% of the width
on medium screens and 55% on extra large. Columns: database icon, Name, Created (hidden on
phones), Last modified, number of tables, and a row menu button. Sorted by last modified,
newest first. Single click selects a row; double click opens it; with a row focused, Enter or
Space opens it and Up/Down move between rows (focus follows; selection updates after a short
debounce). Footer: Cancel (hidden when the dialog cannot be closed), "New database" (closes
this dialog and opens the New diagram dialog) and "Open" (disabled until a row is selected).
Row menu: **Open**, **Duplicate**, separator, **Delete** (red).
- Duplicate: creates a copy with fresh ids named "<original name> (Copy)" and refreshes the
  list. It does not open it.
- Delete: deletes immediately with no confirmation, refreshes the list; if the deleted one is
  the open diagram, or it was the last diagram, the whole page navigates to `/` (a full
  reload), which then starts the first-run flow.
- There is no search box and no rename in this dialog. (A search box exists only in the
  server-mode project dialog.)

**Rename.** In the top bar the diagram's name is shown centred with its database icon.
Double-clicking the name, or clicking the small pencil that appears on hover, switches it to
an input (selected, focused after a short delay). Enter, clicking the check button, or
clicking anywhere outside saves; an empty or whitespace-only name is ignored (the old name
stays). Clicking the database icon opens the Open dialog (closable). Tooltip on the name:
"Double-click to edit". The name is truncated at about 300 px.

**Delete diagram (menu).** Actions menu, item "Delete diagram". It asks for confirmation
(A11). On confirm, in local mode the diagram is deleted and the app goes to `/`. In a
project it is shown only to project admins ("owner" role): the server copy is deleted first
(if that fails nothing is lost and a "could not delete" toast shows the server's message),
then the local copy and its server mapping, then the app goes to the project's diagram list.

**Clear diagram (menu).** Edit menu "Clear" asks for confirmation, then removes all content
but keeps the diagram.

### A6. Top navigation bar and every menu item

Desktop (width 768 px and up). One row, 48 px high, translucent with blur and a bottom border.
Left: the QBase logo (links to `/`), then the menubar. Centre: diagram icon + name (A5). Right
(hidden under 640 px): save status, then in this order "get latest" icon, "Lint" button,
drift control, "Publish" button, account menu or "Sign in", language button. Without a server
only the save icon and the language button appear.

Menubar, four menus. Labels are translated except where marked English-only.

**Actions**
- Import (submenu): `.json`; separator; `SQL`; `DBML`. SQL and DBML open the import dialog in
  the matching mode, restricted to the diagram's database type and to the methods "SQL" and
  "DBML".
- separator
- Export SQL (submenu): the diagram's own database type first (or "Generic" if the diagram is
  generic), then PostgreSQL, MySQL, SQL Server, MariaDB and SQLite, skipping any that equals
  the diagram's own type. (Oracle, ClickHouse and CockroachDB are never offered as targets.)
- Export as (submenu): PNG, JPG, SVG, separator, JSON. PNG and JPG open an options dialog;
  SVG exports immediately (transparent background, no dotted background, scale 1); JSON opens
  the export dialog.
- separator, then Delete diagram (server mode: admins only).

**Edit**
- Undo (shortcut label Ctrl+Z / Cmd+Z), disabled when nothing to undo.
- Redo (Ctrl+Shift+Z / Shift+Cmd+Z), disabled when nothing to redo.
- separator, Clear (with confirmation).

**View**
- Show/Hide sidebar (the side panel) with shortcut Ctrl+B / Cmd+B.
- separator
- Show/Hide cardinality, Show/Hide field attributes, "Compact Tables"/"Standard Tables"
  (English only today), Show/Hide minimap.
- separator
- Zoom on scroll (submenu with two checked items "On" and "Off": On means the mouse wheel
  zooms, Off means it pans).
- separator
- Show views (submenu, "On"/"Off").
- separator
- Theme (submenu, shortcut label Ctrl+M / Cmd+M, checked items System, Light, Dark).

**Backup**
- Export diagram (opens the JSON export dialog) and Restore diagram (opens the JSON import
  dialog). These duplicate the JSON items under Actions.

Menu item wording uses the same translation keys as the existing locale files, so existing
translations can be reused where the wording stays the same.

Keyboard shortcuts (shell part). Mac uses Cmd, other systems Ctrl. All prevent the browser's
own action.

| Action | Keys |
| --- | --- |
| Undo | Ctrl/Cmd+Z |
| Redo | Ctrl/Cmd+Shift+Z |
| Open diagram | Ctrl/Cmd+O (local: Open dialog; server: go to `/`) |
| Save | Ctrl/Cmd+S (refreshes last-modified time) |
| Toggle side panel | Ctrl/Cmd+B |
| Fit all to screen | Ctrl/Cmd+0 (animated 0.5 s, 10% padding, max zoom 0.8) |
| Toggle theme | Ctrl/Cmd+M (also works inside inputs; if theme is System it switches to the opposite of what System currently resolves to) |
| Toggle table filter | Ctrl/Cmd+F (defined; handled by the canvas filter) |

**Mobile navbar** (under 768 px): a hamburger button toggles the left icon sidebar as an
overlay, the text "QBase", then account menu (server mode) and language button, then the
menubar below, then the diagram name centred below that. The save status, get-latest, lint,
drift and publish controls are not shown on phones (an inherited gap; see open questions).

### A7. Side panel and sidebar tabs

Desktop layout: top bar, optional access banner (A8), then a left icon rail ("sidebar", about
64 px, always collapsed to icons with labels under them), a resizable side panel (default 25%
of the width, minimum 25% and 350 px, up to 99% when dragged; zero width when hidden, with a
200 ms width animation and the drag handle hidden), and the canvas.

Icon rail, top group: **New diagram** (plus icon) and **Browse** (folder icon, opens the Open
dialog). Separator. Second group (selecting one shows the side panel and switches section):
**Tables**, **DBML**, **Refs** (relationships and dependencies), **Custom types** (only for
database types that support them: today only PostgreSQL), **Visuals** (areas and notes; opens
on the Areas tab). The active item is tinted teal. There are no footer items (no external
links). Labels wrap per word under the icon.

Section contents (detail in the canvas and tables specs): Tables list (search, add, open an
item to edit); DBML (DBML text of the diagram, loaded when first opened); Refs (relationships
and dependencies lists); Visuals (Areas tab, Notes tab); Custom types (enum and composite
lists).

Mobile layout (under 768 px): the rail becomes an overlay opened by the hamburger, with the
text "QBase" as its header. The side panel is a full-height drawer titled "Manage Diagram"
("Manage your diagram objects" as its description, English only), containing a dropdown at
the top to choose a section (Tables, Refs, Areas, Visuals, and Custom types when supported;
"view all options" on the right) and then the section. The DBML section is not in that
dropdown. On main, choosing "Areas" in that dropdown shows the Custom types section (a
defect; decision: change). The side panel starts hidden on mobile and visible on desktop. The
editor fills `100dvh x 100dvw` on mobile, `100vh x 100vw` on desktop.

Opening something from elsewhere (for example a lint finding, a table on the canvas, a
relationship) shows the panel, switches to the right section (areas and notes switch the
Visuals tab) and expands that item.

### A8. Server-mode editor frame

Only in server mode, around the editor:

- **Gate.** Requires sign-in. Resolves the project from the URL (404 or another user's
  project shows a centred "Project not found" with a "Back to projects" button), checks the
  diagram belongs to the project ("Diagram not found" otherwise), then makes sure the browser
  has a local copy: if there is none it downloads the server version and stores it under a
  new local id; if there is one it is replaced by the server version only when it is behind
  the server and holds nothing unsent (a viewer's copy never does). A viewer cannot open a
  diagram that has never been published ("not published yet" message).
- **Edit lock.** An editor edits only while holding the server's per-diagram lock. The lock
  is requested on open, renewed every 20 seconds (the server's expires after 90), released on
  leaving or closing the tab. If someone else (or another tab) holds it, this tab opens
  read-only. It never retries by itself.
- **Read-only.** A viewer, a diagram not in any project, a lost-access diagram, an
  unreachable server, or a lock held elsewhere all give a read-only editor, with a banner under
  the navbar (info colour, lock icon) explaining which case it is and, when possible, a
  remedy: "Get latest" (when the lock is taken by someone else), "Retry" (server unreachable),
  or a project picker plus "Move" (for an unbound local diagram; lists the projects where the
  user may edit; if there are none, "ask an admin"). While read-only, nothing is stored and no
  edit sticks (see contract C2).
- **Open dialog in a project** replaces the local Open dialog: a searchable list of the
  project's diagrams (title filter, newest first) with columns name, created by, created, last
  modified, tables count, role badge; same selection, double-click, Enter/Space and arrow-key
  behaviour. Row menu: Open; "Get latest" only when this browser holds a copy; Delete only for
  project admins (asks first, deletes for everyone, also removes this browser's copy, shows the
  server's message and keeps the list if refused). Footer: Cancel (not shown when it cannot be
  closed), "New diagram" (hidden for viewers) and "Open diagram".
- **New diagram in a project** replaces the local New dialog: a small form with a name field
  (optional, 200 characters, blank becomes the localised default name), a database type select
  (default PostgreSQL; all nine types offered including Generic), a Create button, and, when
  available, an "Import from database" button that opens the live-database import wizard.
  Creating makes the local diagram and the server diagram together; if the server step fails
  the local copy is removed again and the error shows in the dialog. On success it goes to the
  new diagram's project URL.
- **Account menu** (right of the navbar): "Sign in" button when signed out. Signed in: an
  "Admin" shortcut button (admins), then a dropdown named after the user's email: Projects
  (goes to `/`), Database connections (when the project is known and the user can edit it),
  Re-sync from database and Share (both hidden when read-only), Members, Admin panel (admins),
  Change password, Two-factor authentication (when the server supports it or it is on),
  separator, Sign out. Each opens its own dialog; they belong to QBase and are not part of the
  rewrite.
- Keyboard "Open" goes to `/` (the project list) in server mode.

### A9. Home (project list) and the shared page frame

`/` in server mode shows, inside the shared page frame (a 48 px top bar with the logo and,
for a signed-in user, an Admin button and an email dropdown with Change password and Sign
out; a footer line "Powered by Qubdi" at the bottom): the heading and description, a search
box (shown only when the user has any projects or a search is active), then a grid of
project cards (3 columns on large screens, 2 on small, 1 on phones; 9 per page) with name,
role badge, two-line description and diagram count, plus a pager. Empty and "no match" states
have their own text; an admin with no projects is pointed to the admin panel. Signed out: a
sign-in prompt, and after a session ended by the server a notice says so. Without a
configured server the page says it needs a server. The page title is the translated
"Projects" title.

### A10. Settings and themes

There is no settings page or settings dialog. "Settings" are the View-menu toggles, the theme
and the language, all stored in the browser's `localStorage` (each read and write is wrapped:
if storage is refused the page opens with defaults and the setting just lasts until reload).

| Setting | Stored key | Values | Default |
| --- | --- | --- | --- |
| Theme | `theme` | system / light / dark | system |
| Scroll action ("zoom on scroll") | `scroll_action` | pan / zoom | pan |
| Show views | `show_db_views` | true / false | false |
| Show cardinality | `show_cardinality` | true / false | true |
| Show field attributes | `show_field_attributes` | true / false | true (see note) |
| Compact tables | `compact_tables` | true / false | false |
| Show minimap | `show_minimap_on_canvas` | true / false | true |
| Language | `i18nextLng` (written by the language detector) | a language code | browser language |

Note (defect on main, decision "change"): the field-attributes toggle is not written back to
storage, so it resets to "shown" on every reload. The new app should persist it.
Interface settings are not cleared on sign-out (they hold no data). Keys written by QBase
server features use the prefix `qbase.` in `localStorage`/`sessionStorage` and are cleared on
sign-out or on a change of account (see B3).

**Themes.** Light, Dark, System (follows the operating system and updates live when it
changes). Dark mode is a class on the root element; the whole app (editor, home, admin, 404,
templates) follows it. Toggle by menu or Ctrl/Cmd+M. The viewer page (`/s/<token>`) and the
404 page follow the saved theme through the early script but do not themselves offer a
switch.

### A11. Toasts, confirm dialogs and alerts

- **Toasts**: one at a time (a new toast replaces the visible one), in a viewport region,
  with optional title, description, optional action button (row or column layout) and a close
  button (can be hidden). Variants: default and destructive (red). They auto-dismiss by the
  toast library's default timing (about 5 seconds; not verified in a browser). QBase features
  use them for results ("Published v3", "Re-sync applied", "Lint fix applied") and failures
  (red, with the server's message as description).
- **Confirm alerts**: a modal alert dialog with title, description, a confirm button and a
  cancel button, with caller-supplied labels. Used today for Delete diagram and Clear diagram
  (each with its own translated title, description and labels), and by the canvas and toolbar
  for destructive actions. Confirming runs the action then closes; cancelling or Escape just
  closes. The QBase code also builds its own alert dialogs (Get latest, delete in a project,
  revoke a share link) on the same alert-dialog primitive.
- The Toaster is mounted once, on the editor page only. QBase components outside the editor
  call the toast hook too, so the new app should mount it at the app root (decision: change).

### A12. Templates and examples pages (list only; recommendation: drop all)

Existing in local mode only (not routed in server mode):

- **Examples page** `/examples`: 3 example schemas shipped as full diagrams (MySQL
  "Employees", "Bike stores", "DVD Rental"), shown as cards that open a copy in the editor.
- **Templates pages**: 50 templates (36 PostgreSQL, 14 MySQL), 22 marked featured, with 16
  tags (Postgres 37, Open Source 36, PHP 24, Laravel 22, MySQL 12, Rails 9, Python 7,
  Django 7, Example Apps 4, Node.js 2, CMS 2, WordPress 2, and one each for SaaS, Visual Novel
  Database, Pokemon, Symfony). Routes: all, featured, by tag, a detail page with a read-only
  preview, and a "clone" route that copies the template into a new local diagram and opens it.
  100 thumbnail images (light/dark pairs) ship with them. The pages are English only.
- The New diagram dialog links to the examples page.

Decision recommendation: **drop all** (the owner already decided to drop ChartDB templates,
examples and fixtures; PLAN section 8, decision 4). Removing them also removes the
`/examples` and `/templates*` routes, the dialog card and about 100 images. If starter content
is wanted later, write a few original diagrams (not copies) and offer them from the New
diagram dialog.

### A13. Public share viewer `/s/<token>` (QBase, original; needs only light shell support)

Read-only page showing a published diagram on its own graph canvas with search, selection
highlighting, controls and a minimap; it uses none of the editor's providers. States: loading,
ok, login required (offers a sign-in dialog), not found, not published, error. For "live"
links it keeps an event stream open to the server and reloads when a new version is
published, reconnecting with a back-off of 2 seconds up to 60 seconds. This page is already
original and only depends on: the QBase API client, the account provider, shared primitives
(button, input), the "Powered by Qubdi" mark and i18n. It must not import any editor module.

### A14. Languages and how the language is chosen

The picker lists **22** entries (English first), each with a native name and an English name;
the brief said 21, so see the open questions. English is bundled; all others load on demand
the first time they are chosen (one file per language).

Codes and English names: en English; fr French; de German; es Spanish; uk Ukrainian; ru
Russian; tr Turkish; hr Croatian; pt_BR Portuguese; hi Hindi; ja Japanese; ko_KR Korean;
zh_CN Chinese (Simplified); zh_TW Chinese (Traditional); ne Nepali; mr Marathi; id_ID
Indonesian; te Telugu; bn Bengali; gu Gujarati; vi Vietnamese; ar Arabic. Each is shown with
its own native-script name (for example Francais, Deutsch, a Cyrillic name for Russian).

Choice: the standard browser language detector decides at start: first a `lng` URL parameter,
then a cookie, then `localStorage` (`i18nextLng`), then session storage, then the browser's
language list, then the page's `lang` attribute. The picked language is remembered in
`localStorage`. A regional code (for example `de-AT`) is served from its base file (`de`). An
unknown code falls back to English. Missing words fall back to English key by key.

The language button (globe icon, circular outline button, tooltip "Change language") opens a
small dropdown containing a searchable select; items show the native name with the English
name in brackets. Selecting applies instantly (no reload), closes the dropdown, sets the
page's `lang` attribute, and sets the document direction to right-to-left for Arabic (left to
right for all others).

Translation structure: the editor part of each language must be complete; the QBase part (all
keys under `qubdi`: account, side-panel, database, workspace, admin users, admin projects) may
be missing or partial in a language and falls back to English. QBase's English text lives in
files under `src/i18n/qubdi/` and is merged into English under one `qubdi` key; those files
are original and must keep their key names. Known untranslated texts on main (decision:
change, translate): "Compact Tables/Standard Tables", the mobile drawer title and
description, "Saved ... ago", "More Databases / Primary Databases", the templates and 404
pages.

### A15. Window title and page metadata

Default title and og:title: "QBase - Database schema diagrams". Description meta and
og:description: "Database schema diagrams: import a live database, publish versions, share
read-only links, re-sync and detect drift." og:type is website. In the editor with a diagram
open the title is "QBase - <diagram name>", falling back to the default while no diagram is
loaded. The home page title is the translated "Projects" title; admin and viewer pages set
their own translated titles. Titles update live on rename and on language change.

### A16. Visible browser workarounds

- Safari 15.3 and older lack a few JavaScript features; small stand-ins are installed before
  anything else runs (deep copy of plain data, `at()` on arrays and strings, `Object.hasOwn`).
  The visible effect is only that the app loads there. The new app may rely on the oldest
  browser it decides to support; if it keeps Safari 15 support it needs the same stand-ins.
  The deep-copy stand-in only handles plain JSON-like data (dates become strings).
- Old Safari also fails on a text-matching feature used by the markdown table renderer in the
  templates preview; on those browsers that renderer's extras are turned off. Irrelevant if
  templates are dropped.
- The editor height uses dynamic viewport units on phones so the address bar does not cut the
  bottom off.
- Browsers that refuse storage (private windows) still open the app: settings are not
  remembered; the local diagram database may be unavailable in some of those cases (the
  editor then cannot save; see open questions).
- The side-panel width animation (200 ms) is accounted for by lint "show table", which waits
  about 220 ms before zooming when the panel was hidden.

### A17. Build, deploy and config summary

- One container image: the server serves the built editor and the API (under `/api`); port
  3001; hashed assets get a long-lived cache, the HTML and `/config.js` are no-cache;
  pre-compressed `.br`/`.gz` files are served to browsers that accept them.
- Variables read by the browser app: `window.env.QUBDI_BACKEND_URL` (runtime),
  `VITE_QUBDI_BACKEND_URL` (dev), `VITE_APP_URL`, `VITE_HOST_URL` (build). Server variables
  (database, keys, ports) are documented in `.env.example` and are not part of the editor.
- The server imports one file from the editor tree: the database-metadata type and schema
  (see C16). The Docker build copies that folder, so the path matters.
- Fonts and icons are bundled; nothing is requested from third parties.

---

## Part B. Integration contract for the original QBase code

The QBase code already on this branch (`src/lib/qubdi`, `src/components/qubdi`,
`src/context/qubdi-context`, `src/pages/admin-page`, `src/pages/share-viewer-page`,
`src/pages/home-page`, `server/`, `shared/`) imports modules that were removed. The new
editor must provide them at these paths, or the QBase files must be edited to the new paths
(owner choice, see open questions). Prefer keeping the import paths: then QBase files need
no change and the similarity record stays clean.

### B1. What the editor must expose (contract table)

"Used in" names are under `src/`. "Behaviour" is what the QBase code relies on.

| # | Need (symbol at path) | Used in | Behaviour the QBase code relies on |
| --- | --- | --- | --- |
| C1 | `useDiagram()` hook (`@/hooks/use-diagram`, reading `diagramContext` from `@/context/diagram-context/diagram-context`) returning at least `currentDiagram`, `tables`, `databaseType`, `readonly`, `addIndex(tableId, index)`, `removeIndex(tableId, indexId)`, `updateField(tableId, fieldId, patch)`, `updateTable(tableId, patch)`, `updateDiagramData(diagram, {resetHistory: false})` | autosave, publish, drift, account menu, access banner, lint control, resync dialog | `currentDiagram` is the whole diagram (see C3), always the diagram being edited; while another diagram is loading it is an empty placeholder with a different id (autosave ignores any diagram whose id differs from the URL's). Each edit replaces the changed top-level array by a new reference (name, type, edition, tables, relationships, dependencies, areas, custom types, notes); untouched parts keep their reference, because autosave counts changes by reference. `updatedAt` moves on every edit and is ignored by the change test. Edit operations are undoable. |
| C2 | `DiagramProvider` (`@/context/diagram-context/diagram-provider`) with a `readonly` prop | diagram access gate | `readonly` true means the editor must not change or persist anything (no writes to local storage, no history entries; edit controls hidden or disabled); false or absent is normal. The same flag is exposed as `readonly` in C1. (On main the diff view also forces read-only.) |
| C3 | Diagram type and schema (`@/lib/domain/diagram`: `Diagram`, `diagramSchema`) | api content, open-remote, content, revision, resync, import, new-diagram, tests | `diagramSchema` validates a diagram revived from server JSON (dates revived to Date first; failure means "server copy cannot be read"). Fields QBase reads or writes: id, name, databaseType, databaseEdition (optional), tables, relationships, dependencies, areas, customTypes, notes, createdAt, updatedAt. Collections are optional in the type but QBase always fills them with arrays. Ids are stable strings. The same JSON is what the server stores; the format must stay backward compatible with data already on servers. |
| C4 | Domain types: `DatabaseType` enum (values generic, postgresql, mysql, sql_server, mariadb, sqlite, clickhouse, cockroachdb, oracle); `DatabaseEdition` enum (supabase, timescale, mysql_5_7, sql_server_2016_and_below, cloudflare_d1); `DBTable`, `DBField`, `DBIndex`, `DBRelationship`, `DBCustomType`, `DBCustomTypeKind`; `generateDBFieldSuffix` (used by the table hover card) | summary, lint-fix, resync, new diagram dialog, table hover card, SQL export helpers and tests | The string values are stored on the server and used by the shared description code; do not rename. Field shape per `shared/schema-desc` (id, name, type {id, name}, primaryKey, unique, nullable, increment, isArray, characterMaximumLength, precision, scale, default, comments); table shape (id, name, schema, isView, comments, fields, indexes with fieldIds); relationship shape (id, name, source and target table and field ids). |
| C5 | `databaseTypeToLabelMap` (`@/lib/databases`), `databasesWithSchemas` (`@/lib/domain`) | new diagram dialog, table clipboard | Label per type for the type select; list of types that use schemas (PostgreSQL, CockroachDB, SQL Server, ClickHouse, Oracle). |
| C6 | `dataTypeMap` (`@/lib/data/data-types/data-types`) | lint fix | Per database type, a list of `{id, name}` known types; lint fix uses it to turn a canonical type name into the editor's own type id (unknown names get a made-up id: lowercase, spaces to underscores). **Resolved 2026-11-08:** the new code provides this as `knownTypes(databaseType)` in `@/qbase/type-catalogue` (a facade over the dialect registry); there is no `dataTypeMap` module. `databaseTypeToLabelMap` and `databasesWithSchemas` are at `@/qbase/diagram-types`. |
| C7 | `useStorage()` (`@/hooks/use-storage`) with `addDiagram({diagram})`, `deleteDiagram(id)`, `listDiagrams()`, `getDiagram(id)`; and `StorageProvider` (`@/context/storage-context/storage-provider`) | access gate, new diagram, import dialog, get-latest, home page | Local persistence over IndexedDB database `QBase` (A4 and the data-format spec). `getDiagram` returns the full diagram or nothing; `listDiagrams` returns summaries (ids at least); `deleteDiagram` removes the diagram and its children. `StorageProvider` is also mounted on the home page. It must run `adoptLegacyLocalData` (from `lib/qubdi/local-data`) when the database opens, and use `LOCAL_DB_NAME` and `LEGACY_LOCAL_DB_NAME` from there. The sign-out helper deletes the database by name; the editor must tolerate that and the reload that follows. |
| C8 | `useRedoUndoStack()` (`@/hooks/use-redo-undo-stack`): `addUndoAction({action: 'updateDiagramData', redoData: {diagram}, undoData: {diagram}})`, `resetRedoStack()` | resync dialog | The editor's history must support a whole-diagram replace as one undo step with exactly that action name and payload shape; after it, undo restores the previous full diagram. |
| C9 | `useLayout()` (`@/hooks/use-layout`): `isSidePanelShowed`, `openTableFromSidebar(tableId)` | lint control | Shows the side panel, switches to Tables, expands that table. |
| C10 | `useFocusOn()` (`@/hooks/use-focus-on`): `focusOnTable(tableId)` | lint control | Pans and zooms the canvas to that table; safe to call after a short delay. |
| C11 | `LocalConfigProvider` and `ThemeProvider` (`@/context/local-config-context/local-config-provider`, `@/context/theme-context/theme-provider`) | home page, admin page | Providers with no required props. Theme provider applies the dark class and listens to the OS setting; local-config provider owns the A10 settings and uses the kept helper file `context/local-config-context/stored.ts`. The existing test expects the provider to open with defaults when storage throws. |
| C12 | `@/context/local-config-context/local-config-context` exporting `LocalConfigContext` | settings test | Context object with the A10 fields. |
| C13 | Toast system (`@/components/toast/toast`, `toaster`, `use-toast`): `useToast()` returns `toast({title, description, variant: 'destructive' or default, action, layout, hideCloseButton})`; `Toaster` | 7 QBase files; editor page | Same call shape as today so QBase calls need no change. |
| C14 | UI primitives at their current paths: `button` (37 imports), `input` (17), `dialog` (17; header, title, description, footer, scrolling internal content, `showClose`), `alert-dialog` (action, cancel, content, header, footer, title, description), `dropdown-menu`, `popover`, `table`, `tabs`, `checkbox`, `label`, `badge`, `spinner` (with a `size` prop) | QBase files | Visual and API compatibility with the shadcn-style primitives QBase files use (props `variant`, `size`, `asChild` and so on). The ones already on this branch (`option-select`, `select-box`, `tooltip`, `logo`, `diagram-icon`, `empty-state`, `code-snippet`, `color-picker`) stay. |
| C15 | QBase-owned modules that the original code imports but were removed with the editor: `GetLatestDialog` and `GetLatestControl` (`components/qubdi/get-latest-control`), `ProjectDiagrams` (`components/qubdi/project-diagrams`), `emptyDiagram` and `defaultDiagramName` (`lib/qubdi/new-diagram`), `DiagramLinksDialog` (`pages/admin-page/diagram-links-dialog`), `LastSaved` (`pages/editor-page/top-navbar/last-saved`) | access banner, project open dialog, admin diagrams panel, new diagram dialog; a test exists for each | These were in the 10% to 30% shared band and were deleted. The tests that remain on this branch describe them well and act as an acceptance suite (B3). The clean author recreates them from this spec and those tests. |
| C16 | Metadata types at the fixed path `@/lib/data/import-metadata/metadata-types/database-metadata`: `DatabaseMetadata` type and `DatabaseMetadataSchema` (zod) | server (`introspect/types.ts` imports it by relative path), resync, import-from-db, import dialog | The introspection reply shape (tables, columns with ordinal position, schema, table, name and type, indexes, foreign keys, views) is a data format produced by server queries; keep file location, names and shape. The Docker build copies exactly this folder into the server stage, so moving it breaks the image. |
| C17 | `loadFromDatabaseMetadata({databaseType, databaseMetadata, diagramNumber?, databaseEdition?})` returning a Diagram, at `@/lib/data/import-metadata/import` | import-from-db, resync | Builds a complete diagram (tables with fields, indexes, relationships, views, generated ids) from introspection metadata. Table positions are auto-laid out. QBase uses it for PostgreSQL and SQL Server metadata only. |
| C18 | `createRelationshipsFromMetadata({foreignKeys, tables})` returning relationships, at `@/lib/data/import-metadata/import/relationships` | resync | Given foreign key rows and the diagram's tables, returns relationship objects (cardinality derived); resync removes duplicates by source and target field ids. |
| C19 | SQL export and import helpers that kept files on this branch import: `exportBaseSQL`, `escapeSQLComment`, `determineCardinality`, `sqlImportToDiagram`, `validateSQL`, `validateWithRules`, types `ValidationResult` and `DialectRules` | `lib/data/sql-export/*`, `lib/data/sql-import/*` and their tests | These original files (cross-dialect convert, MySQL/SQLite/SQL Server validators, tests) sit beside removed modules. See the import/export spec; the clean author supplies those sibling modules under the same paths and names, or the kept files are adapted. **Resolved 2026-11-08:** the kept files were adapted (the second option above). The old helper names are not provided; the equivalents are `exportSql` (`src/formats/sql/export-sql.ts`), `importSql` (`src/formats/sql/import-sql.ts`) and the converter in `src/dialects/convert/`. The kept test folders under `src/lib/data/sql-export` and `sql-import` run against them. |
| C20 | Canvas helpers `carryMeasured`, `findFreeShift`, `PlacedRect` (`pages/editor-page/canvas/canvas-utils`); `Toolbar`; `FieldTypeLegend` | tests under `pages/editor-page/canvas/**` | Kept original tests of canvas behaviour (collision-free placement, measured sizes). See the canvas spec. **Resolved 2026-11-08:** `findFreeShift` is in `src/canvas/placement.ts`, the measured-size carry-over is `src/canvas/measure-book.ts`, `Toolbar` is `src/canvas/toolbar.tsx`; the old tests were ported to them (`src/canvas/placement-rules.test.ts`, `measure-book.test.ts`). `carryMeasured`, `PlacedRect` and `FieldTypeLegend` do not exist under those names. |
| C21 | i18n: `i18n` instance, `i18nReady`, `languages` (`@/i18n/i18n`); `en` and per-language locale files; `LanguageMetadata` type (`@/i18n/types`) | 20+ QBase files and `i18n/__tests__` | `i18n.t` is usable outside components (QBase library code calls it). `i18nReady` resolves when the first language is loaded. Locale files at `i18n/locales/<code>.ts`, each exporting an object named by its code (for example `fr`), shaped as a translation object. English merges QBase's six `qubdi` files under the `qubdi` key. |
| C22 | Utilities `@/lib/utils` (`cn`, `generateId`, `area-utils`) and `@/lib/env` | most QBase files | `generateId` returns a unique string (used for local ids and the per-tab editor id). `cn` merges class names. **Resolved 2026-11-08:** `cn` and `generateId` are exported by `@/lib/utils` (`src/lib/utils/index.ts`); `area-utils` is not provided because no code uses it; `@/lib/env` was removed for the same reason. |
| C23 | Page wrapper order for `EditorPage`: local config, theme, storage, QBase diagram access gate, then the editor providers; `ServerAutosave` and `Toaster` rendered once; `AccessBanner` under the navbar on desktop and mobile; navbar slots in B2 | router, editor page | The editor page is rewritten, but it must host these QBase parts in these places. The access gate must wrap the diagram provider (it supplies the `readonly` flag) and sit inside the storage provider (it reads and writes local copies). |
| C24 | Router `buildRoutes(backendEnabled)` and `App` composition | `app.tsx`, tests | `buildRoutes` takes the "backend enabled" flag and returns the table in A2; the QBase `adminRoute` object is spliced in; `ForcedPasswordChange` and `QubdiProvider` wrap the router. |

### B2. Where the QBase controls plug into the editor frame

| # | Plug-in point | Component (QBase, original) | Behaviour the editor frame must allow |
| --- | --- | --- | --- |
| P1 | Page wrapper, inside storage, outside the diagram provider | `DiagramAccessGate` | Chooses between the workspace gate (route has a project slug), the legacy gate (`/diagrams/<id>` with a backend) and plain pass-through (local mode). Supplies the `readonly` flag and the access value to descendants. Renders spinner, sign-in or problem screens instead of the editor when needed. |
| P2 | Under the navbar, desktop and mobile | `AccessBanner` | Needs only vertical space in the layout (a full-width row between the navbar and the content). |
| P3 | Navbar right slot, first | `ServerSaveStatus` with `LastSaved` as the fallback | In local mode or when idle shows the fallback save icon; with a server and an editor role it shows cloud icons: saved (check), unsaved changes (cloud with amber dot; click retries when possible), saving (spinner), not saved (alert; click to retry), conflict (text with an "Overwrite" button). |
| P4 | Navbar right slot | `GetLatestControl` | Cloud-download icon button; visible only for a signed-in user with a diagram that has both local and server ids; asks to confirm, then replaces the local copy and reloads the project diagram URL. |
| P5 | Navbar right slot | `LintControl` | Button with a count badge; opens a right-hand floating panel (portalled to the page body because the navbar's blur would trap it) listing findings by severity with "show table" and "apply fix" actions and a settings dialog. Works offline; per-diagram settings kept in local storage and mirrored to the server. Fixes run through the editor's own undoable operations (C1). |
| P6 | Navbar right slot | `DriftControl` | Badge button that polls the server every 60 seconds while the tab is visible and checks once on open; opens a drift report dialog with a "re-sync" shortcut. |
| P7 | Navbar right slot | `PublishControl` | "Publish" button with a status dot or pill (not synced, not published, published vN, published with unpublished changes); dialog with note field and an "auto publish" switch; shown only when the user holds the edit lock. |
| P8 | Navbar right slot | `AccountMenu`, then `LanguageNav` | As in A8. The language button is editor-owned (rewritten) and sits to the right of the account menu. |
| P9 | Dialog provider | `ProjectCreateDialog`, `ProjectOpenDialog` | In a project workspace the editor's "new diagram" and "open diagram" requests (sidebar buttons, the diagram icon in the navbar, the loader's fallback) open these instead of the local dialogs. The editor's dialog API must offer "open the create dialog" and "open the open dialog (with a can-close flag)". |
| P10 | Window event `qubdi:open-resync` | account menu listens | The drift report asks the account menu to open the re-sync dialog by dispatching this event on the window; the editor must not swallow it. |
| P11 | App root | `ForcedPasswordChange` | A blocking dialog shown above everything while the account is flagged. |
| P12 | Actions menu | Delete diagram item | In a project: admin only, server delete first (A5). |

### B3. Behaviours the QBase code implements around the editor (the editor must not break them)

Publish and share links
- **Publish**: flushes pending autosave first, uploads the current diagram, then asks the
  server to publish with an optional note; toast "Published v<n>" or a red "could not publish".
  Auto-publish is a per-diagram switch saved on the server.
- **Share links**: from the account menu's Share dialog (links with access "anyone",
  "signed-in only" or "off", optional end date, optional "live" updates). The Share dialog
  first makes sure the diagram exists on the server (flush, then upload). Links open
  `/s/<token>` (A13). Admins can list and revoke a diagram's links from the admin panel.
- **Upload (`syncDiagram`)**: converts the diagram to plain JSON keeping every id as-is (no
  renumbering), sends it with the last-known server version as a conflict base and the tab's
  editor id; a missing server diagram is re-created only when a project is known. The editor
  must keep the diagram object serialisable losslessly to JSON and back (dates as ISO
  strings), and editor code must never renumber ids.

Autosave and lock lost
- Autosave waits 10 seconds after the last change, then uploads. It skips when the user is
  not an editor holding the lock. The editor must hand every change over through
  `currentDiagram` (C1) and must not mutate objects in place.
- On a 409 conflict the status shows the conflict text with Overwrite (take the server's
  version as the new base, then save); a save that actually landed is recognised and not
  treated as a conflict. On 423 (lock taken) the editor becomes read-only (banner "taken",
  with "Get latest") and unsent edits are dropped.
- Leaving: closing or hiding the page sends the final save with the browser's keep-alive
  option; if something is unsent the browser's "leave page?" prompt shows. After a reload or
  re-login, an unsent difference from the server version is detected and marked unsaved so it
  is sent.
- The lock is released after the final save settles, and immediately on page hide.

Open remote
- Opening `/<project>/diagrams/<id>` downloads the server diagram, validates it, stores a
  local copy with a fresh local id (remembering the mapping, project and base version in
  `localStorage` under `qbase.*`), and refreshes an out-of-date, clean copy. A diagram the
  server holds with no content yet (never published) cannot be opened by a viewer.

Re-sync and import from a live database
- **Import from database** (QBase wizard in New diagram): connects through saved connections
  held by the server, lists schemas and tables, lets the person select, previews counts, and
  turns the metadata into a diagram (C17), saved locally and uploaded to the project.
- **Re-sync**: re-reads the live database (server introspection), compares with the diagram
  (by table key schema.table and the stored source keys), proposes a grouped change list with
  checkboxes (all on by default; possible renames are suggestions), applies the chosen ones
  as one undo step (C1 `updateDiagramData` plus C8), saves the new "source keys", and uploads
  to the server so drift checks compare the new state. Success toast with the count, and a red
  toast if only the server step failed.
- **Drift detection**: the server compares the stored database state with the diagram's last
  published content; the badge shows counts; the drift dialog can open re-sync.
- **Lint**: a pure function from the diagram (see `shared/lint`) to findings; configuration
  per diagram; fixes limited to adding or removing an index and updating a field or table
  (C1). Stale fixes (diagram edited since) show a red "out of date" toast and do nothing.
- **Get latest**: delete the local copy, forget its server mapping (handing sync state to the
  new copy), reload the project URL, which downloads the server version.

Local data hygiene
- On sign-out, or when a different account signs in, QBase deletes the IndexedDB databases
  `QBase` and `QubdiDB` and every `qbase.*` key in local and session storage, then reloads.
  The editor must not keep diagram data anywhere else (no other database, no other storage
  keys) or it would survive a sign-out on a shared computer. Interface settings (A10) stay.

Admin panel and share viewer
- Both are standalone pages that need: the account provider, theme and local-config
  providers (admin and home), the shared primitives in C14, i18n, and the router. They do not
  use the diagram, storage (except home) or canvas providers.

Tests that already exist on this branch and describe the contract (treat as acceptance tests;
they must pass unchanged after the rewrite): `components/qubdi/__tests__/` (`server-autosave`,
`get-latest-control`, `project-diagrams`, `share-link-list`),
`pages/admin-page/__tests__/diagram-links-dialog`,
`pages/editor-page/top-navbar/__tests__/last-saved`, `lib/qubdi/__tests__/*` (including
`new-diagram`, `open-remote`, `resync`, `import-from-db`, `lint-fix`, `content`),
`context/local-config-context/__tests__/stored`, `i18n/__tests__/*`.

Server dependencies on the editor tree: only the metadata type file (C16) and the shared
folder at the repository root (`shared/`: reconcile, drift, lint, schema-desc, password,
change-text), which the browser also imports. The server needs no other editor module.

---

## Open questions for the project owner

1. **Mode split.** Keep local-only mode (no server) at all? It doubles the New/Open/Delete
   paths (A5 vs A8). Recommendation: keep it for development and demos, but the product is
   server mode; do not invest in local-only extras (examples, templates).
2. **Language count.** The picker lists 22 entries including English; the brief said 21.
   Confirm 22 is the target and whether any language should be dropped (many have partial
   QBase text and fall back to English).
3. **Sign-off on drops.** Drop all templates and examples pages (A12) and the "Examples" card
   in the New dialog? Drop the duplicate "Backup" menu (same two items already under Actions)?
4. **Export SQL targets.** Oracle, ClickHouse and CockroachDB are not offered as export
   targets on main. Keep that, or add them?
5. **Mobile parity.** On phones the lint, drift, publish and save controls are not shown on
   main. Intentional (editing on phones is secondary) or add them to the mobile menu? Same for
   the missing DBML entry in the mobile section dropdown and the "Areas" entry that shows the
   wrong section.
6. **Import paths.** Keep the removed-module import paths exactly (so original QBase files
   need no edits) or allow adapting QBase files to a new layout? The contract is written
   assuming paths are kept, which also keeps the server's relative import of the metadata type
   valid.
7. **Toaster scope.** Mount the Toaster at the app root (QBase pages outside the editor call
   the toast hook) instead of only in the editor page? I recommend yes.
8. **Delete without confirmation.** In the local Open dialog Delete has no confirmation. Add
   one (change) or keep parity?
9. **Persisting "Show field attributes"** (forgotten on reload today): fix it?
10. **Search and rename in the local Open dialog.** None today. Add a search box (the project
    dialog has one)? Rename stays in the title bar.
11. **Environment variables.** `VITE_HOST_URL` and `VITE_APP_URL` appear unused by visible
    behaviour. Remove them (and the Docker build args) or keep for a future link feature?
12. **Browser support.** Which browsers must the rewrite support? This decides whether the
    stand-ins in A16 are needed.
13. **Private-window behaviour.** When IndexedDB is unavailable the editor probably cannot
    save at all. Define the desired behaviour (read-only with a notice?). Not verified on main.
14. **Toast timing and look** were read from code, not seen running; confirm in a browser on
    `main` before the clean author builds them.
15. **Missing QBase modules** (C15): confirm they should be recreated by the clean author from
    this spec and the existing tests rather than restored from `main` (restoring would bring
    back the 10% to 30% shared lines the plan chose to remove).
16. **Admin landing redirect** (admins go to `/admin` once per session): keep? It surprises
    admins who want the project list. Deep links to a project route are not redirected, only
    `/`.
