// start-nimble.mjs — runs the bob-nimble board on ports 3101 (backend) + 3003 (frontend)
// Fully isolated from the control board: separate workspace, separate DB, separate Bob home.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';

const root = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_PORT  = 3101;
const FRONTEND_PORT = 3003;

// Isolated paths — nothing shared with the control board
const BOB_HOME      = path.join(homedir(), '.bob');
const BOB_WORKSPACE = path.join(homedir(), '.bob', 'nimble-playground');
const DB_PATH       = path.join(root, 'backend', 'data', 'nimble-sessions.db');

async function busy(port) {
  return new Promise(resolve => {
    const s = createConnection({ host: '127.0.0.1', port });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

if (await busy(BACKEND_PORT) || await busy(FRONTEND_PORT)) {
  console.error(`bob-nimble ports ${FRONTEND_PORT}/${BACKEND_PORT} already in use.`);
  process.exit(1);
}

const backendEnv = {
  ...process.env,
  PORT:          String(BACKEND_PORT),
  HOST:          '127.0.0.1',
  BOB_HOME,
  BOB_WORKSPACE,
  DB_PATH,
};

const backend = spawn(process.execPath, ['server.js'], {
  cwd: path.join(root, 'backend'),
  stdio: 'inherit',
  env: backendEnv,
});

let frontend;
let closing = false;

function stop() {
  if (closing) return;
  closing = true;
  frontend?.kill('SIGTERM');
  backend.kill('SIGTERM');
}

backend.on('error', stop);
backend.on('exit', () => { if (!closing) stop(); });

for (let n = 0; n < 40; n++) {
  if (await busy(BACKEND_PORT)) break;
  if (n === 39) {
    console.error('bob-nimble backend did not become ready.');
    stop();
    process.exitCode = 1;
  }
  await new Promise(r => setTimeout(r, 250));
}

if (!closing) {
  frontend = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_BACKEND_PORT: String(BACKEND_PORT),
      PORT:              String(FRONTEND_PORT),
    },
  });
  frontend.on('error', stop);
  frontend.on('exit', stop);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
