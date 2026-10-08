// src/integrations/email.js
// Envio de avisos por correo (SMTP con nodemailer). Sirve Gmail con una
// contrasena de aplicacion, cualquier SMTP del equipo, o Mailpit para probar.

const nodemailer = require("nodemailer");
const env = require("../config/env");

function isConfigured() {
  return Boolean(env.SMTP_HOST);
}

function sender() {
  return env.SMTP_FROM || (env.SMTP_USER ? `Naatzo <${env.SMTP_USER}>` : "Naatzo <naatzo@localhost>");
}

let _transport = null;
function transport() {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // 465 es TLS directo; 587 usa STARTTLS
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return _transport;
}

/** Manda un correo de texto. */
async function send({ to, subject, text }) {
  const info = await transport().sendMail({ from: sender(), to, subject, text });
  return { messageId: info.messageId };
}

/** Error legible, sin la contrasena. */
function describeError(err) {
  if (err.code === "EAUTH") return "El servidor de correo rechazo el usuario o la contrasena (SMTP_USER / SMTP_PASS)";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(err.code)) {
    return `No se pudo conectar al servidor de correo ${env.SMTP_HOST}:${env.SMTP_PORT} (${err.code})`;
  }
  if (err.responseCode) return `El servidor de correo respondio ${err.responseCode}: ${err.response || err.message}`;
  return `No se pudo mandar el correo: ${err.message}`;
}

module.exports = { isConfigured, send, describeError, sender };
