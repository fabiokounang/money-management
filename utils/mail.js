const nodemailer = require('nodemailer');

function mail_credentials() {
  const user = String(process.env.GMAIL_USER || process.env.MAIL_USER || '').trim();
  const pass = String(process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS || '')
    .replace(/\s/g, '');
  const from_address = String(process.env.MAIL_FROM || user).trim();
  return { user, pass, from_address };
}

function is_mail_configured() {
  const { user, pass } = mail_credentials();
  return Boolean(user && pass);
}

function create_transport() {
  const { user, pass } = mail_credentials();
  if (!user || !pass) {
    throw new Error('Email is not configured: set GMAIL_USER and GMAIL_APP_PASSWORD in the environment.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user,
      pass
    }
  });
}

/**
 * @param {{ to: string, subject: string, text?: string, html?: string }} opts
 */
async function send_mail(opts) {
  const { to, subject, text, html } = opts;
  if (!to || !subject) {
    throw new Error('Parameters "to" and "subject" are required.');
  }

  const { from_address } = mail_credentials();
  const transporter = create_transport();

  await transporter.sendMail({
    from: `"Money Management" <${from_address}>`,
    to,
    subject,
    text: text || undefined,
    html: html || undefined
  });
}

module.exports = {
  mail_credentials,
  is_mail_configured,
  send_mail
};
