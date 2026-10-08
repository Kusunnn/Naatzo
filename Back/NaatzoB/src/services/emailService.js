const nodemailer = require('nodemailer');
const db = require('../db/postgres');
const { ensureTables } = require('./collaborationService');
let transport;
function configured() { return Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM && (!process.env.SMTP_USER || process.env.SMTP_PASSWORD)); }
async function sendEmail({ to, subject, text, html }) {
  if (!configured()) return { sent: false, reason: 'Correo no configurado. Puedes compartir el enlace.' };
  if (!transport) transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined, connectionTimeout: 10000, socketTimeout: 15000 });
  await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject, text, html, textEncoding: 'base64' });
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
