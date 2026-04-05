const express = require('express');
const auth = require('../middleware/auth');
const dashboard = require('../controllers/dashboard');

const router = express.Router();

router.get('/dashboard', auth, dashboard.index);
router.post('/dashboard/planned-income', auth, dashboard.save_planned_income);

module.exports = router;