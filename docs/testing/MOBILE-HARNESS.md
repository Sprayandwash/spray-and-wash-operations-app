# Mobile harness

Whole-app Playwright run at phone size (360px Android, 390px iPhone) against Staging only, as Admin and as an employee. Runs automatically on every pull request (workflow `staging-mobile-harness-on-pr.yml`); locally: `npm run test:staging:mobile-harness` with the `E2E_STAGING_*` settings. Read-only: forms are never submitted, every confirm() is dismissed. Upload tests use the real files in `tests/e2e/fixtures/` (a real JPEG and a real 2-page PDF), never empty files. Evidence (screens, findings.json, inventory.json) is uploaded as the `mobile-harness-evidence` artifact.

Employee coverage: uses the Height equipment audit account by default; add `E2E_STAGING_HARNESS_EMPLOYEE_EMAIL`/`_PASSWORD` (staging user with Height equipment user + Vehicle inspector) to also cover Vehicle Checks as an employee.

Production-only database rule faults (e.g. old role names in production RLS) cannot be seen on Staging; compare production and staging policies separately.


## A. Layout and visual (about 35 entries)
Seen: overflow off the right edge (REG-131, 158); misaligned pills, columns, buttons, tick boxes (82, 95, 107, 111, 116, 122, 135); uneven button heights (102, 110, 121); blank white-on-white tile (100); empty gaps (150); text overflowing its pill (126); header gap showing scrolled content (154).
Extrapolate (all Auto unless noted): any element wider than viewport; text clipped by `overflow:hidden`; sibling controls of unequal height or baseline; sticky headers hiding the focused or opened item; text/background contrast under 4.5:1 (catches white-on-white); overlapping elements; tap targets under 44px; zoom/orientation change; long names, long emails, 3-digit counts and 40-character course names breaking layouts (Needs data: inject long strings); dark/light mode; RTL not needed. Manual: logo distortion (49).

## B. State lost on redraw (render() replaces everything) (about 12 entries)
Seen: typed values lost (58, 146); sections collapse (34, 115, 161); filters reset (39); scroll jumps (36, 146, 151); file input wiped (162); duplicate/flashing panels (33, 40, 48).
Extrapolate (Auto): for **every form and `<details>`**: fill, trigger the three redraw sources (tab hidden/visible, auth refresh, data reload) and compare field values, open state, scroll, focus and cursor position before/after; count `<details>` that reset; focus lost mid-typing; selected dropdown value reverts; checkbox/toggle state reverts; draft survives Back button and browser reload; double-render flicker (record DOM snapshots from first paint; fail on more than one distinct screen before the dashboard = the load flicker bug).

## C. Scroll and navigation position (about 8 entries)
Seen: page opens scrolled down (new 1); edit form hidden behind sticky bars (150); Back/Matrix click jumps to top (146, 151); edit opens at wrong place (68).
Extrapolate (Auto): after **every** open/edit/back/save/tab change, assert the target's top is in the viewport and below sticky bars; assert Back restores the earlier scroll; deep links and alert taps land on the right record (7, 23); modal opens scrolled to its top and locks background scroll; keyboard opening doesn't hide the focused field; after save the user returns to the expected list (132).

## D. Open/close and accordion rules (about 6 entries)
Seen: opening one should close others (150, new 2); initial collapsed/expanded state (34, 115, 150); outside click doesn't close popovers (12, 155).
Extrapolate (Auto): every popover/menu/dropdown closes on outside tap, Esc and navigation; exactly-one-open groups; default state per section recorded in a table and asserted; open sections stay open after navigating away and back.

## E. Files, photos and uploads (about 10 entries)
Seen: photo not viewable (61); unreadable/empty uploads (31); duplicate names (147); Camera vs Gallery (60, 162); chosen file lost on refresh (162); evidence view vs download (67, 80); no feedback (new 6); all uploads failing (new 16).
Extrapolate (Auto against staging storage): for **every** upload field: small JPG, PDF, oversize (over limit), zero-byte, wrong type, HEIC, very long file name, special characters, same name twice; thumbnail before save; stored object exists and is non-zero after save; reopen after reload via signed URL; delete removes the object (no orphans, Needs data); permission denied shows a message; progress/disabled button while uploading and no double submit; upload survives a background refresh; removing then re-adding works; two-source case (camera then gallery saves the latest).

## F. Data shown vs data held (about 14 entries)
Seen: counts wrong (5, 6, 118, 5 vs 6 sub-assets new 5); empty lists (27, new 7); wrong filter results (35, 37, 38); wrong order (14); extra/missing items on dashboard (5, 88, 108, 118); stale values (83).
Extrapolate (Needs data): for every list, compare rows shown to a direct staging DB query run as the same role; every counter equals its list; filters: each option individually and combined, "All" shows everything; limits (10/20/50) honoured; sort stability; archived excluded/included as promised; unclassified rows (null side/type) still shown; pagination boundaries; role differences (each role sees exactly its allowed rows); empty-state message appears only when truly empty and says why when blocked (new 9).

