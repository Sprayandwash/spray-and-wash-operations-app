# Staging browser testing

The automated browser tests are split deliberately:

- `npm run test:ui` is the safe local browser suite. It never signs in or writes data.
- `npm run test:staging:preflight` is a staging-only read-only access check. It verifies the staging banner and a dedicated staging test-account sign-in. It does not create, change, or remove app records.
- **Create staging Vehicle Checks review records** is a separately confirmed review run. It creates two temporary records beginning with `E2E REVIEW —` and leaves them in place until the Operations manager has refreshed their already-open staging tab and confirmed the result.
- **Create staging Maintenance review record** is a separately confirmed review run. It creates one labelled maintenance log record and one linked task in staging only, and leaves them in place for review.

## One-time GitHub setup

Create a dedicated account in the **Spray and Wash Staging** app. Do not use a personal or production account. Give it only the roles required by the staged test journeys.

In the repository's `staging` GitHub Environment, add these secrets:

| Secret | Value |
| --- | --- |
| `E2E_STAGING_TEST_EMAIL` | The dedicated staging test-account email. |
| `E2E_STAGING_TEST_PASSWORD` | Its password. |
| `E2E_STAGING_ADMIN_EMAIL` | A separate, dedicated Staging-only account with the **Admin** role. |
| `E2E_STAGING_ADMIN_PASSWORD` | That dedicated Admin account's password. |
| `E2E_STAGING_HEIGHT_READONLY_EMAIL` | A separate staging account with **only** the `Height equipment user` role. |
| `E2E_STAGING_HEIGHT_READONLY_PASSWORD` | That account's password. |
| `E2E_REG049_CLAIM_EMAIL` | A real, monitored Staging-only mailbox for the controlled pre-loaded-account claim test. It must be distinct from the normal test account. |
| `E2E_REG049_SELF_SIGNUP_EMAIL` | A second real, monitored Staging-only mailbox for the controlled self-sign-up part of REG-049. It must be distinct from both other addresses. |

The preflight retrieves the staging project ref and temporary browser URL itself from the latest `spray-wash-staging-app` artifact. Do not add a local `127.0.0.1` URL as a GitHub secret: that address only exists on your own computer.

## Automatic build and access preflight

When an approved change is merged to the repository's `main` branch, GitHub automatically runs **Build staging app**. A successful build automatically starts **Staging browser review preflight**. The preflight uses the newly built isolated staging bundle and verifies that the test harness can safely serve it and sign in.

Both runs are read-only with respect to the staging database: the build creates an artifact only, and the preflight creates, changes, and removes no app records. A missing secret, absent bundle, production ref/configuration, or absent staging banner stops the process.

The two workflows can still be started manually from **Actions** when a recheck is needed without merging another change. Manual builds require the existing exact confirmation `BUILD STAGING APP`.

## Controlled pre-loaded-account claim review (REG-049)

**Verify staging pre-loaded account claims** is an explicitly confirmed, write-capable Staging test. It creates and removes two temporary Auth identities so it can check that a claimed pre-load receives only its assigned roles, a role edit made through the real **Admin → Current Users** screen persists after a later sign-in, and a self-sign-up receives no roles.

The workflow uses a dedicated `E2E_STAGING_ADMIN_EMAIL` account for the **Admin → Current Users** edit. It must be separate from the normal test account and both temporary REG-049 mailboxes. The workflow stops before it creates temporary identities if any required secret is missing; it stops without editing a role if the dedicated Admin account cannot open the Admin screen. The test never edits that Admin account's own roles.

Because Staging email confirmation sends an Auth email before the test confirms the account through its controlled database step, this workflow uses the two real monitored mailbox secrets above. It must never generate email addresses. If either secret is absent, duplicated, or the normal test account, the workflow stops before it creates an account or sends an email.

## Height read-only security verification

**Verify staging Height read-only security** is a separate manually confirmed staging test. It requires the exact confirmation `VERIFY STAGING HEIGHT READONLY SECURITY` and signs in with the dedicated **Height equipment user-only** account—not the manager-level staging test account.

It attempts two fully-labelled direct writes through the authenticated Supabase client: one new Height Equipment record and one tiny equipment-photo upload. Both requests must be rejected by Row Level Security (RLS), and the test then confirms that neither record nor file exists. It does not modify production.

If either request is accepted, the run fails and retains clear `E2E SECURITY — HEIGHT READONLY —` evidence in isolated staging for investigation; it does not silently clean up a security failure.

## Review workflow contract

Every future staging review test must:

1. Use only the dedicated staging test-account secrets above, discover the project ref and temporary browser URL from the staging artifact, and refuse production configuration.
2. Prefix temporary labels with `E2E REVIEW —`.
3. State the records it creates, the pages to refresh and inspect, and the expected result in the GitHub Actions summary.
4. Never silently delete review records; cleanup is a separate, explicitly triggered action after review.

## Vehicle Checks browser review journey

Use **Actions → Create staging Vehicle Checks review records** only when fresh visible review evidence is wanted. It requires the exact confirmation `CREATE STAGING REVIEW RECORDS` and runs only against the isolated staging bundle.

