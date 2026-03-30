const {
  pool
} = require('../utils/db');

async function get_list(user_id, limit, offset, search, category_id, is_active) {
  const sql = `
        SELECT
            s.id,
            s.category_id,
            s.subcategory_name,
            s.is_active,
            s.created_at,
            s.updated_at,
            c.category_name,
            c.category_type
        FROM subcategories s
        JOIN categories c
            ON c.id = s.category_id
        WHERE c.user_id = ?
          AND (? = '' OR s.subcategory_name LIKE CONCAT('%', ?, '%'))
          AND (? = 0 OR s.category_id = ?)
          AND (? = -1 OR s.is_active = ?)
        ORDER BY c.category_name ASC, s.subcategory_name ASC, s.id DESC
        LIMIT ? OFFSET ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    search,
    search,
    category_id,
    category_id,
    is_active,
    is_active,
    limit,
    offset
  ]);

  return rows;
}

async function count_all(user_id, search, category_id, is_active) {
  const sql = `
        SELECT COUNT(*) AS total
        FROM subcategories s
        JOIN categories c
            ON c.id = s.category_id
        WHERE c.user_id = ?
          AND (? = '' OR s.subcategory_name LIKE CONCAT('%', ?, '%'))
          AND (? = 0 OR s.category_id = ?)
          AND (? = -1 OR s.is_active = ?)
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    search,
    search,
    category_id,
    category_id,
    is_active,
    is_active,
    1
  ]);

  return rows[0]?.total || 0;
}

async function find_by_id(id, user_id) {
  const sql = `
        SELECT
            s.id,
            s.category_id,
            s.subcategory_name,
            s.is_active,
            s.created_at,
            s.updated_at,
            c.category_name,
            c.category_type
        FROM subcategories s
        JOIN categories c
            ON c.id = s.category_id
        WHERE s.id = ?
          AND c.user_id = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [id, user_id, 1]);
  return rows[0] || null;
}

async function find_by_name(user_id, category_id, subcategory_name, exclude_id) {
  const sql = `
        SELECT
            s.id,
            s.subcategory_name
        FROM subcategories s
        JOIN categories c
            ON c.id = s.category_id
        WHERE c.user_id = ?
          AND s.category_id = ?
          AND s.subcategory_name = ?
          AND (? = 0 OR s.id != ?)
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    category_id,
    subcategory_name,
    exclude_id,
    exclude_id,
    1
  ]);

  return rows[0] || null;
}

async function create(data) {
  const sql = `
        INSERT INTO subcategories (
            category_id,
            subcategory_name,
            is_active
        ) VALUES (?, ?, ?)
    `;

  const [result] = await pool.query(sql, [
    data.category_id,
    data.subcategory_name,
    data.is_active
  ]);

  return result.insertId;
}

async function update(data) {
  const sql = `
        UPDATE subcategories
        SET
            category_id = ?,
            subcategory_name = ?,
            is_active = ?
        WHERE id = ?
        LIMIT ?
    `;

  const [result] = await pool.query(sql, [
    data.category_id,
    data.subcategory_name,
    data.is_active,
    data.id,
    1
  ]);

  return result.affectedRows;
}

async function count_transactions_by_subcategory(id, user_id) {
  const sql = `
        SELECT COUNT(*) AS total
        FROM transactions
        WHERE user_id = ?
          AND subcategory_id = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    id,
    1
  ]);

  return rows[0]?.total || 0;
}

async function remove(id, user_id) {
  const sql = `
        DELETE s
        FROM subcategories s
        JOIN categories c
            ON c.id = s.category_id
        WHERE s.id = ?
          AND c.user_id = ?
        LIMIT ?
    `;

  const [result] = await pool.query(sql, [
    id,
    user_id,
    1
  ]);

  return result.affectedRows;
}

module.exports = {
  get_list,
  count_all,
  find_by_id,
  find_by_name,
  create,
  update,
  count_transactions_by_subcategory,
  remove
};