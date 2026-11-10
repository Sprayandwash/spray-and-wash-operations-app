const { getStagingConfig } = require('./staging-config.cjs');

// The mobile test harness signs in as each role it checks. It reuses the existing dedicated
// staging-only accounts (never production). The employee account defaults to the Height
// equipment user audit account; add E2E_STAGING_HARNESS_EMPLOYEE_EMAIL/PASSWORD (a staging
// user holding "Height equipment user" + "Vehicle inspector") to also cover vehicle checks
// as an employee.
function pick(env, ...pairs) {
  for (const [e, p] of pairs) {
    const email = String(env[e] || '').trim();
    const password = String(env[p] || '').trim();
    if (email && password) return { email: email.toLowerCase(), password };
  }
  return null;
}

function getHarnessAccounts(env = process.env) {
  const admin = pick(env, ['E2E_STAGING_ADMIN_EMAIL', 'E2E_STAGING_ADMIN_PASSWORD']);
  const employee = pick(env,
    ['E2E_STAGING_HARNESS_EMPLOYEE_EMAIL', 'E2E_STAGING_HARNESS_EMPLOYEE_PASSWORD'],
    ['E2E_STAGING_HEIGHT_READONLY_EMAIL', 'E2E_STAGING_HEIGHT_READONLY_PASSWORD']);
  if (!admin) throw new Error('Missing E2E_STAGING_ADMIN_EMAIL / E2E_STAGING_ADMIN_PASSWORD for the mobile harness.');
  // Validates the project ref / base URL and refuses production.
  const base = getStagingConfig({ ...env, E2E_STAGING_TEST_EMAIL: admin.email, E2E_STAGING_TEST_PASSWORD: admin.password });
  const accounts = [{ role: 'admin', ...admin }];
  if (employee) accounts.push({ role: 'employee', ...employee });
  return { base, accounts };
}

module.exports = { getHarnessAccounts };
