const express = require('express');
const auth = require('../middleware/auth');
const exportController = require('../controllers/export');
const { allow_query_fields } = require('../middleware/security');

const router = express.Router();

router.get('/export/transactions/csv', auth, allow_query_fields(['from_date', 'to_date', 'transaction_type', 'account_id', 'category_id', 'search']), exportController.transactions_csv);

module.exports = router;