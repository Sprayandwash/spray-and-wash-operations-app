// Shared helpers for the "standard module UI-testing program" — see
// docs/testing/MODULE-UI-TESTING-STANDARD.md for the full process this
// supports. Any future module's full-UI-suite spec should import from here
// rather than re-inventing sign-in, dialog handling, or fixture naming, so
// every module's suite behaves the same way.
//
// These helpers assume the suite is self-contained: it creates its own
// throwaway fixtures (prefixed via buildFixtureTag) and deletes them again
// at the end of the run, through the real signed-in UI — never through a
// direct database write — so the suite is a genuine usability test as well
// as a regression check.

/**
 * Build a short, visually distinctive, collision-resistant tag for this
 * run's throwaway fixtures. Distinct from the existing "E2E REVIEW —"
 * convention used by the human-reviewed staging workflows elsewhere in this
 * repo: those records are deliberately left behind for a person to look at;
 * everything tagged with this prefix is deleted by the same test run that
 * created it, so the two conventions must never be confused with each
 * other. If a run crashes before its own cleanup completes, anything still
 * in Staging carrying this prefix is always safe to delete by hand.
 */
function buildFixtureTag(moduleTag) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `E2E-UI-SUITE-${String(moduleTag).toUpperCase()}-${nonce}`;
}

/**
 * Sign in through the real sign-in form (never by seeding a session token),
 * with the same diagnostic logging used elsewhere in this repo's staging
 * specs: a failed sign-in surfaces the app's own alert() text and the raw
 * Supabase Auth token response in the test log, instead of only "the
 * signed-in section never appeared".
 */
async function signIn(page, { email, password }) {
  const { expect } = require('@playwright/test');
  await page.goto('/');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('STAGING');
  await expect(page.locator('#stagingEnvironmentBanner')).toContainText('NOT PRODUCTION');

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

  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#signedIn')).toBeVisible({ timeout: 15_000 });
}

/**
 * Install an auto-accept handler for every native confirm()/alert() the app
 * raises from this point on (the app uses plain confirm() for destructive
 * actions and plain alert() for permission/validation errors — see
 * CLAUDE.md / the regression catalogue). Returns an array that is pushed to
 * on every dialog, so a test can assert an expected alert actually fired
 * (e.g. a permission check) without the dialog ever blocking the page.
 */
function acceptDialogsAndCapture(page) {
  const seen = [];
  page.on('dialog', async dialog => {
    seen.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept();
  });
  return seen;
}

/**
 * The app opens the printable register in a new tab/window via
 * window.open(...).write(...) rather than navigating to a URL. Wrap the
 * click that triggers it so the popup is captured and loaded before any
 * assertion runs against it.
 */
async function withPopup(page, triggerLocator) {
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    triggerLocator.click()
  ]);
  await popup.waitForLoadState('domcontentloaded');
  return popup;
}

/**
 * Best-effort cleanup wrapper: logs and swallows any error so one failed
 * deletion never stops the rest of a suite's teardown from running. Every
 * fixture this suite created must be deleted through a call wrapped in
 * this, in reverse creation order, inside the spec's own afterAll.
 */
async function safeCleanup(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.warn(`CLEANUP WARNING — could not clean up ${label}: ${err && err.message ? err.message : err}`);
  }
}

module.exports = { buildFixtureTag, signIn, acceptDialogsAndCapture, withPopup, safeCleanup };
