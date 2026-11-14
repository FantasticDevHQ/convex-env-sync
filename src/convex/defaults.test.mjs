import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { applyDefaults, planDefaults, defaultsIdentity } from './defaults.js';

const target = { projectId: 2, teamId: 1, deploymentType: 'preview' };
const deployment = { kind: 'cloud', url: 'https://example-preview.convex.cloud', teamId: 1, projectId: 2, deploymentId: 3, deploymentType: 'preview' };
const token = 'synthetic-team-token';
function fixture() {
  const defaults = { preview: { TOKEN: 'old-synthetic-value', UNRELATED: 'unrelated-synthetic-value' }, prod: { TOKEN: 'prod-synthetic-value' } };
  const existing = { TOKEN: 'dedicated-synthetic-value', SITE_URL: 'dedicated-synthetic-url' };
  const writes = [];
  const deploymentWrites = [];
  let updated = false;
  let verificationGate;
  let onVerification;
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const headers = new Headers(options.headers);
    if (parsed.origin === 'https://api.convex.dev') {
      assert.equal(headers.get('authorization'), `Bearer ${token}`);
      if (parsed.pathname === '/v1/projects/2') return Response.json({ id: 2, teamId: 1, name: 'Example', slug: 'example', teamSlug: 'example', createTime: 0 });
      if (parsed.pathname.endsWith('/list_default_environment_variables')) {
        assert.equal(parsed.searchParams.get('deploymentType'), 'preview');
        return Response.json({ items: Object.entries(defaults.preview).map(([name, value]) => ({ name, value, deploymentTypes: ['preview'] })), pagination: { hasMore: false } });
      }
      assert.equal(parsed.pathname, '/v1/projects/2/update_default_environment_variables');
      const body = typeof options.body === 'string' ? options.body : new TextDecoder().decode(options.body);
      const { changes } = JSON.parse(body);
      writes.push(changes);
      for (const change of changes) {
        assert.equal(change.applyToExistingDeployments, false);
        assert.equal(change.deploymentType, 'preview');
        if (change.value == null) delete defaults.preview[change.name];
        else defaults.preview[change.name] = change.value;
      }
      return Response.json({});
    }
    assert.equal(parsed.origin, deployment.url);
    assert.equal(headers.get('authorization'), `Convex ${token}`);
    if (parsed.pathname.endsWith('/deployment_info')) return Response.json({ kind: 'cloud', id: 3, projectId: 2, teamId: 1, deploymentType: 'preview' });
    if (parsed.pathname.endsWith('/list_environment_variables')) {
      if (updated && verificationGate) { onVerification(); await verificationGate; }
      return Response.json({ environmentVariables: existing });
    }
    assert.equal(parsed.pathname, '/api/v1/update_environment_variables');
    const body = typeof options.body === 'string' ? options.body : new TextDecoder().decode(options.body);
    const { changes } = JSON.parse(body);
    deploymentWrites.push(changes);
    for (const { name, value } of changes) if (value == null) delete existing[name]; else existing[name] = value;
    updated = true;
    return Response.json({});
  };
  return { defaults, existing, writes, deploymentWrites, fetch, gate(promise, enter) { verificationGate = promise; onVerification = enter; } };
}

test('preview defaults use one project/type change set and leave prod and existing deployments unchanged', async () => {
  const f = fixture();
  const beforeProd = { ...f.defaults.prod };
  const beforeExisting = { ...f.existing };
  const result = await applyDefaults({ target, token, desired: { TOKEN: 'new-synthetic-value' }, fetch: f.fetch });
  assert.deepEqual(f.writes, [[{ name: 'TOKEN', deploymentType: 'preview', value: 'new-synthetic-value', applyToExistingDeployments: false }]]);
  assert.deepEqual(f.defaults.prod, beforeProd);
  assert.deepEqual(f.existing, beforeExisting);
  assert.equal(f.deploymentWrites.length, 0);
  assert.equal(result.verified, true);
  assert.ok(!JSON.stringify(result).includes('synthetic-value'));
});

test('read-only defaults plan and equal values make no update calls', async () => {
  const f = fixture();
  const result = await planDefaults({ target, token, desired: { TOKEN: 'new-synthetic-value' }, fetch: f.fetch });
  assert.deepEqual(result.operations, [{ name: 'TOKEN', operation: 'set' }]);
  await applyDefaults({ target, token, desired: { TOKEN: 'old-synthetic-value' }, fetch: f.fetch });
  assert.equal(f.writes.length, 0);
});

