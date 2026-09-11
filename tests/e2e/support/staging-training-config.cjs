const { getStagingConfig } = require('./staging-config.cjs');

function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Missing required staging Training review setting: ${name}`);
  return value;
}

// The Training module is gated behind the "Training manager" role, which the
// normal read-only staging preflight account deliberately does not hold. This
// suite signs in as its own dedicated staging-only account instead of the
// shared E2E_STAGING_TEST_EMAIL/PASSWORD pair used elsewhere.
function getStagingTrainingConfig(env = process.env) {
  const staging = getStagingConfig(env);
  const email = required(env, 'E2E_STAGING_TRAINING_EMAIL').toLowerCase();
  const password = required(env, 'E2E_STAGING_TRAINING_PASSWORD');

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('SAFETY STOP: E2E_STAGING_TRAINING_EMAIL must be a valid email address.');
  }

  return { ...staging, email, password };
}

module.exports = { getStagingTrainingConfig };
