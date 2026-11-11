// Sign-in flash check (Staging only, phone size). Records every version of the Home screen between pressing
// "Sign in" and the module tiles settling, with timestamps, then fails if Home ever showed "Sign in required"
// after the button was pressed, or showed only some of the tiles before the full set.
// The timeline is printed for every run so a flicker can be read without needing a photo of it.
const { test, expect } = require('@playwright/test');
const { getHarnessAccounts } = require('../support/staging-harness-config.cjs');

const { accounts } = getHarnessAccounts();

async function installHomeRecorder(page) {
  await page.addInitScript(() => {
    window.__homeStates = [];
    window.__signClickAt = null;
    let last = '';
    const read = () => {
      const home = document.getElementById('moduleHomeShell');
      const visible = !!home && !!(home.offsetWidth || home.offsetHeight || home.getClientRects().length);
      if (!visible) return null;
      return {
        headings: [...home.querySelectorAll('h3')].map(h => h.textContent.trim()).filter(Boolean),
        loading: !!home.querySelector('.ops-home-loading'),
        tiles: home.querySelectorAll('.ops-branch-card').length,
        text: home.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)
      };
    };
    const tick = () => {
      if (!document.body) return;
      const s = read();
      const key = JSON.stringify(s);
      if (key === last) return;
      last = key;
      window.__homeStates.push({ t: Math.round(performance.now()), afterClick: window.__signClickAt !== null && performance.now() >= window.__signClickAt, s });
    };
    const start = () => { new MutationObserver(tick).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); tick(); };
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
    const loop = () => { tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
}

for (const account of accounts) {
  test(`Home does not flash while signing in (${account.role})`, async ({ page }, testInfo) => {
    await installHomeRecorder(page);
    await page.goto('/');
    await page.locator('#loginEmail').fill(account.email);
    await page.locator('#loginPassword').fill(account.password);
    await page.evaluate(() => { window.__signClickAt = performance.now(); });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('#signedIn')).toBeVisible({ timeout: 30_000 });
    await page.locator('.ops-branch-card').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(2500);

    const states = await page.evaluate(() => window.__homeStates);
    const after = states.filter(x => x.afterClick && x.s);
    console.log(`HOME TIMELINE (${account.role}, ${testInfo.project.name}):\n` + states.map(x => `  ${String(x.t).padStart(6)}ms ${x.afterClick ? '>' : ' '} ${x.s ? `tiles=${x.s.tiles} loading=${x.s.loading} headings=${JSON.stringify(x.s.headings)}` : '(Home hidden)'}`).join('\n'));

    const signInRequired = after.filter(x => x.s.headings.includes('Sign in required'));
    expect(signInRequired, 'Home showed "Sign in required" after Sign in was pressed').toEqual([]);

    const finalTiles = after.length ? after[after.length - 1].s.tiles : 0;
    expect(finalTiles, 'Home ended with no module tiles').toBeGreaterThan(0);
    const firstWithTiles = after.find(x => x.s.tiles > 0);
    expect(firstWithTiles.s.tiles, 'Home showed only some of the tiles before the full set').toBe(finalTiles);
  });
}
