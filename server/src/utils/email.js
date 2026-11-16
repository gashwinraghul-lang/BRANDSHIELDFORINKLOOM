// server/src/utils/email.js
import nodemailer from 'nodemailer';
import config from '../config.js';

let cachedTransporter = null;
let cachedTransportKey = null;

function smtpConfigured() {
  return Boolean(
    config.smtp.host &&
      config.smtp.user &&
      config.smtp.pass &&
      !config.smtp.user.startsWith('PLACEHOLDER') &&
      !config.smtp.pass.startsWith('PLACEHOLDER')
  );
}

export function isEmailConfigured() {
  return smtpConfigured();
}

async function getTransporter() {
  if (smtpConfigured()) {
    const key = `${config.smtp.host}:${config.smtp.port}:${config.smtp.user}`;
    if (!cachedTransporter || cachedTransportKey !== key) {
      cachedTransporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });
      cachedTransportKey = key;
    }
    return cachedTransporter;
  }

  // Development fallback: Ethereal is opt-in because it needs network access.
  // By default we only log the email so signup stays fast and offline-safe.
  if (process.env.EMAIL_TEST_ACCOUNT !== 'true') {
    return null;
  }
  if (!cachedTransporter) {
    const account = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });
    cachedTransportKey = 'ethereal';
  }
  return cachedTransporter;
}

/**
 * Sends an email. Never throws for delivery problems: the app must keep working
 * when SMTP is not configured. Returns { sent, previewUrl }.
 */
export async function sendMail({ to, subject, text, html }) {
  try {
    const transporter = await getTransporter();
    if (!transporter) {
      console.log(`--- EMAIL (dev log only) ---\nTo: ${to}\nSubject: ${subject}\n${text}\n---`);
      return { sent: false, previewUrl: null, logged: true };
    }
    const info = await transporter.sendMail({
      from: config.smtp.from,
      to,
      subject,
      text,
      html,
    });
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    if (previewUrl) console.log('Email preview URL:', previewUrl);
    return { sent: true, previewUrl, messageId: info.messageId };
  } catch (err) {
    console.warn('Email could not be sent (the app will continue):', err.message);
    console.log(`--- EMAIL FALLBACK ---\nTo: ${to}\nSubject: ${subject}\n${text}\n---`);
    return { sent: false, previewUrl: null, error: err.message };
  }
}
