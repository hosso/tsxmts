import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin.mjs');

const HELLO_DEP_SCRIPT = `
import isOdd from 'npm:is-odd@^3.0.1';
console.log(\`isOdd(3) = \${isOdd(3)}\`);
`;

const EXIT_CODE_SCRIPT = 'process.exit(3);\n';

function run(args, { cacheDir, cwd }) {
  return spawnSync(bin, args, {
    cwd,
    env: { ...process.env, TSXMTS_CACHE: cacheDir },
    encoding: 'utf-8',
  });
}

// These tests hit the real npm registry the first time they run — the
// dependency isn't in the cache yet.
test('CLI', async (t) => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'tsxmts-test-'));
  const cacheDir = path.join(workDir, 'cache');
  const helloDepScript = path.join(workDir, 'hello-dep.mts');
  const exitCodeScript = path.join(workDir, 'exit-code.mjs');
  writeFileSync(helloDepScript, HELLO_DEP_SCRIPT);
  writeFileSync(exitCodeScript, EXIT_CODE_SCRIPT);

  // workDir has no node_modules of its own — this is the whole point of
  // tsxmts, and it's what catches "tsx/esm" being resolved relative to the
  // caller's cwd instead of bin.mjs's own location.
  const opts = { cacheDir, cwd: workDir };

  try {
    await t.test(
      'installs a declared npm: dependency and runs the script, from a cwd with no node_modules',
      () => {
        const result = run([helloDepScript], opts);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /isOdd\(3\) = true/);
        assert.match(result.stderr, /\[tsxmts\] installing is-odd@\^3\.0\.1/);
      },
    );

    await t.test(
      'reuses the cache on the next run instead of reinstalling',
      () => {
        const result = run([helloDepScript], opts);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /isOdd\(3\) = true/);
        assert.doesNotMatch(result.stderr, /installing/);
      },
    );

    await t.test('propagates a non-zero exit code from the script', () => {
      const result = run([exitCodeScript], opts);
      assert.equal(result.status, 3);
    });

    await t.test('prints usage and exits 1 with no arguments', () => {
      const result = run([], opts);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /^Usage: tsxmts /);
    });

    await t.test('--help prints usage and exits 0', () => {
      const result = run(['--help'], opts);
      assert.equal(result.status, 0);
      assert.match(result.stdout, /^Usage: tsxmts /);
    });

    await t.test('--version prints the package version and exits 0', () => {
      const result = run(['--version'], opts);
      assert.equal(result.status, 0);
      assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
    });

    await t.test(
      "a script's own --help (after the script path) is not swallowed by node",
      () => {
        writeFileSync(
          path.join(workDir, 'own-help.mts'),
          "console.log(process.argv.slice(2).join(','));\n",
        );
        const result = run(
          [path.join(workDir, 'own-help.mts'), '--help'],
          opts,
        );
        assert.equal(result.status, 0);
        assert.equal(result.stdout.trim(), '--help');
      },
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
