const { test, expect } = require('@playwright/test');
const { getStagingTrainingConfig } = require('../support/staging-training-config.cjs');
const { signIn, acceptDialogsAndCapture } = require('../support/ui-suite-helpers.cjs');

// App-wide layout check (REG-154): on every module page this account can reach, the blue app header scrolls
// away with the page and nothing shows through or hides behind the fixed red STAGING banner.
// Read-only: it only navigates and scrolls, it creates nothing.
test.setTimeout(180_000);
const config = getStagingTrainingConfig();
const MODULES = ['Height Equipment', 'Vehicle Checks', 'Maintenance', 'Training', 'Admin', 'My Training'];

async function checkLayout(page, label) {
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const b = document.getElementById('stagingEnvironmentBanner'); const h = document.querySelector('header');
    if (!b || !h) return null;
    const bb = b.getBoundingClientRect(); const hb = h.getBoundingClientRect();
    const probe = document.elementFromPoint(Math.round(window.innerWidth / 2), Math.round(bb.bottom + 2));
    return { pos: getComputedStyle(h).position, headerBottom: hb.bottom, bannerBottom: bb.bottom, bannerTop: bb.top, headerAtProbe: !!(probe && probe.closest('header')), scrolled: window.scrollY, headerHeight: hb.height };
  });
  expect(r, `${label}: banner and header exist`).not.toBeNull();
  expect(['sticky', 'fixed'], `${label}: header must not stay pinned`).not.toContain(r.pos);
  if (r.scrolled >= r.headerHeight + 5) {
    expect(r.headerBottom, `${label}: header has scrolled away`).toBeLessThanOrEqual(r.bannerBottom + 1);
    expect(r.headerAtProbe, `${label}: no header under the banner`).toBeFalsy();
  }
  expect(Math.abs(r.bannerTop), `${label}: banner stays at the top`).toBeLessThanOrEqual(1);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('REG-154: header scrolls away and the banner stays clear on every reachable module page', async ({ page }) => {
  acceptDialogsAndCapture(page);
  await signIn(page, config);
  await expect(page.getByRole('button', { name: 'Training', exact: true })).toBeVisible({ timeout: 20_000 });
  await checkLayout(page, 'Home');
  const visited = [];
  for (const name of MODULES) {
    const card = page.getByRole('button', { name, exact: true });
    if (!(await card.count())) continue;
    await card.first().click();
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(400);
    await checkLayout(page, name);
    visited.push(name);
    const tabs = page.locator('#opsNav button');
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      const t = tabs.nth(i);
      const label = (await t.innerText()).trim();
      await t.click();
      await page.waitForTimeout(300);
      await checkLayout(page, `${name} > ${label}`);
    }
    const home = page.locator('#opsShell .ops-home-btn').first();
    if (await home.count()) await home.click();
    await expect(page.getByRole('button', { name: 'Training', exact: true }).or(page.getByRole('button', { name: 'My Training', exact: true })).first()).toBeVisible({ timeout: 15_000 });
  }
  console.log(`Layout checked on: Home, ${visited.join(', ')}`);
  expect(visited.length, 'at least one module page was checked').toBeGreaterThan(0);
});
