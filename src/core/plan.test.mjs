import test from 'node:test';
import assert from 'node:assert/strict';
import { plan } from './plan.js';

const input = {
  source: { ZED: 'synthetic-secret-z', ALPHA: 'synthetic-secret-a', OMIT: 'synthetic-omitted' },
  selection: { defaults: '["ZED","ALPHA"]', deployment: '[]' },
};

test('deterministic output is ordered by key name regardless of selection order', () => {
  const first = plan(input);
  assert.deepEqual(first, { defaults: [{ name: 'ALPHA', operation: 'set' }, { name: 'ZED', operation: 'set' }], deployment: [] });
  assert.deepEqual(first, plan(input));
  assert.deepEqual(first, plan({ ...input, selection: { ...input.selection, defaults: '["ALPHA","ZED"]' } }));
});

test('serialized plan contains no values or value-bearing hidden fields', () => {
  const result = plan(input);
  const serialized = JSON.stringify(result);
  for (const value of Object.values(input.source)) assert.ok(!serialized.includes(value));
  assert.deepEqual(Reflect.ownKeys(result), ['defaults', 'deployment']);
});

test('invalid input cannot invoke provider updates', () => {
  let updates = 0;
  assert.throws(() => plan({ ...input, source: {}, update: () => updates++ }));
  assert.equal(updates, 0);
});
