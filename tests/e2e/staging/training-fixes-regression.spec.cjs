const { test, expect } = require('@playwright/test');
const { getStagingTrainingConfig } = require('../support/staging-training-config.cjs');
const { buildFixtureTag, signIn, acceptDialogsAndCapture, withPopup, safeCleanup } = require('../support/ui-suite-helpers.cjs');

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
  adminCoName: `${TAG} Admin Co`,
  adminCoId: null,
  personName: `${TAG} Worker`,
  courseName: `${TAG} Course`,
  courseBName: `${TAG} Course B`,
  courseBId: null,
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
  // Let the background data load finish so a late redraw cannot wipe a form the test is filling in.
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(400);
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
    // ...and is not hidden behind the sticky banner/header bars.
    const hidden = await s.locator('[data-ops-editing-card]').evaluate(el => { let b = 0; document.querySelectorAll('header, #stagingEnvironmentBanner').forEach(h => { const pos = getComputedStyle(h).position; if(pos === 'sticky' || pos === 'fixed') b = Math.max(b, h.getBoundingClientRect().bottom); }); const t = el.getBoundingClientRect().top; return {t, b}; });
    const atBottom2 = await page.evaluate(() => window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2);
    expect(hidden.t >= hidden.b - 1 || atBottom2, `the edited record starts at ${hidden.t}px but the bars cover the top ${hidden.b}px`).toBeTruthy();
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
    expect(gaps.headingToForm).toBeGreaterThanOrEqual(8);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('FIX-012: contractor administrators (who may not be workers) and fuller business details', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await goToTab(page, 'Contractors');
    await page.getByRole('button', { name: '+ Add contractor', exact: true }).click();
    await page.locator('#opsContractorName').fill(fx.adminCoName);
    await page.locator('#opsContractorType').selectOption('company');
    await page.locator('#opsContractorAdminName').fill(`${TAG} Office Admin`);
    await page.locator('#opsContractorAdminPhone').fill('021 555 0199');
    await page.locator('#opsContractorAdminWorks').uncheck();
    await page.locator('.ops-business-details > summary').click();
    await expect(page.locator('.ops-business-details'), 'Business details should open when its heading is clicked').toHaveJSProperty('open', true, { timeout: 5000 });
    console.log('BUSINESS DETAILS BOX', JSON.stringify(await page.locator('.ops-business-details').evaluate(d => ({open: d.open, h: d.getBoundingClientRect().height, inner: getComputedStyle(d.querySelector('.ops-form')).display}))));
    await page.locator('#opsContractorLegalName').fill(`${TAG} Holdings Limited`);
    await page.locator('#opsContractorNzbn').fill('123');
    await page.getByRole('button', { name: 'Add contractor', exact: true }).click();
    await expect(page.locator('#opsTrainingContractorForm .ops-field-error')).toContainText('13 digits');
    await page.locator('#opsContractorNzbn').fill('9429000000000');
    await page.getByRole('button', { name: 'Add contractor', exact: true }).click();
    const row = page.locator('tr', { has: page.getByText(fx.adminCoName, { exact: true }) });
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText(`${TAG} Office Admin`);
    fx.adminCoId = await row.getAttribute('data-ops-view-contractor');

    // Contractor page: business details summary, admin listed as a company administrator.
    await row.click();
    await expect(page.locator('.ops-detail-list')).toContainText(`${TAG} Holdings Limited`);
    const adminRow = page.locator('tr', { has: page.getByText(`${TAG} Office Admin`, { exact: true }) });
    await expect(adminRow).toContainText('Company administrator');
    await expect(adminRow).toContainText('021 555 0199');
    await expect(page.locator('.ops-contacts-line')).toContainText('Primary contact:');

    // Administrators who do not work on jobs are not in the Matrix.
    const matrix = await openPanel(page, 'Training Matrix');
    await expect(matrix.getByText(`${TAG} Office Admin`)).toHaveCount(0);

    // A second administrator who also works on jobs, added from the contractor page, is in the Matrix.
    await goToTab(page, 'Contractors');
    await page.locator(`tr[data-ops-view-contractor="${fx.adminCoId}"]`).click();
    await page.getByRole('button', { name: '+ Add person', exact: true }).click();
    await page.locator('#opsPersonContractorId').selectOption({ label: `${fx.adminCoName} (Company)` });
    await page.locator('#opsPersonFullName').fill(`${TAG} Working Admin`);
    await page.locator('#opsPersonIsAdmin').check();
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    await expect(page.locator('tr', { has: page.getByText(`${TAG} Working Admin`, { exact: true }) })).toContainText('Administrator and worker', { timeout: 10_000 });
    await expect(page.locator('.ops-contacts-line')).toContainText('Contacts:');
    await expect(page.locator('tr', { has: page.getByText(`${TAG} Office Admin`, { exact: true }) })).toHaveCount(1);
    const matrix2 = await openPanel(page, 'Training Matrix');
    await expect(matrix2.getByText(`${TAG} Working Admin`).first()).toBeVisible();
    await expect(matrix2.getByText(`${TAG} Office Admin`)).toHaveCount(0);

    // A person must have at least one role.
    await goToTab(page, 'Contractors');
    await page.locator(`tr[data-ops-view-contractor="${fx.adminCoId}"]`).click();
    await page.getByRole('button', { name: '+ Add person', exact: true }).click();
    await page.locator('#opsPersonContractorId').selectOption({ label: `${fx.adminCoName} (Company)` });
    await page.locator('#opsPersonFullName').fill(`${TAG} No Role`);
    await page.locator('#opsPersonNeedsTraining').uncheck();
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    await expect(page.locator('#opsTrainingPersonForm .ops-field-error')).toContainText('no role');
  });

  test('FIX-013: a person\'s courses start collapsed, opening one closes the others, and Edit lands below the header bars', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await addCourseViaUi(page, fx.courseBName, 12);
    const cat = await openPanel(page, 'Course Catalog');
    const brow = cat.locator('tr', { has: page.getByRole('button', { name: fx.courseBName, exact: true }) });
    await expect(brow).toHaveCount(1, { timeout: 10_000 });
    fx.courseBId = await brow.getByRole('button', { name: fx.courseBName, exact: true }).getAttribute('data-ops-view-course');
    const m = await openPanel(page, 'Training Matrix');
    const cell = m.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseBId}"]`);
    await cell.click();
    await expect(cell).toHaveAttribute('data-state', 'applicable');

    await openPerson(page);
    const sections = page.locator('details.ops-training-course');
    await expect(sections).toHaveCount(2);
    await expect(page.locator('details.ops-training-course[open]')).toHaveCount(0);
    const a = section(page), b = page.locator(`details[data-ops-course-id="${fx.courseBId}"]`);
    await a.locator('summary').first().click();
    await expect(a).toHaveJSProperty('open', true);
    await b.locator('summary').first().click();
    await expect(b).toHaveJSProperty('open', true);
    await expect(a).toHaveJSProperty('open', false);
    await b.locator('summary').first().click();
    await expect(page.locator('details.ops-training-course[open]')).toHaveCount(0);
  });

  test('FIX-014: courses are reordered by dragging only (no arrow buttons), there is no Display order field, and the order is kept', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    let cat = await openPanel(page, 'Course Catalog');
    await cat.getByRole('button', { name: '+ Add course', exact: true }).click();
    await expect(page.locator('#opsCourseOrder')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    const idx = async () => (await page.locator('tr[data-ops-course-row]').evaluateAll(els => els.map(e => e.getAttribute('data-ops-course-row'))));
    cat = await openPanel(page, 'Course Catalog');
    let ids = await idx();
    expect(ids).toContain(fx.courseId);
    expect(ids).toContain(fx.courseBId);
    await expect(page.locator('[data-ops-course-move]')).toHaveCount(0);
    const gripW = await page.locator('th.ops-grip-cell').first().evaluate(e => e.getBoundingClientRect().width);
    expect(gripW, 'grip column should be narrow').toBeLessThanOrEqual(50);
    // Drag: put B directly above A, then A directly above B.
    const rowA = () => page.locator(`tr[data-ops-course-row="${fx.courseId}"]`);
    const rowB = () => page.locator(`tr[data-ops-course-row="${fx.courseBId}"]`);
    await rowB().dragTo(rowA());
    await expect.poll(async () => { const i = await idx(); return i.indexOf(fx.courseBId) < i.indexOf(fx.courseId); }, { timeout: 10_000 }).toBeTruthy();
    await rowA().dragTo(rowB());
    await expect.poll(async () => { const i = await idx(); return i.indexOf(fx.courseId) < i.indexOf(fx.courseBId); }, { timeout: 10_000 }).toBeTruthy();
    const finalOrder = await idx();
    // Saved: a reload shows the same order.
    await page.reload();
    await expect(page.locator('#opsShell h2')).toHaveText('Training', { timeout: 20_000 });
    cat = await openPanel(page, 'Course Catalog');
    expect(await idx()).toEqual(finalOrder);
  });

  test('FIX-015: the Register has a course filter, fits inside its card, downloads evidence as a zip, and each record has a download button', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await goToTab(page, 'Register');
    // The Register tab opens with both panels collapsed.
    await expect(page.locator('#opsRegisterPanel')).toHaveJSProperty('open', false);
    await expect(page.locator('#opsEvidencePanel')).toHaveJSProperty('open', false);
    await page.locator('#opsRegisterPanel > summary').click();
    await page.locator('#opsRegisterCourse').selectOption(fx.courseId);
    const table = page.locator('.ops-register-table');
    await expect(table).toBeVisible();
    await expect(table).toContainText(fx.personName);
    await expect(table).not.toContainText(fx.courseBName);
    const fit = await page.locator('.ops-register-table').evaluate(t => { const card = t.closest('.ops-card'); const c = card.getBoundingClientRect(); const w = t.closest('.ops-table-wrap'); return { right: c.right, tableRight: t.getBoundingClientRect().right, wrapScroll: w.scrollWidth - w.clientWidth }; });
    expect(fit.tableRight, 'the Register table should not run past the right edge of its card').toBeLessThanOrEqual(fit.right + 1);
    expect(fit.wrapScroll, 'the Register table should fit without sideways scrolling on a desktop screen').toBeLessThanOrEqual(1);

    // Table is view-only; the key line is not on screen.
    await expect(page.locator('[data-ops-register-select]')).toHaveCount(0);
    await expect(page.locator('.ops-register-key')).toHaveCount(0);
    // Evidence panel: search, pick, summary, download.
    const panel = page.locator('#opsEvidencePanel');
    await expect(panel).toBeVisible();
    const regBox = await page.locator('.ops-register-table').boundingBox();
    expect((await panel.boundingBox()).y, 'panel sits below the register').toBeGreaterThan(regBox.y);
    await panel.locator('summary').first().click();
    await panel.locator('#opsEvidencePick > summary').click();
    await panel.locator('#opsEvidenceSearch').fill(fx.personName);
    const row = panel.locator('[data-ops-evidence-row]:visible', { hasText: fx.personName });
    await expect(row).toHaveCount(1);
    await row.locator('input').check();
    await expect(panel.locator('#opsEvidenceSummary')).toContainText(/1 person selected · \d+ files?/);
    await panel.locator('[data-ops-evidence-quick="clear"]').click();
    await expect(panel.locator('#opsEvidenceSummary')).toContainText('0 people selected');
    await expect(panel.locator('#opsEvidencePickLabel')).toContainText('Select people');
    await panel.locator('[data-ops-evidence-quick="employees"]').click();
    await expect(panel.locator('#opsEvidenceSummary')).not.toContainText('0 people selected');
    await panel.locator('[data-ops-evidence-quick="clear"]').click();
    await row.locator('input').check();
    // Dropdown closes on an outside click and on Esc.
    await expect(panel.locator('#opsEvidencePick')).toHaveJSProperty('open', true);
    await page.locator('h3', { hasText: 'Training & Competency Register' }).click();
    await expect(panel.locator('#opsEvidencePick')).toHaveJSProperty('open', false);
    await panel.locator('#opsEvidencePick > summary').click();
    await page.keyboard.press('Escape');
    await expect(panel.locator('#opsEvidencePick')).toHaveJSProperty('open', false);
    // Register is collapsible.
    await page.locator('#opsRegisterPanel > summary').click();
    await expect(page.locator('.ops-register-table')).toBeHidden();
    await page.locator('#opsRegisterPanel > summary').click();
    await expect(page.locator('.ops-register-table')).toBeVisible();
    const dl = panel.locator('#opsEvidenceDownload');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), dl.click()]);
    expect(download.suggestedFilename()).toMatch(/^training-evidence-\d{4}-\d{2}-\d{2}\.zip$/);

    await openPerson(page);
    const s = await openSection(page);
    await expect(s.locator('[data-ops-download-record]').first()).toBeAttached();
  });

  test('FIX-019: round 3 layouts - person header on one row, two-column record form, matrix fixed widths', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await openPerson(page);
    const head = await page.evaluate(() => {
      const h = document.querySelector('.ops-person-head'); const kids = [...h.children].filter(e => !e.classList.contains('ops-person-head-actions')).map(e => e.getBoundingClientRect());
      return { sameRow: kids.every(k => Math.abs(k.top - kids[0].top) < 30), height: h.getBoundingClientRect().height };
    });
    expect(head.sameRow, 'back button, name and designation share a row').toBeTruthy();
    let s = await openSection(page);
    await s.getByRole('button', { name: '+ Add record', exact: true }).click();
    await expect(page.locator('#opsTrainingRecordForm')).not.toContainText('Fills in automatically');
    const lay = await page.evaluate(() => {
      const r = id => document.getElementById(id).closest('label').getBoundingClientRect();
      return { status: r('opsRecordStatus'), completed: r('opsRecordCompletedDate'), expiry: r('opsRecordExpiryDate'), provider: r('opsRecordProvider'), ref: r('opsRecordReference'), notes: r('opsRecordNotes') };
    });
    expect(Math.abs(lay.status.top - lay.completed.top)).toBeLessThan(4);
    expect(Math.abs(lay.completed.top - lay.expiry.top)).toBeLessThan(4);
    expect(lay.provider.top).toBeGreaterThan(lay.status.bottom - 2);
    expect(Math.abs(lay.provider.top - lay.ref.top)).toBeLessThan(4);
    expect(lay.notes.left).toBeGreaterThan(lay.expiry.right - 4);
    expect(lay.notes.height).toBeGreaterThan(lay.status.height * 1.8);
    const before = lay.notes.height;
    // A user's drag sets an inline height on the textarea; the layout must follow it.
    await page.locator('#opsRecordNotes').evaluate(e => { e.style.height = '240px'; });
    const after = (await page.locator('#opsRecordNotes').boundingBox()).height;
    await expect(page.locator('#opsRecordNotes')).toHaveCSS('resize', 'vertical');
    expect(after, 'Notes box follows a resize').toBeGreaterThan(before + 40);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const cat = await openPanel(page, 'Course Catalog');
    await expect(cat.locator('h3', { hasText: 'Course Catalog' })).toHaveCount(1);
    await expect(cat).not.toContainText('use the arrows');
    await cat.getByRole('button', { name: '+ Add course', exact: true }).click();
    await expect(page.locator('#opsCourseDescription')).toHaveCount(0);
    const cl = await page.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { v: r('opsCourseValidity'), n: r('opsCourseNzqaCodes') }; });
    expect(cl.v.width, 'Validity box is small').toBeLessThanOrEqual(130);
    expect(Math.abs(cl.v.top - cl.n.top), 'NZQA sits beside Validity').toBeLessThan(6);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await goToTab(page, 'Settings');
    const mat = await openPanel(page, 'Training Matrix').catch(() => null);
    const w = await page.evaluate(() => {
      const t = document.querySelector('.ops-matrix-table'); if (!t) return null;
      const heads = [...t.querySelectorAll('th.ops-matrix-head-cell')].map(e => Math.round(e.getBoundingClientRect().width));
      return { person: Math.round(t.querySelector('th.ops-matrix-person-head').getBoundingClientRect().width), heads };
    });
    if (w) {
      expect(w.person).toBeLessThanOrEqual(151);
      expect(new Set(w.heads).size, 'all course columns the same width').toBe(1);
    }
  });

  test('FIX-020: the app header scrolls away, nothing hides behind the banner on any Training page, and types read External Qualification / Internal Training', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    const check = async (label) => {
      await page.evaluate(() => window.scrollTo(0, 700));
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const b = document.getElementById('stagingEnvironmentBanner'); const h = document.querySelector('header');
        if (!b || !h) return null;
        const bb = b.getBoundingClientRect(); const hb = h.getBoundingClientRect();
        const pos = getComputedStyle(h).position;
        const probe = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(bb.bottom + 2));
        return { pos, headerBottom: hb.bottom, bannerBottom: bb.bottom, headerAtProbe: !!(probe && probe.closest('header')), bannerTop: bb.top, scrolled: window.scrollY, headerHeight: hb.height };
      });
      if (r) {
        expect(['sticky', 'fixed'], `${label}: header must not stay pinned`).not.toContain(r.pos);
        if (r.scrolled >= r.headerHeight + 5) {
          expect(r.headerBottom, `${label}: header has scrolled away`).toBeLessThanOrEqual(r.bannerBottom + 1);
          expect(r.headerAtProbe, `${label}: no header under the banner`).toBeFalsy();
        }
        expect(Math.abs(r.bannerTop), `${label}: banner stays at the top`).toBeLessThanOrEqual(1);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    };
    for (const tab of ['Dashboard', 'Team members', 'Contractors', 'Settings', 'Register']) {
      await goToTab(page, tab);
      await check(tab);
    }
    await openPerson(page);
    await check('Person page');
    const s = await openSection(page);
    await expect(s).toContainText(/External Qualification|Internal Training/);
    await expect(s).not.toContainText('formal qualification');
    const m = await openPanel(page, 'Training Matrix');
    await expect(m.locator('[data-ops-matrix-tab="external"]')).toContainText('External Qualification');
    await expect(m.locator('[data-ops-matrix-tab="internal"]')).toContainText('Internal Training');
  });

  test('FIX-016: when a Completed record is refused for missing evidence only the evidence box is red', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await openPerson(page);
    const findTmp = async () => {
      const sec = await openSection(page);
      const prev = sec.locator('details.ops-prev-records');
      for (let i = 0; i < await prev.count(); i++) if (!(await prev.nth(i).evaluate(e => e.open))) await prev.nth(i).locator('summary').click();
      return sec.locator('[data-ops-record-card]', { hasText: 'Tmp red-field check' });
    };
    let s = await openSection(page);
    await s.getByRole('button', { name: '+ Add record', exact: true }).click();
    await page.locator('#opsRecordProvider').fill('Tmp red-field check');
    await page.getByRole('button', { name: 'Add record', exact: true }).click();
    await expect(async () => { await expect(await findTmp()).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 20_000 });
    const card = await findTmp();
    await card.locator('[data-ops-edit-record]').click();
    await page.locator('#opsRecordStatus').selectOption('Completed');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.locator('#opsTrainingRecordForm .ops-field-error')).toHaveCount(1);
    await expect(page.locator('#opsTrainingRecordForm .ops-field-invalid')).toHaveCount(1);
    await expect(page.locator('#opsRecordEvidenceBlock')).toHaveClass(/ops-field-invalid/);
    await expect(page.locator('#opsRecordProvider')).not.toHaveCSS('border-top-color', 'rgb(220, 38, 38)');
    // Tidy up: cancel and delete the temporary record.
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    const tmp = await findTmp();
    await tmp.locator('[data-ops-delete-record]').click();
    await expect(tmp).toHaveCount(0, { timeout: 15_000 });
  });

  test('FIX-017: Matrix rows are all the same height even with a very long name, and clicks keep the scroll position', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await page.setViewportSize({ width: 1400, height: 520 });
    await signIn(page, config);
    await openTraining(page);
    await goToTab(page, 'Contractors');
    await page.locator(`tr[data-ops-view-contractor="${fx.contractorId}"]`).click();
    await page.getByRole('button', { name: '+ Add person', exact: true }).click();
    await page.locator('#opsPersonContractorId').selectOption({ label: `${fx.contractorName} (Company)` });
    await page.locator('#opsPersonFullName').fill(`${TAG} ` + 'W'.repeat(100));
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    await expect(page.locator('tr', { hasText: `${TAG} WWWW` })).toHaveCount(1, { timeout: 10_000 });

    const m = await openPanel(page, 'Training Matrix');
    const heights = await m.locator('.ops-matrix-table tr').evaluateAll(rows => rows.slice(1).map(r => Math.round(r.getBoundingClientRect().height)));
    expect(heights.length).toBeGreaterThan(2);
    expect(new Set(heights).size, `Matrix row heights should all match, got ${[...new Set(heights)].join(', ')}`).toBe(1);

    // Scroll the Matrix and the page, click a cell, and nothing should jump.
    await page.evaluate(() => { const w = document.querySelector('.ops-matrix-wrap'); w.scrollTop = Math.min(60, w.scrollHeight - w.clientHeight); window.scrollBy(0, 120); });
    const before = await page.evaluate(() => ({ wrap: document.querySelector('.ops-matrix-wrap').scrollTop, win: window.scrollY }));
    const cell = page.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseBId}"]`);
    const prev = await cell.getAttribute('data-state');
    await cell.evaluate(el => el.click());
    await expect(cell).not.toHaveAttribute('data-state', prev, { timeout: 15_000 });
    const after = await page.evaluate(() => ({ wrap: document.querySelector('.ops-matrix-wrap').scrollTop, win: window.scrollY }));
    expect(Math.abs(after.wrap - before.wrap), 'the Matrix should not scroll back to the top').toBeLessThan(3);
    expect(Math.abs(after.win - before.win), 'the page should not scroll').toBeLessThan(3);
    // put the cell back to off so the temporary course can be deleted tidily
    for (let i = 0; i < 3 && (await cell.getAttribute('data-state')) !== 'off'; i++) { await cell.evaluate(el => el.click()); await page.waitForTimeout(900); }
  });

  test('FIX-018: sole trader contact is fixed as a worker, "Primary contact" wording, and the printed Register has a letterhead', async ({ page }) => {
    acceptDialogsAndCapture(page);
    await signIn(page, config);
    await openTraining(page);
    await goToTab(page, 'Contractors');
    await page.getByRole('button', { name: '+ Add contractor', exact: true }).click();
    await page.locator('#opsContractorType').selectOption('sole_trader');
    await expect(page.locator('.ops-admin-first h5')).toHaveText('Primary contact');
    await expect(page.locator('#opsContractorAdminWorks')).toBeChecked();
    await expect(page.locator('#opsContractorAdminWorks')).toBeDisabled();
    await page.locator('#opsContractorType').selectOption('company');
    await expect(page.locator('#opsContractorAdminWorks')).toBeEnabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    await goToTab(page, 'Register');
    const popup = await withPopup(page, page.getByRole('button', { name: 'Generate printable register', exact: true }));
    await expect(popup.locator('.lh-name')).toHaveText('Spray and Wash Solutions');
    await expect(popup.locator('body')).toContainText('0800 881 123');
    await expect.poll(() => popup.locator('img.lh-logo').evaluate(i => i.complete && i.naturalWidth > 0)).toBeTruthy();
    await popup.close();
  });

  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await browser.newPage();
    page.setDefaultTimeout(15_000);
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
          const ids = await page.locator('tr[data-ops-open-person]').evaluateAll(els => els.filter(e => /E2E-UI-SUITE-TRAINFIX-/.test(e.textContent) && !e.closest('details')).map(e => e.getAttribute('data-ops-open-person')));
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
