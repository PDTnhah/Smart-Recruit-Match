// Dev loop without extra tooling: tsc in watch mode + node --watch on the emitted entrypoint.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const run = (args) => spawn(process.execPath, args, { stdio: 'inherit' });

const first = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
if (first.status !== 0) process.exit(first.status ?? 1);

const children = [
  run([tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput']),
  run(['--watch', 'dist/main.js']),
];
const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
