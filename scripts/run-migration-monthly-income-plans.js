/**
 * Applies sql/migration_monthly_income_plans.sql using DB_* from .env
 * Usage: node scripts/run-migration-monthly-income-plans.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function getSslConfig() {
  const mode = String(process.env.DB_SSL_MODE || '').trim().toLowerCase();
  const force = String(process.env.DB_SSL || '').trim() === '1';
  if (force || mode === 'require' || mode === 'verify-ca' || mode === 'verify-identity' || process.env.NODE_ENV === 'production') {
    return {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: mode === 'verify-ca' || mode === 'verify-identity'
    };
  }
  return undefined;
}

async function main() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT || 3306);

  if (!host || !user || database === undefined || database === '') {
    console.error('Missing DB_HOST, DB_USER, or DB_NAME in .env');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, '..', 'sql', 'migration_monthly_income_plans.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const withoutComments = raw
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
  const statements = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const ssl = getSslConfig();
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: false,
    ...(ssl ? { ssl } : {})
  });

  try {
    for (const st of statements) {
      await conn.query(st);
    }
    console.log('Migration monthly_income_plans: OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
