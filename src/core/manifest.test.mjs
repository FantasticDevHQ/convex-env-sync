import test from 'node:test';
import assert from 'node:assert/strict';
import { selectValues } from './manifest.js';

const source = { TOKEN: 'synthetic-token', URL: 'synthetic-url', EMPTY: '' };
const selection = { defaults: '["TOKEN"]', deployment: '["URL"]' };

test('selects only declared values, including empty strings', () => {
  assert.deepEqual(selectValues(source, { ...selection, deployment: '["EMPTY"]' }), {
    defaults: { TOKEN: source.TOKEN }, deployment: { EMPTY: '' },
  });
});

test('invalid selections fail without echoing input', () => {
  for (const defaults of ['secret-invalid-json', '{}', '[1]', '["TOKEN","TOKEN"]', '["bad name"]', '["DOPPLER_TOKEN"]', '["SYNC_CONVEX_DEFAULT_KEYS"]', '["CONVEX_DEPLOY_KEY"]']) {
    assert.throws(() => selectValues(source, { defaults, deployment: '[]' }), (error) => {
      assert.ok(!error.message.includes('secret-invalid-json'));
      return true;
    });
  }
  assert.throws(() => selectValues(source, { defaults: '["TOKEN"]', deployment: '["TOKEN"]' }));
});

test('missing selected values and non-string values fail before any write', () => {
  assert.throws(() => selectValues(source, { defaults: '["MISSING"]', deployment: '[]' }));
  assert.throws(() => selectValues({ TOKEN: undefined }, { defaults: '["TOKEN"]', deployment: '[]' }));
  assert.throws(() => selectValues(Object.create({ TOKEN: 'inherited' }), { defaults: '["TOKEN"]', deployment: '[]' }));
});
