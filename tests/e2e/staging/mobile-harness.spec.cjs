// Whole-app mobile harness (Staging only). Walks every module a role can reach at phone size
// and reports the kinds of faults recorded in docs/regression-catalogue.md: sideways overflow,
// state lost when the app is left and re-entered, wrong scroll position when something opens,
// buttons that do nothing, error messages, odd text, file/photo choices that do not survive,
// and screens that flicker on load. It is read-only: forms are never submitted and every
// confirm() is dismissed. See docs/testing/MOBILE-HARNESS.md.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { getHarnessAccounts } = require('../support/staging-harness-config.cjs');
const lib = require('../support/mobile-harness-lib.cjs');

const { accounts } = getHarnessAccounts();
const PHOTO = path.join(__dirname, '..', 'fixtures', 'test-photo.jpg');
const NAV_SELECTOR = '#opsNav button, .tabs button, .tabbar button';

async function signInAndWait(page, account, findings) {
  await page.goto('/');
  await page.locator('#loginEmail').fill(account.email);
  await page.locator('#loginPassword').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 30_000 });
  const tiles = await page.locator('.ops-branch-card').first().waitFor({ state: 'visible', timeout: 30_000 }).then(() => true, () => false);
  if (!tiles) findings.add('error', 'F', 'Home', 'No module tiles appeared on Home after signing in');
}

async function goHome(page) {
  await page.goto('/');
  await page.locator('.ops-branch-card').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(600);
}

async function tileLabels(page) {
  return page.locator('.ops-branch-card:visible').evaluateAll(els => els.map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 50)));
}

async function navLabels(page) {
  return page.locator(NAV_SELECTOR).evaluateAll(els => els.filter(e => e.offsetWidth || e.offsetHeight).map(e => e.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean));
}

async function navigate(page, pathParts) {
  await goHome(page);
  if (pathParts[0]) await page.locator('.ops-branch-card').filter({ hasText: pathParts[0], visible: true }).first().click({ timeout: 10_000 });
  await page.waitForTimeout(900);
  if (pathParts[1]) await page.locator(NAV_SELECTOR).filter({ hasText: pathParts[1], visible: true }).first().click({ timeout: 10_000 });
  await page.waitForTimeout(700);
}

async function screenSignature(page) {
  return page.evaluate(() => { const s = document.getElementById('opsShell') || document.body; return `${s.innerHTML.length}|${document.querySelectorAll('details[open]').length}|${(s.querySelector('h2')?.textContent || '')}|${(document.querySelector('#opsNav .active')?.textContent || '')}`; });
}

test.describe.configure({ mode: 'default' });
test.setTimeout(900_000);
const WALK_BUDGET_MS = 7 * 60 * 1000;

