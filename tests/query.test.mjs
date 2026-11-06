import test from 'node:test';
import assert from 'node:assert/strict';
import { executeQuery, QueryError } from '../dist/esm/index.js';

const rows = [
  { id: 1, name: 'Alpha', score: 4, active: true },
  { id: 2, name: 'Beta', score: 8, active: false },
  { id: 3, name: 'Alphabet', score: 6, active: true },
];
test('filters by equality', () =>
  assert.deepEqual(
    executeQuery(rows, { where: [{ field: 'active', op: 'eq', value: true }] }).map((r) => r.id),
    [1, 3],
  ));
test('supports in and contains predicates', () =>
  assert.deepEqual(
    executeQuery(rows, {
      where: [
        { field: 'id', op: 'in', value: [2, 3] },
        { field: 'name', op: 'contains', value: 'a' },
      ],
    }).map((r) => r.id),
    [2, 3],
  ));
test('supports field presence', () =>
  assert.deepEqual(
    executeQuery(rows, { where: [{ field: 'missing', op: 'exists', value: false }] }).length,
    3,
  ));
test('supports typed comparison operators', () =>
  assert.deepEqual(
    executeQuery(rows, {
      where: [
        { field: 'score', op: 'gt', value: 4 },
        { field: 'score', op: 'lte', value: 8 },
      ],
    }).map((r) => r.id),
    [2, 3],
  ));
test('sorts stably and paginates', () =>
  assert.deepEqual(
    executeQuery(rows, {
      orderBy: [{ field: 'score', direction: 'desc' }],
      offset: 1,
      limit: 1,
    }).map((r) => r.id),
    [3],
  ));
test('projects own fields without mutating input', () => {
  const result = executeQuery(rows, { select: ['name', 'missing'] });
  assert.deepEqual(result[0], { name: 'Alpha' });
  assert.notEqual(result[0], rows[0]);
});
test('uses bounded defaults and explicit limits', () =>
  assert.equal(executeQuery(rows, { limit: 1 }).length, 1));
test('rejects malformed condition/operator', () => {
  assert.throws(
    () => executeQuery(rows, { where: [{ field: '', op: 'eq', value: 1 }] }),
    QueryError,
  );
  assert.throws(
    () => executeQuery(rows, { where: [{ field: 'id', op: 'wat', value: 1 }] }),
    QueryError,
  );
  assert.throws(() => executeQuery(rows, { unexpected: true }), QueryError);
  assert.throws(() => executeQuery(rows, {}, { maxRows: null }), QueryError);
});
test('rejects malformed values, sort, and pagination', () => {
  assert.throws(
    () => executeQuery(rows, { where: [{ field: 'id', op: 'in', value: '1' }] }),
    QueryError,
  );
  assert.throws(
    () => executeQuery(rows, { orderBy: [{ field: 'id', direction: 'sideways' }] }),
    QueryError,
  );
  assert.throws(() => executeQuery(rows, { limit: -1 }), QueryError);
});
test('rejects non-record rows and row-cap overflow', () => {
  assert.throws(() => executeQuery([null], {}), QueryError);
  assert.throws(() => executeQuery(rows, {}, { maxRows: 2 }), QueryError);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => executeQuery(sparse, {}), QueryError);
});
test('rejects excessive query clauses and inconsistent sort values', () => {
  assert.throws(
    () =>
      executeQuery(rows, {
        where: Array.from({ length: 65 }, () => ({ field: 'id', op: 'eq', value: 1 })),
      }),
    QueryError,
  );
  assert.throws(
    () => executeQuery([{ x: 1 }, { x: '2' }], { orderBy: [{ field: 'x' }] }),
    QueryError,
  );
});
