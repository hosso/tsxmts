import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';

if (isMainThread) {
  register(import.meta.url, import.meta.url);
}

const CACHE_DIR =
  process.env.TSXMTS_CACHE ?? path.join(homedir(), '.cache', 'tsxmts');
const MOD_DIR = path.join(CACHE_DIR, 'node_modules');
const PKG_PATH = path.join(CACHE_DIR, 'package.json');

function ensureInstalled(name, versionSpec) {
  if (existsSync(path.join(MOD_DIR, name))) return;

  mkdirSync(CACHE_DIR, { recursive: true });
  const existing = existsSync(PKG_PATH)
    ? (JSON.parse(readFileSync(PKG_PATH, 'utf-8')).dependencies ?? {})
    : {};
  existing[name] = versionSpec;
  writeFileSync(
    PKG_PATH,
    JSON.stringify({ private: true, dependencies: existing }, null, 2),
  );

  console.error(`[tsxmts] installing ${name}@${versionSpec}...`);
  execFileSync(
    'npm',
    [
      'install',
      '--prefix',
      CACHE_DIR,
      '--no-fund',
      '--no-audit',
      '--loglevel=error',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

export function parseSpecifier(specifier) {
  const spec = specifier.slice(4); // strip the leading "npm:"
  const at = spec.lastIndexOf('@');
  const hasVersion = at > 0; // handles scoped names ("@scope/pkg") correctly
  const name = hasVersion ? spec.slice(0, at) : spec;
  const version = hasVersion ? spec.slice(at + 1) : 'latest';
  return { name, version };
}

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('npm:')) return nextResolve(specifier, context);

  const { name, version } = parseSpecifier(specifier);

  ensureInstalled(name, version);
  const req = createRequire(path.join(MOD_DIR, '_.js'));
  return { url: pathToFileURL(req.resolve(name)).href, shortCircuit: true };
}
