const { pool } = require('../utils/db');

function is_no_such_table_error(err) {
  return Boolean(err && (err.code === 'ER_NO_SUCH_TABLE' || Number(err.errno) === 1146));
}

async function get_planned_income(user_id, plan_month) {
  const sql = `
        SELECT planned_income
        FROM monthly_income_plans
        WHERE user_id = ?
          AND plan_month = ?
        LIMIT ?
    `;

  try {
    const [rows] = await pool.query(sql, [user_id, plan_month, 1]);
    const row = rows[0];
    return row ? Number(row.planned_income || 0) : 0;
  } catch (err) {
    if (is_no_such_table_error(err)) {
      return 0;
    }
    throw err;
  }
}

async function upsert_planned_income(user_id, plan_month, planned_income) {
  const sql = `
        INSERT INTO monthly_income_plans (user_id, plan_month, planned_income)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            planned_income = VALUES(planned_income),
            updated_at = CURRENT_TIMESTAMP
    `;

  try {
    await pool.query(sql, [user_id, plan_month, planned_income]);
  } catch (err) {
    if (is_no_such_table_error(err)) {
      const wrapped = new Error(
        'The monthly_income_plans table is missing. Run sql/migration_monthly_income_plans.sql on your database, then try again.'
      );
      wrapped.isMigrationRequired = true;
      throw wrapped;
    }
    throw err;
  }
}

module.exports = {
  get_planned_income,
  upsert_planned_income
};
