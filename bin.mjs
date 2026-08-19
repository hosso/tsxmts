#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Resolved as absolute file:// URLs (not bare specifiers) so Node doesn't
// try to resolve "tsx/esm" starting from the caller's cwd, which has no
// node_modules of its own — that's the whole point of this tool.
const require = createRequire(import.meta.url);

const [firstArg, secondArg] = process.argv.slice(2);

if (firstArg === undefined || firstArg === '--help' || firstArg === '-h') {
  console.log(
    'Usage: tsxmts <script.mts|script.mjs> [args...]\n       tsxmts typecheck <script.mts|script.mjs>',
  );
  process.exit(firstArg === undefined ? 1 : 0);
}

if (firstArg === '--version' || firstArg === '-v') {
  console.log(require('./package.json').version);
  process.exit(0);
}

if (firstArg === 'typecheck') {
  if (secondArg === undefined) {
    console.error('Usage: tsxmts typecheck <script.mts|script.mjs>');
    process.exit(1);
  }
  const { typecheck } = await import('./typecheck.mjs');
  process.exit(typecheck(secondArg));
}

const tsxEsmUrl = pathToFileURL(require.resolve('tsx/esm')).href;
const hooksUrl = new URL('./hooks.mjs', import.meta.url).href;

const result = spawnSync(
  process.execPath,
  ['--import', tsxEsmUrl, '--import', hooksUrl, '--', ...process.argv.slice(2)],
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
