const {
  pool
} = require('../utils/db');

async function get_list(user_id, limit, offset, search, period_type, is_active) {
  const sql = `
        SELECT
            b.id,
            b.user_id,
            b.category_id,
            b.amount,
            b.period_type,
            b.start_date,
            b.end_date,
            b.note,
            b.is_active,
            b.created_at,
            b.updated_at,
            c.category_name,
            c.category_type
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        WHERE b.user_id = ?
          AND (? = '' OR c.category_name LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR b.period_type = ?)
          AND (? = -1 OR b.is_active = ?)
        ORDER BY b.start_date DESC, b.id DESC
        LIMIT ? OFFSET ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    search,
    search,
    period_type,
    period_type,
    is_active,
    is_active,
    limit,
    offset
  ]);

  return rows;
}

async function count_all(user_id, search, period_type, is_active) {
  const sql = `
        SELECT COUNT(*) AS total
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        WHERE b.user_id = ?
          AND (? = '' OR c.category_name LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR b.period_type = ?)
          AND (? = -1 OR b.is_active = ?)
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    search,
    search,
    period_type,
    period_type,
    is_active,
    is_active,
    1
  ]);

  return rows[0]?.total || 0;
}

async function find_by_id(id, user_id) {
  const sql = `
        SELECT
            b.id,
            b.user_id,
            b.category_id,
            b.amount,
            b.period_type,
            b.start_date,
            b.end_date,
            b.note,
            b.is_active,
            b.created_at,
            b.updated_at,
            c.category_name,
            c.category_type
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        WHERE b.id = ?
          AND b.user_id = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [id, user_id, 1]);
  return rows[0] || null;
}

async function find_duplicate(user_id, category_id, period_type, start_date, end_date, exclude_id) {
  const sql = `
        SELECT
            id
        FROM budgets
        WHERE user_id = ?
          AND category_id = ?
          AND period_type = ?
          AND start_date = ?
          AND end_date = ?
          AND (? = 0 OR id != ?)
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    category_id,
    period_type,
    start_date,
    end_date,
    exclude_id,
    exclude_id,
    1
  ]);

  return rows[0] || null;
}

async function create(data) {
  const sql = `
        INSERT INTO budgets (
            user_id,
            category_id,
            amount,
            period_type,
            start_date,
            end_date,
            note,
            is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

  const [result] = await pool.query(sql, [
    data.user_id,
    data.category_id,
    data.amount,
    data.period_type,
    data.start_date,
    data.end_date,
    data.note || null,
    data.is_active
  ]);

  return result.insertId;
}

async function update(data) {
  const sql = `
        UPDATE budgets
        SET
            category_id = ?,
            amount = ?,
            period_type = ?,
            start_date = ?,
            end_date = ?,
            note = ?,
            is_active = ?
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

  const [result] = await pool.query(sql, [
    data.category_id,
    data.amount,
    data.period_type,
    data.start_date,
    data.end_date,
    data.note || null,
    data.is_active,
    data.id,
    data.user_id,
    1
  ]);

  return result.affectedRows;
}

async function remove(id, user_id) {
  const sql = `
        DELETE FROM budgets
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

  const [result] = await pool.query(sql, [
    id,
    user_id,
    1
  ]);

  return result.affectedRows;
}

async function get_budget_actual_summary(user_id, search, period_type, is_active) {
    const sql = `
        SELECT
            b.id,
            b.user_id,
            b.category_id,
            b.amount,
            b.period_type,
            b.start_date,
            b.end_date,
            b.note,
            b.is_active,
            b.created_at,
            b.updated_at,
            c.category_name,
            c.category_type,
            COALESCE(SUM(
                CASE
                    WHEN t.transaction_type = ? THEN t.amount
                    ELSE 0
                END
            ), 0) AS actual_amount
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        LEFT JOIN transactions t
            ON t.user_id = b.user_id
           AND t.category_id = b.category_id
           AND t.transaction_type = ?
           AND t.transaction_date BETWEEN b.start_date AND b.end_date
        WHERE b.user_id = ?
          AND (? = '' OR c.category_name LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR b.period_type = ?)
          AND (? = -1 OR b.is_active = ?)
        GROUP BY
            b.id,
            b.user_id,
            b.category_id,
            b.amount,
            b.period_type,
            b.start_date,
            b.end_date,
            b.note,
            b.is_active,
            b.created_at,
            b.updated_at,
            c.category_name,
            c.category_type
        ORDER BY b.start_date DESC, b.id DESC
        LIMIT ?
    `;

    const [rows] = await pool.execute(sql, [
        'expense',
        'expense',
        user_id,
        search,
        search,
        period_type,
        period_type,
        is_active,
        is_active,
        1000
    ]);

    return rows;
}

module.exports = {
  get_list,
  count_all,
  find_by_id,
  find_duplicate,
  create,
  update,
  remove,
  get_budget_actual_summary
};