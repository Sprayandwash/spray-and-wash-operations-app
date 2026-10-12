const { test, expect } = require('@playwright/test');
const { getStagingTrainingConfig } = require('../support/staging-training-config.cjs');
const { getStagingHeightReadOnlySecurityConfig } = require('../support/staging-height-readonly-security-config.cjs');
const { buildFixtureTag, signIn, acceptDialogsAndCapture, withPopup, safeCleanup } = require('../support/ui-suite-helpers.cjs');

// Full, write-capable usability regression suite for the Training &
// Qualifications module — see docs/testing/MODULE-UI-TESTING-STANDARD.md for
// the standing process this suite follows (it is the first module built to
// that standard). Unlike training-module-review.spec.cjs, this suite is not
// browse-only: it exercises every create/edit/toggle/delete action a
// Training manager can take, through the real rendered UI (clicks, typed
// text, real form submits — never a direct database write for the actions
// under test), and asserts the result the UI itself should show afterwards.
//
// Self-contained: every person/contractor/course/record/file this suite
// creates is tagged with a run-unique "E2E-UI-SUITE-TRAINING-…" name (see
// buildFixtureTag) and is cleaned up again in this file's own afterAll —
// never left behind for a human to review. One real constraint, noted here
// so it isn't mistaken for a bug in this suite: the app's own UI has no
// hard-delete for contractors, people or courses — Settings/Catalog and the
// Contractors screen only ever offer Archive/Deactivate (soft-delete). This
// suite therefore archives those three entity types in its own cleanup
// (the furthest the real UI allows) and hard-deletes the training record
// and evidence file it created, which the UI does support deleting
// outright. If a run is interrupted before cleanup finishes, anything left
// over is always identifiable — and safe to remove by hand — by its
// "E2E-UI-SUITE-TRAINING-" name.
//
// This suite never touches the shared, persistent E2E_STAGING_TRAINING_*
// account's own identity-linked data (its own employee/person row, if it
// has one) — only the throwaway fixtures it creates itself.
test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

const config = getStagingTrainingConfig();
const heightReadOnlyConfig = getStagingHeightReadOnlySecurityConfig();
const TAG = buildFixtureTag('training');

// Populated as fixtures are created, so later tests can act on them. Never
// read before the test that creates it has run (serial mode guarantees
// order within this file).
const fixture = {
  contractorId: null,
  contractorName: `${TAG} Contracting Ltd`,
  personId: null,
  personName: `${TAG} Worker`,
  courseId: null,
  courseName: `${TAG} Course`,
  archiveCourseId: null,
  archiveCourseName: `${TAG} Archive-Me Course`,
  recordId: null,
  evidenceFileId: null
};

async function openTrainingModule(page) {
  const trainingCard = page.getByRole('button', { name: 'Training', exact: true });
  await expect(trainingCard, 'The staging Training review account must hold the Training manager role.').toBeVisible({ timeout: 15_000 });
  await trainingCard.click();
  await expect(page.locator('#opsShell h2')).toHaveText('Training');
}

async function goToTab(page, label) {
  await page.locator('#opsNav').getByRole('button', { name: label, exact: true }).click();
}

async function openSettingsPanel(page, summaryText) {
  await goToTab(page, 'Settings');
  const details = page.locator('details.ops-collapsible', { has: page.getByRole('heading', { name: summaryText, exact: true }) });
  const isOpen = await details.evaluate(el => el.open);
  if (!isOpen) await details.locator('summary').click();
  return details;
}

