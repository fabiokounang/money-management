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
    multipleStatements: false,
    ...(ssl ? { ssl } : {})
  });
  try {
    async function ensureColumn(tableName, columnName, ddl) {
      const [rows] = await conn.query(
        `
          SELECT COUNT(*) AS total
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = ?
            AND COLUMN_NAME = ?
          LIMIT 1
        `,
        [database, tableName, columnName]
      );
      const exists = Number(rows[0]?.total || 0) > 0;
      if (!exists) {
        await conn.query(ddl);
      }
    }

    await ensureColumn(
      'transactions',
      'transaction_time',
      "ALTER TABLE transactions ADD COLUMN transaction_time TIME NOT NULL DEFAULT '00:00:00' AFTER transaction_date"
    );
    await ensureColumn(
      'loan_payments',
      'payment_time',
      "ALTER TABLE loan_payments ADD COLUMN payment_time TIME NOT NULL DEFAULT '00:00:00' AFTER payment_date"
    );

    console.log('Migration add_time_fields: OK');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
