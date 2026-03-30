const express = require('express');
const auth = require('../middleware/auth');
const exportController = require('../controllers/export');

const router = express.Router();

router.get('/export/transactions/csv', auth, exportController.transactions_csv);

module.exports = router;