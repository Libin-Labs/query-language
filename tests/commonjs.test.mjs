import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
test('loads and evaluates from the CommonJS build', () => {
  const { executeQuery } = require('../dist/cjs/index.js');
  assert.deepEqual(executeQuery([{ n: 1 }], { where: [{ field: 'n', op: 'eq', value: 1 }] }), [
    { n: 1 },
  ]);
});
