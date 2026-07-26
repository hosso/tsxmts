import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSpecifier } from '../hooks.mjs';

test('bare name defaults to latest', () => {
  assert.deepEqual(parseSpecifier('npm:is-odd'), {
    name: 'is-odd',
    version: 'latest',
    subpath: '',
  });
});

test('name with a version', () => {
  assert.deepEqual(parseSpecifier('npm:is-odd@^3.0.1'), {
    name: 'is-odd',
    version: '^3.0.1',
    subpath: '',
  });
});

test('scoped name without a version', () => {
  assert.deepEqual(parseSpecifier('npm:@sindresorhus/is'), {
    name: '@sindresorhus/is',
    version: 'latest',
    subpath: '',
  });
});

test('scoped name with a version', () => {
  assert.deepEqual(parseSpecifier('npm:@sindresorhus/is@^7.0.0'), {
    name: '@sindresorhus/is',
    version: '^7.0.0',
    subpath: '',
  });
});

test('name with a version and a subpath', () => {
  assert.deepEqual(parseSpecifier('npm:csv-parse@^5.5.0/sync'), {
    name: 'csv-parse',
    version: '^5.5.0',
    subpath: '/sync',
  });
});

test('name with a subpath and no version', () => {
  assert.deepEqual(parseSpecifier('npm:csv-parse/sync'), {
    name: 'csv-parse',
    version: 'latest',
    subpath: '/sync',
  });
});

test('scoped name with a version and a subpath', () => {
  assert.deepEqual(parseSpecifier('npm:@tryfabric/martian@^1.2.4/utils'), {
    name: '@tryfabric/martian',
    version: '^1.2.4',
    subpath: '/utils',
  });
});

test('scoped name with a subpath and no version', () => {
  assert.deepEqual(parseSpecifier('npm:@tryfabric/martian/utils'), {
    name: '@tryfabric/martian',
    version: 'latest',
    subpath: '/utils',
  });
});
