const bcrypt = require('bcryptjs');
const user = require('../models/user');
const { seed_user_default_data } = require('../utils/seed');
const {
  normalize_text,
  is_valid_email,
  is_safe_text
} = require('../utils/validation');

function show_login(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('auth/login', {
    title: 'Login',
    error: null,
    old: {}
  });
}

function show_register(req, res) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.render('auth/register', {
    title: 'Register',
    error: null,
    old: {}
  });
}

function regenerate_session(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        return reject(error);
      }

      return resolve();
    });
  });
}

function save_session(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        return reject(error);
      }

      return resolve();
    });
  });
}

function is_valid_username(username) {
  const value = String(username || '').trim();
  return /^[a-z0-9._]{3,30}$/i.test(value);
}

function is_strong_password(password) {
  const value = String(password || '');
  if (value.length < 8 || value.length > 72) {
    return false;
  }
  const has_upper = /[A-Z]/.test(value);
  const has_lower = /[a-z]/.test(value);
  const has_digit = /\d/.test(value);
  return has_upper && has_lower && has_digit;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log_auth_event(req, event, identifier, status, details = '') {
  const payload = {
    event,
    status,
    identifier: String(identifier || '').slice(0, 150),
    ip: String(req.ip || ''),
    ua: String(req.headers['user-agent'] || '').slice(0, 180),
    details: String(details || ''),
    at: new Date().toISOString()
  };
  console.log('[auth_audit]', JSON.stringify(payload));
}

async function register(req, res, next) {
  try {
    const full_name = normalize_text(req.body.full_name, 100);
    const username = String(req.body.username || '').trim().toLowerCase();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const confirm_password = req.body.confirm_password || '';

    const old = {
      full_name,
      username,
      email
    };

    if (!full_name || !username || !email || !password || !confirm_password) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'All fields are required',
        old
      });
    }

    if (full_name.length > 100) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Name is too long',
        old
      });
    }

    if (email.length > 150) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Email is too long',
        old
      });
    }

    if (username.length > 30) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Username is too long',
        old
      });
    }

    if (!is_valid_username(username)) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Username must be 3-30 chars and only letters, numbers, dot, or underscore',
        old
      });
    }

    if (!is_valid_email(email)) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Invalid email format',
        old
      });
    }

    if (!is_safe_text(full_name)) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Name contains invalid characters',
        old
      });
    }

    if (!is_strong_password(password)) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Password must be 8-72 chars and include uppercase, lowercase, and a number',
        old
      });
    }

    if (password !== confirm_password) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Password confirmation does not match',
        old
      });
    }

    const existing_user = await user.find_by_email(email);

    if (existing_user) {
      log_auth_event(req, 'register', email, 'failed', 'email_exists');
      return res.status(409).render('auth/register', {
        title: 'Register',
        error: 'Email is already registered',
        old
      });
    }

    const existing_username = await user.find_by_username(username);

    if (existing_username) {
      log_auth_event(req, 'register', username, 'failed', 'username_exists');
      return res.status(409).render('auth/register', {
        title: 'Register',
        error: 'Username is already taken',
        old
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user_id = await user.create({
      full_name,
      username,
      email,
      password_hash,
      is_active: 1
    });

    const created_user = await user.find_by_id(user_id);

    await regenerate_session(req);

    req.session.user = {
      id: created_user.id,
      full_name: created_user.full_name,
      username: created_user.username,
      email: created_user.email
    };
    await save_session(req);

    await seed_user_default_data(user_id);
    req.flash('success_msg', 'Registration successful — welcome');
    log_auth_event(req, 'register', email, 'success', 'account_created');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const login_id = String(req.body.login_id || '').trim().toLowerCase();
    const password = req.body.password || '';
    const old = {
      login_id
    };

    if (!login_id || !password) {
      return res.status(400).render('auth/login', {
        title: 'Login',
        error: 'Email/username and password are required',
        old
      });
    }

    if (login_id.length > 150) {
      return res.status(400).render('auth/login', {
        title: 'Login',
        error: 'Email/username is too long',
        old
      });
    }

    const existing_user = await user.find_by_login_id(login_id);

    if (!existing_user) {
      await wait(250);
      log_auth_event(req, 'login', login_id, 'failed', 'user_not_found');
      return res.status(401).render('auth/login', {
        title: 'Login',
        error: 'Invalid email/username or password',
        old
      });
    }

    if (Number(existing_user.is_active) !== 1) {
      log_auth_event(req, 'login', login_id, 'failed', 'inactive_account');
      return res.status(403).render('auth/login', {
        title: 'Login',
        error: 'Account is inactive',
        old
      });
    }

    const is_password_match = await bcrypt.compare(password, existing_user.password_hash);

    if (!is_password_match) {
      await wait(250);
      log_auth_event(req, 'login', login_id, 'failed', 'wrong_password');
      return res.status(401).render('auth/login', {
        title: 'Login',
        error: 'Invalid email/username or password',
        old
      });
    }

    await regenerate_session(req);

    req.session.user = {
      id: existing_user.id,
      full_name: existing_user.full_name,
      username: existing_user.username,
      email: existing_user.email
    };
    await save_session(req);

    req.flash('success_msg', 'Signed in successfully');
    log_auth_event(req, 'login', login_id, 'success', 'session_created');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  const cookie_name = process.env.SESSION_COOKIE_NAME || 'mm.sid';
  const identifier = req.session?.user?.email || req.session?.user?.username || '';
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie(cookie_name, { path: '/' });
    log_auth_event(req, 'logout', identifier, 'success', 'session_destroyed');
    return res.redirect('/login');
  });
}

module.exports = {
  show_login,
  show_register,
  register,
  login,
  logout
};