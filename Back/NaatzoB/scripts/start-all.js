const { spawn } = require('child_process');
const path = require('path');
const backendDir = path.resolve(__dirname, '..');
const children = [];
let stopping = false;
function shutdown(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill(signal);
}
function run(name, file) {
  const child = spawn(process.execPath, [file], { cwd: backendDir, stdio: 'inherit' });
  children.push(child);
  child.on('error', error => {
    console.error(`${name}: ${error.message}`);
    process.exitCode = 1;
    shutdown();
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} finalizó (${signal || code})`);
      process.exitCode = code || 1;
      shutdown();
    }
  });
}
run('chatbot', path.resolve(backendDir, '../../NaatzoE/src/index.js'));
run('backend', path.join(backendDir, 'src/server.js'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
