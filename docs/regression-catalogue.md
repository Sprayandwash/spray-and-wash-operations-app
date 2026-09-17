# Spray & Wash regression catalogue

This is the single source of truth for confirmed bugs found during Spray & Wash development and staging testing. It consolidates the five historical-chat extracts and the current Operations regression suite.

IDs are permanent. A fixed bug remains here so that it cannot silently return. `Automated` means a deterministic CI test is practical; it does **not** mean every listed test has already been implemented.

## Current automated suite

The first eight Operations regressions are implemented in `tests/regression/operations-rules.test.cjs` and run in the **Regression tests** GitHub Actions workflow.

## Browser smoke suite

The first Playwright browser checks live in `tests/e2e/` and run in the **Browser smoke tests** GitHub Actions job. They use a local static server and do not sign in, write to Supabase, or use production data.

| ID | Check | Status |
| --- | --- | --- |
| REG-UI-001 | A visitor can load the application and see the sign-in form. | Automated in Chromium |
| REG-UI-002 | The PWA manifest and the approved 192px/512px app icons load. | Automated in Chromium |
| REG-UI-003 | A Height Equipment Manager can browse the register, filters, item detail, inspection history and certificate view without making a write. | Automated in desktop and mobile Chromium; requires the single controlled `E2E-HEIGHT-TEST` staging fixture |

Run locally after installing the test dependencies and Chromium:

```bash
npm ci
npx playwright install chromium
npm run test:ui
```

On failure, Playwright keeps an HTML report, screenshot, video, and execution trace locally; GitHub Actions uploads these as a 14-day PR artifact.

| ID | Confirmed regression | Expected behaviour | Coverage target | Current state |
| --- | --- | --- | --- | --- |
| REG-001 | A passed periodic vehicle check could create maintenance tasks. | A check containing only `Completed OK` / `N/A` creates no follow-up task. | Unit + staging integration | Automated |
| REG-002 | A vehicle check could create too many tasks. | Create one task for each reported issue and none for passed lines. | Unit + staging integration | Automated |
| REG-003 | Vehicle checks became Due soon for the entire 14-day interval. | Show Due soon only in the final seven days; overdue stays critical. | Unit + browser | Automated |
| REG-004 | Maintenance schedules were assigned to incompatible sub-assets. | A procedure category must match the machinery type. | Unit + database guard | Automated; migration verification pending |
| REG-005 | Historical invalid schedules inflated Home attention counts. | Invalid or misassigned schedules do not appear in Home attention. | Unit + staging data check | Automated; staging data check pending |
| REG-006 | Historic/test tasks polluted Open Tasks. | Completed and Deferred tasks are excluded from open-task counts and lists. | Unit | Automated |
| REG-007 | Vehicle-check alerts did not open a usable preselected form. | Selecting an alert opens Vehicle Checks with the correct vehicle selected. | Staging browser check | Manual staging check passed |
| REG-008 | Staging and production could be confused. | Staging has a persistent test-data banner and staging Supabase configuration. | Build workflow + browser | Automated; banner check passed |

## Consolidated backlog

### Application, identity, and navigation

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-009 | A syntax error in `operations-v4.js` stopped Operations from loading and masqueraded as a routing failure. | All active JavaScript parses; authenticated users can reach Home and return through the logo. | `node --check` for all runtime files + browser smoke test | Automated syntax; browser pending |
| REG-010 | Vehicle inspection identity could fall back to an email-derived name instead of the profile name. | Form and saved inspection use `profiles.display_name` when present. | Staging browser/database integration | Pending |
| REG-011 | Vehicle Checks and Operations/Maintenance could show duplicated content. | Vehicle Checks contains the periodic checklist; Maintenance contains assets/tasks/maintenance management. | Role-aware browser test | Pending |
| REG-012 | The Account popover did not close when clicking outside it. | Outside pointer interaction dismisses the menu without blocking the page. | Browser test | Pending |
| REG-013 | A visible app version could remain at an old release number. | Header/build metadata comes from the current release source of truth. | Static release test | Pending |

### Vehicle Checks

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-014 | Same-day inspections could display in non-deterministic order. | Order by inspection date, then creation time, then stable ID—newest first. | Database/browser integration | Pending |
| REG-015 | Vehicle-check dropdowns offered `No response` as a selectable answer. | Required fields start blank; blank is invalid; `No response` is never a selectable response. | Static checklist guard + browser test | Automated static guard; browser pending |

