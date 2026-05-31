const budget = require('../models/budget');
const { local_calendar_iso_date } = require('./validation');
const { next_period_after_end } = require('./budgetPeriod');

async function apply_budget_autorenew_for_user(user_id) {
  let renewed_count = 0;

  try {
    const today = local_calendar_iso_date();
    const expired_rows = await budget.list_expired_auto_renew(user_id, today);

    for (const row of expired_rows) {
      let current = row;
      let guard = 0;

      while (guard < 36) {
        guard += 1;
        const end_str = String(current.end_date || '').slice(0, 10);
        if (!end_str || end_str >= today) {
          break;
        }

        const next = next_period_after_end(current.period_type, end_str);
        if (!next.ok) {
          break;
        }

        const duplicate = await budget.find_duplicate(
          user_id,
          current.category_id,
          current.period_type,
          next.start_date,
          next.end_date,
          0
        );

        if (duplicate) {
          await budget.set_is_active(current.id, user_id, 0);
          break;
        }

        const overlap = await budget.find_overlapping_period(
          user_id,
          current.category_id,
          next.start_date,
          next.end_date,
          0
        );

        if (overlap) {
          await budget.set_is_active(current.id, user_id, 0);
          break;
        }

        const new_id = await budget.create({
          user_id,
          category_id: current.category_id,
          amount: current.amount,
          period_type: current.period_type,
          start_date: next.start_date,
          end_date: next.end_date,
          note: current.note,
          is_active: 1,
          auto_renew: 1
        });

        await budget.set_is_active(current.id, user_id, 0);
        renewed_count += 1;

        current = await budget.find_by_id(new_id, user_id);
        if (!current) {
          break;
        }
      }
    }
  } catch (err) {
    console.error('[budget-renew] apply_budget_autorenew_for_user failed (run sql/migration_budget_auto_renew.sql?)', err.message || err);
  }

  return renewed_count;
}

module.exports = {
  apply_budget_autorenew_for_user
};
