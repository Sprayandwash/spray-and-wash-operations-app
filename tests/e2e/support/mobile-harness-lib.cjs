// Mobile test harness library. See tests/e2e/staging/mobile-harness.spec.cjs and
// docs/testing/MOBILE-HARNESS.md. Everything here is read-only against Staging: it never
// submits a form, and every native confirm() is dismissed so no destructive action runs.
//
// Fault classes (letters match the taxonomy in docs/testing/MOBILE-HARNESS.md):
//  A layout/overflow  B state lost on redraw  C scroll position  D open/close
//  E uploads          F data/count mismatches  G forms  H dead buttons
//  I permissions/errors  J boot/release  K text  N phone-specific

const DENY_CLICK = /(save|submit|confirm|delete|remove|archive|block|sign ?out|log ?out|purge|approve|complete|generate|send|create|reset|clear|dispose|retire|deactivate|reactivate|upload|download|print|backup|restore|import|export|pdf|certificate|camera|gallery|transfer|apply)/i;
const BAD_TEXT = /(\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|non-2xx|Invalid Date)/;
const ALERT_PROBLEM = /(fail|error|denied|not allowed|unable|could not|couldn't|non-2xx|invalid|permission)/i;

function createFindings() {
  const list = [];
  return {
    list,
    activity: 0,
    add(severity, cls, where, detail) {
      const key = `${severity}|${cls}|${where}|${detail}`;
      if (!list.some(f => f.key === key)) list.push({ key, severity, cls, where, detail });
    }
  };
}

// Records alerts, dialogs, console errors, failed requests and uncaught page errors.
function installProbes(page, findings, getWhere) {
  page.on('request', () => { findings.activity += 1; });
  page.on('dialog', async dialog => {
    findings.activity += 1;
    const message = dialog.message();
    if (ALERT_PROBLEM.test(message)) findings.add('error', 'I', getWhere(), `Alert shown: "${message.slice(0, 160)}"`);
    if (dialog.type() === 'confirm' || dialog.type() === 'prompt') await dialog.dismiss(); else await dialog.accept();
  });
  page.on('pageerror', err => findings.add('error', 'H', getWhere(), `Uncaught page error: ${String(err.message).slice(0, 160)}`));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/favicon|ResizeObserver|Failed to load resource: net::ERR_(ABORTED|BLOCKED)/i.test(text)) return;
    findings.add('warn', 'H', getWhere(), `Console error: ${text.slice(0, 160)}`);
  });
  page.on('response', response => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (/\/auth\/v1\/(token|user)/.test(url) && status === 400) return;
    if (/(favicon|\.map$|push|notification)/i.test(url)) return;
    findings.add('warn', 'I', getWhere(), `HTTP ${status} from ${url.replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 100)}`);
  });
}

