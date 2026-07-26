# tsxmts

[![CI](https://github.com/hosso/tsxmts/actions/workflows/ci.yml/badge.svg)](https://github.com/hosso/tsxmts/actions/workflows/ci.yml)

**tsx, no setup.**

Run standalone `.mts`/`.mjs` scripts that pull in npm packages by themselves —
no `npm install`, no `package.json`, no `node_modules`. Just a script file you
can drop anywhere (or send to someone else) and run.

```ts
#!/usr/bin/env -S npx -y tsxmts
// hello.mts
import pc from 'npm:picocolors@^1.1.1';

console.log(pc.green('it just works'));
```

```sh
chmod +x hello.mts
./hello.mts
# [tsxmts] installing picocolors@^1.1.1...
# it just works
```

Run it again (or from a different directory) and it starts instantly — the
package is cached, not reinstalled.

## Why

Write `.mts`/`.mjs` scripts the same way you'd write a `.sh` script — drop it
in your `PATH`, run it — except you get real npm packages instead of
`curl | jq` gymnastics.

A single script file with no `node_modules` next to it normally can't `import`
an npm package at all — Node's module resolution has nothing to walk up to.
`tsxmts` fixes that without a build step, a bundler, or a project directory:
write the `npm:pkg@version` specifier, run it with `tsxmts`, and the package
gets installed once into a shared cache and resolved from there on every
future run — from any directory, in any script.

This is for small personal scripts and one-off tools: the kind of thing you
`chmod +x` and put in your `PATH`, not a project you `npm init` for.

## Install

```sh
npm install -g tsxmts
```

(Or run it without installing anything via `npx tsxmts`.)

## Usage

```sh
tsxmts your-script.mts
tsxmts your-script.mjs
```

Or, more in the spirit of a standalone script, give it a shebang and run it
directly:

```ts
#!/usr/bin/env -S npx -y tsxmts
```

```sh
chmod +x your-script.mts
./your-script.mts
```

`env -S` splits `npx -y tsxmts` back into separate arguments for the kernel —
this is the same pattern plain `tsx` scripts use (`#!/usr/bin/env -S npx tsx`),
just with dependency resolution included. `npx` finds `tsxmts` on your `PATH`
if it's installed globally, or fetches it transparently otherwise; `-y` skips
npx's "ok to install?" prompt so the script doesn't stall on first run.

Both extensions run through the same pipeline (TypeScript syntax — including
`enum`, decorators, etc. — is always transpiled via [`tsx`](https://tsx.is)),
so `.mjs` files work identically to `.mts` files; the file just happens not
to use any TypeScript syntax.

Inside the script, import any npm package with an explicit version using the
`npm:` specifier (matching [Deno's `npm:` specifier](https://docs.deno.com/examples/npm/)):

```ts
import { execa } from 'npm:execa@^9.3.0';
import parseArgs from 'npm:minimist@^1.2.8'; // default export from a CJS package, no `.default` needed
import debounce from 'npm:lodash-es@^4.17.21';
```

Scoped packages work the same way:

```ts
import { z } from 'npm:@sindresorhus/is@^7.0.0';
```

A package subpath (an alternate entry point declared in its `exports` map)
comes after the version, same as Deno's `npm:` specifier:

```ts
import { parse } from 'npm:csv-parse@^5.5.0/sync';
```

Plain `import`s (`node:*`, relative paths, already-installed packages) are
left completely untouched — only `npm:` specifiers are intercepted.

### Why a version is required

The specifier is deliberately explicit (`npm:pkg@version`, not just `pkg`) so
that a script keeps working the same way every time you run it, on any
machine, without silently drifting to whatever `latest` happens to resolve to
that day. The version also doubles as inline documentation of what the script
depends on — no separate `package.json` to keep in sync.

### Cache

Packages are installed once into a shared cache directory, keyed by nothing
but the package name — every `tsxmts` script on your machine shares it:

- Default: `~/.cache/tsxmts`
- Override: set `TSXMTS_CACHE=/some/path`

Delete the directory any time to force a clean reinstall.

## Examples

- [`examples/qr.mts`](examples/qr.mts) — the simplest shape for a `tsxmts`
  script: one dependency, `minimist` argument parsing, and a `--help`/usage
  message. Prints a scannable QR code to the terminal.

  ```sh
  ./examples/qr.mts "https://example.com"
  ./examples/qr.mts --help
  ```

- [`examples/gh-repos.mts`](examples/gh-repos.mts) — TypeScript. Looks up a
  GitHub user's most-starred repos and prints a formatted table, combining
  two npm packages (`minimist` for flags, `columnify` for the table) with a
  typed `fetch` response.

  ```sh
  ./examples/gh-repos.mts sindresorhus --limit 5
  ```

- [`examples/disk-usage.mjs`](examples/disk-usage.mjs) — plain JavaScript. A
  colored bar chart of the biggest subdirectories under a path, shelling out
  to `du` with `execa` and rendering with `picocolors`. Same pipeline as the
  `.mts` example, no TypeScript syntax needed.

  ```sh
  ./examples/disk-usage.mjs ~/Downloads
  ```

All three are executable and carry a `#!/usr/bin/env -S npx -y tsxmts` shebang, so
they run directly — no `tsxmts` prefix needed.

None of the examples has a `package.json` or `node_modules` next to it — the
only files involved are the scripts themselves. This is the kind of small,
personal CLI tool `tsxmts` is for: things you'd normally either skip writing
(too much setup for a 20-line script) or leave permanently half-`npm install`ed
in some folder you can't remember the location of.

## How it works

`tsx` transpiles TypeScript using Node's [Module Customization Hooks API](https://nodejs.org/api/module.html#customization-hooks)
(`node:module`'s `register()`). `tsxmts` registers one more hook alongside it
that intercepts `npm:pkg@version` specifiers in the `resolve` step: if the
package isn't in the shared cache yet, it runs `npm install --prefix <cache>`
once, then resolves straight to the installed file. Everything after that —
loading, CJS/ESM interop — is handled by Node's normal module loading, so
default exports and interop behave exactly like a regular `node_modules`
install.

## Requirements

Node.js >= 20.6 (`node:module`'s `register()` API).

## Development

```sh
npm install
npm run check   # lint + typecheck + test
```

- Lint/format: [Biome](https://biomejs.dev) (`npm run lint`, `npm run lint:fix`)
- Types: `tsc --noEmit` (`npm run typecheck`) — dev-only; `hooks.mjs`/`bin.mjs`
  never go through a build step, `tsx` transpiles at runtime as usual
- Tests: the built-in [`node:test`](https://nodejs.org/api/test.html) runner
  (`npm run test`) — the CLI tests spawn `bin.mjs` against a real npm
  package in a temporary cache directory, so they need network access on
  first run
- CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `npm run
  check` on a Node 20.6 / 22 / 24 matrix for every push and pull request

### Releasing

Publishing ([`.github/workflows/publish.yml`](.github/workflows/publish.yml))
runs on every published GitHub Release, authenticating to npm via
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) — no
`NPM_TOKEN` secret involved.

One-time setup, because npm requires a package to already exist before a
trusted publisher can be registered for it:

1. Publish the first version manually: `npm login && npm publish`.
2. On npmjs.com, go to the package's *Settings → Trusted Publisher*, add a
   GitHub Actions publisher for this repo with workflow filename
   `publish.yml`.

From then on, releasing is just:

1. Bump `version` in `package.json` to `X.Y.Z` and commit.
2. Create a GitHub Release with tag `vX.Y.Z` (the workflow checks that the
   tag matches `package.json`'s version before publishing).

## License

MIT
