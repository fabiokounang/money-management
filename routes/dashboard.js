const express = require('express');
const auth = require('../middleware/auth');
const dashboard = require('../controllers/dashboard');
const { allow_query_fields, allow_body_fields } = require('../middleware/security');

const router = express.Router();

router.get('/dashboard', auth, allow_query_fields(['page', 'from_date', 'to_date', 'trend_granularity']), dashboard.index);
router.post(
  '/dashboard/planned-income',
  auth,
  allow_body_fields(['plan_month', 'planned_income', 'redirect_from_date', 'redirect_to_date', 'redirect_trend_granularity']),
  dashboard.save_planned_income
);

module.exports = router;