// Records what the page shows between page load and the Home tiles appearing (flicker).
async function installFlickerRecorder(page) {
  await page.addInitScript(() => {
    window.__flicker = [];
    const signature = () => {
      const vis = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const so = document.getElementById('signedOut');
      const shell = document.getElementById('opsShell');
      return JSON.stringify({
        signedOut: vis(so),
        title: (shell && vis(shell) && shell.querySelector('h2, h3') ? shell.querySelector('h2, h3').textContent.trim().slice(0, 40) : ''),
        tiles: document.querySelectorAll('.ops-branch-card').length > 0
      });
    };
    let last = '';
    const tick = () => {
      if (!document.body) return;
      const s = signature();
      if (s !== last) { last = s; window.__flicker.push({ t: Math.round(performance.now()), s: JSON.parse(s) }); }
    };
    const start = () => { new MutationObserver(tick).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); tick(); };
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
    const loop = () => { tick(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
}

// Emulates leaving the app and coming back (the Supabase client re-emits SIGNED_IN on
// visibility return, which re-renders the screen). Returns once the app has settled.
async function simulateAppSwitch(page) {
  await page.evaluate(async () => {
    const setVis = v => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); Object.defineProperty(document, 'hidden', { value: v === 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
    setVis('hidden');
    await new Promise(r => setTimeout(r, 400));
    setVis('visible');
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(1500);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const shell = document.getElementById('opsShell') || document.body;
    const describe = e => e.id || e.name || e.getAttribute('data-ops-asset-file-input') || e.className || e.tagName;
    return {
      scrollY: Math.round(window.scrollY),
      details: [...shell.querySelectorAll('details')].map((d, i) => `${i}:${(d.querySelector('summary')?.textContent || '').trim().slice(0, 40)}:${d.open}`),
      fields: [...shell.querySelectorAll('input:not([type=file]):not([type=hidden]):not([type=password]), textarea, select')].map(e => `${describe(e)}=${e.type === 'checkbox' || e.type === 'radio' ? e.checked : e.value}`),
      files: [...shell.querySelectorAll('input[type=file]')].map(e => `${describe(e)}=${e.files.length}`),
      focus: document.activeElement && document.activeElement.id || ''
    };
  });
}

function diffSnapshots(a, b) {
  const out = [];
  const setDiff = (label, x, y) => { const lost = x.filter(v => !y.includes(v)); if (lost.length) out.push(`${label} changed: ${lost.slice(0, 4).join(' | ')}`); };
  setDiff('open sections', a.details, b.details);
  setDiff('field values', a.fields, b.fields);
  setDiff('file inputs', a.files, b.files);
  if (Math.abs(a.scrollY - b.scrollY) > 40) out.push(`scroll moved ${a.scrollY} -> ${b.scrollY}`);
  return out;
}

// Layout/text scan of what is currently on screen.
async function layoutScan(page) {
  return page.evaluate(({ badText }) => {
    const issues = [];
    const vw = window.innerWidth;
    const visible = el => { for (let n = el; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; } const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const inScroller = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (['auto', 'scroll'].includes(s.overflowX) && p.scrollWidth > p.clientWidth + 2) return true; } return false; };
    const label = el => (el.getAttribute('aria-label') || el.textContent || el.id || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 70);
    if (document.documentElement.scrollWidth > vw + 2) issues.push({ sev: 'error', cls: 'A', detail: `Page scrolls sideways (content ${document.documentElement.scrollWidth}px wide on a ${vw}px screen)` });
    const nodes = [...document.querySelectorAll('input, select, textarea, button, label, h1, h2, h3, h4, .ops-card, .card, summary, img')].filter(visible).filter(e => !inScroller(e));
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.left < -2 || r.right > vw + 2) issues.push({ sev: 'error', cls: 'A', detail: `Runs off the screen edge: ${el.tagName.toLowerCase()} "${label(el)}" (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})` });
      if (el.matches('button, summary, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])') && r.height < 30) issues.push({ sev: 'warn', cls: 'N', detail: `Small tap target (${Math.round(r.height)}px high): ${el.tagName.toLowerCase()} "${label(el)}"` });
    }
    const text = document.body.innerText || '';
    const m = text.match(new RegExp(badText));
    if (m) issues.push({ sev: 'error', cls: 'K', detail: `Screen shows "${m[0]}"` });
    return issues.slice(0, 40);
  }, { badText: BAD_TEXT.source });
}

async function isInViewport(locator) {
  return locator.evaluate(el => { const r = el.getBoundingClientRect(); const sticky = [...document.querySelectorAll('header, .ops-header, #stagingEnvironmentBanner, .topbar')].reduce((m, e) => { const s = getComputedStyle(e); return (s.position === 'sticky' || s.position === 'fixed') ? Math.max(m, e.getBoundingClientRect().bottom) : m; }, 0); return r.top >= sticky - 4 && r.top < window.innerHeight - 20; });
}

module.exports = { DENY_CLICK, createFindings, installProbes, installFlickerRecorder, simulateAppSwitch, snapshot, diffSnapshots, layoutScan, isInViewport };
