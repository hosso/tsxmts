import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
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

  // The package name ends at the first "@" (version) or "/" (subpath) — but
  // a scoped name's own "/" (between scope and package, e.g. "@scope/pkg")
  // doesn't count, so start scanning after it.
  const scoped = spec.startsWith('@');
  const scanFrom = scoped ? spec.indexOf('/') + 1 : 0;
  let boundary = spec.length;
  for (let i = scanFrom; i < spec.length; i++) {
    if (spec[i] === '@' || spec[i] === '/') {
      boundary = i;
      break;
    }
  }
  const name = spec.slice(0, boundary);
  const rest = spec.slice(boundary); // '', '@version', '@version/subpath', or '/subpath'

  if (rest.startsWith('@')) {
    const slash = rest.indexOf('/');
    const version = slash === -1 ? rest.slice(1) : rest.slice(1, slash);
    const subpath = slash === -1 ? '' : rest.slice(slash); // includes leading "/"
    return { name, version, subpath };
  }
  return { name, version: 'latest', subpath: rest };
}

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('npm:')) return nextResolve(specifier, context);

  const { name, version, subpath } = parseSpecifier(specifier);

  ensureInstalled(name, version);
  // Delegate to Node's ESM resolver with a parent inside the cache so that
  // package `exports` maps are evaluated with the "import" condition
  // instead of falling back to CJS-only resolution.
  const parentURL = pathToFileURL(path.join(MOD_DIR, '_.js')).href;
  return nextResolve(name + subpath, { ...context, parentURL });
}
