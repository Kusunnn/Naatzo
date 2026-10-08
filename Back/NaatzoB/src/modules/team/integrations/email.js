// src/integrations/email.js
// Envio de avisos por correo (SMTP con nodemailer). Sirve Gmail con una
// contrasena de aplicacion, cualquier SMTP del equipo, o Mailpit para probar.

const nodemailer = require("nodemailer");
const env = require("../config/env");
const {smtpConfig}=require('../../../config/smtp');

function isConfigured() {
  return smtpConfig().configured;
}

function sender() {
  return smtpConfig().from;
}

let _transport = null;
function transport() {
  if (!_transport) {
    _transport = nodemailer.createTransport(smtpConfig().options);
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
