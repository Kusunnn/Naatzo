// Run this UTF-8 file directly with Node; avoid piping accented text through a shell.
require('../src/config/env');
const { sendEmail } = require('../src/services/emailService');

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Indica un correo válido como argumento.');
  process.exit(1);
}

sendEmail({
  to,
  subject: 'Naatzo: prueba de correo y acentos',
  text: 'Hola, Mario.\n\nEste correo comprueba la configuración de envío de Naatzo y los acentos: invitación, sesión, participación, días, equipo y contraseña.\n\nTambién probamos: á é í ó ú ü ñ ¿Cómo estás? ¡Todo listo!\n\nEquipo Naatzo',
}).then(result => {
  console.log(result.sent ? 'Correo aceptado por Gmail.' : 'Correo no configurado.');
  process.exitCode = result.sent ? 0 : 1;
}).catch(error => {
  console.error('No se pudo enviar el correo:', error.code || 'UNKNOWN');
  process.exitCode = 1;
});
