import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { loadDoppler } from './doppler.js';

const token = 'synthetic-doppler-auth';
const secret = 'synthetic-resolved-value';
const input = { project: 'example-app', config: 'preview', token };
const values = {
  SYNC_CONVEX_DEFAULT_KEYS: { computed: '["TOKEN"]' },
  SYNC_CONVEX_DEPLOYMENT_KEYS: { computed: '["SITE_URL"]' },
  TOKEN: { raw: 'unresolved-reference', computed: secret },
  SITE_URL: { computed: '' },
  DOPPLER_TOKEN: { computed: token },
  UNSELECTED: { computed: 'synthetic-unselected' },
};
const respond = (secrets = values) => Response.json({ secrets });

test('existing SDK reads only the exact config and returns selected computed application values', async () => {
  const requests = [];
  const selected = await loadDoppler({ ...input, fetch: async (url, options) => {
    requests.push({ url: new URL(url), options });
    return respond();
  } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.origin, 'https://api.doppler.com');
  assert.equal(requests[0].url.pathname, '/v3/configs/config/secrets');
  assert.equal(requests[0].url.searchParams.get('project'), input.project);
  assert.equal(requests[0].url.searchParams.get('config'), input.config);
  assert.equal(new Headers(requests[0].options.headers).get('authorization'), `Bearer ${token}`);
  assert.deepEqual(selected, { defaults: { TOKEN: secret }, deployment: { SITE_URL: '' } });
});

test('absent preview config rejects with a sanitized error and never falls back', async () => {
  const configs = [];
  await assert.rejects(loadDoppler({ ...input, fetch: async (url) => {
    configs.push(new URL(url).searchParams.get('config'));
    return Response.json({ messages: [secret] }, { status: 404 });
  } }), (error) => {
    assert.equal(error.message, 'Doppler source could not be loaded');
    assert.ok(!inspect(error).includes(secret));
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.deepEqual(configs, ['preview']);
});

test('missing, restricted, malformed and credential selections all fail closed', async () => {
  for (const secrets of [
    {}, { ...values, TOKEN: undefined },
    { ...values, TOKEN: { computed: secret, computedVisibility: 'restricted' } },
    { ...values, TOKEN: { computed: secret, computedVisibility: 'unknown' } },
    { ...values, TOKEN: { computed: null, computedVisibility: 'masked', raw: secret } },
    { ...values, TOKEN: { raw: secret } },
    { ...values, SYNC_CONVEX_DEFAULT_KEYS: { computed: secret } },
    { ...values, SYNC_CONVEX_DEFAULT_KEYS: { computed: '["DOPPLER_TOKEN"]' } },
  ]) {
    await assert.rejects(loadDoppler({ ...input, fetch: async () => respond(secrets) }));
  }
});

test('invalid mapping rejects before authentication or network access', async () => {
  let calls = 0;
  for (const overrides of [{ project: '' }, { config: undefined }, { token: '' }]) {
    await assert.rejects(loadDoppler({ ...input, ...overrides, fetch: async () => { calls++; return respond(); } }));
  }
  assert.equal(calls, 0);
});

test('adapter emits no logs and does not attach response values to errors or state', async (t) => {
  const logs = ['log', 'error', 'warn', 'info', 'debug'].map((method) => t.mock.method(console, method, () => {}));
  const config = { ...input, fetch: async () => respond() };
  const before = inspect(config);
  await loadDoppler(config);
  assert.equal(inspect(config), before);
  for (const log of logs) assert.equal(log.mock.calls.length, 0);
  // Selected return values are intentionally secret-bearing. Only plans may be persisted.
});

test('transport failures never retain credential-bearing SDK error details', async () => {
  await assert.rejects(loadDoppler({ ...input, fetch: async () => {
    throw new Error(`${token} ${secret}`);
  } }), (error) => {
    assert.equal(error.message, 'Doppler source could not be loaded');
    assert.ok(!inspect(error).includes(token));
    assert.ok(!inspect(error).includes(secret));
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('masked manifests and computed strings remain retrievable through the pinned SDK', async () => {
  const masked = Object.fromEntries(Object.entries(values).map(([name, entry]) => [name, { ...entry, computedVisibility: 'masked' }]));
  const selected = await loadDoppler({ ...input, fetch: async () => respond(masked) });
  assert.deepEqual(selected, { defaults: { TOKEN: secret }, deployment: { SITE_URL: '' } });
});
