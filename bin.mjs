#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const hooksUrl = new URL('./hooks.mjs', import.meta.url).href;

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx/esm', '--import', hooksUrl, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

if (result.error) {
  throw result.error;
}

if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exit(result.status ?? 0);
}
