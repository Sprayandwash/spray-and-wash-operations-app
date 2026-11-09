const { defineConfig, devices } = require('@playwright/test');
const { getHarnessAccounts } = require('./tests/e2e/support/staging-harness-config.cjs');

const { base } = getHarnessAccounts();

// Phone-size runs of the whole-app harness (tests/e2e/staging/mobile-harness.spec.cjs).
// 360px Android and 390px iPhone-sized, both touch + mobile user agent. The iPhone run
// uses Chromium with iPhone dimensions (WebKit is a later, lower-priority addition).
module.exports = defineConfig({
  testDir: './tests/e2e/staging',
  testMatch: '**/mobile-harness.spec.cjs',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 900_000,
  reporter: [['line'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/mobile-harness.json' }]],
  use: { baseURL: base.baseURL, screenshot: 'off', trace: 'retain-on-failure' },
  projects: [
    { name: 'android-360', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } } },
    { name: 'iphone-390', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } } }
  ]
});
