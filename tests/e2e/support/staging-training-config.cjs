const { getStagingConfig } = require('./staging-config.cjs');

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required staging Training review setting: ${name}`);
  return value;
}

// The Training module is gated behind the "Training manager" role, which the
// normal read-only staging preflight account deliberately does not hold. This
// suite signs in as its own dedicated staging-only account instead of the
// shared E2E_STAGING_TEST_EMAIL/PASSWORD pair used elsewhere, following the
// same override pattern as staging-admin-readonly-config.cjs so this suite
// does not depend on the shared account's credentials being set at all.
function getStagingTrainingConfig(env = process.env) {
  const email = required(env, 'E2E_STAGING_TRAINING_EMAIL').toLowerCase();
  const password = required(env, 'E2E_STAGING_TRAINING_PASSWORD');
  const staging = getStagingConfig({
    ...env,
    E2E_STAGING_TEST_EMAIL: email,
    E2E_STAGING_TEST_PASSWORD: password
  });
  return { ...staging, accountPurpose: 'Training manager browser review' };
}

module.exports = { getStagingTrainingConfig };
