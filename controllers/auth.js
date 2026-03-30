const bcrypt = require('bcryptjs');
const user = require('../models/user');
const { seed_user_default_data } = require('../utils/seed');

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

async function register(req, res, next) {
  try {
    const full_name = (req.body.full_name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
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

    if (!email.includes('@')) {
      return res.status(400).render('auth/register', {
        title: 'Register',
        error: 'Format email tidak valid',
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

    req.session.user = {
      id: created_user.id,
      full_name: created_user.full_name,
      email: created_user.email
    };

    await seed_user_default_data(userId);
    req.flash('success_msg', 'Register berhasil, selamat datang');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const old = {
      email
    };

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

    req.session.user = {
      id: existing_user.id,
      full_name: existing_user.full_name,
      email: existing_user.email
    };

    req.flash('success_msg', 'Login berhasil');
    return res.redirect('/dashboard');
  } catch (error) {
    return next(error);
  }
}

function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie('connect.sid');
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