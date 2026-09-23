import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSpecifier, versionRequiredMessage } from './parse-specifier.mjs';

const SUPPORTED_EXTENSIONS = new Set(['.mts', '.mjs']);

// Matches a quoted npm: specifier anywhere in the source — import
// statements, dynamic import(), re-exports — without parsing JS/TS syntax.
const SPECIFIER_RE = /(['"`])(npm:[^'"`]+)\1/g;

// tsc can't see what an `npm:pkg@version` specifier resolves to, so this
// rewrites a copy of the script to plain `import ... from 'pkg'` (tsc
// resolves that normally against a real install of `pkg`) and collects the
// versions actually requested, to install for the check.
function rewriteAndCollectDeps(source) {
  const deps = {};
  const missingVersion = [];
  const rewritten = source.replace(SPECIFIER_RE, (whole, quote, spec) => {
    const { name, version, subpath } = parseSpecifier(spec);
    if (version === 'latest') {
      missingVersion.push({ specifier: spec, name, subpath });
      return whole;
    }
    deps[name] = version;
    return `${quote}${name}${subpath}${quote}`;
  });
  return { rewritten, deps, missingVersion };
}

export function typecheck(scriptPath) {
  const absPath = path.resolve(scriptPath);
  const ext = path.extname(absPath);

  if (!existsSync(absPath)) {
    console.error(`[tsxmts] no such file: ${scriptPath}`);
    return 1;
  }
  // An extensionless file (e.g. a `chmod +x` executable with no `.mts`
  // suffix) is always run as TypeScript — see hooks.mjs's `load` hook —
  // so it's checked the same way here.
  if (ext !== '' && !SUPPORTED_EXTENSIONS.has(ext)) {
    console.error(
      `[tsxmts] typecheck only supports .mts/.mjs scripts, got: ${scriptPath}`,
    );
    return 1;
  }

  const source = readFileSync(absPath, 'utf-8');
  const { rewritten, deps, missingVersion } = rewriteAndCollectDeps(source);

  if (missingVersion.length > 0) {
    for (const { specifier, name, subpath } of missingVersion) {
      console.error(versionRequiredMessage(specifier, name, subpath));
    }
    return 1;
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), 'tsxmts-typecheck-'));
  try {
    // tsc only recognizes source files by extension, so an extensionless
    // script's copy needs one appended for tsc to check it at all.
    const basename =
      ext === '' ? `${path.basename(absPath)}.mts` : path.basename(absPath);
    writeFileSync(path.join(tmpDir, basename), rewritten);
    writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          private: true,
          devDependencies: {
            typescript: 'latest',
            '@types/node': 'latest',
            ...deps,
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            target: 'esnext',
            module: 'nodenext',
            moduleResolution: 'nodenext',
            types: ['node'],
            // Many real npm packages ship no types at all — failing the
            // whole check over that (rather than over an actual mistake in
            // the script) isn't useful, so this stays as lenient as the
            // repo's own tsconfig.json for the same reason: a `npm:pkg@ver`
            // dependency's type quality isn't something the script controls.
            strict: false,
            noImplicitAny: false,
            // esModuleInterop: the real packages behind the rewritten bare
            // imports are often CJS with a default export. skipLibCheck:
            // this only needs to check the script itself, not every
            // dependency's own .d.ts files.
            esModuleInterop: true,
            skipLibCheck: true,
            noEmit: true,
          },
          include: [basename],
        },
        null,
        2,
      ),
    );

    const depCount = Object.keys(deps).length;
    console.error(
      `[tsxmts] installing ${depCount} dependenc${depCount === 1 ? 'y' : 'ies'} for typecheck...`,
    );
    execFileSync(
      'npm',
      ['install', '--no-fund', '--no-audit', '--loglevel=error'],
      { cwd: tmpDir, stdio: ['ignore', 'ignore', 'inherit'] },
    );

    const tscBin = path.join(tmpDir, 'node_modules', '.bin', 'tsc');
    const result = spawnSync(tscBin, ['-p', '.'], {
      cwd: tmpDir,
      encoding: 'utf-8',
    });

    // tsc reports diagnostics against the copy's path (just `basename`,
    // relative to tmpDir) — point them back at the file the user passed in.
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    process.stdout.write(output.split(basename).join(scriptPath));

    return result.status ?? 1;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
