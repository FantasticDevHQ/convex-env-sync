import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { inspect } from 'node:util';
import { loadInfisical } from './infisical.js';
import { loadDoppler } from './doppler.js';

const values = { SYNC_CONVEX_DEFAULT_KEYS: '["TOKEN"]', SYNC_CONVEX_DEPLOYMENT_KEYS: '["SITE_URL"]', TOKEN: 'synthetic-shared-secret', SITE_URL: '', INFISICAL_TOKEN: 'synthetic-credential' };
const mapping = { projectId: 'example-project', environment: 'preview', secretPath: '/backend' };
const secrets = Object.entries(values).map(([secretKey, secretValue]) => ({ secretKey, secretValue, secretValueHidden: false }));
const client = (read) => ({ secrets: () => ({ listSecrets: read }) });

test('maps the exact environment/folder and matches Doppler selected input', async () => {
  const calls = [];
  const selected = await loadInfisical({ ...mapping, client: client(async (options) => { calls.push(options); return { secrets }; }) });
  assert.deepEqual(calls, [{ ...mapping, expandSecretReferences: true, viewSecretValue: true, includeImports: false, recursive: false, attachToProcessEnv: false }]);
  const doppler = await loadDoppler({ project: 'example', config: 'preview', token: 'synthetic-auth', fetch: async () => Response.json({ secrets: Object.fromEntries(Object.entries(values).map(([key, computed]) => [key, { computed }])) }) });
  assert.deepEqual(selected, doppler);
  assert.deepEqual(selected, { defaults: { TOKEN: values.TOKEN }, deployment: { SITE_URL: '' } });
});

test('missing, masked, duplicate, malformed and credential selections fail before a result', async () => {
  for (const response of [
    {}, { secrets: [] },
    { secrets: secrets.filter((s) => s.secretKey !== 'TOKEN') },
    { secrets: secrets.map((s) => s.secretKey === 'TOKEN' ? { ...s, secretValueHidden: true } : s) },
    { secrets: [...secrets, secrets[2]] },
    { secrets: secrets.map((s) => s.secretKey === 'SYNC_CONVEX_DEFAULT_KEYS' ? { ...s, secretValue: '["INFISICAL_TOKEN"]' } : s) },
  ]) await assert.rejects(loadInfisical({ ...mapping, client: client(async () => response) }));
});

test('invalid mapping fails before client access and source errors never fall back', async () => {
  let calls = 0;
  for (const override of [{ environment: '' }, { projectId: undefined }, { secretPath: undefined }, { secretPath: 'backend' }]) {
    await assert.rejects(loadInfisical({ ...mapping, ...override, client: client(async () => { calls++; return { secrets }; }) }));
  }
  assert.equal(calls, 0);
  await assert.rejects(loadInfisical({ ...mapping, client: client(async () => { calls++; throw new Error(values.TOKEN); }) }), (error) => {
    assert.equal(error.message, 'Infisical source could not be loaded');
    assert.ok(!inspect(error).includes(values.TOKEN));
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(calls, 1);
});

test('adapter emits no logs or process environment changes', async (t) => {
  const logs = ['log', 'warn', 'error', 'debug', 'info'].map((key) => t.mock.method(console, key, () => {}));
  const before = { ...process.env };
  await loadInfisical({ ...mapping, client: client(async () => ({ secrets })) });
  assert.deepEqual({ ...process.env }, before);
  for (const log of logs) assert.equal(log.mock.calls.length, 0);
});

test('Doppler-only loading never resolves Infisical dependencies', () => {
  const hook = `import { registerHooks } from 'node:module'; registerHooks({resolve(s,c,next){if(s.includes('infisical'))throw new Error('Infisical dependency resolved');return next(s,c);}});`;
  const script = `import { loadDoppler } from ${JSON.stringify(new URL('./doppler.js', import.meta.url).href)}; await loadDoppler({project:'example',config:'dev',token:'synthetic-auth',fetch:async()=>Response.json({secrets:{SYNC_CONVEX_DEFAULT_KEYS:{computed:'[]'},SYNC_CONVEX_DEPLOYMENT_KEYS:{computed:'[]'}}})});`;
  execFileSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(hook)}`, '--input-type=module', '-e', script], { stdio: 'pipe' });
});
