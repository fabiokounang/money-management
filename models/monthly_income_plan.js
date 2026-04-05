const { pool } = require('../utils/db');

async function get_planned_income(user_id, plan_month) {
  const sql = `
        SELECT planned_income
        FROM monthly_income_plans
        WHERE user_id = ?
          AND plan_month = ?
        LIMIT ?
    `;

  const [rows] = await pool.query(sql, [user_id, plan_month, 1]);
  const row = rows[0];
  return row ? Number(row.planned_income || 0) : 0;
}

async function upsert_planned_income(user_id, plan_month, planned_income) {
  const sql = `
        INSERT INTO monthly_income_plans (user_id, plan_month, planned_income)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            planned_income = VALUES(planned_income),
            updated_at = CURRENT_TIMESTAMP
    `;

  await pool.query(sql, [user_id, plan_month, planned_income]);
}

module.exports = {
  get_planned_income,
  upsert_planned_income
};
