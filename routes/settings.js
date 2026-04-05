const express = require('express');
const auth = require('../middleware/auth');
const settings = require('../controllers/settings');

const router = express.Router();

router.get('/settings/email', auth, settings.email_page);
router.post('/settings/email/test', auth, settings.send_test_email);

module.exports = router;
