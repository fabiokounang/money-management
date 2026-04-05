const {
  pool
} = require('../utils/db');

async function get_dashboard_summary(user_id, from_date, to_date) {
  const sql = `
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_expense,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_transfer
        FROM transactions
        WHERE user_id = ?
          AND transaction_date BETWEEN ? AND ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    'income',
    'expense',
    'transfer',
    user_id,
    from_date,
    to_date,
    1
  ]);

  return rows[0] || {
    total_income: 0,
    total_expense: 0,
    total_transfer: 0
  };
}

async function get_recent_transactions(user_id, limit) {
  const sql = `
        SELECT
            t.id,
            t.transaction_date,
            t.transaction_type,
            t.amount,
            t.description,
            a.account_name,
            ta.account_name AS transfer_to_account_name,
            c.category_name
        FROM transactions t
        LEFT JOIN accounts a
            ON a.id = t.account_id
        LEFT JOIN accounts ta
            ON ta.id = t.transfer_to_account_id
        LEFT JOIN categories c
            ON c.id = t.category_id
        WHERE t.user_id = ?
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    limit
  ]);

  return rows;
}

async function get_top_expense_categories(user_id, from_date, to_date, limit) {
  const sql = `
        SELECT
            c.id,
            c.category_name,
            COALESCE(SUM(t.amount), 0) AS total
        FROM transactions t
        JOIN categories c
            ON c.id = t.category_id
        WHERE t.user_id = ?
          AND t.transaction_type = ?
          AND t.transaction_date BETWEEN ? AND ?
        GROUP BY c.id, c.category_name
        ORDER BY total DESC
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    'expense',
    from_date,
    to_date,
    limit
  ]);

  return rows;
}

async function count_transactions_in_period(user_id, from_date, to_date) {
  const sql = `
        SELECT COUNT(*) AS total
        FROM transactions
        WHERE user_id = ?
          AND transaction_date BETWEEN ? AND ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    from_date,
    to_date,
    1
  ]);

  return rows[0]?.total || 0;
}

async function get_summary(user_id, from_date, to_date, transaction_type, account_id) {
  const sql = `
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_expense,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_transfer
        FROM transactions
        WHERE user_id = ?
          AND transaction_date BETWEEN ? AND ?
          AND (? = '' OR transaction_type = ?)
          AND (? = 0 OR account_id = ? OR transfer_to_account_id = ?)
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    'income',
    'expense',
    'transfer',
    user_id,
    from_date,
    to_date,
    transaction_type,
    transaction_type,
    account_id,
    account_id,
    account_id,
    1
  ]);

  return rows[0] || {
    total_income: 0,
    total_expense: 0,
    total_transfer: 0
  };
}

async function get_category_summary(user_id, from_date, to_date, transaction_type, account_id) {
  const sql = `
        SELECT
            c.id,
            c.category_name,
            c.category_type,
            COALESCE(SUM(t.amount), 0) AS total
        FROM transactions t
        JOIN categories c
            ON c.id = t.category_id
        WHERE t.user_id = ?
          AND t.transaction_date BETWEEN ? AND ?
          AND t.category_id IS NOT NULL
          AND (? = '' OR t.transaction_type = ?)
          AND (? = 0 OR t.account_id = ? OR t.transfer_to_account_id = ?)
        GROUP BY c.id, c.category_name, c.category_type
        ORDER BY total DESC
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    from_date,
    to_date,
    transaction_type,
    transaction_type,
    account_id,
    account_id,
    account_id,
    1000
  ]);

  return rows;
}

async function get_selected_categories_total(user_id, from_date, to_date, transaction_type, account_id, category_ids) {
  if (!Array.isArray(category_ids) || category_ids.length === 0) {
    return 0;
  }

  const placeholders = category_ids.map(() => '?').join(', ');

  const sql = `
        SELECT
            COALESCE(SUM(amount), 0) AS total
        FROM transactions
        WHERE user_id = ?
          AND transaction_date BETWEEN ? AND ?
          AND category_id IN (${placeholders})
          AND (? = '' OR transaction_type = ?)
          AND (? = 0 OR account_id = ? OR transfer_to_account_id = ?)
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    user_id,
    from_date,
    to_date,
    ...category_ids,
    transaction_type,
    transaction_type,
    account_id,
    account_id,
    account_id,
    1
  ]);

  return rows[0]?.total || 0;
}

async function get_monthly_cashflow(user_id, month_limit) {
  const sql = `
        SELECT
            DATE_FORMAT(transaction_date, '%Y-%m') AS month_label,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions
        WHERE user_id = ?
        GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
        ORDER BY month_label DESC
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    'income',
    'expense',
    user_id,
    month_limit
  ]);

  return rows.reverse();
}

