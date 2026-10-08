const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const messages = [];
const createTransport = nodemailer.createTransport.bind(nodemailer);
nodemailer.createTransport = () => ({
  async sendMail(options) {
    messages.push(options);
    const transport = createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    const result = await transport.sendMail(options);
    const mime = result.message.toString('utf8');
    assert.match(mime, /Content-Type: text\/plain; charset=utf-8/i);
    assert.match(mime, /Content-Transfer-Encoding: base64/i);
    const body = mime.split(/\r?\n\r?\n/).slice(1).join('\n\n').replace(/\s/g, '');
    assert.equal(Buffer.from(body, 'base64').toString('utf8').trimEnd(), options.text);
  },
});
process.env.SMTP_HOST = 'example.invalid';
process.env.EMAIL_FROM = 'Naatzo <test@example.com>';
delete process.env.SMTP_USER;
const { sendEmail } = require('../src/services/emailService');
sendEmail({
  to: 'recipient@example.com',
  subject: 'Invitación · Naatzo',
  text: 'Inicia sesión y acepta la invitación. El enlace vence en 7 días. á é í ó ú ü ñ ¿Cómo estás?',
}).then(() => {
  assert.equal(messages.length, 1);
  console.log('UTF-8 y acentos verificados sin enviar correos.');
}).catch(error => { console.error(error); process.exitCode = 1; });
