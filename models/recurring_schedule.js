const { pool } = require('../utils/db');

function add_calendar_months(iso_date, months_to_add) {
  const s = String(iso_date || '').slice(0, 10);
  const parts = s.split('-').map((x) => Number(x));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return s;
  }

  const [y, m, d] = parts;
  const base = new Date(y, m - 1 + months_to_add, 1);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${base.getFullYear()}-${mm}-${dd}`;
}

async function list_due_on_or_before(user_id, as_of_date) {
  const sql = `
        SELECT
            id,
            user_id,
            label,
            interval_months,
            next_due_date,
            is_active,
            transaction_type,
            amount,
            account_id,
            transfer_to_account_id,
            category_id,
            subcategory_id,
            payment_method,
            description,
            reference_no
        FROM recurring_schedules
        WHERE user_id = ?
          AND is_active = ?
          AND next_due_date <= ?
        ORDER BY next_due_date ASC, id ASC
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [user_id, 1, as_of_date, 500]);
  return rows;
}

async function update_next_due_date(id, user_id, next_due_date) {
  const sql = `
        UPDATE recurring_schedules
        SET next_due_date = ?
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

  const [result] = await pool.query(sql, [next_due_date, id, user_id, 1]);
  return result.affectedRows;
}

async function get_list(user_id, limit, offset) {
  const sql = `
        SELECT
            id,
            label,
            interval_months,
            next_due_date,
            is_active,
            transaction_type,
            amount,
            account_id,
            transfer_to_account_id,
            category_id,
            subcategory_id,
            payment_method,
            description,
            reference_no,
            created_at
        FROM recurring_schedules
        WHERE user_id = ?
        ORDER BY next_due_date ASC, id DESC
        LIMIT ? OFFSET ?
    `;

  const [rows] = await pool.query(sql, [user_id, limit, offset]);
  return rows;
}

async function count_all(user_id) {
  const sql = `
        SELECT COUNT(*) AS total
        FROM recurring_schedules
        WHERE user_id = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [user_id, 1]);
  return rows[0]?.total || 0;
}

async function find_by_id(id, user_id) {
  const sql = `
        SELECT *
        FROM recurring_schedules
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [id, user_id, 1]);
  return rows[0] || null;
}

async function create(data) {
  const sql = `
        INSERT INTO recurring_schedules (
            user_id,
            label,
            interval_months,
            next_due_date,
            is_active,
            transaction_type,
            amount,
            account_id,
            transfer_to_account_id,
            category_id,
            subcategory_id,
            payment_method,
            description,
            reference_no
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  const [result] = await pool.query(sql, [
    data.user_id,
    data.label || null,
    data.interval_months,
    data.next_due_date,
    data.is_active ?? 1,
    data.transaction_type,
    data.amount,
    data.account_id,
    data.transfer_to_account_id || null,
    data.category_id || null,
    data.subcategory_id || null,
    data.payment_method,
    data.description || null,
    data.reference_no || null
  ]);

  return result.insertId;
}

async function remove(id, user_id) {
  const sql = `
        DELETE FROM recurring_schedules
        WHERE id = ?
          AND user_id = ?
        LIMIT ?
    `;

  const [result] = await pool.query(sql, [id, user_id, 1]);
  return result.affectedRows;
}

module.exports = {
  add_calendar_months,
  list_due_on_or_before,
  update_next_due_date,
  get_list,
  count_all,
  find_by_id,
  create,
  remove
};
