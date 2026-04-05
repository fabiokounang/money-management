const { is_mail_configured, send_mail } = require('../utils/mail');

function email_page(req, res) {
  return res.render('settings/email', {
    title: 'Test email (Gmail)',
    mail_ready: is_mail_configured()
  });
}

async function send_test_email(req, res, next) {
  try {
    if (!is_mail_configured()) {
      req.flash(
        'error_msg',
        'Gmail belum disetel. Tambahkan GMAIL_USER dan GMAIL_APP_PASSWORD di environment (lihat petunjuk di halaman ini).'
      );
      return res.redirect('/settings/email');
    }

    const to = String(req.session.user?.email || '').trim();
    if (!to) {
      req.flash('error_msg', 'Akun tidak punya alamat email.');
      return res.redirect('/settings/email');
    }

    const when = new Date().toISOString();
    await send_mail({
      to,
      subject: '[Money Management] Test email',
      text: `Ini email percobaan dari Money Management.\n\nWaktu server: ${when}\n\nKalau kamu terima ini, Nodemailer + Gmail sudah jalan.`,
      html: `<p>Ini email percobaan dari <strong>Money Management</strong>.</p><p>Waktu server: <code>${when}</code></p><p>Kalau kamu terima ini, Nodemailer + Gmail sudah jalan.</p>`
    });

    req.flash('success_msg', `Email tes terkirim ke ${to}. Cek inbox (dan folder spam).`);
    return res.redirect('/settings/email');
  } catch (err) {
    req.flash('error_msg', err.message || 'Gagal mengirim email.');
    return res.redirect('/settings/email');
  }
}

module.exports = {
  email_page,
  send_test_email
};