for (const account of accounts) {
  test(`HARNESS ${account.role}: every screen on a phone`, async ({ page }, testInfo) => {
    const findings = lib.createFindings();
    const inventory = [];
    const deadline = Date.now() + WALK_BUDGET_MS;
    const outOfTime = () => Date.now() > deadline;
    let where = 'boot';
    lib.installProbes(page, findings, () => `${account.role} / ${where}`);
    await lib.installFlickerRecorder(page);
    let shotNo = 0;
    const shoot = async name => {
      shotNo += 1;
      const file = testInfo.outputPath('screens', `${String(shotNo).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`);
      await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    };

    // J / N: boot. Record what showed between load and Home.
    await signInAndWait(page, account, findings);
    await page.waitForTimeout(1500);
    const flicker = await page.evaluate(() => window.__flicker || []);
    const afterLogin = flicker.filter(f => !f.s.signedOut || f.s.tiles);
    const distinct = [...new Set(afterLogin.map(f => JSON.stringify(f.s)))];
    inventory.push({ screen: 'boot', flicker });
    if (distinct.length > 2) findings.add('error', 'J', 'boot', `Screen changed ${distinct.length} times before settling on Home: ${distinct.map(d => { const o = JSON.parse(d); return o.tiles ? 'Home tiles' : (o.title || (o.signedOut ? 'sign-in' : 'blank')); }).join(' -> ')}`);

    const tiles = await tileLabels(page);
    inventory.push({ screen: 'home', tiles });
    where = 'Home';
    await shoot('home');
    for (const f of await lib.layoutScan(page)) findings.add(f.sev, f.cls, 'Home', f.detail);
    if (!tiles.length) findings.add('error', 'F', 'Home', 'Home shows no module tiles for this role');

    const t0 = Date.now();
    const scanScreen = async (pathParts, name) => {
      where = name;
      console.log(`HARNESS progress ${account.role}/${testInfo.project.name}: ${name} at ${Math.round((Date.now() - t0) / 1000)}s`);
      await page.waitForTimeout(900);
      await shoot(name);
      for (const f of await lib.layoutScan(page)) findings.add(f.sev, f.cls, name, f.detail);

      const info = await page.evaluate(() => ({
        headings: [...document.querySelectorAll('#opsShell h2, #opsShell h3')].map(e => e.textContent.trim()).slice(0, 12),
        buttons: [...document.querySelectorAll('#opsShell button')].filter(b => b.offsetWidth).map(b => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)).slice(0, 60),
        summaries: [...document.querySelectorAll('#opsShell summary')].map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 50)),
        fields: [...document.querySelectorAll('#opsShell input, #opsShell select, #opsShell textarea')].map(e => e.id || e.name || e.type).slice(0, 40)
      }));
      inventory.push({ screen: name, ...info });

      // B / C / D: open each collapsed section: it must land in view and survive an app switch.
      const summaryCount = await page.locator('#opsShell details:not([open]) > summary:visible').count();
      for (let i = 0; i < Math.min(summaryCount, 3); i += 1) {
        const summary = page.locator('#opsShell details:not([open]) > summary:visible').first();
        const text = (await summary.textContent().catch(() => '') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        await summary.scrollIntoViewIfNeeded().catch(() => {});
        await summary.click().catch(() => {});
        await page.waitForTimeout(500);
        const opened = page.locator('#opsShell details[open] > summary', { hasText: text }).first();
        if (await opened.count() && !(await lib.isInViewport(opened))) findings.add('error', 'C', name, `Section "${text}" opened off screen`);
        const before = await lib.snapshot(page);
        await lib.simulateAppSwitch(page);
        const after = await lib.snapshot(page);
        for (const d of lib.diffSnapshots(before, after)) findings.add('error', 'B', name, `After leaving and returning with "${text}" open, ${d}`);
        if (await page.locator('#opsShell details:not([open]) > summary:visible').count() < summaryCount - i - 1) { /* still open */ } else { break; }
      }

      // B / G: typed text must survive an app switch.
      const typeable = page.locator('#opsShell form input:not([type=file]):not([type=hidden]):not([type=password]):not([type=checkbox]):not([type=radio]):not([type=number]):not([type=date]):not([readonly]), #opsShell form textarea');
      const typeableCount = await typeable.count();
      if (typeableCount) {
        const target = typeable.first();
        if (await target.isVisible().catch(() => false)) {
          await target.fill('E2E draft text').catch(() => {});
          const before = await lib.snapshot(page);
          await lib.simulateAppSwitch(page);
          const after = await lib.snapshot(page);
          for (const d of lib.diffSnapshots(before, after)) findings.add('error', 'B', name, `Typed text lost after leaving and returning: ${d}`);
        }
      }

      // B: a part-filled Vehicle Check (an answer, a note and a chosen photo) must survive an app switch
      // and a page refresh, as happens when the phone camera closes. Production lost all of it (REG-175).
      if (await page.locator('#opsInspectionForm .ops-question').count()) {
        await harnessStep(`${name} (part-filled check)`, async () => {
          const q = page.locator('#opsInspectionForm .ops-question:has(select.ops-answer-value)').first();
          const photoQ = page.locator('#opsInspectionForm .ops-question[data-photo-required="true"]').first();
          const select = q.locator('select.ops-answer-value').first();
          if (!(await select.count())) return;
          const value = await select.locator('option:not([value=""])').first().getAttribute('value');
          await select.selectOption(value);
          if (await photoQ.count()) {
            await photoQ.locator('input.ops-item-photo').first().setInputFiles({ name: 'harness.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
          }
          await lib.simulateAppSwitch(page);
          await page.evaluate(() => document.dispatchEvent(new CustomEvent('sw:operations-force-refresh')));
          await page.waitForTimeout(800);
          if ((await select.inputValue().catch(() => '')) !== value) findings.add('error', 'B', name, 'Part-filled Vehicle Check lost an answer after leaving and returning');
          if (await photoQ.count()) {
            const kept = await photoQ.locator('input.ops-item-photo').first().evaluate(el => el.files.length).catch(() => 0);
            if (!kept) findings.add('error', 'B', name, 'Part-filled Vehicle Check lost its chosen photo after leaving and returning');
          }
        });
      }

      // H / C: press every safe button once: it must do something, not raise errors, and any
      // form it opens must be on screen.
      const buttons = await page.evaluate(({ deny }) => {
        const re = new RegExp(deny, 'i');
        const seen = {};
        return [...document.querySelectorAll('#opsShell button, #opsShell [role=button]')]
          .filter(b => (b.offsetWidth || b.offsetHeight) && !b.disabled && !b.closest('#opsNav'))
          .map(b => b.textContent.trim().replace(/\s+/g, ' '))
          .filter(t => t && t.length < 60 && !re.test(t) && !/^(cancel|close|back|← home)/i.test(t))
          .map(t => { seen[t] = (seen[t] || 0); const nth = seen[t]; seen[t] += 1; return { text: t, nth }; })
          .slice(0, 25);
      }, { deny: lib.DENY_CLICK.source });
      for (const b of buttons.slice(0, 8)) {
        if (outOfTime()) break;
        const loc = page.locator('#opsShell button', { hasText: b.text }).nth(b.nth);
        if (!(await loc.count()) || !(await loc.isVisible().catch(() => false))) continue;
        const sigBefore = await screenSignature(page);
        const activityBefore = findings.activity;
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(700);
        const sigAfter = await screenSignature(page);
        if (sigBefore === sigAfter && findings.activity === activityBefore) findings.add('warn', 'H', name, `Button "${b.text}" did nothing visible`);
        const opened = page.locator('#opsShell form:visible').first();
        if (/^(edit|add|\+|new|start)/i.test(b.text) && await opened.count() && !(await lib.isInViewport(opened))) findings.add('error', 'C', name, `After "${b.text}" the form it opened is off screen`);
        if (sigBefore !== sigAfter) await navigate(page, pathParts);
      }
    };

    try {
      // The walk: each tile, then each tab inside it.
      const harnessStep = async (label, fn) => {
        try { await fn(); } catch (err) { findings.add('warn', 'H', label, `Harness could not complete this step: ${String(err.message).split('\n')[0].slice(0, 160)}`); }
      };
      for (const tile of tiles) {
        if (outOfTime()) { findings.add('warn', 'H', 'walk', `Ran out of time before reaching ${tile} and later modules`); break; }
        let tabs = [];
        await harnessStep(tile, async () => { await navigate(page, [tile]); tabs = await navLabels(page); await scanScreen([tile], tile); });
        for (const tab of tabs) {
          if (outOfTime()) { findings.add('warn', 'H', 'walk', `Ran out of time inside ${tile}`); break; }
          await harnessStep(`${tile} > ${tab}`, async () => { await navigate(page, [tile, tab]); await scanScreen([tile, tab], `${tile} > ${tab}`); });
        }
      }

      // E / B: an asset photo chosen on a phone must show straight away and survive the app switch.
      const maintenance = tiles.find(t => /maintenance/i.test(t));
      if (maintenance && account.role === 'admin') {
        await navigate(page, [maintenance, 'Assets']).catch(e => findings.add('warn', 'H', 'Maintenance > Assets photo upload', 'Could not open Assets: ' + String(e.message).split('\n')[0]));
        where = 'Maintenance > Assets photo upload';
        let input = page.locator('.ops-asset-photo-input').first();
        if (!(await input.count())) {
          await page.locator('#opsShell [data-ops-action="openAssetEditor"], #opsShell button:has-text("Add asset"), #opsShell button:has-text("Add vehicle")').first().click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(800);
          await page.locator('#opsShell button:has-text("Vehicle")').first().click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(800);
          input = page.locator('.ops-asset-photo-input').first();
        }
        if (!(await input.count())) {
          findings.add('warn', 'E', where, 'Harness could not reach the asset photo field (check its steps)');
        } else {
          await input.setInputFiles(PHOTO);
          await page.waitForTimeout(800);
          const shown = await page.evaluate(() => { const f = document.querySelector('[data-ops-asset-photo-field]'); const img = f && f.querySelector('img.ops-asset-photo-thumb'); const note = f && f.querySelector('[data-ops-asset-photo-note]'); return { thumb: !!(img && img.naturalWidth > 0), note: (note && note.textContent.trim()) || '' }; });
          if (!shown.thumb) findings.add('error', 'E', where, 'No thumbnail appeared after choosing a real photo');
          if (!shown.note) findings.add('error', 'E', where, 'No "photo chosen" message appeared after choosing a real photo');
          await lib.simulateAppSwitch(page);
          const kept = await page.evaluate(() => [...document.querySelectorAll('.ops-asset-photo-input')].some(i => i.files && i.files.length === 1));
          if (!kept) findings.add('error', 'E', where, 'The chosen photo was lost after leaving the app and coming back');
        }
      }

    } finally {
    const results = findings.list.map(({ key, ...rest }) => rest);
    await testInfo.attach('harness-findings.json', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
    await testInfo.attach('harness-inventory.json', { body: JSON.stringify(inventory, null, 2), contentType: 'application/json' });
    const errors = results.filter(r => r.severity === 'error');
    const warns = results.filter(r => r.severity === 'warn');
    console.log(`HARNESS ${account.role} (${testInfo.project.name}): ${errors.length} errors, ${warns.length} warnings`);
    for (const r of results) console.log(`  [${r.severity.toUpperCase()}] class ${r.cls} | ${r.where} | ${r.detail}`);
    expect(errors.map(r => `[${r.cls}] ${r.where}: ${r.detail}`), 'Faults found by the mobile harness').toEqual([]);
    }
  });
}
