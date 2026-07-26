import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSpecifier } from '../hooks.mjs';

test('bare name defaults to latest', () => {
  assert.deepEqual(parseSpecifier('npm:is-odd'), {
    name: 'is-odd',
    version: 'latest',
  });
});

test('name with a version', () => {
  assert.deepEqual(parseSpecifier('npm:is-odd@^3.0.1'), {
    name: 'is-odd',
    version: '^3.0.1',
  });
});

test('scoped name without a version', () => {
  assert.deepEqual(parseSpecifier('npm:@sindresorhus/is'), {
    name: '@sindresorhus/is',
    version: 'latest',
  });
});

test('scoped name with a version', () => {
  assert.deepEqual(parseSpecifier('npm:@sindresorhus/is@^7.0.0'), {
    name: '@sindresorhus/is',
    version: '^7.0.0',
  });
});
