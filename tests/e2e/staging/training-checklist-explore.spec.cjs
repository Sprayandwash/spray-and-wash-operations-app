const { test, expect } = require('@playwright/test');
const { getStagingTrainingConfig } = require('../support/staging-training-config.cjs');
const { buildFixtureTag, signIn, safeCleanup } = require('../support/ui-suite-helpers.cjs');

// EXPLORATORY run of the printed Training manual check list (sections 1-13).
// It does NOT assert pass/fail: every check records OK / FINDING / BLOCKED
// lines to the log, and the run always ends with a printed report. Purpose:
// find bugs for the queued batch, not to gate a build. Test-only; changes no
// app code. Everything created is tagged CHECK-... and archived/deleted at
// the end through the UI.

test.setTimeout(240_000);

const config = getStagingTrainingConfig();
const TAG = buildFixtureTag('training').replace('E2E-UI-SUITE-', 'CHECK-');
const results = [];
const dialogs = [];

function note(kind, ref, text) {
  const line = `${kind}: [${ref}] ${text}`;
  results.push(line);
  console.log(line);
}
async function observe(ref, fn) {
  try { await fn(); } catch (e) { note('BLOCKED', ref, String(e && e.message ? e.message : e).split('\n')[0].slice(0, 300)); }
}

const fx = { contractor: `${TAG} Co`, soleTrader: `${TAG} Sole`, person: `${TAG} Worker`, course: `${TAG} Course`, contractorId: null, soleId: null, personId: null, courseId: null, recordId: null };

async function openTraining(page) {
  await page.getByRole('button', { name: 'Training', exact: true }).click();
  await expect(page.locator('#opsShell h2')).toHaveText('Training');
}
const tab = (page, l) => page.locator('#opsNav').getByRole('button', { name: l, exact: true }).click();
async function panel(page, name) {
  await tab(page, 'Settings');
  const d = page.locator('details.ops-collapsible', { has: page.locator('summary h3', { hasText: new RegExp('^\\s*' + name + '\\s*$') }) });
  if (!(await d.evaluate(el => el.open))) await d.locator('summary').click();
  return d;
}
async function openPerson(page) {
  await tab(page, 'Team members');
  await page.locator(`[data-ops-open-person="${fx.personId}"]`).first().click();
}
function section(page) { return page.locator(`details[data-ops-course-id="${fx.courseId}"]`); }
async function openSection(page) {
  const s = section(page);
  if (!(await s.evaluate(el => el.open))) await s.locator('summary').click();
  return s;
}
const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 CHECK test file\n%%EOF') });

test.beforeEach(async ({ page }) => {
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
});

