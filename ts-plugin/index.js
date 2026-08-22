// A classic TypeScript Language Service Plugin — add
// `{ "compilerOptions": { "plugins": [{ "name": "tsxmts/ts-plugin" }] } }` to
// a project's tsconfig.json and an editor's tsserver stops reporting TS2307
// ("Cannot find module") for `npm:pkg@version` specifiers, which only
// tsxmts's own resolve hook (and `tsxmts typecheck`) knows how to resolve.
// Every other diagnostic — including a genuine TS2307 for an unresolved
// module — passes through untouched. This only changes what the editor
// shows; `tsxmts typecheck` remains the real check (plugins aren't loaded
// by a plain `tsc` run).
//
// tsserver resolves plugin names with a Node10-era CommonJS algorithm that
// ignores package.json "exports" maps entirely, so this lives at
// `tsxmts/ts-plugin/index.js` (a real subdirectory with its own "main"),
// not as an `exports`-mapped subpath of the package root — the latter is
// invisible to it. The directory's own package.json sets
// `"type": "commonjs"` to opt out of the root package's `"type": "module"`,
// since tsserver loads this file with `require()`.
//
// TypeScript 7's native (Go) compiler doesn't expose this classic plugin
// protocol yet, so this only takes effect while tsserver itself is running
// on a classic (JS) TypeScript — see README.md.

const CANNOT_FIND_MODULE = 2307;
const NPM_SPECIFIER_PREFIX = 'npm:';

function isNpmSpecifierLiteral(ts, node) {
  return (
    node !== undefined &&
    ts.isStringLiteralLike(node) &&
    node.text.startsWith(NPM_SPECIFIER_PREFIX)
  );
}

// Walks the AST once per filter call to find every `npm:` string literal
// used as an actual module specifier (import/export/dynamic import) — a
// diagnostic only gets filtered if its span falls inside one of these
// ranges, so a plain `const s = 'npm:not-a-specifier'` is left alone.
function collectNpmSpecifierRanges(ts, sourceFile) {
  const ranges = [];
  const visit = (node) => {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    } else if (ts.isImportCall(node)) {
      specifier = node.arguments[0];
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      specifier = node.argument.literal;
    }
    if (isNpmSpecifierLiteral(ts, specifier)) {
      ranges.push([specifier.getStart(sourceFile), specifier.getEnd()]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return ranges;
}

function createDiagnosticFilter(ts) {
  return function filterNpmSpecifierDiagnostics(sourceFile, diagnostics) {
    const ranges = collectNpmSpecifierRanges(ts, sourceFile);
    if (ranges.length === 0) return diagnostics;
    return diagnostics.filter((diagnostic) => {
      if (diagnostic.code !== CANNOT_FIND_MODULE) return true;
      if (diagnostic.start === undefined || diagnostic.length === undefined) {
        return true;
      }
      const diagnosticEnd = diagnostic.start + diagnostic.length;
      return !ranges.some(
        ([start, end]) => diagnostic.start >= start && diagnosticEnd <= end,
      );
    });
  };
}

function init({ typescript: ts }) {
  const filterNpmSpecifierDiagnostics = createDiagnosticFilter(ts);

  function create(info) {
    const proxy = Object.create(null);
    for (const key of Object.keys(info.languageService)) {
      const original = info.languageService[key];
      proxy[key] = (...args) => original.apply(info.languageService, args);
    }

    // TS2307 is only ever reported as a semantic diagnostic —
    // getSuggestionDiagnostics never produces it, so it's left unwrapped.
    proxy.getSemanticDiagnostics = (fileName) => {
      const diagnostics = info.languageService.getSemanticDiagnostics(fileName);
      const sourceFile = info.languageService
        .getProgram()
        ?.getSourceFile(fileName);
      return sourceFile
        ? filterNpmSpecifierDiagnostics(sourceFile, diagnostics)
        : diagnostics;
    };

    return proxy;
  }

  return { create };
}

module.exports = init;
