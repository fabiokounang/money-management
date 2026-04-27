const transaction = require('../models/transaction');
const recurring = require('../models/recurring_schedule');
const { local_calendar_iso_date } = require('./validation');

async function apply_due_recurring_for_user(user_id) {
  try {
  const today = local_calendar_iso_date();
  const due_rows = await recurring.list_due_on_or_before(user_id, today);

  for (const row of due_rows) {
    let next_due = String(row.next_due_date).slice(0, 10);
    const interval = Math.max(1, Number(row.interval_months || 1));
    let guard = 0;

    while (next_due <= today && guard < 48) {
      guard += 1;

      try {
        const advanced_due = recurring.add_calendar_months(next_due, interval);
        const locked = await recurring.update_next_due_date_if_current(
          row.id,
          user_id,
          next_due,
          advanced_due
        );

        // Another process already advanced this schedule, skip to avoid duplicates.
        if (!locked) {
          break;
        }

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
          reference_no: row.reference_no || null,
          include_in_dashboard: 1
        });

        next_due = advanced_due;
      } catch (err) {
        try {
          await recurring.update_next_due_date_if_current(row.id, user_id, recurring.add_calendar_months(next_due, interval), next_due);
        } catch (rollbackErr) {
          console.error('[recurring] failed to rollback next_due_date after post error', row.id, rollbackErr.message || rollbackErr);
        }
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
