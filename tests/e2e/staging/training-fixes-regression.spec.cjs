const { test, expect } = require('@playwright/test');
const { getStagingTrainingConfig } = require('../support/staging-training-config.cjs');
const { buildFixtureTag, signIn, acceptDialogsAndCapture, safeCleanup } = require('../support/ui-suite-helpers.cjs');

// Regression suite for the Nov 2026 Training fixes (items raised by Brendan during his user check).
// Same rules as training-full-ui-suite.spec.cjs: everything is created and removed through the real UI,
// and tagged so anything left behind by an interrupted run is easy to find and remove.
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

const config = getStagingTrainingConfig();
const TAG = buildFixtureTag('trainfix');

const fx = {
  contractorName: `${TAG} Co`,
  soleName: `${TAG} Sole`,
  personName: `${TAG} Worker`,
  courseName: `${TAG} Course`,
  contractorId: null, soleId: null, personId: null, courseId: null,
  recordId: null
};

const nzToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
const shift = (iso, days) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 TRAINING FIX TEST FILE - safe to delete\n%%EOF') });

async function openTraining(page) {
  const card = page.getByRole('button', { name: 'Training', exact: true });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(page.locator('#opsShell h2')).toHaveText('Training');
}
const goToTab = (page, label) => page.locator('#opsNav').getByRole('button', { name: label, exact: true }).click();
async function openPanel(page, name) {
  await goToTab(page, 'Settings');
  const d = page.locator('details.ops-collapsible', { has: page.locator('summary h3', { hasText: new RegExp('^\\s*' + name + '\\s*$') }) });
  if (!(await d.evaluate(el => el.open))) await d.locator('summary').first().click();
  return d;
}
async function openPerson(page) {
  await goToTab(page, 'Team members');
  await page.locator(`[data-ops-open-person="${fx.personId}"]`).first().click();
}
const section = page => page.locator(`details[data-ops-course-id="${fx.courseId}"]`);
async function openSection(page) {
  const s = section(page);
  if (!(await s.evaluate(el => el.open))) await s.locator('summary').first().click();
  return s;
}
async function addCourseViaUi(page, name, validity) {
  const cat = await openPanel(page, 'Course Catalog');
  await cat.getByRole('button', { name: '+ Add course', exact: true }).click();
  await page.locator('#opsCourseName').fill(name);
  if (validity !== undefined) await page.locator('#opsCourseValidity').fill(String(validity));
  await page.getByRole('button', { name: 'Add course', exact: true }).click();
}
async function editRecord(page, fields) {
  const s = await openSection(page);
  await s.locator(`[data-ops-edit-record="${fx.recordId}"]`).click();
  if (fields.status) await page.locator('#opsRecordStatus').selectOption(fields.status);
  if (fields.completed !== undefined) await page.locator('#opsRecordCompletedDate').fill(fields.completed);
  if (fields.expiry !== undefined) await page.locator('#opsRecordExpiryDate').fill(fields.expiry);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
}

