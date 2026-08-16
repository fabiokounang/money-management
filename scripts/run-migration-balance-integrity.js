/**
 * Adds balance-integrity columns:
 * - transactions.debt_cash_effect
 * - loan_records.source_transaction_id
 * - loan_payments.transaction_id
 * Usage: node scripts/run-migration-balance-integrity.js
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

async function hasIndex(conn, dbName, tableName, indexName) {
  const [rows] = await conn.query(
    `SELECT 1
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [dbName, tableName, indexName]
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
    if (!(await hasColumn(conn, database, 'transactions', 'debt_cash_effect'))) {
      await conn.query(`
        ALTER TABLE transactions
        ADD COLUMN debt_cash_effect ENUM('in', 'out') NOT NULL DEFAULT 'in'
        AFTER transaction_type
      `);
    }

    if (!(await hasColumn(conn, database, 'loan_records', 'source_transaction_id'))) {
      await conn.query(`
        ALTER TABLE loan_records
        ADD COLUMN source_transaction_id INT UNSIGNED NULL
        AFTER note
      `);
    }

    if (!(await hasIndex(conn, database, 'loan_records', 'idx_loans_source_tx'))) {
      await conn.query(`
        ALTER TABLE loan_records
        ADD KEY idx_loans_source_tx (source_transaction_id)
      `);
    }

    if (!(await hasColumn(conn, database, 'loan_payments', 'transaction_id'))) {
      await conn.query(`
        ALTER TABLE loan_payments
        ADD COLUMN transaction_id INT UNSIGNED NULL
        AFTER note
      `);
    }

    if (!(await hasIndex(conn, database, 'loan_payments', 'uq_loan_payments_transaction'))) {
      await conn.query(`
        ALTER TABLE loan_payments
        ADD UNIQUE KEY uq_loan_payments_transaction (transaction_id)
      `);
    }

    console.log('Migration balance_integrity: OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
