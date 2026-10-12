const { defineConfig, devices } = require('@playwright/test');
const { getStagingTrainingConfig } = require('./tests/e2e/support/staging-training-config.cjs');

// Write-capable full UI regression suite for the Training module — see
// docs/testing/MODULE-UI-TESTING-STANDARD.md. Unlike playwright.staging.training.config.cjs
// (browse-only), this suite creates, edits and deletes its own throwaway
// fixtures through the real app UI, signed in as the same dedicated
// Training-manager-only account. Production configuration is rejected by
// staging-config.cjs before Playwright starts, exactly as it is everywhere
// else in this repo.
const staging = getStagingTrainingConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/training-full-ui-suite.spec.cjs',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [['line'], ['html', { open: 'never' }]],
  use: {
    baseURL: staging.baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  projects: [{ name: 'staging-training-full-suite-chromium', use: { ...devices['Desktop Chrome'] } }]
});
