const { pool } = require('../utils/db');

async function touch_overdue_statuses(user_id) {
  await pool.query(
    `
      UPDATE loan_records
      SET status = CASE
        WHEN outstanding_amount <= 0 THEN 'settled'
        WHEN due_date IS NOT NULL AND due_date < CURDATE() THEN 'overdue'
        ELSE 'open'
      END
      WHERE user_id = ?
    `,
    [user_id]
  );
}

async function count_all(user_id, filters = {}) {
  const search = String(filters.search || '').trim();
  const loan_type = String(filters.loan_type || '').trim();
  const status = String(filters.status || '').trim();

  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM loan_records
      WHERE user_id = ?
        AND (? = '' OR counterparty_name LIKE CONCAT('%', ?, '%'))
        AND (? = '' OR loan_type = ?)
        AND (? = '' OR status = ?)
      LIMIT 1
    `,
    [user_id, search, search, loan_type, loan_type, status, status]
  );

  return Number(rows[0]?.total || 0);
}

async function get_list(user_id, limit, offset, filters = {}) {
  const search = String(filters.search || '').trim();
  const loan_type = String(filters.loan_type || '').trim();
  const status = String(filters.status || '').trim();

  const [rows] = await pool.query(
    `
      SELECT
        id,
        user_id,
        loan_type,
        counterparty_name,
        principal_amount,
        outstanding_amount,
        start_date,
        due_date,
        status,
        reminder_days,
        note,
        created_at,
        updated_at
      FROM loan_records
      WHERE user_id = ?
        AND (? = '' OR counterparty_name LIKE CONCAT('%', ?, '%'))
        AND (? = '' OR loan_type = ?)
        AND (? = '' OR status = ?)
      ORDER BY
        CASE status WHEN 'overdue' THEN 0 WHEN 'open' THEN 1 ELSE 2 END ASC,
        due_date IS NULL ASC,
        due_date ASC,
        id DESC
      LIMIT ? OFFSET ?
    `,
    [user_id, search, search, loan_type, loan_type, status, status, limit, offset]
  );

  return rows;
}

async function get_summary(user_id) {
  const [rows] = await pool.query(
    `
      SELECT
        COALESCE(SUM(CASE WHEN loan_type = 'receivable' AND status != 'settled' THEN outstanding_amount ELSE 0 END), 0) AS receivable_outstanding,
        COALESCE(SUM(CASE WHEN loan_type = 'payable' AND status != 'settled' THEN outstanding_amount ELSE 0 END), 0) AS payable_outstanding,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END), 0) AS overdue_count,
        COALESCE(SUM(CASE WHEN status != 'settled' THEN 1 ELSE 0 END), 0) AS open_count
      FROM loan_records
      WHERE user_id = ?
      LIMIT 1
    `,
    [user_id]
  );
  return rows[0] || {
    receivable_outstanding: 0,
    payable_outstanding: 0,
    overdue_count: 0,
    open_count: 0
  };
}

async function create(data) {
  const [result] = await pool.query(
    `
      INSERT INTO loan_records (
        user_id,
        loan_type,
        counterparty_name,
        principal_amount,
        outstanding_amount,
        start_date,
        due_date,
        status,
        reminder_days,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      data.user_id,
      data.loan_type,
      data.counterparty_name,
      data.principal_amount,
      data.outstanding_amount,
      data.start_date,
      data.due_date || null,
      data.status || 'open',
      data.reminder_days || 0,
      data.note || null
    ]
  );
  return result.insertId;
}

async function find_by_id(id, user_id) {
  const [rows] = await pool.query(
    `
      SELECT
        id,
        user_id,
        loan_type,
        counterparty_name,
        principal_amount,
        outstanding_amount,
        start_date,
        due_date,
        status,
        reminder_days,
        note,
        created_at,
        updated_at
      FROM loan_records
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [id, user_id]
  );
  return rows[0] || null;
}

async function get_payments(loan_id, user_id) {
  const [rows] = await pool.query(
    `
      SELECT id, loan_id, user_id, payment_date, payment_time, amount, note, created_at
      FROM loan_payments
      WHERE loan_id = ?
        AND user_id = ?
      ORDER BY payment_date DESC, payment_time DESC, id DESC
    `,
    [loan_id, user_id]
  );
  return rows;
}

async function add_payment(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [loanRows] = await conn.query(
      `
        SELECT id, user_id, due_date, status, outstanding_amount
        FROM loan_records
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [data.loan_id, data.user_id]
    );
    const loan = loanRows[0] || null;
    if (!loan) {
      throw new Error('LOAN_NOT_FOUND');
    }

    const currentOutstanding = Number(loan.outstanding_amount || 0);
    const amount = Number(data.amount || 0);
    if (amount <= 0) {
      throw new Error('INVALID_PAYMENT_AMOUNT');
    }
    if (amount > currentOutstanding) {
      throw new Error('PAYMENT_EXCEEDS_OUTSTANDING');
    }

    await conn.query(
      `
        INSERT INTO loan_payments (loan_id, user_id, payment_date, payment_time, amount, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [data.loan_id, data.user_id, data.payment_date, data.payment_time || '00:00:00', amount, data.note || null]
    );

    const newOutstanding = Math.max(0, currentOutstanding - amount);
    let newStatus = 'open';
    if (newOutstanding <= 0) {
      newStatus = 'settled';
    } else if (loan.due_date && new Date(loan.due_date) < new Date()) {
      newStatus = 'overdue';
    }

    await conn.query(
      `
        UPDATE loan_records
        SET outstanding_amount = ?,
            status = ?
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
      `,
      [newOutstanding, newStatus, data.loan_id, data.user_id]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  touch_overdue_statuses,
  count_all,
  get_list,
  get_summary,
  create,
  find_by_id,
  get_payments,
  add_payment
};
