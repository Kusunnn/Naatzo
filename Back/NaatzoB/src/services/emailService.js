const nodemailer = require('nodemailer');
const db = require('../db/postgres');
const { ensureTables } = require('./collaborationService');
const { smtpConfig } = require('../config/smtp');
let transport;
function configured() { return smtpConfig().configured; }
async function sendEmail({ to, subject, text, html }) {
  if (!configured()) return { sent: false, reason: 'Correo no configurado. Puedes compartir el enlace.' };
  const config=smtpConfig();
  if (!transport) transport = nodemailer.createTransport(config.options);
  await transport.sendMail({ from: config.from, to, subject, text, html, textEncoding: 'base64' });
  return { sent: true };
}
async function sendOnce(key, message) {
  if (!configured()) return false;
  await ensureTables();
  const claim = await db.query(`INSERT INTO naatzo_email_log(key,status) VALUES($1,'sending') ON CONFLICT(key) DO UPDATE SET status='sending',updated_at=NOW() WHERE naatzo_email_log.status='failed' RETURNING key`, [key]);
  if (!claim.rows.length) return false;
  try { await sendEmail(message); await db.query('UPDATE naatzo_email_log SET status=\'sent\',updated_at=NOW() WHERE key=$1',[key]); return true; }
  catch(error) { await db.query('UPDATE naatzo_email_log SET status=\'failed\',updated_at=NOW() WHERE key=$1',[key]); throw error; }
}
module.exports = { configured, sendEmail, sendOnce };
