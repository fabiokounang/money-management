const express = require('express');
const auth = require('../middleware/auth');
const budget = require('../controllers/budget');
const { allow_query_fields, allow_body_fields } = require('../middleware/security');

const router = express.Router();

router.get('/budget', auth, allow_query_fields(['page', 'search', 'period_type', 'is_active']), budget.index);
router.get('/budget/recap', auth, allow_query_fields(['from_date', 'to_date']), budget.recap);
router.get('/budget/create', auth, allow_query_fields([]), budget.show_create);
router.post('/budget', auth, allow_body_fields(['category_id', 'amount', 'period_type', 'start_date', 'end_date', 'note', 'is_active']), budget.create);
router.get('/budget/:id/edit', auth, allow_query_fields([]), budget.show_edit);
router.put('/budget/:id', auth, allow_body_fields(['category_id', 'amount', 'period_type', 'start_date', 'end_date', 'note', 'is_active']), budget.update);
router.delete('/budget/:id', auth, allow_body_fields([]), budget.remove);

module.exports = router;