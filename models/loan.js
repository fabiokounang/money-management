const { pool } = require('../utils/db');
const {
  money,
  normalize_debt_cash_effect
} = require('../utils/accountBalance');

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
        source_transaction_id,
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

function derive_status(outstanding_amount, due_date) {
  const outstanding = money(outstanding_amount);
  if (outstanding <= 0) return 'settled';
  if (due_date && new Date(`${due_date}T23:59:59`) < new Date()) return 'overdue';
  return 'open';
}

async function createInConnection(conn, data) {
  const [result] = await conn.query(
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
        note,
        source_transaction_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.note || null,
      data.source_transaction_id || null
    ]
  );
  return result.insertId;
}

async function create(data) {
  return createInConnection(pool, data);
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
        source_transaction_id,
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
      SELECT id, loan_id, user_id, payment_date, payment_time, amount, note, transaction_id, created_at
      FROM loan_payments
      WHERE loan_id = ?
        AND user_id = ?
      ORDER BY payment_date DESC, payment_time DESC, id DESC
    `,
    [loan_id, user_id]
  );
  return rows;
}

async function find_payment_by_transaction_id_in_connection(conn, transaction_id, user_id) {
  const [rows] = await conn.query(
    `
      SELECT id, loan_id, user_id, payment_date, payment_time, amount, note, transaction_id
      FROM loan_payments
      WHERE transaction_id = ?
        AND user_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [transaction_id, user_id]
  );
  return rows[0] || null;
}

async function find_by_source_transaction_id_in_connection(conn, transaction_id, user_id) {
  const [rows] = await conn.query(
    `
      SELECT id, user_id, loan_type, principal_amount, outstanding_amount, due_date, status, source_transaction_id
      FROM loan_records
      WHERE source_transaction_id = ?
        AND user_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [transaction_id, user_id]
  );
  return rows[0] || null;
}

async function count_payments_in_connection(conn, loan_id, user_id) {
  const [rows] = await conn.query(
    `
      SELECT COUNT(*) AS total
      FROM loan_payments
      WHERE loan_id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [loan_id, user_id]
  );
  return Number(rows[0]?.total || 0);
}

