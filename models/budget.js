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
            COALESCE(SUM(CASE WHEN b.period_type = 'weekly' THEN b.amount ELSE 0 END), 0) AS weekly_budget_amount,
            COALESCE(SUM(CASE WHEN b.period_type = 'monthly' THEN b.amount ELSE 0 END), 0) AS monthly_budget_amount,
            COALESCE(SUM(CASE WHEN b.period_type = 'yearly' THEN b.amount ELSE 0 END), 0) AS yearly_budget_amount,
            COALESCE(SUM(CASE WHEN b.period_type = 'custom' THEN b.amount ELSE 0 END), 0) AS custom_budget_amount,
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
    weekly_budget_amount: 0,
    monthly_budget_amount: 0,
    yearly_budget_amount: 0,
    custom_budget_amount: 0,
    total_actual_amount: 0,
    over_budget_count: 0
  };
}

async function get_totals_by_period_type(user_id, search, period_type, is_active) {
  const sql = `
        SELECT
            COALESCE(SUM(CASE WHEN b.period_type = 'weekly' THEN b.amount ELSE 0 END), 0) AS weekly_budget_amount,
            COALESCE(SUM(CASE WHEN b.period_type = 'monthly' THEN b.amount ELSE 0 END), 0) AS monthly_budget_amount,
            COALESCE(SUM(CASE WHEN b.period_type = 'yearly' THEN b.amount ELSE 0 END), 0) AS yearly_budget_amount,
            COALESCE(SUM(CASE WHEN b.period_type = 'custom' THEN b.amount ELSE 0 END), 0) AS custom_budget_amount
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

  return rows[0] || {
    weekly_budget_amount: 0,
    monthly_budget_amount: 0,
    yearly_budget_amount: 0,
    custom_budget_amount: 0
  };
}

async function get_active_period_usage_rows(user_id) {
  const sql = `
        SELECT
            b.id,
            b.amount,
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
          AND b.is_active = ?
          AND CURDATE() BETWEEN b.start_date AND b.end_date
        GROUP BY b.id, b.amount
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, ['expense', 'expense', user_id, 1, 500]);
  return rows;
}

async function get_active_period_alert_counts(user_id) {
  const rows = await get_active_period_usage_rows(user_id);
  let near_count = 0;
  let over_count = 0;

  rows.forEach((row) => {
    const budget_amount = Number(row.amount || 0);
    const actual = Number(row.actual_amount || 0);

    if (budget_amount <= 0) {
      return;
    }

    if (actual > budget_amount) {
      over_count += 1;
      return;
    }

    if (actual >= budget_amount * 0.8) {
      near_count += 1;
    }
  });

  return {
    near_count,
    over_count,
    tracked_count: rows.length
  };
}

/**
 * Budgets whose period overlaps [range_from, range_to], with expense total
 * only for transactions in the intersection of budget window and report range.
 */
async function get_recap_by_date_range(user_id, range_from, range_to) {
  const sql = `
        SELECT
            b.id,
            b.category_id,
            b.amount AS budget_amount,
            b.period_type,
            b.start_date AS budget_start,
            b.end_date AS budget_end,
            b.is_active,
            b.note,
            c.category_name,
            GREATEST(b.start_date, ?) AS slice_from,
            LEAST(b.end_date, ?) AS slice_to,
            COALESCE(SUM(
                CASE
                    WHEN t.transaction_type = ? THEN t.amount
                    ELSE 0
                END
            ), 0) AS spent
        FROM budgets b
        INNER JOIN categories c
            ON c.id = b.category_id
        LEFT JOIN transactions t
            ON t.user_id = b.user_id
           AND t.category_id = b.category_id
           AND t.transaction_type = ?
           AND t.transaction_date >= GREATEST(b.start_date, ?)
           AND t.transaction_date <= LEAST(b.end_date, ?)
        WHERE b.user_id = ?
          AND b.start_date <= ?
          AND b.end_date >= ?
        GROUP BY
            b.id,
            b.category_id,
            b.amount,
            b.period_type,
            b.start_date,
            b.end_date,
            b.is_active,
            b.note,
            c.category_name
        ORDER BY
            c.category_name ASC
    `;

  const [rows] = await pool.query(sql, [
    range_from,
    range_to,
    'expense',
    'expense',
    range_from,
    range_to,
    user_id,
    range_to,
    range_from
  ]);

  return rows;
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
  get_totals,
  get_totals_by_period_type,
  get_active_period_usage_rows,
  get_active_period_alert_counts,
  get_recap_by_date_range
};