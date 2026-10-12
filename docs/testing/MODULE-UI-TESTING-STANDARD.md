# Standard module UI-testing program

This is the repeatable process for testing a module's UI — run the same way
every time a module is created or substantially changed. It was designed
and first carried out for the Training & Qualifications module (October
2026); see that module's own files for the worked example referenced
throughout.

**Before starting any new round of this program, read this file first** —
that is the whole point of writing it down. Do not re-derive the process
from scratch or invent a different shape for the next module.

## The two kinds of finding this program produces, and the one rule that governs both

1. A **code audit** — mistakes, conflicts, missing parts, unused code, and
   other tidy-ups found by reading the module's source directly.
2. A **Playwright UI suite** — a real, usability-level exercise of every
   function the module offers, with the expected result asserted after
   each action.

Both are **report-only** until Brendan gives one explicit go-ahead. Per
`CLAUDE.md` → "Feedback/bug-report sessions — always wait for the explicit
go-ahead", nothing found by either phase is fixed, committed, or pushed —
not even a one-line fix — until that go-ahead is given for the batch as a
whole. Log everything, present it together, then fix it together.

## Step-by-step process

### 1. Check for an existing program first

Before writing anything, read this file (you're doing that now) and check
`docs/testing/CURRENT-STATE.md` and the module-status table in
`REGRESSION-CATALOGUE.md` for whether this module already has a prior
round of testing, so a new round builds on it rather than duplicating or
contradicting it.

### 2. Code audit (report only)

Read the module's source end-to-end (in this codebase, that is the
relevant sections of `operations-v4.js`, plus `app.js` for anything shared)
looking for: logic mistakes, conflicting behaviour between two code paths
that should agree, missing handling (error cases, permission checks,
empty states), dead/unused code, and anything that's safe to tidy without
changing behaviour. Delegating this read to a subagent works well for a
module this size — it comes back faster and still cites exact file:line
locations.

Every finding needs: a file:line citation, a one-sentence description of
the mistake, and a concrete failure scenario (what a user does, what goes
wrong). Do not fix anything yet — see the rule above.

### 3. Confirm access before building anything

Check whether a dedicated staging test account already exists for this
module's primary write role, and whether a suitable **known-negative**
account already exists (an account that definitely lacks the module's
role, for permission/role-gate tests). In this repo those are GitHub
Environment secrets named `E2E_STAGING_<ROLE>_EMAIL` /
`E2E_STAGING_<ROLE>_PASSWORD` — see
`docs/testing/ACCESS-AND-RECOVERY-HANDOVER.md` for the current table and
`tests/e2e/support/staging-*-config.cjs` for the loaders. Read the
module's permission-gating function directly (e.g. `canUseTraining()`) to
confirm which existing account(s) already qualify before assuming a new
secret is needed. If a genuinely new secret pair is needed, say so to
Brendan **before** writing any test that depends on it — never build
against a secret that doesn't exist yet and hope it gets added later.

### 4. Reuse the shared helper library

`tests/e2e/support/ui-suite-helpers.cjs` is shared across every module's
full-UI-suite spec — a new module's suite imports from it rather than
re-inventing sign-in, dialog handling, or fixture naming:

- `buildFixtureTag(moduleTag)` — a short, collision-resistant,
  visually distinctive tag (`E2E-UI-SUITE-<MODULE>-<nonce>`) for this run's
  throwaway fixtures. Deliberately distinct from the `E2E REVIEW —` prefix
  used by the older, human-reviewed browse-only staging specs: those
  records are meant to be left behind for a person to look at; everything
  tagged by this helper is deleted by the same run that created it.
- `signIn(page, {email, password})` — signs in through the real form (never
  a seeded session token) with the same diagnostic dialog/response logging
  used elsewhere in this repo's staging specs.
- `acceptDialogsAndCapture(page)` — auto-accepts native `confirm()`/`alert()`
  dialogs from that point on and returns the array they're logged to.