test.describe('Training checklist — exploratory', () => {
  test('SETUP: contractor, sole trader, person, course, compulsory matrix cell', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await tab(page, 'Contractors');
    for (const [name, type, key] of [[fx.contractor, 'company', 'contractorId'], [fx.soleTrader, 'sole_trader', 'soleId']]) {
      await page.getByRole('button', { name: '+ Add contractor', exact: true }).click();
      await page.locator('#opsContractorName').fill(name);
      await page.locator('#opsContractorType').selectOption(type);
      await page.getByRole('button', { name: 'Add contractor', exact: true }).click();
      const row = page.locator('tr', { has: page.getByText(name, { exact: true }) });
      await expect(row).toHaveCount(1, { timeout: 10_000 });
      fx[key] = await row.getAttribute('data-ops-view-contractor');
    }
    await page.locator(`tr[data-ops-view-contractor="${fx.contractorId}"]`).click();
    await page.getByRole('button', { name: '+ Add person', exact: true }).click();
    await page.locator('#opsPersonContractorId').selectOption({ label: `${fx.contractor} (Company)` });
    await page.locator('#opsPersonFullName').fill(fx.person);
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    const pr = page.locator('tr', { has: page.getByText(fx.person, { exact: true }) });
    await expect(pr).toHaveCount(1, { timeout: 10_000 });
    fx.personId = await pr.getAttribute('data-ops-open-person');

    const cat = await panel(page, 'Course Catalog');
    await cat.getByRole('button', { name: '+ Add course', exact: true }).click();
    await page.locator('#opsCourseName').fill(fx.course);
    await page.locator('#opsCourseType').selectOption('external');
    await page.locator('#opsCourseValidity').fill('12');
    await page.getByRole('button', { name: 'Add course', exact: true }).click();
    const cr = (await panel(page, 'Course Catalog')).locator('tr', { has: page.getByRole('button', { name: fx.course, exact: true }) });
    await expect(cr).toHaveCount(1, { timeout: 10_000 });
    fx.courseId = await cr.getByRole('button', { name: fx.course, exact: true }).getAttribute('data-ops-view-course');

    const m = await panel(page, 'Training Matrix');
    const cell = m.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`);
    await cell.click(); await expect(cell).toHaveAttribute('data-state', 'applicable');
    await cell.click(); await expect(cell).toHaveAttribute('data-state', 'compulsory');
    note('OK', 'setup', 'fixtures created');
  });

  test('1 Navigation, spacing, Back button', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await observe('1.5 Back button', async () => {
      const before = await page.evaluate(() => history.length);
      for (const t of ['Team members', 'Contractors', 'Settings', 'Register', 'Dashboard']) await tab(page, t);
      const after = await page.evaluate(() => history.length);
      if (after === before) note('FINDING', '1.5 / bug 3', `Switching 5 tabs added no browser history entries (history.length ${before} -> ${after}), so Back is greyed out / cannot step back through tabs.`);
      else note('OK', '1.5', `history grew ${before}->${after}`);
    });
    await observe('1.4 Refresh keeps tab', async () => {
      await tab(page, 'Register');
      await page.reload();
      const h2 = await page.locator('#opsShell h2').count();
      note(h2 ? 'OK' : 'FINDING', '1.4', h2 ? 'still inside Training after reload (tab not checked)' : 'reload drops out of the Training module to the home screen');
    });
    await observe('spacing', async () => {
      await openTraining(page);
      for (const t of ['Dashboard', 'Team members', 'Contractors', 'Settings', 'Register']) {
        await tab(page, t);
        const gaps = await page.evaluate(() => {
          const shell = document.querySelector('#opsShell');
          const btns = [...shell.querySelectorAll('button')].filter(b => b.offsetParent && !b.closest('#opsNav'));
          const out = [];
          for (const b of btns.slice(0, 40)) {
            const r = b.getBoundingClientRect();
            const prev = b.previousElementSibling || b.parentElement.previousElementSibling;
            if (!prev) continue;
            const pr = prev.getBoundingClientRect();
            const gap = Math.round(r.top - pr.bottom);
            if (gap >= 0 && gap < 6 && r.left < pr.right) out.push(`"${(b.textContent || '').trim().slice(0, 24)}" gap ${gap}px`);
          }
          return out;
        });
        if (gaps.length) note('FINDING', `spacing/${t}`, `buttons with under 6px gap to the element above: ${gaps.slice(0, 6).join('; ')}`);
        else note('OK', `spacing/${t}`, 'no tight buttons found by the gap probe');
      }
    });
  });

  test('2 Dashboard tiles', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await observe('2.1 tiles', async () => {
      const txt = (await page.locator('#opsShell').innerText()).replace(/\s+/g, ' ');
      note('OK', '2.1', `Dashboard text: ${txt.slice(0, 260)}`);
      for (const w of ['Overdue', 'Due soon', 'Compliant', 'Not recorded']) {
        const el = page.locator('#opsShell').getByText(w, { exact: false }).first();
        if (!(await el.count())) { note('FINDING', '2.1', `tile "${w}" not found`); continue; }
        await tab(page, 'Dashboard');
        await page.locator('#opsShell').getByText(w, { exact: false }).first().click().catch(() => {});
        const onRegister = (await page.locator('#opsRegisterStatus').count()) > 0;
        note(onRegister ? 'OK' : 'FINDING', '2.2', `clicking "${w}" ${onRegister ? 'opens' : 'does NOT open'} the Register`);
      }
    });
  });

  test('3 Course catalog input handling', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    const tryCourse = async (ref, label, name, validity, expectRow = true) => {
      await observe(ref, async () => {
        const d0 = dialogs.length;
        const cat = await panel(page, 'Course Catalog');
        await cat.getByRole('button', { name: '+ Add course', exact: true }).click();
        await page.locator('#opsCourseName').fill(name);
        if (validity !== undefined) await page.locator('#opsCourseValidity').fill(String(validity));
        await page.getByRole('button', { name: 'Add course', exact: true }).click();
        await page.waitForTimeout(1500);
        const cat2 = await panel(page, 'Course Catalog');
        const shown = await cat2.locator('tr', { hasText: name.slice(0, 40) }).count();
        const alerts = dialogs.slice(d0);
        const redField = await page.locator('.ops-field-error, .ops-error, [aria-invalid="true"]').count();
        note(shown ? 'INFO' : 'INFO', ref, `${label}: rows shown=${shown}, alerts=${JSON.stringify(alerts)}, inline error elements=${redField}`);
        if (!shown && !alerts.length && !redField) note('FINDING', ref, `${label}: nothing saved and NO message shown (silent failure)`);
        if (shown > 1) note('FINDING', ref, `${label}: created duplicate rows (${shown})`);
      });
    };
    await tryCourse('3.3', 'empty name', '   ');
    await tryCourse('3.4a', 'very long name (200 chars)', `${TAG} ` + 'L'.repeat(200));
    await tryCourse('3.4b', 'symbols & / \' " < >', `${TAG} S&/'"<>`);
    await tryCourse('3.4c', 'emoji', `${TAG} 🦺 Safety`);
    await tryCourse('3.5', 'duplicate of fixture course name', fx.course);
    await tryCourse('3.6a', 'validity -1', `${TAG} Neg`, -1);
    await tryCourse('3.6b', 'validity 999', `${TAG} Big`, 999);
    await tryCourse('3.6c', 'validity 0', `${TAG} Zero`, 0);
    await observe('3.8 open course goes to edit form', async () => {
      const cat = await panel(page, 'Course Catalog');
      await cat.getByRole('button', { name: fx.course, exact: true }).click();
      note((await page.locator('#opsCourseName').count()) ? 'OK' : 'FINDING', '3.8', 'course opens straight into the edit form');
    });
    await observe('archived position', async () => {
      const cat = await panel(page, 'Course Catalog');
      const names = await cat.locator('tr td:first-child').allInnerTexts();
      const stat = await cat.locator('tr td:nth-child(5)').allInnerTexts();
      note('INFO', 'catalog order', `${names.length} rows; Archived rows at positions: ${stat.map((s, i) => /Archived/.test(s) ? i : null).filter(x => x !== null).slice(0, 12).join(',')}`);
    });
  });

  test('4 Training Matrix', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await observe('4 scroll position on cell click (bug 20)', async () => {
      const m = await panel(page, 'Training Matrix');
      const cell = m.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`);
      await cell.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, 200));
      const y0 = await page.evaluate(() => window.scrollY);
      await cell.click();
      await page.waitForTimeout(800);
      const y1 = await page.evaluate(() => window.scrollY);
      note(y1 === y0 ? 'OK' : 'FINDING', '4.x / item 20', `scrollY before click=${y0}, after=${y1}`);
      // put it back to compulsory (clicks cycle off/applicable/compulsory)
      const c2 = (await panel(page, 'Training Matrix')).locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`);
      for (let i = 0; i < 3 && (await c2.getAttribute('data-state')) !== 'compulsory'; i++) { await c2.click(); await page.waitForTimeout(700); }
    });
    await observe('4.5 rapid clicks', async () => {
      const m = await panel(page, 'Training Matrix');
      const c = m.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`);
      for (let i = 0; i < 3; i++) await c.click({ delay: 0 }).catch(() => {});
      await page.waitForTimeout(1500);
      const st = await (await panel(page, 'Training Matrix')).locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`).getAttribute('data-state');
      note('INFO', '4.5', `after 3 rapid clicks starting from compulsory the state is "${st}" (expected "compulsory" if each click registered)`);
      const c3 = (await panel(page, 'Training Matrix')).locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`);
      for (let i = 0; i < 3 && (await c3.getAttribute('data-state')) !== 'compulsory'; i++) { await c3.click(); await page.waitForTimeout(700); }
    });
    await observe('4.6 refresh keeps cell', async () => {
      await page.reload(); await openTraining(page);
      const m = await panel(page, 'Training Matrix');
      note('INFO', '4.6', `cell state after reload: ${await m.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`).getAttribute('data-state')}`);
    });
  });

  test('5 Team members + 6/7 records and evidence', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await openPerson(page);
    const s = await openSection(page);

    await observe('6.1 form defaults', async () => {
      await s.getByRole('button', { name: '+ Add record', exact: true }).click();
      const status = await page.locator('#opsRecordStatus').inputValue();
      const opts = await page.locator('#opsRecordStatus option').allTextContents();
      const cd = await page.locator('#opsRecordCompletedDate').inputValue();
      note('INFO', '6.1', `default status="${status}", options=${JSON.stringify(opts)}, completed date default="${cd}"`);
      note('INFO', '6.1', `Add record button vs evidence box: evidence upload present in add form = ${(await page.locator('#opsTrainingRecordForm input[type=file]').count()) > 0}`);
    });
    await observe('6.3 Completed with no evidence', async () => {
      const d0 = dialogs.length;
      await page.locator('#opsRecordStatus').selectOption('Completed');
      await page.locator('#opsRecordProvider').fill('CHECK typed provider');
      await page.getByRole('button', { name: 'Add record', exact: true }).click();
      await page.waitForTimeout(1500);
      const prov = await page.locator('#opsRecordProvider').inputValue().catch(() => null);
      note('INFO', '6.3', `alerts=${JSON.stringify(dialogs.slice(d0))}`);
      note(prov === 'CHECK typed provider' ? 'OK' : 'FINDING', '6.3 / item 15', `after failed save the typed provider field is ${prov === null ? 'gone (form closed)' : `"${prov}"`}`);
    });
    await observe('6.x create In progress record', async () => {
      const form = page.locator('#opsTrainingRecordForm');
      if (!(await form.count())) { await (await openSection(page)).getByRole('button', { name: '+ Add record', exact: true }).click(); }
      await page.locator('#opsRecordStatus').selectOption('In progress');
      await page.locator('#opsRecordProvider').fill('CHECK Provider');
      await page.getByRole('button', { name: 'Add record', exact: true }).click();
      const edit = (await openSection(page)).locator('[data-ops-edit-record]');
      await expect(edit).toHaveCount(1, { timeout: 10_000 });
      fx.recordId = await edit.getAttribute('data-ops-edit-record');
    });
    await observe('6.x double click save', async () => {
      const sec = await openSection(page);
      await sec.getByRole('button', { name: '+ Add record', exact: true }).click();
      await page.locator('#opsRecordProvider').fill('CHECK double');
      await page.getByRole('button', { name: 'Add record', exact: true }).dblclick();
      await page.waitForTimeout(2000);
      const n = await (await openSection(page)).locator('[data-ops-edit-record]').count();
      note(n === 2 ? 'OK' : 'FINDING', '6.9', `after double-clicking Add record the course has ${n} records (expected 2 total incl. the earlier one)`);
    });

    await observe('7 evidence upload + duplicate + odd type', async () => {
      const sec = await openSection(page);
      const input = () => sec.locator(`input[data-ops-evidence-input="${fx.recordId}"][type="file"]`).last();
      await sec.getByRole('button', { name: '+ Add file', exact: true }).first().click().catch(() => {});
      await input().setInputFiles(pdf('check-a.pdf'));
      await expect(sec.getByRole('button', { name: 'check-a.pdf', exact: true })).toHaveCount(1, { timeout: 15_000 });
      await sec.getByRole('button', { name: '+ Add file', exact: true }).first().click().catch(() => {});
      await input().setInputFiles(pdf('check-a.pdf'));
      await page.waitForTimeout(2500);
      const n = await sec.getByRole('button', { name: 'check-a.pdf', exact: true }).count();
      note(n > 1 ? 'FINDING' : 'OK', '7.6 / item 25', `uploading a second file named check-a.pdf results in ${n} entries`);
      const d0 = dialogs.length;
      await sec.getByRole('button', { name: '+ Add file', exact: true }).first().click().catch(() => {});
      await input().setInputFiles({ name: 'check.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ fake') });
      await page.waitForTimeout(2500);
      const ex = await sec.getByRole('button', { name: 'check.exe', exact: true }).count();
      note('INFO', '7.3', `.exe upload: listed=${ex}, alerts=${JSON.stringify(dialogs.slice(d0))}`);
    });

    await observe('item 19: typed edits survive an evidence upload', async () => {
      const sec = await openSection(page);
      await sec.locator(`[data-ops-edit-record="${fx.recordId}"]`).click();
      await page.locator('#opsRecordProvider').fill('CHECK edited provider');
      await page.locator('#opsRecordNotes').fill('CHECK edited notes');
      const input = sec.locator(`input[data-ops-evidence-input="${fx.recordId}"][type="file"]`).last();
      await input.setInputFiles(pdf('check-b.pdf'));
      await page.waitForTimeout(3000);
      const prov = await page.locator('#opsRecordProvider').inputValue().catch(() => '(form gone)');
      note(prov === 'CHECK edited provider' ? 'OK' : 'FINDING', 'item 19', `provider field after evidence upload during edit: "${prov}"`);
    });
    await observe('item 17/18 edit prefill and scroll', async () => {
      const sec = await openSection(page);
      await sec.locator(`[data-ops-edit-record="${fx.recordId}"]`).click();
      await page.waitForTimeout(500);
      const forms = await page.locator('#opsTrainingRecordForm').count();
      const prov = await page.locator('#opsRecordProvider').inputValue();
      const top = await page.locator('#opsTrainingRecordForm').boundingBox();
      note('INFO', 'item 4/17/18', `forms open=${forms}; provider prefilled="${prov}" (saved: CHECK Provider); form top offset in viewport=${top ? Math.round(top.y) : 'n/a'}px`);
    });

    // Completed + expiry boundaries (needs evidence, already attached above)
    const boundary = async (ref, completed, expiry, label) => {
      await observe(ref, async () => {
        const sec = await openSection(page);
        await sec.locator(`[data-ops-edit-record="${fx.recordId}"]`).click();
        await page.locator('#opsRecordStatus').selectOption('Completed');
        await page.locator('#opsRecordCompletedDate').fill(completed);
        await page.locator('#opsRecordExpiryDate').fill(expiry);
        const d0 = dialogs.length;
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await page.waitForTimeout(1500);
        const s2 = await openSection(page);
        const pill = (await s2.locator('summary .ops-pill').allInnerTexts()).join(' | ');
        const row = (await s2.locator('table tr').nth(1).innerText().catch(() => '')).replace(/\s+/g, ' ');
        note('INFO', ref, `${label}: completed=${completed} expiry=${expiry} -> summary pills="${pill}", alerts=${JSON.stringify(dialogs.slice(d0))}, row="${row.slice(0, 90)}"`);
      });
    };
    const iso = (days) => { const d = new Date(Date.now() + days * 86400000); return d.toISOString().slice(0, 10); };
    await boundary('6.6 +29d', iso(-300), iso(29), 'expires in 29 days');
    await boundary('6.6 +31d', iso(-300), iso(31), 'expires in 31 days');
    await boundary('6.6 today', iso(-300), iso(0), 'expires today (should be Expired)');
    await boundary('6.6 yesterday', iso(-300), iso(-1), 'expired yesterday');
    await boundary('6.8a end<start', iso(-10), iso(-20), 'expiry before completed');
    await boundary('6.8b 1900s', '1999-05-01', '1999-06-01', 'dates in the 1900s');
    await boundary('6.8c far future', iso(-10), '2099-01-01', 'expiry in 2099');
    await observe('6.5 auto expiry 29 Feb / 31 Jan', async () => {
      for (const [c, label] of [['2024-02-29', '29 Feb 2024'], ['2025-01-31', '31 Jan 2025'], [iso(0), 'today']]) {
        const sec = await openSection(page);
        await sec.locator(`[data-ops-edit-record="${fx.recordId}"]`).click();
        await page.locator('#opsRecordCompletedDate').fill(c);
        await page.locator('#opsRecordExpiryDate').fill('');
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await page.waitForTimeout(1500);
        const row = (await (await openSection(page)).locator('table tr').nth(1).innerText().catch(() => '')).replace(/\s+/g, ' ');
        note('INFO', '6.5', `validity 12 months, completed ${label}, expiry left blank -> row "${row.slice(0, 80)}"`);
      }
    });
    await observe('6.10 delete record cancel keeps it', async () => {
      const sec = await openSection(page);
      const before = await sec.locator('[data-ops-delete-record]').count();
      note('INFO', '6.10', `records before delete test: ${before} (delete is auto-accepted by this run, checked at cleanup)`);
    });
  });

  test('8 Contractors + sole trader rules', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await tab(page, 'Contractors');
    await observe('8 sole trader two people (item 26)', async () => {
      await page.locator(`tr[data-ops-view-contractor="${fx.soleId}"]`).click();
      let added = 0;
      for (const n of ['One', 'Two']) {
        await page.getByRole('button', { name: '+ Add person', exact: true }).click();
        await page.locator('#opsPersonContractorId').selectOption({ label: `${fx.soleTrader} (Sole trader)` });
        await page.locator('#opsPersonFullName').fill(`${TAG} Sole ${n}`);
        await page.getByRole('button', { name: 'Add person', exact: true }).click();
        await page.waitForTimeout(1500);
        if (await page.locator('tr', { has: page.getByText(`${TAG} Sole ${n}`, { exact: true }) }).count()) added++;
      }
      note(added > 1 ? 'FINDING' : 'OK', 'item 26', `sole trader accepted ${added} people`);
    });
    await observe('8 first contact missing from people (item 27)', async () => {
      await tab(page, 'Contractors');
      await page.locator(`tr[data-ops-view-contractor="${fx.contractorId}"]`).click();
      const txt = (await page.locator('#opsShell').innerText()).replace(/\s+/g, ' ');
      note('INFO', 'item 27', `contractor page text: ${txt.slice(0, 300)}`);
    });
    await observe('8.4 labels', async () => {
      await tab(page, 'Contractors');
      const t = (await page.locator('#opsShell').innerText()).replace(/\s+/g, ' ');
      note(/Deactivate|Inactive/.test(t) ? 'INFO' : 'OK', 'item 28', `contractor list uses ${/Deactivate/.test(t) ? '"Deactivate"' : '(no Deactivate)'} / ${/Inactive/.test(t) ? '"Inactive"' : '(no Inactive)'} wording`);
      const f = await page.getByRole('button', { name: '+ Add contractor', exact: true });
      await f.click();
      const ids = await page.locator('#opsShell form input, #opsShell form select, #opsShell form textarea').evaluateAll(els => els.map(e => e.id || e.name).filter(Boolean));
      note('INFO', 'item 29', `contractor form fields: ${ids.join(', ')}`);
    });
  });

  test('9 Register filters and print', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await tab(page, 'Register');
    await observe('9.2 filter row counts', async () => {
      const rowsFor = async () => page.locator('#opsShell table.ops-table tr').count();
      const base = await rowsFor();
      note('INFO', '9.2', `unfiltered table rows (incl. header): ${base}`);
      for (const [sel, vals] of [['#opsRegisterPersonType', null], ['#opsRegisterTrainingType', null], ['#opsRegisterStatus', null]]) {
        const opts = await page.locator(`${sel} option`).evaluateAll(o => o.map(x => x.value));
        for (const v of opts) {
          await page.locator(sel).selectOption(v);
          await page.waitForTimeout(300);
          note('INFO', '9.2', `${sel}=${v} -> rows ${await rowsFor()}`);
        }
        await page.locator(sel).selectOption(opts[0]);
      }
    });
    await observe('9.4 pill overflow / page width', async () => {
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      note(w.sw > w.iw ? 'FINDING' : 'OK', '9.5', `page scrollWidth ${w.sw} vs window ${w.iw}`);
    });
    await observe('9.6 print popup', async () => {
      const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Generate printable register', exact: true }).click()]);
      await pop.waitForLoadState('domcontentloaded');
      note('INFO', '9.6', `printable register length ${(await pop.locator('body').innerText()).length} chars, contains fixture course: ${(await pop.locator('body').innerText()).includes(fx.course)}`);
      await pop.close();
    });
    await observe('9.8 empty filter print', async () => {
      await page.locator('#opsRegisterStatus').selectOption('overdue');
      const n = await page.locator('#opsShell table.ops-table tr').count();
      note('INFO', '9.8', `overdue filter rows: ${n}`);
    });
  });

  test('12 Phone layout', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    try {
      await signIn(page, config);
      await openTraining(page);
      for (const t of ['Dashboard', 'Team members', 'Contractors', 'Settings', 'Register']) {
        await observe(`12 ${t}`, async () => {
          await tab(page, t);
          const m = await page.evaluate(() => {
            const small = [...document.querySelectorAll('#opsShell button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).filter(r => r.height < 32 || r.width < 32).length;
            return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, small };
          });
          note(m.sw > m.iw + 1 ? 'FINDING' : 'OK', `12 ${t}`, `scrollWidth ${m.sw} vs ${m.iw}; buttons under 32px: ${m.small}`);
        });
      }
    } finally { await ctx.close(); }
  });

  test('13 Wording scan + CLEANUP', async ({ page }) => {
    await signIn(page, config);
    await openTraining(page);
    await observe('13 option capitalisation', async () => {
      await tab(page, 'Register');
      const all = [];
      for (const sel of ['#opsRegisterPersonType', '#opsRegisterTrainingType', '#opsRegisterStatus']) all.push(...await page.locator(`${sel} option`).allTextContents());
      note('INFO', '13.5', `register dropdown wording: ${JSON.stringify(all)}`);
    });

    await safeCleanup('records', async () => {
      await openPerson(page);
      const sec = await openSection(page);
      for (let i = 0; i < 6 && (await sec.locator('[data-ops-delete-record]').count()); i++) {
        await sec.locator('[data-ops-delete-record]').first().click();
        await page.waitForTimeout(1500);
      }
    });
    await safeCleanup('matrix cell', async () => {
      const m = await panel(page, 'Training Matrix');
      const c = m.locator(`button[data-ops-matrix-cell][data-person="${fx.personId}"][data-course="${fx.courseId}"]`);
      for (let i = 0; i < 3 && (await c.getAttribute('data-state')) !== 'off'; i++) { await c.click(); await page.waitForTimeout(700); }
    });
    await safeCleanup('people', async () => {
      await tab(page, 'Team members');
      const boxes = page.locator('input[data-ops-toggle-training-person-active]');
      const n = await boxes.count();
      for (let i = 0; i < n; i++) {
        const row = page.locator('tr', { has: boxes.nth(i) });
        if (/CHECK-/.test(await row.innerText().catch(() => '')) && (await boxes.nth(i).isChecked())) await boxes.nth(i).uncheck();
      }
    });
    await safeCleanup('contractors', async () => {
      await tab(page, 'Contractors');
      const ids = await page.locator('tr[data-ops-view-contractor]').evaluateAll(els => els.filter(e => /CHECK-/.test(e.textContent)).map(e => e.getAttribute('data-ops-view-contractor')));
      for (const id of ids) {
        await tab(page, 'Contractors');
        const b = page.locator(`tr[data-ops-view-contractor="${id}"]`).getByRole('button', { name: 'Deactivate', exact: true });
        if (await b.count()) { await b.click(); await page.waitForTimeout(600); }
      }
    });
    await safeCleanup('courses', async () => {
      const cat = await panel(page, 'Course Catalog');
      const ids = await cat.locator('[data-ops-view-course]').evaluateAll(els => els.filter(e => /CHECK-/.test(e.textContent)).map(e => e.getAttribute('data-ops-view-course')));
      for (const id of ids) {
        const c2 = await panel(page, 'Course Catalog');
        const link = c2.locator(`[data-ops-view-course="${id}"]`);
        if (!(await link.count())) continue;
        await link.click();
        const cb = page.locator('#opsCourseActive');
        if (await cb.isChecked()) { await cb.uncheck(); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await page.waitForTimeout(800); }
      }
    });

    console.log('\n===== CHECKLIST EXPLORATORY REPORT =====');
    results.forEach(r => console.log(r));
    console.log('===== END REPORT =====');
  });
});
