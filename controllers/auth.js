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

async function register(req, res, next) {
  try {
    const full_name = normalize_text(req.body.full_name, 100);
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const confirm_password = req.body.confirm_password || '';

    const old = {
      full_name,
      email
    };

    if (!full_name || !email || !password || !confirm_password) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Semua field wajib diisi',
        old
      });
    }

    if (full_name.length > 100) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Nama terlalu panjang',
        old
      });
    }

    if (email.length > 150) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Email terlalu panjang',
        old
      });
    }

    if (!is_valid_email(email)) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Format email tidak valid',
        old
      });
    }

    if (!is_safe_text(full_name)) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Nama mengandung karakter yang tidak diizinkan',
        old
      });
    }

    if (password.length < 6) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Password minimal 6 karakter',
        old
      });
    }

    if (password !== confirm_password) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Konfirmasi password tidak sama',
        old
      });
    }

    const existing_user = await user.find_by_email(email);

    if (existing_user) {
      return res.status(409).render('auth/register', {
        title: 'Register',
        error: 'Email sudah terdaftar',
        old
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user_id = await user.create({
      full_name,
      email,
      password_hash,
      is_active: 1
    });

    const created_user = await user.find_by_id(user_id);

    await regenerate_session(req);

    req.session.user = {
      id: created_user.id,
      full_name: created_user.full_name,
      email: created_user.email
    };
    await save_session(req);

    await seed_user_default_data(user_id);
    req.flash('success_msg', 'Register berhasil, selamat datang');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const old = {
      email
    };

    if (!is_valid_email(email)) {
      return res.status(400).render('auth/login', {
        title: 'Login',
        error: 'Format email tidak valid',
        old
      });
    }

    if (!email || !password) {
      return res.status(400).render('auth/login', {
        title: 'Login',
        error: 'Email dan password wajib diisi',
        old
      });
    }

    const existing_user = await user.find_by_email(email);

    if (!existing_user) {
      return res.status(401).render('auth/login', {
        title: 'Login',
        error: 'Email atau password salah',
        old
      });
    }

    if (Number(existing_user.is_active) !== 1) {
      return res.status(403).render('auth/login', {
        title: 'Login',
        error: 'Akun tidak aktif',
        old
      });
    }

    const is_password_match = await bcrypt.compare(password, existing_user.password_hash);

    if (!is_password_match) {
      return res.status(401).render('auth/login', {
        title: 'Login',
        error: 'Email atau password salah',
        old
      });
    }

    await regenerate_session(req);

    req.session.user = {
      id: existing_user.id,
      full_name: existing_user.full_name,
      email: existing_user.email
    };
    await save_session(req);

    req.flash('success_msg', 'Login berhasil');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  const cookie_name = process.env.SESSION_COOKIE_NAME || 'mm.sid';
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie(cookie_name, { path: '/' });
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