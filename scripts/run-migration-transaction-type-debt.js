/**
 * Adds 'debt' value to transactions.transaction_type ENUM if missing.
 * Usage: node scripts/run-migration-transaction-type-debt.js
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

async function columnTypeHasDebt(conn, database) {
  const [rows] = await conn.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'transactions'
       AND COLUMN_NAME = 'transaction_type'
     LIMIT 1`,
    [database]
  );
  const t = String(rows[0]?.COLUMN_TYPE || '');
  return t.includes("'debt'");
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
    const ok = await columnTypeHasDebt(conn, database);
    if (ok) {
      console.log('Migration transaction_type debt: already applied');
      return;
    }

    await conn.query('SET NAMES utf8mb4');
    await conn.query(
      "ALTER TABLE transactions MODIFY COLUMN transaction_type ENUM('income', 'expense', 'transfer', 'debt') NOT NULL"
    );
    console.log('Migration transaction_type debt: OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
