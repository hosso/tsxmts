import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
const STORE_DIR = path.join(CACHE_DIR, 'store');

// Different scripts can ask for different, incompatible ranges of the same
// package (e.g. zod@^3 vs zod@^4). Installing each (name, versionSpec) pair
// into its own directory — rather than one shared node_modules tree — makes
// that a non-issue instead of a silent "whichever was installed first wins".
function installDirFor(name, versionSpec) {
  // Sanitize only the versionSpec: it can contain range operators
  // (">=", "||", spaces, ...) that aren't safe path characters, whereas the
  // package name's own "/" (scoped packages) is kept as a real path segment.
  const safeVersion = versionSpec.replace(/[^a-zA-Z0-9.\-_^~]/g, '_');
  return path.join(STORE_DIR, name, safeVersion);
}

function ensureInstalled(name, versionSpec) {
  const dir = installDirFor(name, versionSpec);
  if (existsSync(path.join(dir, 'node_modules', name))) return dir;

  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      { private: true, dependencies: { [name]: versionSpec } },
      null,
      2,
    ),
  );

  console.error(`[tsxmts] installing ${name}@${versionSpec}...`);
  execFileSync(
    'npm',
    ['install', '--prefix', dir, '--no-fund', '--no-audit', '--loglevel=error'],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  return dir;
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

  const dir = ensureInstalled(name, version);
  // Delegate to Node's ESM resolver with a parent inside the install dir so
  // that package `exports` maps are evaluated with the "import" condition
  // instead of falling back to CJS-only resolution.
  const parentURL = pathToFileURL(path.join(dir, 'node_modules', '_.js')).href;
  return nextResolve(name + subpath, { ...context, parentURL });
}
