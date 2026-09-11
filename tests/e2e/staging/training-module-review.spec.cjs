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

test('TRAINING-REVIEW-002: Training Matrix renders every active course and known seeded statuses', async ({ page }) => {
  await signIn(page);
  await openTrainingModule(page);
  await page.locator('[data-ops-view="training-matrix"]').click();

  const table = page.locator('.ops-table-wrap table.ops-table').first();
  await expect(table).toBeVisible({ timeout: 15_000 });

  // The catalog currently has 15 active courses plus the leading "Person"
  // column. This is a coarse guard, not a layout check — it only confirms
  // every course still renders a header, not the header's width or position.
  const headerCells = table.locator('tr').first().locator('th');
  await expect(headerCells).toHaveCount(16);

  // Spot-check a handful of the dummy statuses seeded across every bucket
  // the app can render, so a broken status calculation shows up here rather
  // than only being noticed by hand in the UI. Only uniquely-named people are
  // targeted individually — two seeded test accounts share the exact name
  // "Brendan Harris", so their Expiring/Expired statuses are checked
  // table-wide instead of by row.
  const checks = [
    { person: 'Samwise Gamgee', label: 'Missing' },
    { person: 'Frodo Baggins', label: 'In progress' },
    { person: 'Brendan Harris80', label: 'Not recorded' }
  ];
  for (const { person, label } of checks) {
    const row = table.locator('tr', { has: page.locator(`button[data-ops-open-person]:text-is("${person}")`) });
    await expect(row, `Expected a Training Matrix row for ${person}`).toHaveCount(1);
    await expect(row.locator('.ops-pill', { hasText: label }).first()).toBeVisible();
  }

  // Frodo Baggins is seeded with a completed higher-level learning course, so
  // that pill should read Compliant.
  const frodoRow = table.locator('tr', { has: page.locator('button[data-ops-open-person]:text-is("Frodo Baggins")') });
  await expect(frodoRow.locator('.ops-pill', { hasText: 'Compliant' }).first()).toBeVisible();

  // The expiring-soon and expired examples both belong to accounts named
  // plain "Brendan Harris" (two of them), so check the whole table instead
  // of a single row.
  await expect(table.locator('.ops-pill', { hasText: 'Expires in' }).first()).toBeVisible();
  await expect(table.locator('.ops-pill', { hasText: 'Expired' }).first()).toBeVisible();
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
