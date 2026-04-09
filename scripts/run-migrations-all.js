/**
 * Runs all idempotent migrations in sequence.
 * Safe to execute on each deploy/start.
 */

const path = require('path');
const { execFileSync } = require('child_process');

const migrationScripts = [
  'run-migration-usernames.js',
  'run-migration-recurring-schedules.js',
  'run-migration-transaction-dashboard-flag.js',
  'run-migration-add-time-fields.js',
  'run-migration-monthly-income-plans.js',
  'run-migration-loans-module.js'
];

function runScript(scriptName) {
  const filePath = path.join(__dirname, scriptName);
  console.log(`[migrate:all] running ${scriptName}`);
  execFileSync(process.execPath, [filePath], {
    stdio: 'inherit'
  });
}

function main() {
  migrationScripts.forEach(runScript);
  console.log('[migrate:all] completed');
}

try {
  main();
} catch (err) {
  console.error('[migrate:all] failed:', err.message || err);
  process.exit(1);
}
