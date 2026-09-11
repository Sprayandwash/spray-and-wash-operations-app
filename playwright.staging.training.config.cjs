const { defineConfig, devices } = require('@playwright/test');
const { getStagingTrainingConfig } = require('./tests/e2e/support/staging-training-config.cjs');

// Browse-only staging review for the Training module. It signs in as its own
// dedicated Training-manager-only account; production configuration is
// rejected by staging-config.cjs before Playwright starts.
const staging = getStagingTrainingConfig();

module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/training-module-review.spec.cjs',
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
  projects: [{ name: 'staging-training-review-chromium', use: { ...devices['Desktop Chrome'] } }]
});
