import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from './reconcile.js';

const target = 'deployment:example-preview';
const base = {
  target,
  desired: { TOKEN: 'new-synthetic-value' },
  actual: { TOKEN: 'old-synthetic-value', UNRELATED: 'external-synthetic-value', FORMER: 'retained-synthetic-value' },
  ownership: { target, managedNames: ['TOKEN', 'FORMER'], syncVersion: 1 },
};

test('preserves unrelated and omitted keys, reports only rotated managed names', () => {
  const before = structuredClone(base);
  const result = reconcile(base);
  assert.deepEqual(result.operations, [{ name: 'TOKEN', operation: 'set' }]);
  assert.deepEqual(result.ownership, { target, managedNames: ['FORMER', 'TOKEN'], syncVersion: 1 });
  assert.deepEqual(base, before);
  // A sparse provider change set leaves all keys without an operation untouched.
  const updated = { ...base.actual };
  for (const { name, operation } of result.operations) {
    if (operation === 'set') updated[name] = base.desired[name];
    else delete updated[name];
  }
  assert.equal(updated.UNRELATED, base.actual.UNRELATED);
  assert.equal(updated.FORMER, base.actual.FORMER);
});

test('deletion requires both prior ownership for this target and an explicit declaration', () => {
  assert.throws(() => reconcile({ ...base, deletions: ['UNRELATED'] }));
  assert.throws(() => reconcile({ ...base, ownership: { ...base.ownership, target: 'deployment:sibling' }, deletions: ['FORMER'] }));
  assert.throws(() => reconcile({ ...base, deletions: ['TOKEN'] }));
  const result = reconcile({ ...base, deletions: ['FORMER'] });
  assert.deepEqual(result.operations, [{ name: 'FORMER', operation: 'delete' }, { name: 'TOKEN', operation: 'set' }]);
  assert.deepEqual(result.ownership.managedNames, ['TOKEN']);
});

test('unchanged desired values produce no writes and new keys become owned', () => {
  const result = reconcile({ target, desired: { NEW: '', SAME: 'equal' }, actual: { SAME: 'equal' } });
  assert.deepEqual(result.operations, [{ name: 'NEW', operation: 'set' }]);
  assert.deepEqual(result.ownership.managedNames, ['NEW', 'SAME']);
});

test('rotation plans and ownership serialize without values', () => {
  const result = reconcile(base);
  const serialized = JSON.stringify(result);
  for (const value of [...Object.values(base.actual), ...Object.values(base.desired)]) assert.ok(!serialized.includes(value));
  assert.deepEqual(Reflect.ownKeys(result), ['operations', 'ownership']);
});

test('source errors, incomplete observation, invalid names and malformed ownership fail closed', () => {
  for (const overrides of [
    { desired: undefined }, { desired: new Error('synthetic-source-error') }, { desired: [] },
    { desired: { TOKEN: undefined } }, { actual: undefined }, { actual: { TOKEN: null } },
    { desired: { DOPPLER_TOKEN: 'synthetic-credential' } }, { target: '' },
    { ownership: { target, managedNames: ['TOKEN', 'TOKEN'], syncVersion: 1 } },
    { ownership: { target, managedNames: ['TOKEN'], syncVersion: 99 } },
    { deletions: ['FORMER', 'FORMER'] },
  ]) {
    assert.throws(() => reconcile({ ...base, ...overrides }), (error) => {
      assert.ok(!error.message.includes('synthetic-'));
      return true;
    });
  }
});

test('empty selection never implies deletion, including previously owned missing keys', () => {
  assert.deepEqual(reconcile({ ...base, desired: {} }).operations, []);
  const missing = reconcile({ ...base, actual: {}, desired: {}, deletions: ['FORMER'] });
  assert.deepEqual(missing.operations, []);
  assert.deepEqual(missing.ownership.managedNames, ['TOKEN']);
});
