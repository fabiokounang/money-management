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
        'Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in the environment (see instructions on this page).'
      );
      return res.redirect('/settings/email');
    }

    const to = String(req.session.user?.email || '').trim();
    if (!to) {
      req.flash('error_msg', 'This account has no email address.');
      return res.redirect('/settings/email');
    }

    const when = new Date().toISOString();
    await send_mail({
      to,
      subject: '[Money Management] Test email',
      text: `This is a test email from Money Management.\n\nServer time: ${when}\n\nIf you received this, Nodemailer + Gmail are working.`,
      html: `<p>This is a test email from <strong>Money Management</strong>.</p><p>Server time: <code>${when}</code></p><p>If you received this, Nodemailer + Gmail are working.</p>`
    });

    req.flash('success_msg', `Test email sent to ${to}. Check inbox (and spam).`);
    return res.redirect('/settings/email');
  } catch (err) {
    req.flash('error_msg', err.message || 'Failed to send email.');
    return res.redirect('/settings/email');
  }
}

module.exports = {
  email_page,
  send_test_email
};
