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
  const info=await transport.sendMail({ from: config.from, to, subject, text, html, textEncoding: 'base64' });
  if(!info.accepted?.length || info.rejected?.length) {
    const error=new Error('El servidor de correo rechazó el destinatario.');
    error.code='ERECIPIENT';throw error;
  }
  return { sent: true, messageId:info.messageId, accepted:info.accepted };
}
function describeSendError(error) {
  if(error.code==='EAUTH')return 'Gmail rechazó la autenticación. Revisa la contraseña de aplicación del servidor.';
  if(error.code==='ERECIPIENT'||error.code==='EENVELOPE')return 'El servidor rechazó el correo del destinatario. Revisa la dirección.';
  if(['ETIMEDOUT','ECONNECTION','ESOCKET','EDNS'].includes(error.code))return 'No se pudo conectar al servidor de correo. Intenta de nuevo en unos minutos.';
  return 'No se pudo enviar el correo. Intenta de nuevo o comparte el enlace.';
}
async function sendOnce(key, message) {
  if (!configured()) return false;
  await ensureTables();
  const claim = await db.query(`INSERT INTO naatzo_email_log(key,status) VALUES($1,'sending') ON CONFLICT(key) DO UPDATE SET status='sending',updated_at=NOW() WHERE naatzo_email_log.status='failed' OR (naatzo_email_log.status='sending' AND naatzo_email_log.updated_at<NOW()-INTERVAL '10 minutes') RETURNING key`, [key]);
  if (!claim.rows.length) return false;
  try { const delivery=await sendEmail(message);if(!delivery.sent){const error=new Error('Correo no configurado.');error.code='ECONFIG';throw error;}await db.query('UPDATE naatzo_email_log SET status=\'sent\',updated_at=NOW() WHERE key=$1',[key]); return true; }
  catch(error) { await db.query('UPDATE naatzo_email_log SET status=\'failed\',updated_at=NOW() WHERE key=$1',[key]); throw error; }
}
module.exports = { configured, sendEmail, sendOnce, describeSendError };
