/**
 * Starts the API server (with --watch) and the Vite dev server together.
 * Vite proxies /api to the API server, see vite.config.ts.
 */
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } }),
  spawn('npm', ['run', 'dev:client'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
