const { test, expect } = require('@playwright/test');
const { getStagingTrainingConfig } = require('../support/staging-training-config.cjs');

const config = getStagingTrainingConfig();

// This suite is browse-only. It signs in as a dedicated staging-only
// "Training manager" account and reads back what the app renders for the
// Training module's seeded review data. It must not submit a form, edit a
// matrix cell, add/remove a contractor or person, or delete a record.
test.setTimeout(60_000);

async function signIn(page) {
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');

  // Diagnostic-only: surface the exact reason a sign-in attempt fails (the
  // app reports auth errors via a plain alert()) and the raw Supabase Auth
  // token response, so a broken run's log states the cause instead of only
  // "the signed-in section never appeared".
  page.on('dialog', async dialog => {
    console.log(`SIGN-IN DIALOG: ${dialog.message()}`);
    await dialog.dismiss();
  });
  page.on('response', response => {
    if (response.url().includes('/auth/v1/token')) {
      response
        .text()
        .then(body => console.log(`AUTH TOKEN RESPONSE: status=${response.status()} body=${body}`))
        .catch(() => {});
    }
  });

  await page.locator('#loginEmail').fill(config.email);
  await page.locator('#loginPassword').fill(config.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
}

async function openTrainingModule(page) {
  const trainingCard = page.getByRole('button', { name: 'Training', exact: true });
  await expect(trainingCard, 'The staging Training review account must hold the Training manager role.').toBeVisible({ timeout: 15_000 });
  await trainingCard.click();
  await expect(page.locator('#opsShell h2')).toHaveText('Training');
}

test('TRAINING-REVIEW-001: dedicated Training manager account can sign in and open the module', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);
});

test('TRAINING-REVIEW-002: Training Matrix is a pure Applies/Compulsory data-entry grid', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);
  // The Matrix now lives inside Settings rather than its own top-level tab.
  await page.locator('[data-ops-view="training-settings"]').click();

  const table = page.locator('.ops-table-wrap table.ops-table').first();
  await expect(table).toBeVisible({ timeout: 15_000 });

  // The catalog currently has 15 active courses plus the leading "Person"
  // column. This is a coarse guard, not a layout check — it only confirms
  // every course still renders a header, not the header's width or position.
  const headerCells = table.locator('tr').first().locator('th');
  await expect(headerCells).toHaveCount(16);

  // The Matrix is data entry only now: every cell offers an "Applies"
  // checkbox (and "Compulsory" once ticked), and none of it shows a
  // completion/expiry status pill — that lives on the person's own record.
  const samwiseRow = table.locator('tr', { has: page.locator('button[data-ops-open-person]:text-is("Samwise Gamgee")') });
  await expect(samwiseRow, 'Expected a Training Matrix row for Samwise Gamgee').toHaveCount(1);
  await expect(samwiseRow.locator('input[type="checkbox"][data-ops-matrix-applicable]').first()).toBeVisible();

  // Scoped to the data cells, not the header row - a course's own
  // "Higher-level" badge in the header is a course attribute, not a
  // per-person status pill, and is unaffected by this change.
  await expect(table.locator('td.ops-matrix-cell .ops-pill')).toHaveCount(0);
});

test('TRAINING-REVIEW-003: Contractors view shows the seeded pass and fail signal', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);
  await page.locator('[data-ops-view="training-contractors"]').click();
  await expect(page.locator('h3', { hasText: 'Contractors' })).toBeVisible({ timeout: 15_000 });

  // Scope to the Contractors table itself (the first table on this view).
  // The page also renders a separate "Subcontractor & Sole Trader People"
  // table further down that lists each person's contractor by name, so an
  // unscoped `tr` search matches that contractor's name once per person too.
  const contractorsTable = page.locator('.ops-table-wrap table.ops-table').first();
  await expect(contractorsTable).toBeVisible();

  const failingRow = contractorsTable.locator('tr', { hasText: 'Aotearoa Scaffolding Ltd' });
  await expect(failingRow).toHaveCount(1);
  await expect(failingRow.locator('.ops-pill', { hasText: 'Fail' })).toBeVisible();

  const passingRow = contractorsTable.locator('tr', { hasText: 'Kiwi Rope Access' });
  await expect(passingRow).toHaveCount(1);
  await expect(passingRow.locator('.ops-pill', { hasText: 'Pass' })).toBeVisible();
});

test('TRAINING-REVIEW-004: the Training & Competency Register generates and lists a Level 3+ example', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);
  await page.locator('[data-ops-view="training-dashboard"]').click();

  // Not `exact: true` — this home-tile button's accessible name is its
  // title plus its subtitle text ("...RegisterPrintable register for
  // SiteWise"), since moduleCard() renders both inside the same <button>.
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Training & Competency Register' }).click();
  const registerPage = await popupPromise;
  await registerPage.waitForLoadState('domcontentloaded');

  const bodyText = await registerPage.locator('body').innerText();
  expect(bodyText).toContain('Frodo Baggins');
  expect(bodyText).toContain('Experience');
  await registerPage.close();
});

test('TRAINING-REVIEW-005: the dedicated account can open My Training without error', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => window.openMyTrainingModule());
  await expect(page.locator('#opsShell h2')).toHaveText('My Training', { timeout: 15_000 });
});

