import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sync = spawnSync(process.execPath, ['scripts/sync-data.mjs'], { cwd: root, stdio: 'inherit' });
if (sync.status !== 0) process.exit(sync.status ?? 1);
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'scripts/api/server.ts'], { cwd: root, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--strictPort'], { cwd: root, stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); process.exitCode = code; }
for (const child of children) { child.on('error', () => stop(1)); child.on('exit', code => stop(code ?? 0)); }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
