const express = require('express');
const auth = require('../middleware/auth');
const dashboard = require('../controllers/dashboard');

const router = express.Router();

router.get('/dashboard', auth, dashboard.index);

module.exports = router;