const express = require('express');
const auth = require('../middleware/auth');
const loan = require('../controllers/loan');
const { allow_query_fields, allow_body_fields } = require('../middleware/security');

const router = express.Router();

router.get('/loan', auth, allow_query_fields(['page', 'search', 'loan_type', 'status']), loan.index);
router.get('/loan/create', auth, allow_query_fields([]), loan.show_create);
router.post('/loan', auth, allow_body_fields(['loan_type', 'counterparty_name', 'principal_amount', 'start_date', 'due_date', 'reminder_days', 'note']), loan.create);
router.get('/loan/:id', auth, allow_query_fields([]), loan.show_detail);
router.post(
  '/loan/:id/payment',
  auth,
  allow_body_fields(['amount', 'payment_date', 'payment_time', 'note', 'create_transaction', 'account_id', 'payment_method', 'include_in_dashboard']),
  loan.add_payment
);

module.exports = router;