async function delete_in_connection(conn, loan_id, user_id) {
  await conn.query(
    `
      DELETE FROM loan_payments
      WHERE loan_id = ?
        AND user_id = ?
    `,
    [loan_id, user_id]
  );
  const [result] = await conn.query(
    `
      DELETE FROM loan_records
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [loan_id, user_id]
  );
  return result.affectedRows;
}

async function update_principal_from_source_tx_in_connection(conn, data) {
  const principal = money(data.principal_amount);
  const status = derive_status(principal, null);
  // Keep loan_type aligned with debt cash direction when possible.
  const loan_type = normalize_debt_cash_effect(data.debt_cash_effect) === 'out' ? 'receivable' : 'payable';

  const [loanRows] = await conn.query(
    `
      SELECT id, due_date
      FROM loan_records
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [data.loan_id, data.user_id]
  );
  const loanRow = loanRows[0] || null;
  if (!loanRow) {
    throw new Error('LOAN_NOT_FOUND');
  }

  const newStatus = derive_status(principal, loanRow.due_date);

  await conn.query(
    `
      UPDATE loan_records
      SET principal_amount = ?,
          outstanding_amount = ?,
          loan_type = ?,
          status = ?
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [principal, principal, loan_type, newStatus || status, data.loan_id, data.user_id]
  );
}

async function reverse_payment_in_connection(conn, data) {
  const [loanRows] = await conn.query(
    `
      SELECT id, user_id, due_date, outstanding_amount, principal_amount
      FROM loan_records
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
      FOR UPDATE
    `,
    [data.loan_id, data.user_id]
  );
  const loanRow = loanRows[0] || null;
  if (!loanRow) {
    throw new Error('LOAN_NOT_FOUND');
  }

  const restored = money(Number(loanRow.outstanding_amount || 0) + Number(data.amount || 0));
  const capped = Math.min(restored, money(loanRow.principal_amount));
  const newStatus = derive_status(capped, loanRow.due_date);

  await conn.query(
    `
      DELETE FROM loan_payments
      WHERE id = ?
        AND loan_id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [data.payment_id, data.loan_id, data.user_id]
  );

  await conn.query(
    `
      UPDATE loan_records
      SET outstanding_amount = ?,
          status = ?
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [capped, newStatus, data.loan_id, data.user_id]
  );
}

/**
 * Record a payment and optionally create the cash transaction in the same DB transaction.
 */
async function add_payment_with_optional_transaction(data, createTransactionFn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [loanRows] = await conn.query(
      `
        SELECT id, user_id, loan_type, due_date, status, outstanding_amount, counterparty_name
        FROM loan_records
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [data.loan_id, data.user_id]
    );
    const loanRow = loanRows[0] || null;
    if (!loanRow) {
      throw new Error('LOAN_NOT_FOUND');
    }

    const currentOutstanding = money(loanRow.outstanding_amount);
    const amount = money(data.amount);
    if (amount <= 0) {
      throw new Error('INVALID_PAYMENT_AMOUNT');
    }
    if (amount > currentOutstanding) {
      throw new Error('PAYMENT_EXCEEDS_OUTSTANDING');
    }

    const [paymentResult] = await conn.query(
      `
        INSERT INTO loan_payments (loan_id, user_id, payment_date, payment_time, amount, note, transaction_id)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
      `,
      [
        data.loan_id,
        data.user_id,
        data.payment_date,
        data.payment_time || '00:00:00',
        amount,
        data.note || null
      ]
    );
    const payment_id = paymentResult.insertId;

    const newOutstanding = money(Math.max(0, currentOutstanding - amount));
    const newStatus = derive_status(newOutstanding, loanRow.due_date);

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

    let transaction_id = null;
    if (data.create_transaction) {
      if (!data.account_id) {
        throw new Error('PAYMENT_ACCOUNT_REQUIRED');
      }
      if (typeof createTransactionFn !== 'function') {
        throw new Error('CREATE_TX_FN_REQUIRED');
      }

      const tx_type = loanRow.loan_type === 'receivable' ? 'income' : 'expense';
      const tx_desc_prefix = loanRow.loan_type === 'receivable' ? 'Loan payment received' : 'Loan payment paid';

      const created = await createTransactionFn(conn, {
        user_id: data.user_id,
        transaction_date: data.payment_date,
        transaction_time: data.payment_time || '00:00:00',
        transaction_type: tx_type,
        amount,
        category_id: null,
        subcategory_id: null,
        account_id: data.account_id,
        transfer_to_account_id: null,
        payment_method: data.payment_method || 'bank_transfer',
        include_in_dashboard: Number(data.include_in_dashboard) === 1 ? 1 : 0,
        include_in_budget: Number(data.include_in_budget) === 1 ? 1 : 0,
        description: `${tx_desc_prefix} - ${loanRow.counterparty_name} (loan #${data.loan_id})`,
        reference_no: null
      });

      transaction_id = created.id;
      await conn.query(
        `
          UPDATE loan_payments
          SET transaction_id = ?
          WHERE id = ?
            AND user_id = ?
          LIMIT 1
        `,
        [transaction_id, payment_id, data.user_id]
      );
    }

    await conn.commit();
    return { payment_id, transaction_id };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** @deprecated Prefer add_payment_with_optional_transaction for cash sync. */
async function add_payment(data) {
  return add_payment_with_optional_transaction({
    ...data,
    create_transaction: false
  });
}

async function set_source_transaction_id_in_connection(conn, loan_id, user_id, transaction_id) {
  await conn.query(
    `
      UPDATE loan_records
      SET source_transaction_id = ?
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [transaction_id, loan_id, user_id]
  );
}

module.exports = {
  touch_overdue_statuses,
  count_all,
  get_list,
  get_summary,
  create,
  createInConnection,
  find_by_id,
  get_payments,
  add_payment,
  add_payment_with_optional_transaction,
  find_payment_by_transaction_id_in_connection,
  find_by_source_transaction_id_in_connection,
  count_payments_in_connection,
  delete_in_connection,
  update_principal_from_source_tx_in_connection,
  reverse_payment_in_connection,
  set_source_transaction_id_in_connection
};
