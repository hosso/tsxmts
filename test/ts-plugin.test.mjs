import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginPath = path.join(here, '..', 'ts-plugin');
const require = createRequire(import.meta.url);

const SCRIPT_NAME = 'script.mts';
const SOURCE = [
  `import pc from 'npm:picocolors@^1.1.1';`,
  `import value from 'package-that-does-not-exist';`,
  `const bad: number = 'wrong';`,
  `async function load() {`,
  `  return await import('npm:gray-matter@^4.0.3');`,
  `}`,
  `console.log(pc, value, bad, load);`,
].join('\n');

function createLanguageService(ts, fileName, source) {
  const host = {
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => '0',
    getScriptSnapshot: (name) =>
      name === fileName ? ts.ScriptSnapshot.fromString(source) : undefined,
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => ({
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      noEmit: true,
    }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

// tsxmts's own `typescript` devDependency is TypeScript 7 (the native Go
// compiler), which doesn't expose the classic createLanguageService API the
// Language Service Plugin protocol ts-plugin/index.js implements is built
// on — installing a throwaway classic TypeScript (same ephemeral-npm-project
// pattern as the typecheck tests) gets a real one to test against.
test('ts-plugin hides TS2307 only for npm: module specifiers', () => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'tsxmts-ts-plugin-test-'));
  try {
    writeFileSync(
      path.join(workDir, 'package.json'),
      JSON.stringify({ private: true }),
    );
    execFileSync(
      'npm',
      [
        'install',
        '--no-fund',
        '--no-audit',
        '--loglevel=error',
        'typescript@^5.7.0',
      ],
      { cwd: workDir, stdio: ['ignore', 'ignore', 'inherit'] },
    );

    const ts = require(path.join(workDir, 'node_modules', 'typescript'));
    const initPlugin = require(pluginPath);

    const languageService = createLanguageService(ts, SCRIPT_NAME, SOURCE);
    const rawDiagnostics = languageService
      .getSemanticDiagnostics(SCRIPT_NAME)
      .filter((d) => d.code === 2307);
    assert.equal(
      rawDiagnostics.length,
      3,
      'sanity check: unfiltered tsserver reports TS2307 for all three npm: specifiers plus the genuinely missing one',
    );

    const proxy = initPlugin({ typescript: ts }).create({ languageService });
    const diagnostics = proxy.getSemanticDiagnostics(SCRIPT_NAME);

    const unresolvedModules = diagnostics.filter((d) => d.code === 2307);
    assert.equal(unresolvedModules.length, 1);
    const [remaining] = unresolvedModules;
    assert.equal(
      SOURCE.slice(remaining.start, remaining.start + remaining.length),
      "'package-that-does-not-exist'",
    );

    assert.ok(
      diagnostics.some((d) => d.code === 2322),
      'a real type error (assigning a string to a number) is still reported',
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
