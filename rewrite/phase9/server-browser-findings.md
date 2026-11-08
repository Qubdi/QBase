# Server mode in a real browser: findings

Run of `tools/e2e/run-server-flows.sh` (image built from this tree, throwaway PostgreSQL backend, second PostgreSQL as the "live source database", Chromium 1.49.1, desktop 1280x800 and phone 390x844, English, German, Georgian). Screenshots of the last run were reviewed by eye (folder outside the repo, names below are the file names the script writes).

## Bugs found and fixed (each with a test)

| # | Bug | Fix | Test |
| - | --- | --- | ---- |
| 1 | The server's policy is `font-src 'self'`, but Vite inlined every font under 4 KB as a `data:` URI: about 20 console errors "Refused to load the font" on the first page load, and those font subsets (rare scripts) did not load. The old smoke test overrode the policy with `font-src 'self' data:`, so it never saw this. | `build.assetsInlineLimit` keeps fonts as files (`vite.fonts.ts`). The policy stays strict. | `src/__tests__/vite-fonts.test.ts` |
| 2 | Sign out sent `DELETE /api/diagrams/:id/lock` after the session had ended: a 401 in the console on every sign-out from an open diagram. | Sign-out gives the edit lock back first (`releaseHeldLocks`), then ends the session. | `use-edit-lock.test.tsx` ("releaseHeldLocks gives the lock back once") |
| 3 | The Publish button badge never showed "unpublished changes" after an edit until the person clicked it (status was read only on open and on click). MT-359 says it must show. | The status is read again whenever an autosave reaches the server. | `publish-control.test.tsx` ("shows unpublished changes after a save ...") |
| 4 | Re-sync and drift never saw a table added to the database after the import: the import stored the explicit list of all chosen tables, and the server filtered the new table out. `SyncState.tables` is documented "empty means every table". Seen in `s8-resync-list`: only removals were offered. | When every table of the catalog was chosen the import stores `[]`. | `import-from-database-dialog.test.tsx` (two tests) |

## Found and not fixed

| # | Finding | Screenshot | Note |
| - | ------- | ---------- | ---- |
| A | Phone width (390 px): the second row of the editor bar (menu, save state, Lint, Drift, Publish) is wider than the screen. Drift and Publish are cut off and only reachable by scrolling that row sideways (step S9.03 passes: they can be reached). | `s9-phone-editor`, `s9-phone-navbar-scrolled` | Layout work in the navbar; not changed here. |
| B | German and Georgian: the Qubdi screens (sign-in, re-sync, drift, share, admin) are English; the editor chrome is translated. This is the documented fallback (`src/i18n/qubdi/*`), no raw `qubdi.` keys showed. The re-sync change lines ("Add column public.orders.priority (integer)") come from `shared/change-text.ts` and are English by construction. | `s10-de-signin`, `s10-de-resync`, `s10-ka-signin`, `s10-ka-resync` | Needs translations. |
| C | Georgian: the new "Backup" menu entry (სარეზერვო ასლი) wraps to two lines in the menu bar; German makes the diagram title in the bar shrink to "Sho...". | `s10-ka-resync`, `s10-de-resync` | Cosmetic. |
| D | The sign-in dialog inputs have a placeholder but no `aria-label` (the admin dialogs have one). A screen reader still gets the name from the placeholder. | `s1-setup-prompt` | Not changed. |
| E | There is no versions list in the editor: the server has `GET /api/diagrams/:id/versions` (checked by S3.07), but nothing in the UI shows it. | `s3-saved` | Feature gap, not a bug. |

## Things that looked wrong and are by design

- Signing in as the admin on a second browser ends the first browser's session (one session per account). The script orders its flows around this.
- The lint "Fix" for a foreign key without an index adds an index the database does not have, so the next drift check lists it ("Only in the diagram").
- A user created by an admin must change the temporary password before anything else (a 403 `password_change_required` until then, step S5.01).
