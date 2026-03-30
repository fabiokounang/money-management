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

async function find_overlapping_period(user_id, category_id, start_date, end_date, exclude_id) {
  const sql = `
        SELECT
            id
        FROM budgets
        WHERE user_id = ?
          AND category_id = ?
          AND start_date <= ?
          AND end_date >= ?
          AND (? = 0 OR id != ?)
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    category_id,
    end_date,
    start_date,
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

async function get_actual_amount_by_budget_ids(user_id, budget_ids) {
  if (!Array.isArray(budget_ids) || budget_ids.length === 0) {
    return [];
  }

  const placeholders = budget_ids.map(() => '?').join(', ');
  const sql = `
        SELECT
            b.id,
            COALESCE(SUM(
                CASE
                    WHEN t.transaction_type = ? THEN t.amount
                    ELSE 0
                END
            ), 0) AS actual_amount
        FROM budgets b
        LEFT JOIN transactions t
            ON t.user_id = b.user_id
           AND t.category_id = b.category_id
           AND t.transaction_type = ?
           AND t.transaction_date BETWEEN b.start_date AND b.end_date
        WHERE b.user_id = ?
          AND b.id IN (${placeholders})
        GROUP BY b.id
        ORDER BY b.id ASC
    `;

  const [rows] = await pool.query(sql, [
    'expense',
    'expense',
    user_id,
    ...budget_ids
  ]);

  return rows;
}

async function get_totals(user_id, search, period_type, is_active) {
  const sql = `
        SELECT
            COALESCE(SUM(b.amount), 0) AS total_budget_amount,
            COALESCE(SUM(COALESCE(actual.actual_amount, 0)), 0) AS total_actual_amount,
            COALESCE(SUM(
                CASE
                    WHEN COALESCE(actual.actual_amount, 0) > b.amount THEN 1
                    ELSE 0
                END
            ), 0) AS over_budget_count
        FROM budgets b
        JOIN categories c
            ON c.id = b.category_id
        LEFT JOIN (
            SELECT
                b2.id,
                COALESCE(SUM(
                    CASE
                        WHEN t.transaction_type = ? THEN t.amount
                        ELSE 0
                    END
                ), 0) AS actual_amount
            FROM budgets b2
            LEFT JOIN transactions t
                ON t.user_id = b2.user_id
               AND t.category_id = b2.category_id
               AND t.transaction_type = ?
               AND t.transaction_date BETWEEN b2.start_date AND b2.end_date
            WHERE b2.user_id = ?
            GROUP BY b2.id
        ) actual
            ON actual.id = b.id
        WHERE b.user_id = ?
          AND (? = '' OR c.category_name LIKE CONCAT('%', ?, '%'))
          AND (? = '' OR b.period_type = ?)
          AND (? = -1 OR b.is_active = ?)
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    'expense',
    'expense',
    user_id,
    user_id,
    search,
    search,
    period_type,
    period_type,
    is_active,
    is_active,
    1
  ]);

  return rows[0] || {
    total_budget_amount: 0,
    total_actual_amount: 0,
    over_budget_count: 0
  };
}

module.exports = {
  get_list,
  count_all,
  find_by_id,
  find_duplicate,
  find_overlapping_period,
  create,
  update,
  remove,
  get_actual_amount_by_budget_ids,
  get_totals
};