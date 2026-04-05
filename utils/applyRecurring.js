const transaction = require('../models/transaction');
const recurring = require('../models/recurring_schedule');

async function apply_due_recurring_for_user(user_id) {
  try {
  const today = new Date().toISOString().slice(0, 10);
  const due_rows = await recurring.list_due_on_or_before(user_id, today);

  for (const row of due_rows) {
    let next_due = String(row.next_due_date).slice(0, 10);
    const interval = Math.max(1, Number(row.interval_months || 1));
    let guard = 0;

    while (next_due <= today && guard < 48) {
      guard += 1;

      try {
        await transaction.create_with_balance_update({
          user_id,
          transaction_date: next_due,
          transaction_type: row.transaction_type,
          amount: row.amount,
          category_id: row.category_id || null,
          subcategory_id: row.subcategory_id || null,
          account_id: row.account_id,
          transfer_to_account_id: row.transfer_to_account_id || null,
          payment_method: row.payment_method,
          description: row.description || null,
          reference_no: row.reference_no || null
        });

        next_due = recurring.add_calendar_months(next_due, interval);
        await recurring.update_next_due_date(row.id, user_id, next_due);
      } catch (err) {
        console.error('[recurring] skip schedule', row.id, err.message || err);
        break;
      }
    }
  }
  } catch (err) {
    console.error('[recurring] apply_due_recurring_for_user failed (did you run sql/migration_recurring_schedules.sql?)', err.message || err);
  }
}

module.exports = {
  apply_due_recurring_for_user
};