### Maintenance, schedules, tasks, and reports

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-016 | Valid maintenance types were rejected by the maintenance-log database constraint. | Every approved UI/RPC type persists successfully. | Static UI matrix + controlled staging integration | Automated static matrix; controlled staging covers `Other maintenance` and `Engine oil changed`; broader database matrix pending |
| REG-017 | Compatibility mapping changed valid maintenance types into generic/legacy values. | Stored `maintenance_done` exactly matches the selected legitimate type. | Static RPC guard + staging integration | Automated static guard; controlled staging covers `Other maintenance` and `Engine oil changed`; broader matrix pending |
| REG-018 | Generated follow-up task descriptions contained a verbose/duplicated maintenance prefix. | Task description is exactly the entered follow-up requirement. | Staging RPC integration | Automated; controlled staging review passed (24 Aug 2026) |
| REG-019 | A maintenance save depended on a browser-side task update that normal permissions rejected. | The security-definer RPC creates the final correct task without a client PATCH/UPDATE. | Staging permission integration | Automated; controlled staging review passed (24 Aug 2026) |
| REG-020 | A custom on-demand maintenance item could not be saved without a positive frequency. | Blank frequency means on-demand, with no date-driven alert or task. | Static browser guard + controlled database integration | Automated static guard; controlled database integration pending |
| REG-021 | Task status could save while steps/parts failed, and retrying could duplicate detail rows. | Task, steps, and parts save atomically and retries are idempotent. | Transaction/database test | Pending |
| REG-022 | A passing Height inspection could close unrelated or newer Height tasks. | Close only the qualifying earlier failure task; never manual or newer failures. | SQL trigger test | Pending |
| REG-023 | Due-soon maintenance attention navigated to overdue results. | Due-soon opens due-soon; overdue opens overdue. | Shared-rule + browser routing test | Automated shared-rule guard; staging browser routing check pending |
| REG-024 | Height overdue attention could show a blank due date. | Every dated alert displays its formatted due date. | Unit/browser test | Pending |
| REG-025 | Historic maintenance report records were misleadingly labelled after compatibility fixes. | CSV/PDF presentation normalises known legacy forms without changing source data. | Static CSV normalisation + PDF spot check | Automated static guard; manual browser/PDF check pending |
| REG-026 | Maintenance print/PDF output contained browser URL/date/page chrome. | Reports have only intended report content, clean margins, and readable pagination. | Static print CSS + manual browser/PDF check | Automated static guard; manual browser/PDF check pending |
| REG-058 | On mobile, adding a sub-asset (machinery) or vehicle lost all entered field values, and the machinery type reverted to Engine, if the tab was backgrounded (e.g. to take a photo) and reloaded, or the form was otherwise re-rendered before saving. | An in-progress Add vehicle / Add machinery form survives a backgrounded-tab reload; the machinery type and all typed fields are restored automatically. | Manual mobile device check (background the app mid-entry, return, confirm fields survive) | Automated: form drafts are captured to sessionStorage on every field change and restored when the blank add form re-renders (`captureFormDraft`/`applyFormDraft`, operations-v4.js) |
| REG-059 | Vehicle and machinery/sub-asset records had no way to attach a document (e.g. a maintenance manual PDF). | An existing vehicle or machinery record has a Files section to upload, view and remove documents. | Staging browser check (upload/view/remove a file on an existing asset) | Automated: `operations_asset_files` table + `asset-files` storage bucket added; upload/view/delete wired into the vehicle and machinery forms |
| REG-060 | Adding a photo to an asset record offered a single generic file picker, which does not reliably offer both camera and gallery on every device. | Every place a photo can be added to an asset offers explicit Camera and Gallery choices, matching the pattern already used for vehicle-inspection photos. | Manual mobile device check | Automated: vehicle and machinery asset-photo fields use twin Camera/Gallery buttons (`assetPhotoFieldHtml`) |
| REG-061 | A photo uploaded to a vehicle or machinery record could not be reopened afterward; the form only showed a static "Photo saved" badge with no link. | A saved asset photo has a "View photo" action that opens it via a signed URL. | Staging browser check | Automated: `openAssetPhoto` + a "View photo" button next to the saved-photo badge |
| REG-062 | There was no way to delete a vehicle or machinery/sub-asset record. | Admin/Maintenance manager users can delete an existing vehicle or machinery record from its edit form, behind a two-step confirmation (a warning dialog, then typing the asset's own identifier). | Staging browser check (attempt and complete a deletion, confirm history is preserved but unassigned) | Automated: `deleteVehicle`/`deleteWashing`, two-step confirmation matching the existing delete-user-account pattern |
| REG-063 | A new vehicle never received default maintenance schedules (only a new machinery/sub-asset did via `applyDefaultSchedulesForEquipment`), so a vehicle's maintenance never became due and no task was ever generated for it. | Creating a vehicle applies its default maintenance schedules automatically, the same as machinery/sub-assets already do. | Staging browser check (add a vehicle, confirm its schedules appear) | Automated: `applyDefaultSchedulesForVehicle` / `upsertSchedulesForVehicleIds`, called from `saveVehicle` on create |
| REG-064 | The "Create task" action on an upcoming/overdue maintenance item had no working handler: the button was never rendered, and the function it referenced (`createTaskFromSchedule`) did not exist anywhere in the app. | Every row in the Upcoming/Overdue maintenance list has a working "Create task" action (or shows "Task created" once one exists), for both machinery and vehicle schedules. | Staging browser check | Automated: `createTaskFromSchedule` implemented and wired to the existing button attribute; shares the `operations_sync_automatic_tasks_v4077` RPC's automatic_key format to avoid duplicate tasks |
| REG-065 | The server-side automatic task sync (`operations_sync_automatic_tasks_v4077`) only created a task once a schedule's due date was strictly in the past, so an item due today did not get its task until the following day. | A schedule due today is treated the same as overdue: its task is created automatically the same day. | Staging RPC check (`select operations_sync_automatic_tasks_v4077()` against a schedule due today) | Automated: RPC's maintenance-half condition widened from `< current_date` to `<= current_date` |

### Certificates, qualifications, and Height Equipment

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-027 | Certificate selectors, filters, or matching lists did not populate correctly. | Eligible in-service items appear for each filter combination, including default All types. | Seeded browser test | Pending |
| REG-028 | Individually selected certificate items were ignored. | Generation uses exactly the selected eligible IDs. | Browser/PDF integration | Pending |
| REG-029 | Certificate selection count and Generate state drifted out of sync. | Count equals selected eligible rows; buttons enable/disable correctly. | Browser test | Pending |
| REG-030 | Inspector selection for qualification details did not populate or retain a selection. | Saved inspector names load and selection drives the correct output. | Browser integration | Pending |
| REG-031 | Qualification uploads could be empty, corrupt, or unreadable. | Reject invalid files; verify non-zero readable stored objects before saving records. | Isolated staging Storage test | Pending |
| REG-032 | Qualification evidence was absent from generated Inspector/Qualification Details. | Verified image renders in output; PDF evidence has a valid view/download path. | Generated-document + manual visual test | Pending |
| REG-033 | Qualification panels were duplicated or legacy qualification content flashed first. | One Saved Inspectors and one Add Inspector area, rendered directly in final layout. | DOM mutation/browser test | Pending |
| REG-034 | Saved Inspectors had the wrong initial expanded/collapsed state. | Saved Inspectors and Add Inspector begin collapsed. | Browser test | Pending |
| REG-035 | Recent Inspection History ignored the selected 10/20/30/50 record limit. | The requested number of rows is loaded into a scrollable list. | Seeded browser test | Pending |
| REG-036 | Recent Inspection History changes caused whole-page twitching. | Only the history list updates; no module replacement, scroll jump, or layout shift. | DOM/layout-shift + manual visual test | Pending |
| REG-037 | Equipment had duplicate/missing filter controls, including a missing Inspection Result filter. | One filter panel with every canonical field; Clear Filters works. | Browser test | Automated read-only filter coverage; full control matrix pending |
| REG-038 | Equipment filtering transiently showed wrong records or re-rendered the tab. | Only the results list updates and unrelated records never become visible. | Delayed-response browser mutation test | Pending |
| REG-039 | Equipment filtering or item navigation reset page scroll. | Filter and record return preserve relevant scroll position and filter state. | Browser test | Automated read-only filter-state coverage; scroll preservation pending |
| REG-040 | Height dashboard could show duplicate or transiently different Start Inspection cards. | One canonical card from first paint through settled state. | DOM mutation/browser test | Pending |
| REG-041 | Certificate item rows were not consistently left aligned. | Rows use the canonical left-aligned list layout. | CSS/browser visual baseline | Pending |
| REG-042 | Certificate photo provenance and pagination were wrong. | Equipment photo remains distinct; only latest inspection photos appear in their intended output section. | Generated-document + manual visual test | Pending |
| REG-057 | The Height Equipment **+ Add item** action left the register visible because its JavaScript referred to superseded form field IDs. | A Height Equipment Manager can open the Add Equipment form, set its current fields, and save a valid item. | Static form-ID integrity guard + controlled staging fixture journey | Automated: static guard and controlled staging fixture passed; mobile UI confirmation and production Pages deployment passed (24 Aug 2026). |

### Training & Qualifications

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-066 | A person's training course row centred its title (an invisible `<summary>` marker slot threw off `justify-content:space-between`) and the Compulsory pill sat to the left of the title instead of grouped with the status pill. | Course titles are left-justified; Compulsory and status pills are grouped together on the right. | Staging browser check | Code fix on `fix/training-module-batch-sep2026`; `node --check` and the full `npm run test:regression` suite pass (91/91); Staging visual confirmation pending |
| REG-067 | Evidence controls were labelled "Evidence: <filename>" with a single combined button, offering no separate way to view vs. download a file. | Evidence shows a "File" label with distinct View and Download actions (Download sets `Content-Disposition: attachment`). | Staging browser check | Code fix on `fix/training-module-batch-sep2026`; `node --check` and `npm run test:regression` pass; Staging confirmation pending |
| REG-068 | Editing a contractor person always opened the edit form at the top of the card instead of under the row being edited. | The edit form for a contractor person opens inline, directly beneath that person's row. | Staging browser check | Code fix on `fix/training-module-batch-sep2026`; `node --check` and `npm run test:regression` pass; Staging confirmation pending |
| REG-069 | A course's "Higher-level learning" flag was derived from an NZQA **level** of 3+, not from whether the course actually had an NZQA code/number attached. | A course is higher-level automatically when it has an NZQA code, or a recognised competency type — never a separate manual selection. | Staging DB check + Staging browser check | Staging DB migration applied and verified (`higher_level_learning` generated-column expression confirmed via SQL). `tests/e2e/staging/training-module-review.spec.cjs` (TRAINING-REVIEW-006) updated to assert the new derivation and that the pill now lives on the course record, not the catalogue list; Playwright run against Staging pending |
| REG-070 | Compulsory/Higher-level pills sat awkwardly among the course name in the printable Training Register. | Compulsory/Higher-level pills are grouped to the right, alongside the status pill. | Staging browser/print check | Code fix on `fix/training-module-batch-sep2026`; `node --check` and `npm run test:regression` pass; Staging print confirmation pending |
| REG-071 | The app tracked and displayed an automatically-calculated "years of experience" (from a first-qualified date) across My Training, the individual record table and the printable register — a field nobody asked to keep. | No experience/first-qualified-date section is tracked or shown anywhere in Training. | Staging browser check | Code fix removes all "Experience" columns, the `first_qualified_date` form field and its helper text. `training-module-review.spec.cjs` (TRAINING-REVIEW-004) updated to assert the register no longer contains "Experience"; Playwright run against Staging pending |
| REG-072 | There was no way to record an internal, manually-assessed competency level (supervision requirement) against a training record. | Each training record can be given a Competency rating of 1–4 (Requires full supervision → Can train others), set manually. | Staging DB + browser check | Staging DB migration applied (`competency_level` column with a 1–4 check constraint) and verified; UI (`TRAINING_COMPETENCY_LEVELS` field on the record form/table) built but not yet exercised on Staging |
| REG-073 | The printable Training Register always showed an "Example: current training at Level 3 or above" callout, which was unwanted and tied to the old NZQA-level derivation. | The register has no such example callout. | Staging browser/print check | Code fix removes `exampleBlock`/`higherLevelCandidates` from the register build. `training-module-review.spec.cjs` (TRAINING-REVIEW-004) updated to assert the callout text is absent; Playwright run against Staging pending |
| REG-074 | The Training & Competency Register always covered every active employee and contractor person with every training type, with no way to scope it. | The register can be filtered by People (Employees / Contractors / both) and Training type (Formal / Internal / both) before it generates. | Staging browser check | New `training-register` filter view built (`trainingRegisterBuildData(filters)`). `training-module-review.spec.cjs` (TRAINING-REVIEW-004) updated to exercise the filter step before generating; Playwright run against Staging pending |
| REG-075 | Training items approaching their expiry date never generated a follow-up task — only maintenance schedules and failed height inspections did. | A training record due within 30 days automatically gets a Maintenance task (once per record), matching the existing automatic-task pattern. | Staging RPC check | `operations_sync_automatic_tasks_v4077` extended with a training-renewal insert block, keyed by `training_record_expiry:<record id>`, and applied to Staging; not yet exercised against seeded expiring records |
| REG-076 | The Training dashboard showed only counts of courses/contractors/people, with no compliance signal like other modules' dashboards. | The Training dashboard shows Overdue, Due soon, Compliant and Not recorded stat tiles, matching other modules' dashboard pattern. | Staging browser check | Code fix on `fix/training-module-batch-sep2026`; `node --check` and `npm run test:regression` pass; Staging visual confirmation pending |
| REG-077 | The Training Settings page carried an unwanted descriptive helper-text box above the Matrix/Catalog. | The Settings page shows the Training Matrix and Course Catalog only, with no helper-text box above them. | Staging browser check | Code fix on `fix/training-module-batch-sep2026`; `node --check` and `npm run test:regression` pass; Staging confirmation pending |
| REG-078 | The Course Catalog listed Edit/Deactivate actions and a Higher-level pill directly in the list rows, with no dedicated course record. | Clicking a course opens its own record, where Edit and Archive (renamed from Deactivate) live, along with the Higher-level pill. | Staging browser check | New `training-course-detail` view built (`openTrainingCourse`, `data-ops-view-course`). `training-module-review.spec.cjs` (TRAINING-REVIEW-006) updated to click through and assert Edit/Archive on the record; Playwright run against Staging pending |
| REG-079 | The Course Catalog list rows showed each course's description text under its title. | The catalogue list shows no description text; a course's description is visible on its own record. | Staging browser check | Code fix on `fix/training-module-batch-sep2026`; `node --check` and `npm run test:regression` pass; Staging confirmation pending |
| REG-080 | A training record's evidence list showed a cluttered mix of raw file actions with no clean way to just view a file, and no single "add file" control. | Evidence renders as a tidy list of added files; clicking a file opens a viewer with a Download button; one "+ Add file" control reveals Camera/Gallery options. | Staging browser check | Code fix on `fix/training-module-round2-sep2026` (new `showTrainingEvidenceViewer`/`closeTrainingEvidenceViewer`, `state.trainingFileMenuOpenId`); `node --check` passes; Staging visual confirmation pending |
| REG-081 | The "+ Add record" button sat flush against the training-record info box with no separation. | A small gap separates the info box from the "+ Add record" button, matching the pill side-spacing. | Staging browser check | CSS fix (`.ops-training-course-body > .ops-add-record-btn{margin-top:.75rem}`) on `fix/training-module-round2-sep2026`; `node --check` passes; Staging visual confirmation pending |
| REG-082 | Pill badge columns (e.g. Compulsory) did not align vertically because flexbox spacing shifted column position with text length. | Pill columns render in a fixed-width grid and stay aligned top-to-bottom regardless of the text length in any row. | Staging browser check | CSS fix on `fix/training-module-round2-sep2026` (`.ops-training-course-badges`/`.ops-training-row-badges` converted from flex to grid with an always-rendered placeholder slot); `node --check` passes; Staging visual confirmation pending |
| REG-083 | Fixes already applied to the Training Matrix/Catalog were not visible in a staging build under review, with no documented step to confirm the staging source commit actually contained them. | Before every Step 8-9A handoff, the staging build's source commit is confirmed against the last known-good commit so a stale local server is never mistaken for a missing fix. | Process/documentation check | `docs/testing/ACCESS-AND-RECOVERY-HANDOVER.md` New-chat start checklist item 8 added; no code change (the underlying `main` commit already contained the fixes — confirmed via `git log`/`git diff`) |
| REG-084 | The course catalogue had no field to capture an NZQA code, so "Higher-level" status could only be inferred indirectly. | The course form's NZQA code field is clearly linked to Higher-level designation via its placeholder text. | Staging browser check | UI hint added on `fix/training-module-round2-sep2026` (placeholder "Present = Higher-level" on `opsCourseNzqaCode`); underlying derivation logic already shipped in REG-069; `node --check` passes; Staging confirmation pending |
| REG-085 | The Training Matrix spread across the full screen width with two tick boxes per cell, verbose header text, no way to collapse it, and no frozen header/first column while scrolling. | The Matrix is compact, single-tick per cell, collapsible (with the Course Catalog), and keeps its header row and Person column frozen while scrolling. | Staging browser check | Code fix on `fix/training-module-round2-sep2026`: `toggleTrainingMatrixApplicable`/`toggleTrainingMatrixCompulsory` replaced with a single `toggleTrainingMatrixCell` that sets `applicable`/`compulsory` together; `<details>` wrapping and sticky-header/column CSS added; `training-module-review.spec.cjs` (TRAINING-REVIEW-002) updated for the single-checkbox selector; `node --check` and syntax pass; Staging visual/functional confirmation pending. **Flagged for review:** collapsing the two independent flags into one tick is a judgment call, not explicitly requested — confirm this matches intent before relying on it. |
| REG-086 | The Course Catalog carried a Provider column/field, but a course's provider varies per person per training record, making the catalogue-level field meaningless. | The Course Catalog has no Provider field or column; Provider remains only on individual training records. | Staging browser check | Code fix on `fix/training-module-round2-sep2026` (`trainingCourseFormHtml`, `saveTrainingCourse`, `trainingCatalogHtml`, `trainingCourseDetailHtml`); grep-verified no stale `c.provider`/`opsCourseProvider` references remain; `node --check` passes; Staging confirmation pending |
| REG-087 | Action buttons in the Contractors list wrapped or crowded together inconsistently. | Contractor rows carry at most one action button, evenly spaced, consistent with the rest of the module. | Staging browser check | Resolved as part of the Contractors navigation restructure (REG-091) on `fix/training-module-round2-sep2026`, which moved per-row actions into each contractor's own entry page; `node --check` passes; Staging visual confirmation pending |
| REG-088 | The Training dashboard could show a blank stat tile, its Due soon/Compliant tiles did not click through to the matching records, and it carried four redundant module-navigation tiles duplicating the top nav tabs. | The dashboard shows only the four stat tiles (Overdue, Due soon, Compliant, Not recorded), each clickable through to the Training & Competency Register; no duplicate navigation tiles remain. | Staging browser check | Code fix on `fix/training-module-round2-sep2026` (`trainingDashboardHtml` moduleCard tiles removed; `data-ops-dashboard-tile` click/keydown wired to `training-register`; new `Register` top-nav tab added since the removed dashboard tile was the only other route there); `training-module-review.spec.cjs` (TRAINING-REVIEW-004) updated for the new nav route; `node --check` passes. **Flagged for review:** tiles route to the full Register rather than a status-pre-filtered list — a simplification, not true filtering. The reported blank-tile bug could not be reproduced via static code review; confirm after this round whether it recurs. Staging confirmation pending |
| REG-089 | There was no visual indicator of which person's entry was being edited. | Superseded — see REG-089/091: the restructure to whole-row navigation with editing living inside each entry page removes the ambiguous multi-row inline-edit scenario this bug depended on. | Staging browser check | Defensive CSS added on `fix/training-module-round2-sep2026` (`tr.ops-row-link`/`tr.ops-row-editing` hover/focus states), currently unused since no multi-row inline edit remains; `node --check` passes; Staging confirmation pending |
| REG-090 | The Team members list showed unnecessary header text, only listed subcontractor-added people rather than registered app users, and required navigating to a separate View/Edit action to open a record. | Team members shows only registered app users, with no header text, and the whole row opens that person's own record directly. | Staging browser check | Code fix on `fix/training-module-round2-sep2026` (`trainingTeamMembersHtml` rewritten: header text and Actions column removed, rows made whole-row links); `training-module-review.spec.cjs` (TRAINING-REVIEW-007) updated for row-click navigation; `node --check` passes; Staging confirmation pending |
| REG-091 | Team members carried an "+ Add subcontractor person" button that did not belong on that list. | No "+ Add subcontractor person" control appears on Team members. | Staging browser check | Code fix on `fix/training-module-round2-sep2026` (button removed from `trainingTeamMembersHtml`); `node --check` passes; Staging confirmation pending |
| REG-092 | Contractors had no scoped per-contractor page: a sole trader jumped straight to their person record (skipping the ability to edit contractor-level details), and there was no consistent way to add/view a company's own people from one place. | Every contractor row — sole trader or company — opens that contractor's own scoped page first, with Edit (contractor details) and, for companies, "+ Add person"; that page lists only people belonging to that contractor, each opening their own record. | Staging browser check | Code fix on `fix/training-module-round2-sep2026` (`viewTrainingContractor` sole-trader bypass removed; `trainingContractorPeopleHtml` gains an Edit action; rows made whole-row links); guarded `state.trainingContractorFormOpen`/`editingContractorId` reuse with `!state.editingContractorId` to prevent the list-page create form appearing during an entry-page edit; `training-module-review.spec.cjs` (TRAINING-REVIEW-008) rewritten for the new flow; `node --check` passes. **Flagged for review:** removing the sole-trader shortcut is a deliberate behaviour change — confirm it's wanted before relying on it. Staging confirmation pending |
| REG-093 | Button spacing and alignment were inconsistent in places across the Training & Qualifications module. | Buttons are evenly spaced and consistently aligned throughout the module. | Staging browser check | Audited and fixed on `fix/training-module-round2-sep2026` as part of the REG-080/081/087/090–092 changes above (evidence controls, add-record gap, contractor/team actions); `node --check` passes; Staging visual confirmation pending |

### Admin, permissions, and security

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-043 | User management was inaccessible or Edit user collapsed the Current Users section. | Admin can reach the canonical UI and edit a user without collapsing the working area. | Admin browser test | Automated static guard; Staging Admin read-only review and controlled temporary-user role-edit test passed on 27 Aug 2026. |
| REG-044 | User changes could remove the active Admin's role or access. | Editing users does not remove the current Admin's permissions; preserve last-Admin protection. | Disposable Admin integration | Own-role browser safeguard automated; final-Admin check remains a separately designed controlled test. |
| REG-045 | Profile name displays could omit a user surname. | User choices show full, canonical first-and-last names. | Browser fixture test | Pending |
| REG-046 | Height and Admin showed conflicting role definitions or duplicate management controls. | One canonical role source and user-management UI, in Admin only. | Role-matrix/browser test | Automated static guard; Staging Admin read-only review and controlled temporary-user role-edit coverage passed on 27 Aug 2026. |
| REG-047 | Height read-only access was only hidden in UI, not enforced in database/storage policies. | Read-only roles cannot directly write tables or storage. | Authenticated Supabase role-matrix test | Pending; live policies need baseline |
| REG-048 | Admin could duplicate Home controls or visibly reposition after opening. | One Home control; final Admin layout renders once without delayed movement. | DOM/layout-shift + manual visual test | Static guard plus Staging desktop/mobile browser stability check implemented; manual visual confirmation remains. |

### Shared styling, releases, PWA, and source of truth

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-049 | Logo could load late, wrong, blank, or distorted before authentication. | The packaged logo is correct and proportionate from first paint. | Screenshot/browser test | Pending |
| REG-050 | Shared palette and dashboard/action layouts drifted between modules. | Shared tokens, active states, spacing, and card alignment remain consistent. | CSS token + visual baseline | Pending |
| REG-051 | Browser/PWA icons could remain obsolete after an icon release. | Manifest/favicons reference approved assets; clean installs use them. | Static manifest + manual device test | Automated static guard; device test pending |
| REG-052 | Service-worker/browser caching could keep an old release active or omit critical assets. | Upgrade uses the new complete asset set; service worker cache includes critical files. | Static service-worker guard + controlled upgrade/offline test | Automated static guard; upgrade test pending |
| REG-053 | Release assets and version references could be inconsistent or installation instructions could omit changed runtime files. | All active asset/version/cache references agree and release manifest lists every changed runtime file. | CI release-integrity test | Automated entry-script guard; full release metadata check pending |
| REG-054 | GitHub could not reproduce the deployed database schema/migrations. | All applied migrations are version-controlled and clean migration output matches an approved snapshot. | Clean database migration/schema test | Pending; live schema export needed |

### Regression-system safeguards

| ID | Confirmed regression | Expected behaviour | Coverage target | Status |
| --- | --- | --- | --- | --- |
| REG-055 | A verifier treated a successful non-200 `2xx` response as failure. | Defined successful `2xx` responses pass; `4xx`/`5xx` fail. | Verifier unit test | Automated |
| REG-056 | A verifier treated optional blank completion notes as failure. | A completed task can have blank notes if completion identity and timestamp exist. | Verifier helper + integration | Automated helper; integration pending |

## Module coverage map

This map covers the normal operational journeys in every app module. It complements the bug-by-bug catalogue above: a journey can pass its individual regression tests yet still fail when its screens, permissions, and saved data are used together.

`CI` tests are safe deterministic checks with no Supabase writes. `Staging` tests use labelled, disposable records in the isolated staging project. `Review` tests leave labelled staging records temporarily so that the Operations manager can refresh an already-open, signed-in staging browser tab and inspect the outcome. `Device` tests require a real supported phone/tablet or print dialog.

| Module | Priority journey | Expected result | Coverage type | Initial status |
| --- | --- | --- | --- | --- |
| Global / Home | Sign in, role landing, Home navigation, dashboard attention counts | User reaches only permitted modules; Home counts match the underlying visible records | CI + Staging browser | CI sign-in shell only; integration pending |
| Global / Home | Staging identity and cache/update behaviour | Persistent staging banner; no production configuration; new release assets install correctly | CI + Device | Banner/static checks automated; device update pending |
| Height Equipment | Find an asset, open it, record an inspection, return to preserved filters/history | Correct record is saved; list, scroll position and filters remain stable | Staging browser + Review | Read-only browse/filter/detail coverage automated; controlled inspection review pending |
| Height Equipment | Certificates and Inspector Details | Eligible selections, counts and generated documents match selected records and evidence | Staging browser + Review + Device/PDF | Read-only certificate view automated; generation and Inspector Details pending |
| Height Equipment | Qualification upload/replacement | Valid evidence is readable and retained; bad files are rejected | Isolated staging Storage + Review | Pending |
| Vehicle Checks | See due/overdue attention and start the correct vehicle check | Alert opens one usable preselected check; completion advances its next due date | Staging browser + Review | Alert routing manually passed; lifecycle pending |
| Vehicle Checks | Complete a check with all pass/N/A answers | Check saves, produces no maintenance tasks, and updates due/overdue attention | Staging browser + Review | Rule automated; end-to-end pending |
| Vehicle Checks | Report one or more issues | Exactly one follow-up task is created per issue; passes create none | Staging browser + Review | Rule automated; end-to-end pending |
| Maintenance | Add/edit vehicle and compatible machinery/sub-assets | Only compatible maintenance procedures can be assigned; active schedules appear in the appropriate attention list | Staging browser | Pending |
| Maintenance | Record vehicle-only `Other maintenance` with parts and a follow-up | One valid maintenance log item; required task is created by the approved RPC with exact text; no schedules or sub-assets are seeded | Controlled staging browser review | Automated; first staging review run pending |
| Maintenance | Open, update and complete tasks | Status, steps, parts, responsible role and completion evidence save atomically without duplicates | Staging browser | Pending |
| Maintenance | Filter/export maintenance history | Filters match exported CSV/PDF; print/PDF is readable and has no browser chrome | CI + Staging browser + Device/PDF | Pending |
| Admin | Create/edit users and roles | Canonical roles display once; edits retain the working page and never remove the final active Admin | Disposable staging role matrix + Review | Pending |
| Admin | Enforce permissions | Hidden controls and direct Supabase writes both respect role restrictions | Authenticated staging role matrix | Pending |
| Mobile / PWA | Critical Home, Height, Vehicle Checks, Maintenance and Admin journeys at phone widths | Controls remain usable; no clipping, scroll traps, unusable dialogs or accidental desktop-only behaviour | Playwright mobile project + Device | Pending |

### Delivery order

1. Build shared authenticated staging fixtures and cleanup helpers once, with a dedicated staging-only test account and the `E2E REVIEW —` prefix.
2. Add the critical Vehicle Checks review journey first: one pass, one reported issue, exact task verification, and user-visible staging review records.
3. Add one critical end-to-end journey for Height Equipment, Maintenance and Admin using the same fixture layer.
4. Add Playwright mobile viewports for the safe browser cases, then real-device/PWA and print checks where browser emulation is insufficient.

## Manual release checklist

Run these in **staging only** before production review. They are important but require visual, device, or print confirmation beyond deterministic CI assertions.

1. Certificate, Inspector Details, and Maintenance PDF appearance: no browser print chrome, clipping, wrong page placement, or unreadable images.
2. Real-device PWA install/update, icon refresh, offline/reconnect, camera/photo upload, touch targets, and small-screen scrolling.
3. Visual smoothness while changing Height history/equipment filters, opening Admin, and opening Qualifications.
4. Shared palette, responsive layout, dashboard spacing, and pre-login logo quality.
5. Production migration preflight: schema/policy comparison and a reviewed backup/rollback plan. Never point automated tests at production.

## Implementation plan

The catalogue deliberately distinguishes coverage that can be added immediately from coverage that needs an isolated staging fixture/database.

1. **Phase A — expand static/unit coverage:** all JavaScript syntax, release/service-worker integrity, schedule/task/vehicle rules, and verifier helpers.
2. **Phase B — browser regression harness:** Playwright with deterministic fixture data for navigation, filters, selections, counts, blank required inputs, DOM uniqueness, ordering, and scroll preservation.
3. **Phase C — isolated Supabase staging tests:** role matrix, migrations, RPC/task lifecycle, Storage file verification, and generated report data. Use disposable records and test-only prefixes.
4. **Phase D — visual and mobile/PWA:** screenshot baselines, generated-document rendering, and an explicit supported-phone testing matrix.

## Rules for future bugs

1. Record every **confirmed** bug here before its fix is promoted.
2. Keep the concrete expected behaviour and one reproducible test scenario.
3. Add the deterministic automated test in the same PR whenever practical; otherwise add a concise staging/manual check.
4. Update the entry's status when the test is implemented—do not delete fixed bugs.
5. The regression workflow must pass, and required staging/manual checks must be recorded, before a PR is ready for production review.