test('authorized propagation preserves explicit overrides and waits for verified completion', async () => {
  const f = fixture();
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { entered = resolve; });
  f.gate(gate, entered);
  let settled = false;
  const pending = applyDefaults({ target, token, desired: { TOKEN: 'new-synthetic-value', SITE_URL: 'baseline-synthetic-url' }, propagation: { authorized: true, targets: [{ target: deployment, overrides: { SITE_URL: 'dedicated-synthetic-url' } }] }, fetch: f.fetch }).then((result) => { settled = true; return result; });
  const state = await Promise.race([reached.then(() => 'verifying'), pending.then(() => 'returned-early')]);
  assert.equal(state, 'verifying');
  assert.equal(settled, false);
  release();
  const result = await pending;
  assert.equal(result.verified, true);
  assert.equal(result.propagation[0].verified, true);
  assert.equal(f.existing.TOKEN, 'new-synthetic-value');
  assert.equal(f.existing.SITE_URL, 'dedicated-synthetic-url');
  assert.deepEqual(f.deploymentWrites, [[{ name: 'TOKEN', value: 'new-synthetic-value' }]]);
});

test('unapproved propagation, wrong project/type, source errors and bulk overwrite fail before writes', async () => {
  const f = fixture();
  for (const overrides of [
    { desired: new Error('synthetic-source-error') },
    { applyToExistingDeployments: true },
    { propagation: { targets: [{ target: deployment }] } },
    { propagation: { authorized: true, targets: [{ target: { ...deployment, deploymentType: 'prod' } }] } },
    { propagation: { authorized: true, targets: [{ target: { ...deployment, projectId: 99 } }] } },
    { propagation: { authorized: true, targets: [{ target: deployment }, { target: deployment }] } },
  ]) await assert.rejects(applyDefaults({ target, token, desired: { TOKEN: 'new' }, fetch: f.fetch, ...overrides }));
  assert.equal(f.writes.length, 0);
  assert.equal(f.deploymentWrites.length, 0);
});

test('wrong project identity, incomplete observation and readback mismatches reject without secret evidence', async () => {
  for (const mode of ['identity', 'pagination', 'readback']) {
    const f = fixture();
    const fetch = async (url, options) => {
      const parsed = new URL(url);
      if (mode === 'identity' && parsed.pathname === '/v1/projects/2') return Response.json({ id: 2, teamId: 99, name: 'Example', slug: 'example', teamSlug: 'example', createTime: 0 });
      if (mode === 'pagination' && parsed.pathname.endsWith('list_default_environment_variables')) return Response.json({ items: [], pagination: { hasMore: true, nextCursor: 'opaque' } });
      const result = await f.fetch(url, options);
      if (mode === 'readback' && f.writes.length && parsed.pathname.endsWith('list_default_environment_variables')) return Response.json({ items: [], pagination: { hasMore: false } });
      return result;
    };
    await assert.rejects(applyDefaults({ target, token, desired: { TOKEN: 'new-synthetic-value' }, fetch }), (error) => {
      assert.ok(!inspect(error).includes('synthetic'));
      assert.equal(error.cause, undefined);
      return true;
    });
    if (mode !== 'readback') assert.equal(f.writes.length, 0);
  }
});

test('owned deletion remains scoped and omission alone retains values', async () => {
  const f = fixture();
  const ownership = { target: defaultsIdentity(target), managedNames: ['TOKEN'], syncVersion: 1 };
  await applyDefaults({ target, token, desired: {}, ownership, fetch: f.fetch });
  assert.equal(f.writes.length, 0);
  await applyDefaults({ target, token, desired: {}, ownership, deletions: ['TOKEN'], fetch: f.fetch });
  assert.deepEqual(f.writes, [[{ name: 'TOKEN', deploymentType: 'preview', value: null, applyToExistingDeployments: false }]]);
  assert.equal(f.defaults.prod.TOKEN, 'prod-synthetic-value');
});

test('propagation preflight rejects a mismatched deployment before changing defaults', async () => {
  const f = fixture();
  await assert.rejects(applyDefaults({ target, token, desired: { TOKEN: 'new-synthetic-value' }, propagation: { authorized: true, targets: [{ target: { ...deployment, deploymentId: 99 } }] }, fetch: f.fetch }));
  assert.equal(f.writes.length, 0);
  assert.equal(f.deploymentWrites.length, 0);
});

test('propagation readback failure prevents overall success after defaults change', async () => {
  const f = fixture();
  const fetch = async (url, options) => {
    const response = await f.fetch(url, options);
    if (f.deploymentWrites.length && new URL(url).pathname.endsWith('/list_environment_variables')) return Response.json({ environmentVariables: {} });
    return response;
  };
  await assert.rejects(applyDefaults({ target, token, desired: { TOKEN: 'new-synthetic-value' }, propagation: { authorized: true, targets: [{ target: deployment }] }, fetch }), { message: 'Convex defaults apply or verification failed' });
  assert.equal(f.writes.length, 1);
  assert.equal(f.deploymentWrites.length, 1);
});
