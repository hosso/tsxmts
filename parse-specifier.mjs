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

export function versionRequiredMessage(specifier, name, subpath) {
  return `[tsxmts] "${specifier}" has no version — add one, e.g. npm:${name}@^1.0.0${subpath} (a version is required so the script keeps resolving the same way on every run).`;
}
