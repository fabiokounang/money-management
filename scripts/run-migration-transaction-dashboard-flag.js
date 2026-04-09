/**
 * Adds transactions.include_in_dashboard if missing.
 * Usage: node scripts/run-migration-transaction-dashboard-flag.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

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

  const conn = await mysql.createConnection({ host, port, user, password, database });

  try {
    const exists = await hasColumn(conn, database, 'transactions', 'include_in_dashboard');
    if (!exists) {
      await conn.query(
        'ALTER TABLE transactions ADD COLUMN include_in_dashboard TINYINT(1) NOT NULL DEFAULT 1 AFTER payment_method'
      );
    }
    console.log('Migration transaction include_in_dashboard: OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
