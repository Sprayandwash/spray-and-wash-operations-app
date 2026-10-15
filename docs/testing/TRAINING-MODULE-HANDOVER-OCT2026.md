# Training & Qualifications module — testing round handover (14 Oct 2026)

**Why this file exists:** the chat that did this round's code audit and found
and fixed `TRAINING-SUITE-004`'s root cause had no GitHub write access at
all, in a running session that turned out not to be fixable from inside
itself (see "The GitHub access gotcha" below). Brendan is starting a fresh
chat with the repository properly attached from the outset. This file is
the complete state transfer from the old chat to the new one — **read it in
full, and read every file Appendix B lists, before taking any action.**
Don't re-derive context from a partial skim; everything needed to continue
safely is written down here specifically so that isn't necessary.

This file is itself part of the record this round produced — once it's
landed on `main`, keep it (don't delete it once the round is done); a later
reader can see exactly how this handover happened.

## Step 0 — verify every connection before doing anything else

This is now a standing rule for every future chat on this project (see the
"New-chat start checklist" addition in `ACCESS-AND-RECOVERY-HANDOVER.md`),
not just this handover: confirm each connection the work will need actually
functions for *this* session before reading further or proposing any work.
If something needed is missing, stop and say exactly what's missing and how
to fix it — don't work around it.

1. **GitHub — read AND write.** Read access alone is not enough for this
   round; the previous chat had read access the whole time and still
   couldn't push. Confirm write access actually works by doing the real
   push this handover asks for in Step 1 — there is no harmless dry-run
   that proves push authorization at the proxy level, so the first real
   push *is* the verification. If it fails with `access denied by the git
   proxy: ... is not in this session's authorized repository set`, see the
   gotcha immediately below before reporting back to Brendan.

   **The GitHub access gotcha (discovered 14 Oct 2026 — don't rediscover
   this the hard way):** the account-level connection
   (claude.ai → Settings → Connectors → "GitHub Integration" → "Claude
   GitHub App") can show installed, and its "Check repository status" box
   can show green for
   `Sprayandwash/spray-and-wash-operations-app`, while a session that was
   *already running* when that was fixed still gets the 403 above. A
   session's authorized repository set is fixed when the session/task is
   created; granting access afterward does not retroactively attach to a
   session already in progress. If the connector check is green but push
   still fails, the fix is to make sure *this* task was started with the
   repo attached as a connected source from the outset — not to keep
   retrying in the same session, and not to look for a different cause.

   If push still fails even in a freshly-started session, stop and report
   the exact error text to Brendan. Do not attempt the GitHub web-editor
   workaround (editing a file's blob view in the browser, "More file
   actions" → "Edit file...") as a substitute — as of 13 Oct 2026 that
   route is explicitly blocked by the Claude Code auto-mode classifier
   (`[Auto-Mode Bypass]`) precisely because it looked like a way around
   missing real git access. Retrying it is not a workaround, it's the
   thing that's blocked.

2. **Supabase.** Confirm the `mcp__Supabase__*` tools are loaded and
   actually respond — e.g. `list_projects` or `get_project` against the
   Staging project `tsnmbvezrweciaitkquf` — before relying on it for any
   diagnostic query in this round.

3. **Browser / device control.** Only needed if GitHub Actions
   `workflow_dispatch` can't be done directly via `gh api` (see Step 2 for
   the exact call to try first — repo write access, once confirmed, very
   likely also unlocks this and removes the need for browser automation
   that earlier rounds relied on). Confirm `mcp__remote-devices__*` tools
   (or Claude in Chrome) actually respond before assuming browser
   automation is needed at all.

## Standing instructions already in force for this round

Quoted verbatim, given by Brendan before this handover: **"recover the
missing read-through, proceed with the test suite and fix any issues that
come up. Then keep going with the test suite until all issues are
resolved."**

This authorizes continuing to fix whatever blocks the Training UI suite
*itself* from running cleanly (suite-infrastructure bugs, like
`TRAINING-SUITE-004`'s flake) and iterating until the suite runs clean.

**It does not override** `CLAUDE.md`'s standing "always wait for the
explicit go-ahead" rule for genuine product/application bugs the code audit
finds. Two known-bug regression tests (`TRAINING-SUITE-003`,
`TRAINING-SUITE-015`) and two newly-surfaced findings (below) are
deliberately left unfixed — they need a fresh, explicit go-ahead from
Brendan per `docs/testing/MODULE-UI-TESTING-STANDARD.md` steps 8–9. Keep
these two categories separate; don't let the broad "keep going" instruction
above bleed into fixing a product bug without that separate go-ahead.

## What's already done

- A full line-by-line code audit of the Training module in
  `operations-v4.js` is complete: evidence functions, matrix cell
  functions, record save/delete, course/contractor/person CRUD, role
  gating (`hasAny()`/`canUseTraining()`, `operations-v4.js:192`/`:223` —
  confirmed Admins already get Training access through `hasAny()`'s
  `isAdmin()` check, this is *not* a bug), and the Height Equipment →
  Training sync trigger (`sync_height_qualification()`, confirmed correct
  via Supabase `execute_sql`/`pg_get_functiondef` — it inserts a
  placeholder 'In progress' record before setting final status, correctly
  avoiding the evidence-required trigger race described below).
- `TRAINING-SUITE-004`'s root cause is found and fixed locally (not yet on
  `main` — see Step 1). Root cause: `loadRoles()` unconditionally blanked
  `state.roles`/`state.profile` on *every* call, including a redundant
  `onAuthStateChange` event fired for the same already-signed-in user. This
  page runs two independent Supabase client instances — this module's own
  (`state.sb`) and the legacy `app.js` one (`sb`) — that both read and
  write the same auth storage key, which Supabase itself warns is
  "undefined behavior" when done concurrently (confirmed present via a
  "Multiple GoTrueClient instances detected" console warning on every test
  in the suite). A storage write from one client can trigger a redundant
  auth event on the other for the same session. That redundant event used
  to leave a real window — the time it takes `loadRoles()`'s own queries to
  come back — where every `canUseX()`/`isAdmin()` check read as "no
  access", so any `render()` landing in that window showed "Training access
  required" instead of the real Settings panel. This is the best-evidenced
  explanation for `TRAINING-SUITE-004` hanging the full 60s on
  `details.evaluate()`: CI network-timing diagnostics for the failing run
  showed all 7 `loadTrainingData()` requests completing in ~2.7s with zero
  console/page/REST errors, yet the test still hung — and a mysterious
  *second* full sign-in cycle appeared ~58s into that same single test
  attempt, exactly consistent with the dual-client redundant-auth-event
  theory.

## Step 1 — land the fix

The fix is committed locally as branch `fix/training-dual-auth-client-race`
(commit `3124ff1`, one commit ahead of `main` @ `b94262c`) in the session
that diagnosed it, but was never pushed — that session had no GitHub write
access at all, confirmed repeatedly (`git push`, `gh api`, and the now
explicitly-blocked browser-editor route all failed). That local branch will
not exist in your checkout; reconstruct it from the diff in **Appendix A**
below.

1. Verify GitHub write access per Step 0.1 by actually doing this push —
   it's the real test.
2. From current `main`, create branch `fix/training-dual-auth-client-race`
   and apply the diff in Appendix A to `operations-v4.js` (same file, same
   two functions: `refreshAuthAndData()` and `loadRoles()`). Use the exact
   commit message in Appendix A so the history reads the same either way.
3. Push the branch, open a PR, wait for this repo's existing CI checks (JS
   syntax check, local regression suite — check `.github/workflows/` for
   the exact job names) to pass, then merge.
4. This change touches only `operations-v4.js`'s `loadRoles()` and
   `refreshAuthAndData()` — no schema, no config, no secrets, nothing else.

## Step 2 — re-run the full Training UI suite and confirm TRAINING-SUITE-004 passes

Workflow: **"Staging Training module — full UI regression suite"**
(`.github/workflows/staging-training-full-ui-suite.yml`), `workflow_dispatch`
only, requires the exact confirmation string
`RUN STAGING TRAINING FULL UI SUITE`. It downloads the latest isolated
`spray-wash-staging-app` artifact (built automatically by
`build-staging-app.yml` on every push to `main` — confirm a staging build
has actually run against the merge commit before dispatching, so you're
testing the fix and not a stale bundle) and serves it locally on the
runner.

Expected result: `TRAINING-SUITE-004` now passes. `TRAINING-SUITE-003` and
`TRAINING-SUITE-015` are **still expected to fail** — they're known-bug
regression tests, not yet authorized to fix (see below). The other 16 tests
should already be passing.

Dispatch it yourself — per `MODULE-UI-TESTING-STANDARD.md` step 7, Claude
is the one who dispatches and types the confirmation phrase, never
Brendan. Now that repo write access is confirmed, try the direct API route
first, since it's cheaper than browser automation and may not have been
available before this access was fixed:

```
gh api repos/Sprayandwash/spray-and-wash-operations-app/actions/workflows/staging-training-full-ui-suite.yml/dispatches \
  -f ref=main -f "inputs[confirmation]=RUN STAGING TRAINING FULL UI SUITE"
```

Fall back to browser automation against the Actions UI only if that call is
rejected — see `ACCESS-AND-RECOVERY-HANDOVER.md` → "Browser control" →
"Workflow-dispatch recovery" for the exact fallback procedure already
written down there. Watch the run through to completion rather than firing
it and walking away.

## Step 3 — continue the fix-and-rerun loop

Per the standing instruction quoted above: keep iterating (fix whatever the
suite surfaces about its own execution, re-run, repeat) until the suite
runs cleanly end-to-end, with `TRAINING-SUITE-003`/`-015` as the only
expected failures.

## Step 4 — remove temporary diagnostic instrumentation

Once `TRAINING-SUITE-004` is confirmed fixed via a clean CI run, remove the
temporary diagnostic logging added to `tests/e2e/support/ui-suite-helpers.cjs`
while chasing this bug: live console/`pageerror`/REST-error capture, and
the `TRAINING REQUEST`/`FINISHED`/`FAILED` network-timing listeners (added
in commits `c185ab8` "Add live console/pageerror/REST-error capture to
Training suite sign-in" and `b94262c` "Log per-request timing for Training
table fetches in the suite's sign-in" — both already on `main`). This is
test-only cleanup, not a product change, and doesn't need a separate
go-ahead.

## Findings that still need Brendan's explicit go-ahead before fixing

**Do not fix these without a fresh go-ahead.** They're genuine product
findings from the code audit, not suite-infrastructure bugs, so they fall
under `CLAUDE.md`'s "always wait for the explicit go-ahead" rule, separate
from the standing authorization above.

1. **Register mislabels a Failed record as Compliant** —
   `operations-v4.js:1237`, in `trainingRegisterBuildData()`:
   `compliant: status.pillClass !== 'ops-bad'`. A "Failed" record's pill
   class is `ops-warn`, not `ops-bad`, so it reads as Compliant on both the
   on-screen and printable Register. This is a second consequence of the
   same root cause as `TRAINING-SUITE-015` (a Failed record is
   coloured/signalled the same as "In progress").
2. **New training-record form defaults to "Completed" with no evidence
   possible yet** — `operations-v4.js:1467`, `trainingRecordFormHtml()`:
   the Status `<select>` defaults to "Completed" for a brand-new record.
   Combined with the DB trigger
   `training_records_require_evidence_on_insert` (raises an exception if a
   record is inserted as `status='Completed'` with no linked
   `operations_training_record_files` row), saving a newly-added record at
   its default status always throws. This is handled gracefully today —
   `saveTrainingRecord()`'s `if(r.error) return alert('Could not save the
   training record: '+r.error.message);` — so it's not a crash, but it's
   confusing UX with no clear next step for the user. A fix would default
   new records to a non-"Completed" status (e.g. "In progress", matching
   the pattern the `sync_height_qualification()` DB function already uses
   correctly).

Present both of these together with `TRAINING-SUITE-003`/`-015` as one
combined report, per `MODULE-UI-TESTING-STANDARD.md` step 8, once the suite
is running cleanly — and wait for Brendan's one explicit go-ahead before
fixing any of the four.

## After the go-ahead (once given)

Fix the whole batch (`TRAINING-SUITE-003`, `TRAINING-SUITE-015`, and the
two findings above), re-run the suite and confirm all 19 tests now pass —
don't just assume the fixes worked. Then update
`docs/testing/CURRENT-STATE.md` and `docs/testing/REGRESSION-CATALOGUE.md`
(and the master `docs/regression-catalogue.md` it indexes, per the note at
the top of `REGRESSION-CATALOGUE.md`) to record the Training module's
verified state, the same way Height Equipment, Vehicle Checks, Maintenance
and Admin are already recorded there. Finally, compile the combined
code-audit-plus-suite-run report and present it to Brendan.

## Appendix A — the TRAINING-SUITE-004 fix, full diff

Commit message to reuse:

```
Fix transient Training access-required flash from duplicate auth refresh

loadRoles() blanked state.roles/state.profile unconditionally on every
call, including a redundant auth event for the SAME already-signed-in
user. This page runs two independent Supabase client instances (this
module's own client and the legacy app.js client) that both read and
write the same auth storage key -- something Supabase itself warns is
undefined behavior when done concurrently -- and a storage write from
one can trigger a redundant onAuthStateChange event on the other for
the same session.

That redundant event used to leave a real window, the time it takes
loadRoles()'s own queries to come back, where every canUseX()/isAdmin()
check (all gated on state.roles) read as "no access". Any render()
that landed inside that window showed a "<module> access required"
message instead of the real view -- this is the most likely explanation
for TRAINING-SUITE-004 hanging on the Training Settings panel after its
own data had already loaded successfully (confirmed via CI network
timing diagnostics: all 7 loadTrainingData() requests completed in
~2.7s, with no console, page, or REST errors at any point).

Now loadRoles() only clears the previous roles/profile when the signed-
in user has actually changed, matching the existing resetNavigation
signal computed in onAuthStateChange. A genuine user change still
clears immediately as before.
```

Diff (against `main` @ `b94262c`):

```diff
diff --git a/operations-v4.js b/operations-v4.js
index 1a810f3..2a5d00b 100644
--- a/operations-v4.js
+++ b/operations-v4.js
@@ -2059,7 +2059,7 @@
     if(!state.sb || revision!==state.authRevision) return;
     state.lastError = '';
     if(!state.user){ state.roles = []; render(); return; }
-    await loadRoles(revision);
+    await loadRoles(revision, resetNavigation);
     if(revision!==state.authRevision) return;
     // Account gates must take precedence over the module landing screen.  A
     // first-password user otherwise remains on Home and the required form is
@@ -2096,11 +2096,29 @@
     }catch(err){ console.warn('Preloaded user setup skipped:', err.message); }
   }
 
-  async function loadRoles(revision=state.authRevision){
+  async function loadRoles(revision=state.authRevision, isNewUser=false){
     const userId=state.user?.id;
     if(!userId || revision!==state.authRevision) return;
-    state.roles = [];
-    state.profile = null;
+    // Only blank out the previous roles/profile when this is genuinely a
+    // different signed-in user. onAuthStateChange can fire more than once
+    // for the SAME user and session — e.g. this page runs two independent
+    // Supabase client instances (this module's own client and the legacy
+    // app.js client, both reading/writing the same auth storage key, which
+    // Supabase itself warns is "undefined behavior" when done concurrently)
+    // and a storage write from one can trigger a redundant auth event on
+    // the other. Clearing state.roles here unconditionally used to leave a
+    // real window — the time it takes this function's own queries to come
+    // back — where every canUseX() check (all gated on state.roles) read as
+    // "no access", so any render() that landed in that window (for example
+    // the one that reveals the Training module's Settings tab once its own
+    // data finishes loading) showed a "<module> access required" message
+    // instead of the real content. Keeping the still-correct roles/profile
+    // in place for a same-user refresh removes that flash entirely; a
+    // genuine user change still clears them immediately, exactly as before.
+    if(isNewUser){
+      state.roles = [];
+      state.profile = null;
+    }
     await claimPreloadedUserSetup();
     if(revision!==state.authRevision) return;
     const r = await state.sb.from('user_roles').select('role').eq('user_id', userId).order('role');
```

All other call sites of `loadRoles()` already default `isNewUser` to
`false` and were checked for correctness: the deferred retry inside
`claimPreloadedUserSetup()`'s `window.loadRoles()`, a same-user-guarded call
(`if(String(userId) === String(state.user?.id)) await loadRoles();`), and
`saveFirstPassword()`'s post-password-change call. None needed a change.

A ready-to-apply patch file equivalent to this diff was also delivered to
Brendan directly in the previous chat, in case this document and that file
end up out of sync for any reason — prefer this document, since it's the
one that stays with the repo.

## Appendix B — read all of this before doing anything (the full context)

In this order:

1. `CLAUDE.md`
2. `docs/testing/MODULE-UI-TESTING-STANDARD.md`
3. `docs/testing/ACCESS-AND-RECOVERY-HANDOVER.md`
4. `docs/testing/RECOVERY-GUIDE.md`
5. `docs/testing/CURRENT-STATE.md`
6. `docs/testing/REGRESSION-CATALOGUE.md` and the master
   `docs/regression-catalogue.md` it indexes
7. `docs/testing/RUN-LEDGER.md`
8. This file, in full, again, once you've read 1–7 — some of what's above
   will make more sense the second time.

Then the Training module's own source and tests, minutely rather than
skimmed:

- The Training sections of `operations-v4.js` (role gating, course
  catalog, contractors, people, the training matrix, records and evidence,
  the Register, and the two code paths cited above)
- `tests/e2e/staging/training-full-ui-suite.spec.cjs`
- `tests/e2e/support/ui-suite-helpers.cjs`
- `.github/workflows/staging-training-full-ui-suite.yml`
- `.github/workflows/build-staging-app.yml`
- `playwright.staging.training.full-suite.config.cjs` and the
  `test:staging:training-full-suite` script in `package.json`

Do not propose or start any work until this reading is done and Step 0's
connection checks have all passed.
