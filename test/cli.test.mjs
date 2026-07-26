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

function run(scriptPath, cacheDir) {
  return spawnSync(bin, [scriptPath], {
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

  try {
    await t.test(
      'installs a declared npm: dependency and runs the script',
      () => {
        const result = run(helloDepScript, cacheDir);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /isOdd\(3\) = true/);
        assert.match(result.stderr, /\[tsxmts\] installing is-odd@\^3\.0\.1/);
      },
    );

    await t.test(
      'reuses the cache on the next run instead of reinstalling',
      () => {
        const result = run(helloDepScript, cacheDir);
        assert.equal(result.status, 0);
        assert.match(result.stdout, /isOdd\(3\) = true/);
        assert.doesNotMatch(result.stderr, /installing/);
      },
    );

    await t.test('propagates a non-zero exit code from the script', () => {
      const result = run(exitCodeScript, cacheDir);
      assert.equal(result.status, 3);
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
