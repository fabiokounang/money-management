/**
 * Adds budgets.auto_renew if missing.
 * Usage: node scripts/run-migration-budget-auto-renew.js
 */

require('dotenv').config();
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

async function hasColumn(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [dbName, tableName, columnName]
  );
  return rows.length > 0;
}

async function main() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;
  const port = Number(process.env.DB_PORT || 3306);

  if (!host || !user || !database) {
    throw new Error('Missing DB_HOST, DB_USER, or DB_NAME in .env');
  }

  const ssl = getSslConfig();
  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    ...(ssl ? { ssl } : {})
  });

  try {
    const exists = await hasColumn(conn, database, 'budgets', 'auto_renew');
    if (!exists) {
      await conn.query(
        'ALTER TABLE budgets ADD COLUMN auto_renew TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active'
      );
    }
    console.log('Migration budget auto_renew: OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