test.describe('Training module — full UI regression suite', () => {
  test('TRAINING-SUITE-001: Training manager account can open the Training module', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await expect(page.locator('#opsNav').getByRole('button', { name: 'Dashboard', exact: true })).toHaveClass(/active/);
  });

  test('TRAINING-SUITE-002: an account without the Training manager role sees no Training module card', async ({ page }) => {
    await signIn(page, heightReadOnlyConfig);
    await expect(page.getByRole('button', { name: 'Training', exact: true })).toHaveCount(0);
  });

  test('TRAINING-SUITE-003 [known-bug regression]: "My Training" must only ever receive the signed-in person\'s own rows over the network', async ({ page }) => {
    const seenPersonIds = new Set();
    page.on('response', response => {
      if (!response.url().includes('/rest/v1/operations_training_records')) return;
      response
        .json()
        .then(rows => {
          if (Array.isArray(rows)) rows.forEach(row => { if (row && row.person_id != null) seenPersonIds.add(String(row.person_id)); });
        })
        .catch(() => {});
    });
    await signIn(page, heightReadOnlyConfig);
    await page.getByRole('button', { name: 'My Training', exact: true }).click();
    await expect(page.locator('#opsShell h2')).toHaveText('My Training');
    await page.waitForTimeout(1500); // let the operations_training_records fetch complete and be captured above
    expect(
      seenPersonIds.size,
      'loadMyTrainingData() fetches operations_training_records with no server-side filter and only narrows to "my" rows in the browser afterwards (operations-v4.js ~line 933-952). ' +
      `This account\'s browser received rows for ${seenPersonIds.size} distinct person_id(s) instead of at most 1 — every other person's training completion dates, statuses and provider names were sent to a client that has no Training-module access at all.`
    ).toBeLessThanOrEqual(1);
  });

  test('TRAINING-SUITE-004: creating a course adds it to the Course Catalog with the entered details', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    const matrixDetails = await openSettingsPanel(page, 'Training Matrix');
    void matrixDetails;
    const catalog = await openSettingsPanel(page, 'Course Catalog');

    await catalog.getByRole('button', { name: '+ Add course', exact: true }).click();
    await page.locator('#opsCourseName').fill(fixture.courseName);
    await page.locator('#opsCourseType').selectOption('external');
    await page.locator('#opsCourseValidity').fill('24');
    await page.locator('#opsCourseNzqaCodes').fill('99999');
    await page.getByRole('button', { name: 'Add course', exact: true }).click();

    const row = catalog.locator('tr', { has: page.getByRole('button', { name: fixture.courseName, exact: true }) });
    await expect(row, `Expected the new course "${fixture.courseName}" to appear in the Course Catalog`).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText('External');
    await expect(row).toContainText('99999');
    await expect(row).toContainText('24 months');
    await expect(row).toContainText('Active');
    fixture.courseId = await row.getByRole('button', { name: fixture.courseName, exact: true }).getAttribute('data-ops-view-course');
    expect(fixture.courseId).toBeTruthy();
  });

  test('TRAINING-SUITE-005: editing a course to Internal moves it between Matrix tabs and updates the Catalog row', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    const catalog = await openSettingsPanel(page, 'Course Catalog');
    await catalog.getByRole('button', { name: fixture.courseName, exact: true }).click();
    await expect(page.locator('#opsShell h2')).toHaveText('Training');

    await page.locator('#opsCourseType').selectOption('internal');
    await page.locator('#opsCourseValidity').fill('');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    const catalogAfter = await openSettingsPanel(page, 'Course Catalog');
    const row = catalogAfter.locator('tr', { has: page.getByRole('button', { name: fixture.courseName, exact: true }) });
    await expect(row).toContainText('Internal');
    await expect(row).toContainText('No expiry');

    const matrix = await openSettingsPanel(page, 'Training Matrix');
    await matrix.getByRole('button', { name: /Internal \(\d+\)/ }).click();
    await expect(matrix.getByRole('columnheader', { name: fixture.courseName })).toBeVisible();
    await matrix.getByRole('button', { name: /External \(\d+\)/ }).click();
    await expect(matrix.getByRole('columnheader', { name: fixture.courseName })).toHaveCount(0);
  });

  test('TRAINING-SUITE-006: archiving a course (the UI\'s only "delete") removes it from the Matrix and marks it Archived in the Catalog', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    const catalog = await openSettingsPanel(page, 'Course Catalog');

    await catalog.getByRole('button', { name: '+ Add course', exact: true }).click();
    await page.locator('#opsCourseName').fill(fixture.archiveCourseName);
    await page.getByRole('button', { name: 'Add course', exact: true }).click();
    const createdRow = (await openSettingsPanel(page, 'Course Catalog')).locator('tr', { has: page.getByRole('button', { name: fixture.archiveCourseName, exact: true }) });
    await expect(createdRow).toHaveCount(1, { timeout: 10_000 });
    fixture.archiveCourseId = await createdRow.getByRole('button', { name: fixture.archiveCourseName, exact: true }).getAttribute('data-ops-view-course');
    expect(fixture.archiveCourseId).toBeTruthy();

    await createdRow.getByRole('button', { name: fixture.archiveCourseName, exact: true }).click();
    await page.locator('#opsCourseActive').uncheck();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    const catalogAfter = await openSettingsPanel(page, 'Course Catalog');
    const rowAfter = catalogAfter.locator('tr', { has: page.getByRole('button', { name: fixture.archiveCourseName, exact: true }) });
    await expect(rowAfter).toContainText('Archived');

    const matrix = await openSettingsPanel(page, 'Training Matrix');
    await expect(matrix.getByRole('columnheader', { name: fixture.archiveCourseName })).toHaveCount(0);
  });

  test('TRAINING-SUITE-007: creating a contractor adds it to Contractors with a "Not set up" training signal', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await goToTab(page, 'Contractors');

    await page.getByRole('button', { name: '+ Add contractor', exact: true }).click();
    await page.locator('#opsContractorName').fill(fixture.contractorName);
    await page.locator('#opsContractorType').selectOption('company');
    await page.locator('#opsContractorContactEmail').fill('e2e-ui-suite@example.invalid');
    await page.getByRole('button', { name: 'Add contractor', exact: true }).click();

    const row = page.locator('tr', { has: page.getByText(fixture.contractorName, { exact: true }) });
    await expect(row, `Expected the new contractor "${fixture.contractorName}" to appear in Contractors`).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText('Company');
    await expect(row).toContainText('Not set up');
    await expect(row).toContainText('Active');
    fixture.contractorId = await row.getAttribute('data-ops-view-contractor');
    expect(fixture.contractorId).toBeTruthy();
  });

  test('TRAINING-SUITE-008: editing a contractor\'s contact details is reflected in the Contractors list', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await goToTab(page, 'Contractors');
    const row = page.locator(`tr[data-ops-view-contractor="${fixture.contractorId}"]`);
    await row.click();
    await expect(page.locator('h3', { hasText: fixture.contractorName })).toBeVisible();

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#opsContractorContactPhone').fill('021 555 0100');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    await goToTab(page, 'Contractors');
    const rowAfter = page.locator(`tr[data-ops-view-contractor="${fixture.contractorId}"]`);
    await expect(rowAfter).toContainText('021 555 0100');
  });

  test('TRAINING-SUITE-009: deactivating then reactivating a contractor round-trips its Status and button label', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTrainingModule(page);
    await goToTab(page, 'Contractors');
    let row = page.locator(`tr[data-ops-view-contractor="${fixture.contractorId}"]`);
    await row.getByRole('button', { name: 'Deactivate', exact: true }).click();

    await goToTab(page, 'Contractors');
    row = page.locator(`tr[data-ops-view-contractor="${fixture.contractorId}"]`);
    await expect(row).toContainText('Inactive');
    await expect(row.getByRole('button', { name: 'Reactivate', exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Reactivate', exact: true }).click();
    await goToTab(page, 'Contractors');
    row = page.locator(`tr[data-ops-view-contractor="${fixture.contractorId}"]`);
    await expect(row).toContainText('Active');
    await expect(row.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
  });

  test('TRAINING-SUITE-010: adding a person under a contractor lists them there and under Team members', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await goToTab(page, 'Contractors');
    await page.locator(`tr[data-ops-view-contractor="${fixture.contractorId}"]`).click();

    await page.getByRole('button', { name: '+ Add person', exact: true }).click();
    // The contractor was created as type "company" in TRAINING-SUITE-007, so
    // trainingPersonFormHtml() renders this option's label as exactly
    // "<company_name> (Company)" (operations-v4.js ~line 1754). selectOption's
    // `label` match is an exact string, not a regex — a RegExp here would
    // silently fail to match any option and time out.
    await page.locator('#opsPersonContractorId').selectOption({ label: `${fixture.contractorName} (Company)` });
    await page.locator('#opsPersonFullName').fill(fixture.personName);
    await page.getByRole('button', { name: 'Add person', exact: true }).click();

    const personRow = page.locator('tr', { has: page.getByText(fixture.personName, { exact: true }) });
    await expect(personRow, `Expected "${fixture.personName}" to appear under the contractor's people`).toHaveCount(1, { timeout: 10_000 });
    fixture.personId = await personRow.getAttribute('data-ops-open-person');
    expect(fixture.personId).toBeTruthy();

    await goToTab(page, 'Team members');
    await expect(page.locator(`tr[data-ops-open-person="${fixture.personId}"]`)).toContainText(fixture.personName);
  });

  test('TRAINING-SUITE-011: renaming a person is reflected under the contractor and under Team members', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await page.locator(`[data-ops-open-person="${fixture.personId}"]`).first().click();
    await expect(page.locator('h3', { hasText: fixture.personName })).toBeVisible();

    const renamed = `${fixture.personName} (renamed)`;
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#opsPersonFullName').fill(renamed);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    fixture.personName = renamed;

    await expect(page.locator('h3', { hasText: renamed })).toBeVisible();
    await goToTab(page, 'Team members');
    await expect(page.locator(`tr[data-ops-open-person="${fixture.personId}"]`)).toContainText(renamed);
  });

  test('TRAINING-SUITE-012: the Training Matrix switch cycles Off → Applicable (amber) → Compulsory (green) → Off', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    const matrix = await openSettingsPanel(page, 'Training Matrix');
    const cell = matrix.locator(`button[data-ops-matrix-cell][data-person="${fixture.personId}"][data-course="${fixture.courseId}"]`);
    await expect(cell, 'Expected a Matrix cell for the fixture person × fixture course').toHaveCount(1, { timeout: 10_000 });

    await expect(cell).toHaveAttribute('data-state', 'off');

    await cell.click();
    await expect(cell).toHaveAttribute('data-state', 'applicable');
    await expect(cell).toHaveCSS('background-color', 'rgb(245, 158, 11)'); // #f59e0b, REG-139

    await cell.click();
    await expect(cell).toHaveAttribute('data-state', 'compulsory');
    await expect(cell).toHaveCSS('background-color', 'rgb(22, 163, 74)'); // #16a34a, REG-139

    await cell.click();
    await expect(cell).toHaveAttribute('data-state', 'off');

    // Leave it Compulsory for the record/register tests below.
    await cell.click();
    await cell.click();
    await expect(cell).toHaveAttribute('data-state', 'compulsory');
  });

  test('TRAINING-SUITE-013: a compulsory course with no record shows "Compulsory" and a "Not recorded" (red) status on the person\'s page', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await page.locator(`[data-ops-open-person="${fixture.personId}"]`).first().click();

    const section = page.locator(`details[data-ops-course-id="${fixture.courseId}"]`);
    await expect(section).toContainText(fixture.courseName);
    await expect(section.locator('.ops-pill.ops-ok', { hasText: 'Compulsory' })).toBeVisible();
    await expect(section.locator('.ops-pill.ops-bad', { hasText: 'Not recorded' })).toBeVisible();
  });

  test('TRAINING-SUITE-014: adding a Completed record auto-computes the expiry date and shows an "In date" status', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await page.locator(`[data-ops-open-person="${fixture.personId}"]`).first().click();
    const section = page.locator(`details[data-ops-course-id="${fixture.courseId}"]`);
    await section.locator('summary').click();
    await section.getByRole('button', { name: '+ Add record', exact: true }).click();

    await page.locator('#opsRecordStatus').selectOption('Completed');
    await page.locator('#opsRecordProvider').fill('E2E UI Suite Provider');
    await page.getByRole('button', { name: 'Add record', exact: true }).click();

    await expect(section.locator('.ops-pill.ops-ok', { hasText: 'In date' })).toBeVisible({ timeout: 10_000 });
    const expiryCell = section.locator('table tr').nth(1).locator('td').nth(1);
    await expect(expiryCell).not.toHaveText('No expiry');
    await expect(expiryCell).not.toHaveText('—');

    const editButton = section.getByRole('button', { name: 'Edit', exact: true });
    await expect(editButton).toHaveCount(1);
    fixture.recordId = await editButton.getAttribute('data-ops-edit-record');
    expect(fixture.recordId).toBeTruthy();
  });

  test('TRAINING-SUITE-015 [known-bug regression]: a "Failed" record must be flagged red and surface as a contractor "Fail", not "Pass"', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await page.locator(`[data-ops-open-person="${fixture.personId}"]`).first().click();
    const section = page.locator(`details[data-ops-course-id="${fixture.courseId}"]`);
    await section.locator('summary').click(); // course body — including the Edit button — only exists while this <details> is open
    await section.locator(`[data-ops-edit-record="${fixture.recordId}"]`).click();
    await page.locator('#opsRecordStatus').selectOption('Failed');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    const statusPill = section.locator('.ops-training-course-badges .ops-pill').last();
    await expect(statusPill, 'Label text should still say Failed').toHaveText('Failed', { timeout: 10_000 });
    await expect(
      statusPill,
      'operations-v4.js trainingCellStatus() (~line 1152) maps any non-"Completed" status, including "Failed", to pillClass "ops-warn" (amber) instead of "ops-bad" (red) — ' +
      'a failed compulsory course currently renders with the same colour as merely "In progress".'
    ).toHaveClass(/ops-bad/);

    await goToTab(page, 'Contractors');
    const contractorRow = page.locator(`tr[data-ops-view-contractor="${fixture.contractorId}"]`);
    await expect(
      contractorRow,
      'contractorTrainingStatus() (~line 1161-1178) only treats pillClass "ops-bad" as a failure, so a "Failed" record (pillClass "ops-warn") never trips the contractor-level "Fail" signal — ' +
      'the Contractors screen\'s own description calls this "the single check an HSE review…will draw on" (operations-v4.js ~line 1715).'
    ).toContainText('Fail');
  });

  test('TRAINING-SUITE-016: uploading evidence to a record shows it in the evidence list', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await page.locator(`[data-ops-open-person="${fixture.personId}"]`).first().click();
    const section = page.locator(`details[data-ops-course-id="${fixture.courseId}"]`);
    await section.locator('summary').click();

    await section.getByRole('button', { name: '+ Add file', exact: true }).click();
    const galleryInput = section.locator(`input[data-ops-evidence-input="${fixture.recordId}"][type="file"]`).last();
    await galleryInput.setInputFiles({
      name: 'e2e-ui-suite-evidence.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 E2E UI SUITE TEST FILE — safe to delete\n%%EOF')
    });

    const evidenceLink = section.getByRole('button', { name: 'e2e-ui-suite-evidence.pdf', exact: true });
    await expect(evidenceLink, 'Expected the uploaded evidence file to appear in the list').toBeVisible({ timeout: 15_000 });
    fixture.evidenceFileId = await evidenceLink.getAttribute('data-ops-view-evidence');
    expect(fixture.evidenceFileId).toBeTruthy();
  });

  test('TRAINING-SUITE-017: removing evidence takes it back out of the evidence list', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTrainingModule(page);
    await page.locator(`[data-ops-open-person="${fixture.personId}"]`).first().click();
    const section = page.locator(`details[data-ops-course-id="${fixture.courseId}"]`);
    await section.locator('summary').click();

    await section.locator(`[data-ops-delete-evidence="${fixture.evidenceFileId}"]`).click();
    await expect(section.locator('.ops-evidence-empty')).toContainText('No files added yet.', { timeout: 10_000 });
    fixture.evidenceFileId = null;
  });

  test('TRAINING-SUITE-018: the on-screen Register lists the fixture person/course, and a status filter narrows and labels the results', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await goToTab(page, 'Register');

    const resultsRow = page.locator('tr', { has: page.getByRole('button', { name: fixture.personName, exact: true }) });
    await expect(resultsRow).toContainText(fixture.courseName);

    await page.locator('#opsRegisterStatus').selectOption('overdue');
    await expect(page.locator('h3', { hasText: 'Filtered to:' })).toBeVisible();
  });

  test('TRAINING-SUITE-019: "Generate printable register" opens a document containing the fixture person and course', async ({ page }) => {
    await signIn(page, config);
    await openTrainingModule(page);
    await goToTab(page, 'Register');
    await page.locator('#opsRegisterStatus').selectOption('all');

    const popup = await withPopup(page, page.getByRole('button', { name: 'Generate printable register', exact: true }));
    await expect(popup.locator('body')).toContainText(fixture.personName);
    await expect(popup.locator('body')).toContainText(fixture.courseName);
    await popup.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    acceptDialogsAndCapture(page);
    try {
      await signIn(page, config);
      await openTrainingModule(page);

      if (fixture.personId && fixture.courseId) {
        await safeCleanup('training record', async () => {
          await page.locator(`[data-ops-open-person="${fixture.personId}"]`).first().click();
          const section = page.locator(`details[data-ops-course-id="${fixture.courseId}"]`);
          await section.locator('summary').click();
          const deleteButton = section.locator(`[data-ops-delete-record]`);
          if (await deleteButton.count()) {
            await deleteButton.first().click();
            await expect(section).toContainText('No records yet.', { timeout: 10_000 });
          }
        });
      }

      await safeCleanup('fixture person (archived — the UI has no hard delete for people)', async () => {
        if (!fixture.personId) return;
        await page.locator(`[data-ops-open-person="${fixture.personId}"]`).first().click();
        const checkbox = page.locator(`input[data-ops-toggle-training-person-active="${fixture.personId}"]`);
        if (await checkbox.isChecked()) await checkbox.uncheck();
      });

      await safeCleanup('fixture contractor (archived — the UI has no hard delete for contractors)', async () => {
        if (!fixture.contractorId) return;
        await goToTab(page, 'Contractors');
        const row = page.locator(`tr[data-ops-view-contractor="${fixture.contractorId}"]`);
        const deactivate = row.getByRole('button', { name: 'Deactivate', exact: true });
        if (await deactivate.count()) await deactivate.click();
      });

      for (const [label, courseId] of [['fixture course', fixture.courseId], ['throwaway archive-test course', fixture.archiveCourseId]]) {
        await safeCleanup(`${label} (archived — the UI has no hard delete for courses)`, async () => {
          if (!courseId) return;
          const catalog = await openSettingsPanel(page, 'Course Catalog');
          const link = catalog.locator(`[data-ops-view-course="${courseId}"]`);
          if (!(await link.count())) return;
          await link.click();
          const checkbox = page.locator('#opsCourseActive');
          if (await checkbox.isChecked()) await checkbox.uncheck();
          await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        });
      }
    } finally {
      await page.close();
    }
  });
});
