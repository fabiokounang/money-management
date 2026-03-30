const express = require('express');
const auth = require('../middleware/auth');
const report = require('../controllers/report');

const router = express.Router();

router.get('/report', auth, report.index);

module.exports = router;