- `withPopup(page, triggerLocator)` — wraps a click that opens a
  `window.open(...)` popup (used by this app's printable-register pattern)
  and waits for it to load.
- `safeCleanup(label, fn)` — wraps one teardown step so a single failed
  deletion never stops the rest of a suite's cleanup from running.

If a new module's suite needs a genuinely new shared behaviour, add it here
rather than duplicating it inside that module's own spec file.

### 5. Write the suite: every function, through the real UI, with the expected result asserted

The suite must be a genuine usability test, not a smoke test — every click,
fill, select and submit goes through the real rendered UI (never a direct
database write for the action under test), and every test asserts the
specific result the UI should show afterwards, not just "no error was
thrown."

**Self-contained fixtures — the binding policy for this program:** every
person/record/entity a suite creates is tagged via `buildFixtureTag` and
deleted again in that same spec file's own `test.afterAll`, through the
real signed-in UI. Nothing is ever left behind for a human to review. If a
run is interrupted before its own cleanup finishes, anything still in
Staging carrying that run's tag is always identifiable and safe to remove
by hand — never silently left in an ambiguous state.

**Archive vs. hard-delete — read this before assuming "delete" means hard
delete:** check what the module's own UI actually offers before writing
cleanup. Several modules in this app (Training's contractors, people, and
course catalog among them) have **no hard-delete** in their UI at all —
only Archive/Deactivate. Cleanup must match what the real UI supports:
hard-delete whatever the UI genuinely offers a destructive action for
(e.g. Training's record delete and evidence-file removal), and archive
whatever it doesn't. Don't invent a workaround (like a direct database
delete) just to satisfy "delete every run" — that would stop the suite
from being a true UI test and would contradict the "never through a direct
database write" rule above. Note the exact constraint inline in the spec
file so a future reader doesn't mistake it for a bug in the suite itself.

**Known-bug regression tests:** when the code audit (step 2) finds a real,
reproducible bug, encode it directly into the suite as a test that is
*expected to fail* until the bug is fixed, with an inline comment
explaining the known root cause and citing the exact file:line. This
means the suite itself becomes live, reproducible documentation of the
bug — strengthening the combined report in step 8 — rather than the bug
existing only as a prose description. Mark these tests clearly in their
title, e.g. `TRAINING-SUITE-015 [known-bug regression]: ...`.

**Negative/permission cases:** always include at least one test signed in
as the known-negative account confirming the module is fully gated (no
card/button offering the module at all, not just a blocked action inside
it).

**Serial execution:** run the suite's tests in `test.describe.configure({
mode: 'serial' })` when later tests build on fixtures created by earlier
ones (e.g. "add a person" → "add a record for that person" → "upload
evidence for that record"). Track fixture IDs in a single shared object
populated as the suite progresses.

### 6. Config, npm script, and the write-capable workflow

Each module's full-UI-suite gets its own Playwright config
(`playwright.staging.<module>.full-suite.config.cjs`, modelled on the
module's existing browse-only config), its own npm script
(`test:staging:<module>-full-suite` in `package.json`), and its own GitHub
Actions workflow (`.github/workflows/staging-<module>-full-ui-suite.yml`).

The workflow follows the established write-capable pattern in this repo
(modelled on `staging-preloaded-user-claim-review.yml`): `workflow_dispatch`
with a required `confirmation` string input matched by an exact `test
"..." = '...'` check, secrets injected as env vars, a `concurrency` group so
two runs can never write at once, checkout → setup-node → `npm ci` →
`npx playwright install --with-deps chromium` → download and
production-ref-safety-check the latest `spray-wash-staging-app` artifact →
serve it with `http-server` → run the suite → publish a `GITHUB_STEP_SUMMARY`
→ upload Playwright failure evidence (`playwright-report/`, `test-results/`,
the server log) on failure. A full-UI-suite workflow does **not** need the
SQL-based cleanup-on-interrupt job that the pre-loaded-account workflow
has — cleanup here happens entirely through the UI in the spec's own
`afterAll`, which is what step 5's self-contained policy is for.

### 7. Ship it without making Brendan a bottleneck

Commit the new files to a branch, push, open a PR, and wait for this
repo's existing CI checks (JS syntax check, local regression suite) to
pass, then merge. **Claude is the one who dispatches the new workflow and
types its confirmation phrase**, via browser automation against the
Actions UI — Brendan should never need to download an artifact or manually
enter anything to get a new module's suite running for the first time.
Watch the run through to completion rather than firing it and walking
away.

### 8. One combined report, then wait

Once the suite has actually run against real Staging, compile **one**
report that merges the code-audit findings (step 2) with what the suite
run reported (expect at minimum that every known-bug regression test from
step 5 failed, confirming the bug is live). Present it to Brendan and
explicitly do not fix anything — wait for his one go-ahead to fix the
whole batch, per the rule at the top of this file.

### 9. After the go-ahead: fix, then re-verify, then update the record

Once Brendan gives the go-ahead: fix the batch, then re-run the suite and
confirm every known-bug regression test now passes (don't just assume the
fix worked — the suite exists precisely so this is a real check, not a
guess). Update this module's row in `REGRESSION-CATALOGUE.md` /
`docs/testing/CURRENT-STATE.md` to reflect the module's new state, the same
way existing modules (Height Equipment, Vehicle Checks, Maintenance,
Admin) are recorded there.

## Where everything lives (quick reference)

| What | Path pattern |
| --- | --- |
| Shared helpers (every module imports from here) | `tests/e2e/support/ui-suite-helpers.cjs` |
| Module's write-capable account loader | `tests/e2e/support/staging-<module>-config.cjs` |
| The full UI suite itself | `tests/e2e/staging/<module>-full-ui-suite.spec.cjs` |
| Its Playwright config | `playwright.staging.<module>.full-suite.config.cjs` |
| Its npm script | `test:staging:<module>-full-suite` in `package.json` |
| Its GitHub Actions workflow | `.github/workflows/staging-<module>-full-ui-suite.yml` |
| This process document | `docs/testing/MODULE-UI-TESTING-STANDARD.md` (this file) |

## Worked example: Training & Qualifications (first module built to this standard)

- Suite: `tests/e2e/staging/training-full-ui-suite.spec.cjs` — 19 tests
  (`TRAINING-SUITE-001` through `-019`) covering: role gating (positive and
  negative), Course Catalog create/edit/archive, Contractors
  create/edit/deactivate/reactivate, People add/rename, the Training
  Matrix's three-state switch cycle and its colours, a person's course
  section status pills, adding a training record (incl. auto-computed
  expiry) and editing one, evidence file upload/removal, the on-screen
  Register and its status filter, and the printable Register popup.
- Two known-bug regression tests: `TRAINING-SUITE-003` ("My Training" has
  no server-side row filter — the browser receives every person's training
  rows) and `TRAINING-SUITE-015` (a "Failed" record is coloured/signalled
  the same as "In progress", so it never trips the contractor-level Fail
  signal).
- Access used: the existing `E2E_STAGING_TRAINING_EMAIL/PASSWORD` account
  (Training manager role) for every write action, and the existing
  `E2E_STAGING_HEIGHT_READONLY_EMAIL/PASSWORD` account (role: only "Height
  equipment user") as the known-negative account for the role-gate test —
  no new secret was needed for this module.
- Archive-vs-delete: contractors, people and courses are archived in
  cleanup (the UI's only "delete" for those three); the training record
  and its evidence file are hard-deleted (the UI does support deleting
  those outright).
