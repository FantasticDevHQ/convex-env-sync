import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { planDeployment, applyDeployment, deploymentIdentity } from './deployment.js';

const token = 'synthetic-admin-token';
const cloud = { kind: 'cloud', url: 'https://example-preview.convex.cloud', teamId: 1, projectId: 2, deploymentId: 3, deploymentType: 'preview' };
const local = (port, name) => ({ kind: 'local', url: `http://127.0.0.1:${port}`, instanceName: name, protectedNames: ['LOCAL_AUTH_ID'] });
const a = local(19001, 'anonymous-a');
const b = local(19002, 'anonymous-b');

function fixture(targets = [cloud]) {
  const state = new Map(targets.map((target) => [target.url, { target, values: { TOKEN: 'old-synthetic-value', UNRELATED: 'unrelated-synthetic-value', LOCAL_AUTH_ID: `local-synthetic-${target.url}` }, writes: [], requests: [] }]));
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url);
    const current = state.get(parsed.origin);
    assert.ok(current, 'Request must target a declared origin');
    current.requests.push(parsed.pathname);
    if (parsed.pathname === '/instance_name') return new Response(current.target.instanceName);
    assert.equal(new Headers(options.headers).get('authorization'), `Convex ${token}`);
    if (parsed.pathname === '/api/v1/deployment_info') return Response.json(current.info ?? (current.target.kind === 'cloud' ? { kind: 'cloud', id: 3, teamId: 1, projectId: 2, deploymentType: 'preview' } : { kind: 'selfHosted' }));
    if (parsed.pathname === '/api/v1/list_environment_variables') return Response.json({ environmentVariables: current.readback ?? current.values });
    assert.equal(parsed.pathname, '/api/v1/update_environment_variables');
    assert.equal(options.method, 'POST');
    const body = typeof options.body === 'string' ? options.body : new TextDecoder().decode(options.body);
    const { changes } = JSON.parse(body);
    current.writes.push(changes);
    for (const change of changes) {
      if (change.value == null) delete current.values[change.name];
      else current.values[change.name] = change.value;
    }
    return Response.json({});
  };
  return { state, fetch };
}

test('mismatched cloud identity fails before a write', async () => {
  const f = fixture();
  f.state.get(cloud.url).info = { kind: 'cloud', id: 99, teamId: 1, projectId: 2, deploymentType: 'preview' };
  await assert.rejects(applyDeployment({ target: cloud, token, desired: { TOKEN: 'new-synthetic-value' }, fetch: f.fetch }));
  assert.equal(f.state.get(cloud.url).writes.length, 0);
});

test('one SDK bulk update contains only scoped changes and verifies readback', async () => {
  const f = fixture();
  const result = await applyDeployment({ target: cloud, token, desired: { TOKEN: 'new-synthetic-value', EMPTY: '' }, fetch: f.fetch });
  const current = f.state.get(cloud.url);
  assert.deepEqual(current.writes, [[{ name: 'EMPTY', value: '' }, { name: 'TOKEN', value: 'new-synthetic-value' }]]);
  assert.equal(current.values.UNRELATED, 'unrelated-synthetic-value');
  assert.equal(result.verified, true);
  assert.deepEqual(result.ownership.managedNames, ['EMPTY', 'TOKEN']);
  assert.ok(!JSON.stringify(result).includes('synthetic-value'));
});