## G. Forms, validation and saving (about 18 entries)
Seen: required fields (15, 156, 157, 152); impossible dates (147); status values the database rejects (144, 145); double submit (147); failed save loses input (146); unnecessary red fields (152); defaults wrong (144); atomic save (21); duplicates (148, 149).
Extrapolate (Auto + Needs data): every enum option in every dropdown saved once against staging (catches 145, 16, 17); each required field left blank individually; max lengths; unicode/emoji/apostrophes; leading/trailing spaces; negative and decimal numbers; date edges (today, leap day, far past/future); rapid double tap and offline/slow network save; browser back after save doesn't resubmit; unsaved-changes prompt on navigating away (new 3); success confirmation shown; save then reopen shows the same values.

## H. Buttons that do nothing or do the wrong thing (about 10 entries)
Seen: dead handlers (64, 112, 125, 142, 57); wrong routing (7, 23, 143); global guards capturing wrong clicks (101, 143).
Extrapolate (Auto): click **every** visible button/link/tile once on a seeded record; assert something observable happened (navigation, DOM change, request, dialog); no uncaught console error; no 4xx/5xx except expected; buttons whose text contains guarded words (archive, dispose, retire, delete); inline onclick referencing undefined functions (static scan + runtime).

## I. Permissions and security (about 8 entries)
Seen: UI-only restrictions (47); admin self-lockout (44); role-based tile visibility (108, 160); blocked/empty register for employees (new 7); delete refused with hidden reason (new 11).
Extrapolate (Auto + Needs data): per role, every tile/tab/button visible exactly as the permission matrix says; for each role try the **write** actions directly and expect refusal; read access per table per role checked by DB query vs UI; refusal messages are readable (no "non-2xx"); last-admin protection; signed-in-as-other-user data isolation; storage buckets: read/write per role.

## J. Release, environment and caching (about 8 entries)
Seen: staging vs production confusion (8); stale service worker (52); version number (13); asset list inconsistencies (53); syntax error breaks load (9); fix not in the build (83); icons (2, 51).
Extrapolate (Auto): version string matches build; every referenced asset returns 200; staging banner present and offset correct; service worker update path (old cache then new release); `node --check` plus a runtime "app boots to dashboard" test; manifest valid; offline load of the shell.

## K. Text and wording (about 15 entries)
Seen: labels, capitalisation, wrong terms (120, 127, 134, 136, 137, 114).
Extrapolate (Auto): scan all visible labels against a style list: Title Case in dropdowns, no "Formal", company name exact, no placeholder or developer text, no "undefined"/"null"/"NaN"/"[object Object]"/raw ids or ISO timestamps on screen. Manual: wording opinions stay with Brendan.

## L. Generated documents (print/PDF/CSV) (about 8 entries)
Seen: browser chrome in print (26); wrong header (137); missing evidence/photos (32, 42); letterhead (153); legacy labels (25).
Extrapolate (Auto + Manual): generate each report at phone size; PDF has pages, no blank pages, no clipped table, correct header/logo, names not truncated; CSV columns match headers, quotes/commas in values escaped.

## M. Server/database rules (about 15 entries)
Seen: constraints rejecting valid UI values (16, 144, 145); triggers closing wrong tasks (22); task creation counts (1, 2, 75, 65); schedule mismatches (4, 5); retries duplicating rows (21).
Extrapolate (Needs data, staging): each UI action's resulting rows (counts, status, links); idempotent retry; time-of-day edges (due today, expiring today); RLS: every table x role x action; storage policies per bucket; edge function error paths (400/403/500) surface a readable message.

## N. Phone-specific, not yet in the catalogue
Auto/Manual: viewport meta and pinch zoom; keyboard covering fields; `input type` shows right keyboard (email, number, date); autofill/auto-capitalise on codes; 300ms tap delay; pull-to-refresh triggering reload and losing state (important: causes B-class bugs); app backgrounded then resumed after 5+ minutes (auth token expiry, signed-in state); slow 3G and offline (spinner, retry, partial data); low memory page reload; Android Back button; installed-PWA vs browser tab; notch/safe areas; small phone 320px; landscape.

## Coverage notes
- Classes B, C, E, F and G account for most of Brendan's recent finds, so they get the deepest checks.
- A harness cannot judge taste (K, parts of A, L). Screenshots at every step are saved so Brendan can skim them.
- Production-only database rule problems (new 7) can't be reproduced on staging, so a separate read-only comparison of production and staging policies is proposed.