It deliberately retains two labelled records so they can be inspected after refreshing the staging browser tab:

- one completed vehicle check, verified to create **zero** tasks;
- one check with a single reported issue, verified to create **exactly one** task.

This write journey runs on one desktop browser only. Mobile coverage will be added separately without duplicating staging review records.

## Maintenance browser review journey

Use **Actions → Create staging Maintenance review record** only when fresh visible Maintenance evidence is wanted. It requires the exact confirmation `CREATE STAGING MAINTENANCE REVIEW RECORD` and runs only against the isolated staging bundle.

It first creates an active vehicle with registration `E2E-MAINT-TEST` if that target does not already exist. The workflow creates **no schedules, machinery, sub-assets, or future maintenance attention** for that vehicle.

It then retains one labelled `E2E REVIEW —` **Other maintenance** record on the vehicle itself, with parts, notes, and a further-maintenance requirement. The test verifies that the record has exactly one linked open task whose description is exactly the follow-up requirement. Review it in **Maintenance → Log** and **Maintenance → Tasks** after opening the current staging bundle and refreshing the page.

## Local UI testing handoff (Step 8-9A)

**Read this whole section before giving any local-preview command.** The one-liner below is the only one to give — verbatim, on its own, never combined with an extraction/`cd` step or otherwise modified. This was re-confirmed with Brendan on 1 Oct 2026 after a combined extract+serve command was given by mistake; see the note at the end of this section.

Whenever the project reaches a Step 8-9A Staging browser review phase (a green Staging build ready to be checked in a browser), always hand the requester both of the following, without waiting to be asked again:

1. **The current `spray-wash-staging-app` artifact, delivered directly as a file in the conversation** - do not just give a link to the workflow run's Artifacts section and leave it there. Confirmed directly by Brendan on 1 Oct 2026 ("Just give me the zip here, like we have been doing") after a link-only handoff was given once by mistake - he wants the zip itself, every time, not an extra click through GitHub. If the GitHub Actions artifact download cannot be fetched directly in a given session (for example, no working route to pull the artifact bytes into the workspace), rebuild the staging bundle locally instead of giving a bare link: check out the current `main`, follow `build-staging-app.yml` step-by-step (rsync/tar-copy excluding `.git/`, `.github/`, `supabase/`, `*.zip`; generate `config.js` from the staging Supabase project's URL and publishable key - `mcp__Supabase__list_projects` / `get_publishable_keys` for project "Spray and Wash Staging"; apply the same NZ-time patches to `app.js` and `operations-v4.js`; patch `index.html`/`manifest.webmanifest`/`service-worker.js`; run the same safety greps; write `STAGING-README.txt` and `SHA256SUMS.txt`), zip it as `spray-wash-staging-app-round<N>-<month><year>.zip` (matching the existing sequence already in the requester's `Claude outputs` folder), and deliver that zip directly. Only fall back to a bare Artifacts-section link if the requester explicitly asks for just the link.
2. **One simple PowerShell one-liner**, run from inside the extracted app folder, that starts the server, opens the browser automatically, and copies the URL to the clipboard as a fallback:

   ```powershell
   "http://127.0.0.1:4174" | Set-Clipboard; npx.cmd --yes http-server . -p 4174 -c-1 -o
   ```

   Keep this simple - Brendan has explicitly asked for a single short line here, not a multi-line search/extract script. Tell the requester to `cd` into the folder holding the extracted app (the one with `index.html`/`STAGING-README.txt` in it) before running it. The `-o` flag opens the default browser once the server is actually ready, avoiding a premature "unable to connect" from opening before `npx` finishes its first-run download of `http-server`. Before testing, confirm `STAGING-README.txt` in that folder references only the Staging Supabase project and never the production ref - the same safety check `staging-training-review.yml` performs in CI.

   **Two Windows prerequisites confirmed on Brendan's machine (13 Sep 2026), verified working:**
   - **Node.js must be installed.** If `node -v` / `npx -v` come back as "not recognized", Node.js isn't installed (or PATH hasn't refreshed) - install the LTS build from https://nodejs.org, then fully close and reopen every PowerShell window before retrying.
   - **Use `npx.cmd`, not plain `npx`, in PowerShell.** Plain `npx` resolves to `npx.ps1`, which PowerShell's default execution policy blocks with a `PSSecurityException` ("running scripts is disabled on this system") even once Node.js is installed. Calling `npx.cmd` explicitly sidesteps that without changing any execution-policy/security settings. Always give the `npx.cmd` form above, never plain `npx`.

This handoff is a standing requirement for every Step 8-9A phase, not a one-off request. The command given must stay this simple one-liner using `npx.cmd` - do not expand it back into a multi-line self-locating search script, and do not revert to plain `npx`.

**Do not prepend `Expand-Archive`, `cd`, or any other setup to this line.** Extracting the zip and navigating into the extracted folder are separate steps Brendan does himself before running the server one-liner - they are not part of it. On 1 Oct 2026 a combined "extract + cd + serve" command was given instead of the plain one-liner above, which was wrong and had to be corrected. Give exactly the one-liner in the code block above, nothing more, every time - see `CLAUDE.md` at the repo root for the same instruction.
