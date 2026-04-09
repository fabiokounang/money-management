const {
  pool
} = require('../utils/db');

const SELECT_USER_COLUMNS = `
            id,
            full_name,
            username,
            email,
            password_hash,
            is_active,
            created_at,
            updated_at
`;

async function find_by_id(id) {
  const sql = `
        SELECT
            ${SELECT_USER_COLUMNS}
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
            ${SELECT_USER_COLUMNS}
        FROM users
        WHERE email = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [email, 1]);
  return rows[0] || null;
}

async function find_by_username(username) {
  const sql = `
        SELECT
            ${SELECT_USER_COLUMNS}
        FROM users
        WHERE username = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [username, 1]);
  return rows[0] || null;
}

async function find_by_login_id(login_id) {
  const normalized = String(login_id || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const sql = `
        SELECT
            ${SELECT_USER_COLUMNS}
        FROM users
        WHERE LOWER(email) = ?
           OR LOWER(username) = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [normalized, normalized, 1]);
  return rows[0] || null;
}

async function create(data) {
  const sql = `
        INSERT INTO users (
            full_name,
            username,
            email,
            password_hash,
            is_active
        ) VALUES (?, ?, ?, ?, ?)
    `;

  const params = [
    data.full_name,
    data.username,
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
  find_by_username,
  find_by_login_id,
  create
};