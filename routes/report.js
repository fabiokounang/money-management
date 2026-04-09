const express = require('express');
const auth = require('../middleware/auth');
const report = require('../controllers/report');
const { allow_query_fields } = require('../middleware/security');

const router = express.Router();

router.get('/report', auth, allow_query_fields(['from_date', 'to_date', 'transaction_type', 'account_id', 'category_ids', 'trend_granularity']), report.index);

module.exports = router;