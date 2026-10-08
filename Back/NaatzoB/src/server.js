require('./config/env');
const { app } = require('./app');
const { port } = require('./config/env');
const team = require('./modules/team/lifecycle');
const db = require('./db/postgres');

const server = app.listen(port, () => {
  console.log(`NaatzoB listo en http://localhost:${port} (individual: /api, equipos: /api/team)`);
  team.start();
});
server.on('error', error => {
  console.error(`[server] ${error.code === 'EADDRINUSE' ? `El puerto ${port} ya está ocupado` : error.message}`);
  process.exitCode = 1;
});
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(async () => {
    await Promise.all([team.stop(), db.close()]);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
module.exports = { server };