function trend_date_format_expression(granularity) {
  if (granularity === 'day') {
    return "DATE_FORMAT(transaction_date, '%Y-%m-%d')";
  }

  if (granularity === 'year') {
    return "DATE_FORMAT(transaction_date, '%Y')";
  }

  return "DATE_FORMAT(transaction_date, '%Y-%m')";
}

async function get_income_expense_trend(
  user_id,
  from_date,
  to_date,
  granularity,
  transaction_type,
  account_id,
  max_buckets = 800
) {
  const bucket_expr = trend_date_format_expression(granularity);

  const sql = `
        SELECT
            ${bucket_expr} AS period_label,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions
        WHERE user_id = ?
          AND transaction_date BETWEEN ? AND ?
          AND (? = '' OR transaction_type = ?)
          AND (? = 0 OR account_id = ? OR transfer_to_account_id = ?)
        GROUP BY ${bucket_expr}
        ORDER BY period_label ASC
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    'income',
    'expense',
    user_id,
    from_date,
    to_date,
    transaction_type,
    transaction_type,
    account_id,
    account_id,
    account_id,
    max_buckets
  ]);

  return rows;
}

async function get_monthly_income_expense(user_id, month_limit) {
    const sql = `
        SELECT
            DATE_FORMAT(transaction_date, '%Y-%m') AS month_label,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions
        WHERE user_id = ?
        GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
        ORDER BY month_label DESC
        LIMIT ?
    `;

    const [rows] = await pool.query(sql, [
        'income',
        'expense',
        user_id,
        month_limit
    ]);

    return rows.reverse();
}

async function get_expense_by_category(user_id, from_date, to_date, limit) {
    const sql = `
        SELECT
            c.category_name,
            COALESCE(SUM(t.amount), 0) AS total
        FROM transactions t
        JOIN categories c
            ON c.id = t.category_id
        WHERE t.user_id = ?
          AND t.transaction_type = ?
          AND t.transaction_date BETWEEN ? AND ?
        GROUP BY c.id, c.category_name
        ORDER BY total DESC
        LIMIT ?
    `;

    const [rows] = await pool.query(sql, [
        user_id,
        'expense',
        from_date,
        to_date,
        limit
    ]);

    return rows;
}

async function get_recent_transactions_by_range(user_id, from_date, to_date, limit) {
    const sql = `
        SELECT
            t.id,
            t.transaction_date,
            t.transaction_type,
            t.amount,
            t.description,
            a.account_name,
            ta.account_name AS transfer_to_account_name,
            c.category_name
        FROM transactions t
        LEFT JOIN accounts a
            ON a.id = t.account_id
        LEFT JOIN accounts ta
            ON ta.id = t.transfer_to_account_id
        LEFT JOIN categories c
            ON c.id = t.category_id
        WHERE t.user_id = ?
          AND t.transaction_date BETWEEN ? AND ?
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT ?
    `;

    const [rows] = await pool.query(sql, [
        user_id,
        from_date,
        to_date,
        limit
    ]);

    return rows;
}

async function get_income_expense_trend_by_range(user_id, from_date, to_date) {
    const sql = `
        SELECT
            DATE_FORMAT(transaction_date, '%Y-%m-%d') AS day_label,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_expense
        FROM transactions
        WHERE user_id = ?
          AND transaction_date BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(transaction_date, '%Y-%m-%d')
        ORDER BY day_label ASC
    `;

    const [rows] = await pool.query(sql, [
        'income',
        'expense',
        user_id,
        from_date,
        to_date
    ]);

    return rows;
}

async function get_period_summary(user_id, from_date, to_date) {
  const sql = `
        SELECT
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN transaction_type = ? THEN amount ELSE 0 END), 0) AS total_expense,
            COUNT(*) AS transaction_count
        FROM transactions
        WHERE user_id = ?
          AND transaction_date BETWEEN ? AND ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [
    'income',
    'expense',
    user_id,
    from_date,
    to_date,
    1
  ]);

  return rows[0] || {
    total_income: 0,
    total_expense: 0,
    transaction_count: 0
  };
}

module.exports = {
  get_dashboard_summary,
  get_recent_transactions,
  get_top_expense_categories,
  count_transactions_in_period,
  get_summary,
  get_category_summary,
  get_selected_categories_total,
  get_monthly_cashflow,
  get_income_expense_trend,
  get_monthly_income_expense,
  get_expense_by_category,
  get_recent_transactions_by_range,
  get_income_expense_trend_by_range,
  get_period_summary
};