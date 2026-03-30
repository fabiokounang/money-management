const {
  pool
} = require('../utils/db');

async function find_by_id(id) {
  console.log(id, 'asd')
  const sql = `
        SELECT
            id,
            full_name,
            email,
            password_hash,
            is_active,
            created_at,
            updated_at
        FROM users
        WHERE id = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [id, 1]);
  return rows[0] || null;
}

async function find_by_email(email) {
  const sql = `
        SELECT
            id,
            full_name,
            email,
            password_hash,
            is_active,
            created_at,
            updated_at
        FROM users
        WHERE email = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [email, 1]);
  return rows[0] || null;
}

async function create(data) {
  const sql = `
        INSERT INTO users (
            full_name,
            email,
            password_hash,
            is_active
        ) VALUES (?, ?, ?, ?)
    `;

  const params = [
    data.full_name,
    data.email,
    data.password_hash,
    data.is_active ?? 1
  ];

  const [result] = await pool.query(sql, params);

  return result.insertId;
}

module.exports = {
  find_by_id,
  find_by_email,
  create
};