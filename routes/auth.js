const express = require('express');
const auth = require('../controllers/auth');
const {
  create_rate_limiter,
  allow_query_fields,
  allow_body_fields
} = require('../middleware/security');

const router = express.Router();

const auth_attempt_limiter = create_rate_limiter({
  name: 'auth-attempt',
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  keyGenerator(req) {
    const id = String(req.body?.login_id || req.body?.email || req.body?.username || '').trim().toLowerCase();
    return `${req.ip}:${id}`;
  }
});

const register_attempt_limiter = create_rate_limiter({
  name: 'register-attempt',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many registration attempts. Please try again in 15 minutes.',
  keyGenerator(req) {
    const id = String(req.body?.email || req.body?.username || '').trim().toLowerCase();
    return `${req.ip}:${id}`;
  }
});

router.get('/login', allow_query_fields([]), auth.show_login);
router.get('/register', allow_query_fields([]), auth.show_register);

router.post('/login', allow_body_fields(['login_id', 'password']), auth_attempt_limiter, auth.login);
router.post('/register', allow_body_fields(['full_name', 'username', 'email', 'password', 'confirm_password']), register_attempt_limiter, auth.register);
router.post('/logout', allow_body_fields([]), auth.logout);

module.exports = router;