test('TRAINING-REVIEW-006: Course Catalog shows NZQA info and derives Higher-level objectively', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);
  await page.locator('[data-ops-view="training-catalog"]').click();
  await expect(page.locator('h3', { hasText: 'Course Catalog' })).toBeVisible({ timeout: 15_000 });

  const table = page.locator('.ops-table-wrap table.ops-table').first();
  await expect(table).toBeVisible();
  await expect(table.locator('tr').first().locator('th', { hasText: 'NZQA' })).toBeVisible();

  // "Higher-level" is no longer an arbitrary manual tick per course - it's
  // derived the same way for every course from an NZQA level (>=3) or a
  // recognised competency type. Abseiling quals is height/rope-access work,
  // so it must now carry the Higher-level pill even though nothing was
  // manually ticked for it.
  const abseilingRow = table.locator('tr', { hasText: 'Abseiling quals' });
  await expect(abseilingRow).toHaveCount(1);
  await expect(abseilingRow.locator('.ops-pill', { hasText: 'Higher-level' })).toBeVisible();
});

test('TRAINING-REVIEW-007: Settings holds the Matrix and Catalog, and Team members lists everyone', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);

  // Matrix and Course Catalog are no longer their own top-level tabs - they
  // now live inside Settings, since they're used less often than Team
  // members.
  await expect(page.locator('[data-ops-view="training-matrix"]')).toHaveCount(0);
  await expect(page.locator('[data-ops-view="training-catalog"]')).toHaveCount(0);

  await page.locator('[data-ops-view="training-settings"]').click();
  await expect(page.locator('h3', { hasText: 'Settings' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('h3', { hasText: 'Training Matrix' })).toBeVisible();
  await expect(page.locator('h3', { hasText: 'Course Catalog' })).toBeVisible();

  await page.locator('[data-ops-view="training-team"]').click();
  await expect(page.locator('h3', { hasText: 'Team members' })).toBeVisible({ timeout: 15_000 });
  const table = page.locator('.ops-table-wrap table.ops-table').first();
  const frodoRow = table.locator('tr', { hasText: 'Frodo Baggins' });
  await expect(frodoRow).toHaveCount(1);

  // Clicking through opens the person's own record - now the main way to
  // manage an individual's training entries, instead of going through the
  // Matrix.
  await frodoRow.getByRole('button', { name: 'View / edit training' }).click();
  await expect(page.locator('h3', { hasText: 'Frodo Baggins' })).toBeVisible({ timeout: 15_000 });
});

test('TRAINING-REVIEW-008: Contractors route to a scoped page per contractor', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);
  await page.locator('[data-ops-view="training-contractors"]').click();
  await expect(page.locator('h3', { hasText: 'Contractors' })).toBeVisible({ timeout: 15_000 });

  const contractorsTable = page.locator('.ops-table-wrap table.ops-table').first();

  // Kiwi Rope Access is seeded as a sole trader - clicking through should go
  // straight to that person's own training record, skipping any
  // intermediate scoped list.
  const soleTraderRow = contractorsTable.locator('tr', { hasText: 'Kiwi Rope Access' });
  await expect(soleTraderRow).toHaveCount(1);
  await soleTraderRow.getByRole('button', { name: 'View training' }).click();
  await expect(page.locator('h3', { hasText: 'Piripi Walker' })).toBeVisible({ timeout: 15_000 });

  // Back to Contractors, then into a company contractor - Aotearoa
  // Scaffolding Ltd is seeded with two workers. This list must be scoped to
  // just that company, not the flat cross-contractor list it replaces.
  await page.locator('[data-ops-view="training-contractors"]').click();
  await expect(page.locator('h3', { hasText: 'Contractors' })).toBeVisible({ timeout: 15_000 });
  const companyRow = contractorsTable.locator('tr', { hasText: 'Aotearoa Scaffolding Ltd' });
  await expect(companyRow).toHaveCount(1);
  await companyRow.getByRole('button', { name: 'View employees' }).click();
  await expect(page.locator('h3', { hasText: 'Aotearoa Scaffolding Ltd' })).toBeVisible({ timeout: 15_000 });

  const scopedTable = page.locator('.ops-table-wrap table.ops-table').first();
  await expect(scopedTable.locator('tr', { hasText: 'Dave Mitchell' })).toHaveCount(1);
  await expect(scopedTable.locator('tr', { hasText: 'Tui Ngata' })).toHaveCount(1);
  // People belonging to other contractors, or none, must not leak into this
  // scoped view.
  await expect(scopedTable.locator('tr', { hasText: 'Piripi Walker' })).toHaveCount(0);
  await expect(scopedTable.locator('tr', { hasText: 'Frodo Baggins' })).toHaveCount(0);
});

test('TRAINING-REVIEW-009: each course on a person\'s training record is collapsible', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);
  await page.locator('[data-ops-view="training-settings"]').click();

  const table = page.locator('.ops-table-wrap table.ops-table').first();
  await expect(table).toBeVisible({ timeout: 15_000 });
  await table.locator('button[data-ops-open-person]:text-is("Frodo Baggins")').click();
  await expect(page.locator('h3', { hasText: 'Frodo Baggins' })).toBeVisible({ timeout: 15_000 });

  const courseBoxes = page.locator('details.ops-training-course');
  await expect(courseBoxes.first()).toBeVisible({ timeout: 15_000 });
  const firstBox = courseBoxes.first();

  // Course boxes start collapsed - the record table stays hidden until the
  // header is clicked, rather than every course rendering fully expanded.
  await expect(firstBox).not.toHaveAttribute('open', '');
  await expect(firstBox.locator('.ops-training-course-body')).toBeHidden();

  // Clicking the header expands it, revealing the record table underneath.
  await firstBox.locator('summary').click();
  await expect(firstBox).toHaveAttribute('open', '');
  await expect(firstBox.locator('.ops-training-course-body')).toBeVisible();

  // Clicking again collapses it back.
  await firstBox.locator('summary').click();
  await expect(firstBox).not.toHaveAttribute('open', '');
});
