/**
 * Adds users.username and unique index, then backfills existing rows.
 * Usage: node scripts/run-migration-usernames.js
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
    const columnExists = await hasColumn(conn, database, 'users', 'username');
    if (!columnExists) {
      await conn.query('ALTER TABLE users ADD COLUMN username VARCHAR(30) NULL AFTER full_name');
    }

    // Backfill blank usernames from email + id.
    await conn.query(`
      UPDATE users
      SET username = LOWER(CONCAT(REPLACE(SUBSTRING_INDEX(email, '@', 1), ' ', ''), '_', id))
      WHERE username IS NULL OR username = ''
    `);

    await conn.query('ALTER TABLE users MODIFY COLUMN username VARCHAR(30) NOT NULL');

    const indexExists = await hasIndex(conn, database, 'users', 'uq_users_username');
    if (!indexExists) {
      await conn.query('ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)');
    }

    console.log('Migration usernames: OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
