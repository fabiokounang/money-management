/**
 * Shared helpers for account balance math and locked relative updates.
 */

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function normalize_debt_cash_effect(value, fallback = 'in') {
  return value === 'out' ? 'out' : (value === 'in' ? 'in' : fallback);
}

/**
 * Signed cash effect of one transaction on a given account.
 * Positive = money into account; negative = money out.
 */
function transaction_effect_on_account(tx, account_id) {
  const amount = money(tx.amount);
  const accountId = Number(account_id);
  const fromId = Number(tx.account_id || 0);
  const toId = Number(tx.transfer_to_account_id || 0);
  const type = String(tx.transaction_type || '');

  if (type === 'income' && fromId === accountId) return amount;
  if (type === 'expense' && fromId === accountId) return -amount;
  if (type === 'debt' && fromId === accountId) {
    return normalize_debt_cash_effect(tx.debt_cash_effect) === 'out' ? -amount : amount;
  }
  if (type === 'transfer') {
    if (fromId === accountId) return -amount;
    if (toId === accountId) return amount;
  }
  return 0;
}

function compute_balance_from_ledger(opening_balance, transactions, account_id) {
  let balance = money(opening_balance);
  for (const tx of transactions || []) {
    balance = money(balance + transaction_effect_on_account(tx, account_id));
  }
  return balance;
}

async function lock_accounts(connection, user_id, account_ids) {
  const ids = [...new Set((account_ids || []).map((id) => Number(id)).filter((id) => id > 0))].sort((a, b) => a - b);
  const map = {};

  for (const account_id of ids) {
    const [rows] = await connection.query(
      `
        SELECT id, user_id, account_name, current_balance, opening_balance, is_active
        FROM accounts
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [account_id, user_id]
    );
    const row = rows[0] || null;
    if (!row) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }
    map[account_id] = {
      id: Number(row.id),
      account_name: row.account_name,
      current_balance: money(row.current_balance),
      opening_balance: money(row.opening_balance),
      is_active: Number(row.is_active || 0)
    };
  }

  return map;
}

/**
 * Apply a signed delta with a relative SQL update under an already-locked row.
 * Debits (negative delta) fail with INSUFFICIENT_BALANCE if funds are short.
 */
async function apply_balance_delta(connection, user_id, account_id, delta) {
  const amount = money(delta);
  if (amount === 0) return;

  if (amount > 0) {
    const [result] = await connection.query(
      `
        UPDATE accounts
        SET current_balance = current_balance + ?
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
      `,
      [amount, account_id, user_id]
    );
    if (!result.affectedRows) {
      throw new Error('ACCOUNT_NOT_FOUND');
    }
    return;
  }

  const debit = money(Math.abs(amount));
  const [result] = await connection.query(
    `
      UPDATE accounts
      SET current_balance = current_balance - ?
      WHERE id = ?
        AND user_id = ?
        AND current_balance >= ?
      LIMIT 1
    `,
    [debit, account_id, user_id, debit]
  );

  if (!result.affectedRows) {
    throw new Error('INSUFFICIENT_BALANCE');
  }
}

/**
 * Reverse a previous cash effect. Uses INVALID_BALANCE_REVERSE when undoing
 * a credit would drive the account negative (same rule as delete).
 */
async function reverse_balance_delta(connection, user_id, account_id, original_delta) {
  const amount = money(original_delta);
  if (amount === 0) return;

  // Original was credit → reverse is debit (needs funds).
  // Original was debit → reverse is credit (always ok).
  if (amount > 0) {
    const [result] = await connection.query(
      `
        UPDATE accounts
        SET current_balance = current_balance - ?
        WHERE id = ?
          AND user_id = ?
          AND current_balance >= ?
        LIMIT 1
      `,
      [amount, account_id, user_id, amount]
    );
    if (!result.affectedRows) {
      throw new Error('INVALID_BALANCE_REVERSE');
    }
    return;
  }

  const credit = money(Math.abs(amount));
  const [result] = await connection.query(
    `
      UPDATE accounts
      SET current_balance = current_balance + ?
      WHERE id = ?
        AND user_id = ?
      LIMIT 1
    `,
    [credit, account_id, user_id]
  );
  if (!result.affectedRows) {
    throw new Error('ACCOUNT_NOT_FOUND');
  }
}

async function apply_transaction_effects(connection, user_id, tx, mode) {
  const accountIds = [Number(tx.account_id || 0)];
  if (tx.transaction_type === 'transfer' && tx.transfer_to_account_id) {
    accountIds.push(Number(tx.transfer_to_account_id));
  }

  // Lock in sorted order to avoid deadlocks.
  const accountMap = await lock_accounts(connection, user_id, accountIds);

  const fromId = Number(tx.account_id || 0);
  const toId = Number(tx.transfer_to_account_id || 0);
  const amount = money(tx.amount);
  const type = String(tx.transaction_type || '');
  const apply = mode === 'reverse' ? reverse_balance_delta : apply_balance_delta;

  if (mode === 'apply') {
    const source = accountMap[fromId];
    if (!source || Number(source.is_active) !== 1) {
      throw new Error('SOURCE_ACCOUNT_INVALID');
    }
    if (type === 'transfer') {
      const destination = accountMap[toId];
      if (!destination || Number(destination.is_active) !== 1) {
        throw new Error('DESTINATION_ACCOUNT_INVALID');
      }
    }
  }

  if (type === 'income') {
    await apply(connection, user_id, fromId, amount);
    return;
  }

  if (type === 'expense') {
    await apply(connection, user_id, fromId, -amount);
    return;
  }

  if (type === 'debt') {
    const effect = normalize_debt_cash_effect(tx.debt_cash_effect);
    await apply(connection, user_id, fromId, effect === 'out' ? -amount : amount);
    return;
  }

  if (type === 'transfer') {
    // Reverse transfer: debit destination first so INVALID_BALANCE_REVERSE
    // is raised before source is credited when mode=reverse.
    if (mode === 'reverse') {
      await apply(connection, user_id, toId, amount);
      await apply(connection, user_id, fromId, -amount);
    } else {
      await apply(connection, user_id, fromId, -amount);
      await apply(connection, user_id, toId, amount);
    }
  }
}

module.exports = {
  money,
  normalize_debt_cash_effect,
  transaction_effect_on_account,
  compute_balance_from_ledger,
  lock_accounts,
  apply_balance_delta,
  reverse_balance_delta,
  apply_transaction_effects
};
