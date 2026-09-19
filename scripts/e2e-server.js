// Boots a dedicated server + database for Playwright E2E runs.
import { rmSync, existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');

process.env.DATA_DIR = dataDir;
process.env.DATABASE_PATH = path.join(dataDir, 'e2e.db');
process.env.SESSION_SECRET = 'e2e-secret';
process.env.PORT = process.env.E2E_PORT || '3100';

// Fail fast if a stale server from a previous run still holds the port —
// otherwise Playwright would silently test against the old instance.
function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    sock.on('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });
}

const port = Number(process.env.PORT);
if (await portInUse(port)) {
  console.error(`[e2e] Port ${port} is already in use. Kill the stale process (e.g. fuser -k ${port}/tcp) and retry.`);
  process.exit(1);
}

// Fresh database for every run.
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(path.join(dataDir, 'e2e.db' + suffix), { force: true });
}

await import('../server/seed.js'); // prints seed info, closes its own handle
await import('../server/index.js');
