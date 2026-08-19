import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin.mjs');

function run(args, cwd) {
  return spawnSync(bin, args, { cwd, encoding: 'utf-8' });
}

// These tests each spin up an ephemeral npm project (typescript, @types/node,
// and any npm: deps the script declares) — they hit the real npm registry
// every time, so they're slower than the resolve-hook tests.
test('typecheck', async (t) => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'tsxmts-typecheck-test-'));

  try {
    await t.test('a script with no type errors exits 0', () => {
      const script = path.join(workDir, 'ok.mts');
      writeFileSync(
        script,
        `import isOdd from 'npm:is-odd@^3.0.1';\nconsole.log(isOdd(3));\n`,
      );
      const result = run(['typecheck', script], workDir);
      assert.equal(result.status, 0);
    });

    await t.test(
      'a real type error is reported against the original path and fails',
      () => {
        const script = path.join(workDir, 'bad.mts');
        writeFileSync(
          script,
          `const n: number = 'not a number';\nconsole.log(n);\n`,
        );
        const result = run(['typecheck', script], workDir);
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /error TS2322/);
        assert.match(
          result.stdout,
          new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        );
      },
    );

    await t.test(
      'an npm: dependency with no version fails without running tsc',
      () => {
        const script = path.join(workDir, 'nover.mts');
        writeFileSync(script, `import isOdd from 'npm:is-odd';\n`);
        const result = run(['typecheck', script], workDir);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /"npm:is-odd" has no version/);
      },
    );

    await t.test('an unsupported extension fails with a clear message', () => {
      const script = path.join(workDir, 'plain.ts');
      writeFileSync(script, 'const x = 1;\n');
      const result = run(['typecheck', script], workDir);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /only supports \.mts\/\.mjs/);
    });

    await t.test('no script argument prints usage and exits 1', () => {
      const result = run(['typecheck'], workDir);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Usage: tsxmts typecheck/);
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