test('failed readback reports failure without secret values or ownership success', async () => {
  const f = fixture();
  f.state.get(cloud.url).readback = { TOKEN: 'wrong-synthetic-value' };
  await assert.rejects(applyDeployment({ target: cloud, token, desired: { TOKEN: 'new-synthetic-value' }, fetch: f.fetch }), (error) => {
    assert.equal(error.message, 'Convex deployment apply or verification failed');
    assert.ok(!inspect(error).includes('synthetic'));
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(f.state.get(cloud.url).writes.length, 1);
});

test('two local targets remain isolated and preserve generated local identity', async () => {
  const f = fixture([a, b]);
  const sibling = structuredClone(f.state.get(b.url).values);
  const ownAuth = f.state.get(a.url).values.LOCAL_AUTH_ID;
  await applyDeployment({ target: a, token, desired: { TOKEN: 'new-synthetic-value' }, fetch: f.fetch });
  assert.deepEqual(f.state.get(b.url).values, sibling);
  assert.equal(f.state.get(b.url).requests.length, 0);
  assert.equal(f.state.get(a.url).values.LOCAL_AUTH_ID, ownAuth);
  assert.equal(f.state.get(a.url).writes.length, 1);
});

test('local instance mismatch and protected names fail before writes', async () => {
  const f = fixture([a]);
  await assert.rejects(applyDeployment({ target: { ...a, instanceName: 'anonymous-sibling' }, token, desired: { TOKEN: 'new' }, fetch: f.fetch }));
  await assert.rejects(applyDeployment({ target: a, token, desired: { LOCAL_AUTH_ID: 'shared-cloud-auth' }, fetch: f.fetch }));
  assert.equal(f.state.get(a.url).writes.length, 0);
});

test('planning is read-only and equal values skip update calls', async () => {
  const f = fixture();
  const planned = await planDeployment({ target: cloud, token, desired: { TOKEN: 'new-synthetic-value' }, fetch: f.fetch });
  assert.deepEqual(planned.operations, [{ name: 'TOKEN', operation: 'set' }]);
  assert.equal(f.state.get(cloud.url).writes.length, 0);
  const applied = await applyDeployment({ target: cloud, token, desired: { TOKEN: 'old-synthetic-value' }, fetch: f.fetch });
  assert.equal(applied.verified, true);
  assert.equal(f.state.get(cloud.url).writes.length, 0);
});

test('explicit owned deletion is sparse and requires exact destination ownership', async () => {
  const f = fixture();
  const ownership = { target: deploymentIdentity(cloud), managedNames: ['TOKEN'], syncVersion: 1 };
  await applyDeployment({ target: cloud, token, desired: {}, ownership, deletions: ['TOKEN'], fetch: f.fetch });
  assert.deepEqual(f.state.get(cloud.url).writes, [[{ name: 'TOKEN' }]]);
  assert.ok(!Object.hasOwn(f.state.get(cloud.url).values, 'TOKEN'));
  assert.equal(f.state.get(cloud.url).values.UNRELATED, 'unrelated-synthetic-value');
});

test('malformed targets and source errors fail before authentication', async () => {
  let requests = 0;
  const fetch = async () => { requests++; throw new Error(token); };
  for (const target of [undefined, { ...cloud, deploymentId: undefined }, { ...cloud, url: 'https://evil.example' }, { ...a, url: 'http://remote.example:9000' }, { ...a, protectedNames: undefined }]) {
    await assert.rejects(applyDeployment({ target, token, desired: { TOKEN: 'new' }, fetch }));
  }
  await assert.rejects(applyDeployment({ target: cloud, token, desired: new Error('synthetic-source-failure'), fetch }));
  assert.equal(requests, 0);
});

test('caller mutation during observation cannot change target, desired values or credentials', async () => {
  const f = fixture();
  const input = { target: { ...cloud }, token, desired: { TOKEN: 'new-synthetic-value' } };
  input.fetch = async (url, options) => {
    const response = await f.fetch(url, options);
    input.token = 'replacement-synthetic-token';
    input.target.url = 'https://sibling.convex.cloud';
    input.desired.TOKEN = 'replacement-synthetic-value';
    return response;
  };
  await applyDeployment(input);
  assert.equal(f.state.get(cloud.url).values.TOKEN, 'new-synthetic-value');
});

test('identity changing after observation fails before update', async () => {
  const f = fixture();
  const fetch = async (url, options) => {
    const response = await f.fetch(url, options);
    if (new URL(url).pathname.endsWith('list_environment_variables')) f.state.get(cloud.url).info = { kind: 'selfHosted' };
    return response;
  };
  await assert.rejects(applyDeployment({ target: cloud, token, desired: { TOKEN: 'new' }, fetch }));
  assert.equal(f.state.get(cloud.url).writes.length, 0);
});

test('SDK response failures are sanitized without logs', async (t) => {
  const logs = ['log', 'error', 'info', 'warn', 'debug'].map((name) => t.mock.method(console, name, () => {}));
  await assert.rejects(applyDeployment({ target: cloud, token, desired: { TOKEN: 'new' }, fetch: async () => Response.json({ code: 'Forbidden', message: token }, { status: 403 }) }), (error) => {
    assert.ok(!inspect(error).includes(token));
    assert.equal(error.cause, undefined);
    return true;
  });
  for (const log of logs) assert.equal(log.mock.calls.length, 0);
});
