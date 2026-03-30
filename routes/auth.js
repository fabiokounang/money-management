const express = require('express');
const auth = require('../controllers/auth');

const router = express.Router();

router.get('/login', auth.show_login);
router.get('/register', auth.show_register);

router.post('/login', auth.login);
router.post('/register', auth.register);
router.post('/logout', auth.logout);

module.exports = router;