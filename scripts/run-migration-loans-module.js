/**
 * Applies sql/migration_loans_module.sql using DB_* from .env
 * Usage: node scripts/run-migration-loans-module.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT || 3306);

  if (!host || !user || !database) {
    throw new Error('Missing DB_HOST, DB_USER, or DB_NAME in .env');
  }

  const sqlPath = path.join(__dirname, '..', 'sql', 'migration_loans_module.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const statements = raw
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: false
  });

  try {
    for (const st of statements) {
      await conn.query(st);
    }
    console.log('Migration loans_module: OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