test.describe('Training fixes (Nov 2026) — regression suite', () => {
  test('FIX-001: set up a company, a person, a course (12 months) and a compulsory matrix cell', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await goToTab(page, 'Contractors');
    await page.getByRole('button', { name: '+ Add contractor', exact: true }).click();
    await page.locator('#opsContractorName').fill(fx.contractorName);
    await page.locator('#opsContractorType').selectOption('company');
    await page.getByRole('button', { name: 'Add contractor', exact: true }).click();
    const row = page.locator('tr', { has: page.getByText(fx.contractorName, { exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    fx.contractorId = await row.getAttribute('data-ops-view-contractor');

    await row.click();
    await page.getByRole('button', { name: '+ Add person', exact: true }).click();
    await page.locator('#opsPersonContractorId').selectOption({ label: `${fx.contractorName} (Company)` });
    await page.locator('#opsPersonFullName').fill(fx.personName);
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    const prow = page.locator('tr', { has: page.getByText(fx.personName, { exact: true }) });
    await expect(prow).toHaveCount(1, { timeout: 10_000 });
    fx.personId = await prow.getAttribute('data-ops-open-person');

    await addCourseViaUi(page, fx.courseName, 12);
    const cat = await openPanel(page, 'Course Catalog');
    const crow = cat.locator('tr', { has: page.getByRole('button', { name: fx.courseName, exact: true }) });
    await expect(crow).toHaveCount(1, { timeout: 10_000 });
    fx.courseId = await crow.getByRole('button', { name: fx.courseName, exact: true }).getAttribute('data-ops-view-course');

    const m = await openPanel(page, 'Training Matrix');
    const cell = m.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`);
    await cell.click(); await expect(cell).toHaveAttribute('data-state', 'applicable');
    await cell.click(); await expect(cell).toHaveAttribute('data-state', 'compulsory');
  });

  test('FIX-002: course form shows a red message for a duplicate name, a name over 100 characters, bad validity and an empty name', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    const tryAdd = async (name, validity) => {
      const cat = await openPanel(page, 'Course Catalog');
      if (!(await page.locator('#opsCourseName').count())) await cat.getByRole('button', { name: '+ Add course', exact: true }).click();
      await page.locator('#opsCourseName').fill(name);
      await page.locator('#opsCourseValidity').fill(validity === undefined ? '' : String(validity));
      await page.getByRole('button', { name: 'Add course', exact: true }).click();
    };
    await tryAdd('   ');
    await expect(page.locator('#opsTrainingCourseForm .ops-field-error')).toContainText('Enter a course name');
    await tryAdd(fx.courseName.toUpperCase() + '  ');
    await expect(page.locator('#opsTrainingCourseForm .ops-field-error')).toContainText('already exists');
    // fill() respects maxlength, so set the value directly to prove the code check as well as the input limit.
    await expect(page.locator('#opsCourseName')).toHaveAttribute('maxlength', '100');
    await page.locator('#opsCourseName').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, `${TAG} ` + 'L'.repeat(120));
    await page.getByRole('button', { name: 'Add course', exact: true }).click();
    await expect(page.locator('#opsTrainingCourseForm .ops-field-error')).toContainText('limit is 100');
    await tryAdd(`${TAG} NegValidity`, -1);
    await expect(page.locator('#opsTrainingCourseForm .ops-field-error')).toContainText('1 to 120');
    await tryAdd(`${TAG} BigValidity`, 999);
    await expect(page.locator('#opsTrainingCourseForm .ops-field-error')).toContainText('1 to 120');
    // The invalid input stays in the form, the red field is marked, and nothing was created.
    await expect(page.locator('#opsTrainingCourseForm .ops-field-invalid')).toHaveCount(1);
    const cat = await openPanel(page, 'Course Catalog');
    await expect(cat.locator('tr', { hasText: `${TAG} NegValidity` })).toHaveCount(0);
    await expect(cat.locator('tr', { hasText: `${TAG} BigValidity` })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('FIX-003: archived courses move to a collapsed "Archived courses" list, and an unused course can be deleted', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    const name = `${TAG} Archive Then Delete`;
    await addCourseViaUi(page, name, undefined);
    let cat = await openPanel(page, 'Course Catalog');
    await cat.getByRole('button', { name, exact: true }).click();
    await page.locator('#opsCourseActive').uncheck();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    cat = await openPanel(page, 'Course Catalog');
    await expect(cat.locator('.ops-archived-list tr', { hasText: name })).toHaveCount(1);
    await expect(cat.locator('.ops-archived-list')).not.toHaveJSProperty('open', true);
    await expect(cat.locator('table.ops-table').first().locator('tr', { hasText: name })).toHaveCount(0);

    // Delete it (no records, so allowed).
    await cat.locator('.ops-archived-list summary').click();
    await cat.locator('.ops-archived-list').getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Delete course', exact: true }).click();
    cat = await openPanel(page, 'Course Catalog');
    await expect(cat.locator('tr', { hasText: name })).toHaveCount(0, { timeout: 15_000 });
  });

  test('FIX-004: a Completed record needs evidence, keeps what was typed when it is refused, and saves with a file chosen in the form', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await openPerson(page);
    const s = await openSection(page);
    await s.getByRole('button', { name: '+ Add record', exact: true }).click();

    // Add record button comes after the evidence box.
    const order = await page.locator('#opsTrainingRecordForm').evaluate(f => {
      const kids = [...f.querySelectorAll('#opsRecordNewFiles, button[type="submit"]')];
      return kids.map(k => k.id || k.type);
    });
    expect(order).toEqual(['opsRecordNewFiles', 'submit']);

    await page.locator('#opsRecordStatus').selectOption('Completed');
    await page.locator('#opsRecordProvider').fill('Typed provider');
    await page.locator('#opsRecordNotes').fill('Typed notes');
    await page.getByRole('button', { name: 'Add record', exact: true }).click();
    await expect(page.locator('#opsRecordEvidenceBlock .ops-field-error')).toContainText('Add at least one evidence file');
    await expect(page.locator('#opsRecordProvider')).toHaveValue('Typed provider');
    await expect(page.locator('#opsRecordNotes')).toHaveValue('Typed notes');
    await expect(page.locator('#opsRecordStatus')).toHaveValue('Completed');

    await page.locator('#opsRecordNewFiles').setInputFiles(pdf('fix-evidence-1.pdf'));
    await page.getByRole('button', { name: 'Add record', exact: true }).click();
    const card = (await openSection(page)).locator('.ops-record-current');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Completed');
    await expect(card).toContainText('Typed provider');
    await expect(card.getByRole('button', { name: 'fix-evidence-1.pdf', exact: true })).toBeVisible();
    fx.recordId = await card.locator('[data-ops-edit-record]').getAttribute('data-ops-edit-record');
    expect(fx.recordId).toBeTruthy();
  });

  test('FIX-005: Edit opens the fields in place, closes other courses, and typed values survive adding a file', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await openPerson(page);
    const s = await openSection(page);
    await s.locator(`[data-ops-edit-record="${fx.recordId}"]`).click();

    await expect(page.locator('#opsTrainingRecordForm')).toHaveCount(1);
    await expect(s.locator('[data-ops-editing-card] #opsTrainingRecordForm')).toHaveCount(1);
    // Saved values are filled in, not blank.
    await expect(page.locator('#opsRecordProvider')).toHaveValue('Typed provider');
    await expect(page.locator('#opsRecordStatus')).toHaveValue('Completed');
    // The editing card sits at the top of the screen.
    const top = await s.locator('[data-ops-editing-card]').evaluate(el => Math.round(el.getBoundingClientRect().top));
    const atBottom = await page.evaluate(() => window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2);
    expect(top < 160 || atBottom, `the record being edited should be scrolled to the top of the page (top=${top}px)`).toBeTruthy();
    // Other course sections are collapsed.
    await expect(page.locator('details.ops-training-course[open]')).toHaveCount(1);

    await page.locator('#opsRecordProvider').fill('Edited provider');
    await page.locator('#opsRecordNotes').fill('Edited notes');
    await s.getByRole('button', { name: '+ Add file', exact: true }).click();
    await expect(page.locator('#opsRecordProvider')).toHaveValue('Edited provider');
    await s.locator(`input[data-ops-evidence-input="${fx.recordId}"][type="file"]`).last().setInputFiles(pdf('fix-evidence-2.pdf'));
    await expect(s.getByRole('button', { name: 'fix-evidence-2.pdf', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#opsRecordProvider')).toHaveValue('Edited provider');
    await expect(page.locator('#opsRecordNotes')).toHaveValue('Edited notes');

    // The same file name cannot be attached twice.
    await s.getByRole('button', { name: '+ Add file', exact: true }).click();
    await s.locator(`input[data-ops-evidence-input="${fx.recordId}"][type="file"]`).last().setInputFiles(pdf('FIX-Evidence-2.PDF'));
    await expect(s.locator('.ops-field-error')).toContainText('already attached');
    await expect(s.locator('.ops-evidence-link', { hasText: /fix-evidence-2\.pdf/i })).toHaveCount(1);

    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(s.locator('.ops-record-current')).toContainText('Edited provider', { timeout: 10_000 });
  });

  test('FIX-006: expiry follows the completed date, and impossible dates are refused with a red message', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await openPerson(page);
    const s = await openSection(page);
    const today = nzToday();

    await s.locator(`[data-ops-edit-record="${fx.recordId}"]`).click();
    await page.locator('#opsRecordCompletedDate').fill('2024-02-29');
    await expect(page.locator('#opsRecordExpiryDate')).toHaveValue('2025-02-28');
    await page.locator('#opsRecordCompletedDate').fill('2025-01-31');
    await expect(page.locator('#opsRecordExpiryDate')).toHaveValue('2026-01-31');
    // A hand-typed expiry is not overwritten when the completed date changes.
    await page.locator('#opsRecordExpiryDate').fill(shift(today, 100));
    await page.locator('#opsRecordCompletedDate').fill(shift(today, -30));
    await expect(page.locator('#opsRecordExpiryDate')).toHaveValue(shift(today, 100));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    const refused = async (label, fields, message, errorField) => {
      await editRecord(page, fields);
      await expect(page.locator(`#${errorField}`).locator('xpath=ancestor::label[1]').locator('.ops-field-error'), label).toContainText(message);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    };
    await refused('expiry before completed', { completed: shift(today, -10), expiry: shift(today, -20) }, 'must be after the completed date', 'opsRecordExpiryDate');
    await refused('1900s', { completed: '1999-05-01', expiry: '' }, 'before 2000', 'opsRecordCompletedDate');
    await refused('far future expiry', { completed: shift(today, -10), expiry: '2099-01-01' }, 'more than 5 years', 'opsRecordExpiryDate');
    await refused('future completed', { completed: shift(today, 10), expiry: '' }, 'cannot be in the future', 'opsRecordCompletedDate');

    const pill = async () => (await s.locator('summary .ops-pill').allInnerTexts()).join(' | ');
    await editRecord(page, { completed: shift(today, -100), expiry: today });
    await expect(s.locator('summary .ops-pill', { hasText: 'Expired' })).toBeVisible({ timeout: 10_000 });
    await editRecord(page, { completed: shift(today, -100), expiry: shift(today, -1) });
    await expect(s.locator('summary .ops-pill', { hasText: 'Expired' })).toBeVisible({ timeout: 10_000 });
    await editRecord(page, { completed: shift(today, -100), expiry: shift(today, 29) });
    await expect(s.locator('summary .ops-pill', { hasText: 'Expires in 29d' }), await pill()).toBeVisible({ timeout: 10_000 });
    await editRecord(page, { completed: shift(today, -100), expiry: shift(today, 31) });
    await expect(s.locator('summary .ops-pill', { hasText: 'In date' })).toBeVisible({ timeout: 10_000 });
  });

  test('FIX-007: older records sit in a collapsed "Previous records" list under a clearly marked current record, and a double click adds one record', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await openPerson(page);
    const s = await openSection(page);
    const before = await s.locator('[data-ops-record-card]').count();
    await s.getByRole('button', { name: '+ Add record', exact: true }).click();
    await page.locator('#opsRecordStatus').selectOption('In progress');
    await page.locator('#opsRecordCompletedDate').fill(nzToday());
    await page.locator('#opsRecordProvider').fill('Double click provider');
    await page.getByRole('button', { name: 'Add record', exact: true }).dblclick();
    await expect(s.locator('[data-ops-record-card]')).toHaveCount(before + 1, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(s.locator('[data-ops-record-card]')).toHaveCount(before + 1);
    await expect(s.locator('.ops-record-current')).toHaveCount(1);
    const prev = s.locator('details.ops-prev-records');
    await expect(prev.locator('summary')).toContainText('Previous records (1)');
    await expect(prev).not.toHaveJSProperty('open', true);
  });

  test('FIX-008: a sole trader can have only one person, and archived contractors move to their own collapsed list', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await goToTab(page, 'Contractors');
    await page.getByRole('button', { name: '+ Add contractor', exact: true }).click();
    await page.locator('#opsContractorName').fill(fx.soleName);
    await page.locator('#opsContractorType').selectOption('sole_trader');
    await page.locator('#opsContractorAdminName').fill(`${TAG} Sole Person`);
    await page.locator('#opsContractorAdminEmail').fill('not-an-email');
    await page.getByRole('button', { name: 'Add contractor', exact: true }).click();
    await expect(page.locator('#opsTrainingContractorForm .ops-field-error')).toContainText('valid email');
    await page.locator('#opsContractorAdminEmail').fill('sole@example.invalid');
    await page.getByRole('button', { name: 'Add contractor', exact: true }).click();
    const row = page.locator('tr', { has: page.getByText(fx.soleName, { exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    fx.soleId = await row.getAttribute('data-ops-view-contractor');

    // The first administrator was saved as a real person: a sole trader's one person is also the worker.
    await row.click();
    await expect(page.locator('tr', { has: page.getByText(`${TAG} Sole Person`, { exact: true }) })).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: '+ Add person', exact: true })).toHaveCount(0);

    // Archive the sole trader: it leaves the main list and shows under the collapsed archived list.
    await goToTab(page, 'Contractors');
    await page.locator(`tr[data-ops-view-contractor="${fx.soleId}"] label.ops-toggle-pill`).click();
    await expect(page.locator('details.ops-collapsible', { hasText: 'Archived contractors' })).toHaveCount(1, { timeout: 10_000 });
    const archivedDetails = page.locator('details.ops-collapsible', { hasText: 'Archived contractors' });
    await expect(archivedDetails).not.toHaveJSProperty('open', true);
    await expect(archivedDetails.locator(`tr[data-ops-view-contractor="${fx.soleId}"]`)).toHaveCount(1);
  });

  test('FIX-009: quick Matrix clicks each count, and the page does not jump', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    const m = await openPanel(page, 'Training Matrix');
    const cell = () => page.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`);
    // compulsory -> off with one click, then two quick clicks -> compulsory
    await cell().scrollIntoViewIfNeeded();
    await cell().click();
    await expect(cell()).toHaveAttribute('data-state', 'off');
    const y0 = await page.evaluate(() => window.scrollY);
    await cell().click({ delay: 0 });
    await cell().click({ delay: 0 }).catch(() => {});
    await expect(cell()).toHaveAttribute('data-state', 'compulsory', { timeout: 15_000 });
    const y1 = await page.evaluate(() => window.scrollY);
    expect(Math.abs(y1 - y0), 'the page should stay where it was after a Matrix click').toBeLessThan(5);
    void m;
  });

  test('FIX-010: browser Back steps through tabs, and a refresh stays on the same screen', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await goToTab(page, 'Team members');
    await goToTab(page, 'Register');
    await page.goBack();
    await expect(page.locator('#opsNav button.active')).toHaveText('Team members');
    await page.goBack();
    await expect(page.locator('#opsNav button.active')).toHaveText('Dashboard');
    await page.goForward();
    await expect(page.locator('#opsNav button.active')).toHaveText('Team members');
    await goToTab(page, 'Contractors');
    await page.reload();
    await expect(page.locator('#opsShell h2')).toHaveText('Training', { timeout: 20_000 });
    await expect(page.locator('#opsNav button.active')).toHaveText('Contractors');
  });

  test('FIX-011: there is clear space between the top of the page and the Home button, and between forms and the lists below them', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    for (const tab of ['Dashboard', 'Team members', 'Contractors', 'Settings', 'Register']) {
      await goToTab(page, tab);
      const gap = await page.evaluate(() => document.querySelector('#opsShell .ops-home-btn').getBoundingClientRect().top - document.querySelector('#operations').getBoundingClientRect().top);
      expect(gap, `${tab}: space above the Home button`).toBeGreaterThanOrEqual(16);
    }
    await goToTab(page, 'Contractors');
    await page.getByRole('button', { name: '+ Add contractor', exact: true }).click();
    const gaps = await page.evaluate(() => {
      const f = document.querySelector('#opsTrainingContractorForm');
      const fr = f.getBoundingClientRect();
      const next = document.querySelector('#opsShell .ops-table-wrap').getBoundingClientRect();
      const heading = document.querySelector('#opsShell .ops-section-title').getBoundingClientRect();
      return { formToList: next.top - fr.bottom, headingToForm: fr.top - heading.bottom };
    });
    expect(gaps.formToList).toBeGreaterThanOrEqual(16);
    expect(gaps.headingToForm).toBeGreaterThanOrEqual(12);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('FIX-012: contractor administrators (who may not be workers) and fuller business details', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await goToTab(page, 'Contractors');
    await page.getByRole('button', { name: '+ Add contractor', exact: true }).click();
    await page.locator('#opsContractorName').fill(fx.contractorName);
    await page.locator('#opsContractorType').selectOption('company');
    await page.locator('#opsContractorAdminName').fill(`${TAG} Office Admin`);
    await page.locator('#opsContractorAdminPhone').fill('021 555 0199');
    await page.locator('#opsContractorAdminWorks').uncheck();
    await page.locator('.ops-business-details > summary').click();
    await page.locator('#opsContractorLegalName').fill(`${TAG} Holdings Limited`);
    await page.locator('#opsContractorNzbn').fill('123');
    await page.getByRole('button', { name: 'Add contractor', exact: true }).click();
    await expect(page.locator('#opsTrainingContractorForm .ops-field-error')).toContainText('13 digits');
    await page.locator('#opsContractorNzbn').fill('9429000000000');
    await page.getByRole('button', { name: 'Add contractor', exact: true }).click();
    const row = page.locator('tr', { has: page.getByText(fx.contractorName, { exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText(`${TAG} Office Admin`);
    fx.contractorId = await row.getAttribute('data-ops-view-contractor');

    // Contractor page: business details summary, admin listed as a company administrator.
    await row.click();
    await expect(page.locator('.ops-detail-list')).toContainText(`${TAG} Holdings Limited`);
    const adminRow = page.locator('tr', { has: page.getByText(`${TAG} Office Admin`, { exact: true }) });
    await expect(adminRow).toContainText('Company administrator');
    await expect(adminRow).toContainText('021 555 0199');

    // Administrators who do not work on jobs are not in the Matrix.
    const matrix = await openPanel(page, 'Training Matrix');
    await expect(matrix.getByText(`${TAG} Office Admin`)).toHaveCount(0);

    // A second administrator who also works on jobs, added from the contractor page, is in the Matrix.
    await goToTab(page, 'Contractors');
    await page.locator(`tr[data-ops-view-contractor="${fx.contractorId}"]`).click();
    await page.getByRole('button', { name: '+ Add person', exact: true }).click();
    await page.locator('#opsPersonContractorId').selectOption({ label: `${fx.contractorName} (Company)` });
    await page.locator('#opsPersonFullName').fill(`${TAG} Working Admin`);
    await page.locator('#opsPersonIsAdmin').check();
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    await expect(page.locator('tr', { has: page.getByText(`${TAG} Working Admin`, { exact: true }) })).toContainText('Administrator and worker', { timeout: 10_000 });
    await expect(page.locator('tr', { has: page.getByText(`${TAG} Office Admin`, { exact: true }) })).toHaveCount(1);
    const matrix2 = await openPanel(page, 'Training Matrix');
    await expect(matrix2.getByText(`${TAG} Working Admin`).first()).toBeVisible();
    await expect(matrix2.getByText(`${TAG} Office Admin`)).toHaveCount(0);

    // A person must have at least one role.
    await goToTab(page, 'Contractors');
    await page.locator(`tr[data-ops-view-contractor="${fx.contractorId}"]`).click();
    await page.getByRole('button', { name: '+ Add person', exact: true }).click();
    await page.locator('#opsPersonContractorId').selectOption({ label: `${fx.contractorName} (Company)` });
    await page.locator('#opsPersonFullName').fill(`${TAG} No Role`);
    await page.locator('#opsPersonNeedsTraining').uncheck();
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    await expect(page.locator('#opsTrainingPersonForm .ops-field-error')).toContainText('no role');
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    acceptDialogsAndCapture(page);
    try {
      await signIn(page, config);
      await openTraining(page);
      await safeCleanup('records', async () => {
        if (!fx.personId || !fx.courseId) return;
        await openPerson(page);
        const s = await openSection(page);
        if (await s.locator('details.ops-prev-records').count()) await s.locator('details.ops-prev-records summary').click();
        for (let i = 0; i < 8 && (await s.locator('[data-ops-delete-record]').count()); i++) {
          await s.locator('[data-ops-delete-record]').first().click();
          await page.waitForTimeout(1200);
        }
      });
      await safeCleanup('person', async () => {
        for (const id of [fx.personId]) {
          if (!id) continue;
          await goToTab(page, 'Team members');
          await page.locator(`[data-ops-open-person="${id}"]`).first().click();
          const cb = page.locator(`input[data-ops-toggle-training-person-active="${id}"]`);
          if (await cb.isChecked()) await cb.uncheck();
        }
      });
      await safeCleanup('tagged people', async () => {
        for (let round = 0; round < 8; round++) {
          await goToTab(page, 'Team members');
          const ids = await page.locator('tr[data-ops-open-person]').evaluateAll(els => els.filter(e => /E2E-UI-SUITE-TRAINFIX-/.test(e.textContent)).map(e => e.getAttribute('data-ops-open-person')));
          if (!ids.length) break;
          await page.locator(`[data-ops-open-person="${ids[0]}"]`).first().click();
          const cb = page.locator(`input[data-ops-toggle-training-person-active="${ids[0]}"]`);
          if (await cb.isChecked()) await cb.uncheck();
          await page.waitForTimeout(800);
        }
      });
      await safeCleanup('contractors', async () => {
        await goToTab(page, 'Contractors');
        const ids = await page.locator('tr[data-ops-view-contractor]').evaluateAll(els => els.filter(e => /E2E-UI-SUITE-TRAINFIX-/.test(e.textContent)).map(e => e.getAttribute('data-ops-view-contractor')));
        for (const id of ids) {
          await goToTab(page, 'Contractors');
          const cb = page.locator(`tr[data-ops-view-contractor="${id}"] input[data-ops-toggle-contractor-active]`);
          if (await cb.count() && await cb.isChecked()) { await cb.evaluate(el => el.click()); await page.waitForTimeout(800); }
        }
      });
      await safeCleanup('stray courses from this suite', async () => {
        for (let round = 0; round < 6; round++) {
          const cat = await openPanel(page, 'Course Catalog');
          const archivedList = cat.locator('.ops-archived-list');
          if (await archivedList.count() && !(await archivedList.evaluate(el => el.open))) await archivedList.locator('summary').click();
          const ids = await cat.locator('[data-ops-view-course]').evaluateAll(els => els.filter(e => /E2E-UI-SUITE-TRAINFIX-/.test(e.textContent) && !/Course$/.test(e.textContent.trim())).map(e => e.getAttribute('data-ops-view-course')));
          if (!ids.length) break;
          await cat.locator(`[data-ops-view-course="${ids[0]}"]`).click();
          const del = page.getByRole('button', { name: 'Delete course', exact: true });
          if (await del.count()) await del.click(); else break;
          await page.waitForTimeout(1200);
        }
      });
      await safeCleanup('courses', async () => {
        if (!fx.courseId) return;
        const cat = await openPanel(page, 'Course Catalog');
        const link = cat.locator(`[data-ops-view-course="${fx.courseId}"]`);
        if (!(await link.count())) return;
        await link.click();
        const del = page.getByRole('button', { name: 'Delete course', exact: true });
        if (await del.count()) await del.click();
        else {
          const cb = page.locator('#opsCourseActive');
          if (await cb.isChecked()) { await cb.uncheck(); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); }
        }
      });
    } finally {
      await page.close();
    }
  });
});
