import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStage, runStage } from './stages.js';
import { cloudTarget, syncFixture } from '../../test/sync-fixture.mjs';

const stages = { preview: { kind: 'preview', source: 'preview-baseline', target: cloudTarget } };
function fixture() {
  const f = syncFixture();
  const calls = { source: 0, credentials: 0 };
  const runtime = {
    sources: { 'preview-baseline': async () => { calls.source++; return { defaults: { TOKEN: 'new-synthetic-value' }, deployment: {} }; } },
    getToken: async () => { calls.credentials++; return 'synthetic-admin-token'; },
    fetch: f.fetch,
  };
  return { f, calls, runtime };
}

test('unknown stages reject before source or credentials without production fallback', async () => {
  const { f, calls, runtime } = fixture();
  assert.throws(() => resolveStage(stages, 'unknown'));
  await assert.rejects(runStage({ stages, stage: 'unknown', runtime, mode: 'apply' }));
  assert.deepEqual(calls, { source: 0, credentials: 0 });
  assert.equal(f.writes.length, 0);
});

test('preview dispatch writes only the exact deployment and reports no values', async () => {
  const { f, runtime } = fixture();
  const result = await runStage({ stages, stage: 'preview', runtime, mode: 'apply' });
  assert.equal(f.remote.TOKEN, 'new-synthetic-value');
  assert.equal(f.defaultsWrites, 0);
  assert.equal(result.verified, true);
  assert.ok(!JSON.stringify(result).includes('synthetic-value'));
});

test('explicit source and generated overlays apply in declared order', async () => {
  const { f, runtime } = fixture();
  runtime.sources.overlay = async () => ({ defaults: { TOKEN: 'overlay-synthetic-value' }, deployment: { SITE_URL: 'overlay-synthetic-url' } });
  runtime.generated = async () => ({ SITE_URL: 'generated-synthetic-url' });
  const mapping = { preview: { ...stages.preview, overlaySource: 'overlay', overlayNames: ['TOKEN', 'SITE_URL'], generatedNames: ['SITE_URL'] } };
  await runStage({ stages: mapping, stage: 'preview', runtime, mode: 'apply' });
  assert.equal(f.remote.TOKEN, 'overlay-synthetic-value');
  assert.equal(f.remote.SITE_URL, 'generated-synthetic-url');
});

test('missing source, undeclared overlays and failed selected values reject before destination authentication', async () => {
  for (const scenario of ['missing', 'error', 'conflict', 'null-overlay', 'undeclared-generated']) {
    const { f, runtime, calls } = fixture();
    let mapping = stages;
    if (scenario === 'missing') delete runtime.sources['preview-baseline'];
    if (scenario === 'error') runtime.sources['preview-baseline'] = async () => { throw new Error('synthetic-source-error'); };
    if (scenario === 'conflict') runtime.sources['preview-baseline'] = async () => ({ defaults: { TOKEN: 'a' }, deployment: { TOKEN: 'b' } });
    if (scenario === 'null-overlay') {
      mapping = { preview: { ...stages.preview, overlaySource: 'overlay', overlayNames: ['TOKEN'] } };
      runtime.sources.overlay = async () => null;
    }
    if (scenario === 'undeclared-generated') {
      mapping = { preview: { ...stages.preview, generatedNames: ['SITE_URL'] } };
      runtime.generated = async () => ({ TOKEN: 'unexpected-synthetic-value' });
    }
    await assert.rejects(runStage({ stages: mapping, stage: 'preview', runtime, mode: 'apply' }));
    assert.equal(calls.credentials, 0);
    assert.equal(f.writes.length, 0);
  }
});

test('unsafe configuration fields and mismatched deployment classifications fail', () => {
  for (const entry of [
    { ...stages.preview, token: 'synthetic-credential' },
    { ...stages.preview, target: { ...cloudTarget, deploymentType: 'prod' } },
    { ...stages.preview, source: undefined },
    { kind: 'project-defaults', source: 'preview-baseline', target: { teamId: 1, projectId: 2, deploymentType: 'preview' }, generatedNames: ['SITE_URL'] },
  ]) assert.throws(() => resolveStage({ preview: entry }, 'preview'));
});

test('plan mode observes without writes and invalid modes fail before loading', async () => {
  const { f, runtime, calls } = fixture();
  const result = await runStage({ stages, stage: 'preview', runtime, mode: 'plan' });
  assert.deepEqual(result.operations, [{ name: 'TOKEN', operation: 'set' }]);
  assert.equal(f.writes.length, 0);
  const sourceCalls = calls.source;
  await assert.rejects(runStage({ stages, stage: 'preview', runtime, mode: 'deploy' }));
  assert.equal(calls.source, sourceCalls);
});

test('runtime callbacks cannot mutate the resolved destination', async () => {
  const { f, runtime } = fixture();
  const mapping = { preview: { ...stages.preview, generatedNames: ['SITE_URL'] } };
  runtime.generated = async ({ target }) => { target.url = 'https://sibling.convex.cloud'; return { SITE_URL: 'generated-synthetic-url' }; };
  runtime.getToken = async ({ target }) => { target.url = 'https://another.convex.cloud'; return 'synthetic-admin-token'; };
  await runStage({ stages: mapping, stage: 'preview', runtime, mode: 'apply' });
  assert.equal(f.remote.TOKEN, 'new-synthetic-value');
});
