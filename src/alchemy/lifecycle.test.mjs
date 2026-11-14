import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Logger from 'effect/Logger';
import * as Provider from 'alchemy/Provider';
import { Resource } from 'alchemy/Resource';
import { Stack } from 'alchemy/Stack';
import { InMemoryService } from 'alchemy/State/InMemoryState';
import { State } from 'alchemy/State/State';
import { encodeState } from 'alchemy/State/StateEncoding';
import { evalStack } from 'alchemy/EvalStack';
import * as Plan from 'alchemy/Plan';
import { apply } from 'alchemy/Apply';
import { Sync, syncProvider } from './index.js';
import { loadDoppler } from '../sources/doppler.js';
import { cloudTarget, syncFixture } from '../../test/sync-fixture.mjs';

function fixture({ upstream = false, generated = false, unsafe = false } = {}) {
  const f = syncFixture();
  const state = {};
  const snapshots = [];
  const logs = [];
  const calls = { source: 0, token: 0, initialize: 0 };
  let current = 'first-synthetic-secret';
  let failedSource = false;
  const runtime = {
    sources: { preview: async () => {
      calls.source++;
      if (failedSource) throw new Error(current);
      return loadDoppler({ project: 'example', config: 'preview', token: 'synthetic-doppler-token', fetch: async () => Response.json({ secrets: {
        SYNC_CONVEX_DEFAULT_KEYS: { computed: '["TOKEN"]' },
        SYNC_CONVEX_DEPLOYMENT_KEYS: { computed: '[]' },
        TOKEN: { computed: current },
        DOPPLER_TOKEN: { computed: 'synthetic-doppler-token' },
        UNSELECTED: { computed: 'unused-synthetic-secret' },
      } }) });
    } },
    getToken: async () => { calls.token++; return 'synthetic-admin-token'; },
    fetch: f.fetch,
    generated: async () => ({ SITE_URL: 'generated-synthetic-secret' }),
  };
  const stateLayer = Layer.effect(State, Effect.cached(Effect.map(InMemoryService(state), (client) => ({
    ...client,
    set: (args) => client.set(args).pipe(Effect.tap(() => Effect.sync(() => snapshots.push(JSON.stringify(encodeState(args.value)))))),
  }))));
  const Consumer = Resource('Example.CodeInitialization');
  const Target = Resource('Example.ExistingTarget');
  const providers = Layer.mergeAll(
    syncProvider(runtime),
    Provider.succeed(Target, { reconcile: () => Effect.succeed({ url: cloudTarget.url }), delete: () => Effect.void }),
    Provider.succeed(Consumer, {
      diff: () => Effect.succeed({ action: 'update' }),
      reconcile: ({ news }) => Effect.sync(() => {
        assert.equal(news.verified, true);
        assert.equal(f.remote.TOKEN, current, 'environment must verify before code initialization');
        calls.initialize++;
        return { ready: true };
      }),
      delete: () => Effect.void,
    }),
  );
  const stack = Stack('env-sync-test', { providers, state: stateLayer }, Effect.gen(function* () {
    const target = upstream ? { ...cloudTarget, url: (yield* Target('target', {})).url } : cloudTarget;
    const sync = yield* Sync('environment', { stages: { preview: { kind: 'preview', source: 'preview', target: unsafe ? { ...target, token: 'synthetic-admin-token' } : target, ...(generated ? { generatedNames: ['SITE_URL'] } : {}) } } });
    const code = yield* Consumer('initialize', { verified: sync.verified });
    return { verified: sync.verified, initialized: code.ready };
  }));
  const run = ({ mode = 'apply', stage = 'preview' } = {}) => Effect.runPromise(evalStack(stack, (s) => Effect.gen(function* () {
    const plan = yield* (mode === 'destroy' ? Plan.destroy(s) : Plan.make(s));
    return mode === 'plan' ? Plan.describePlan(plan) : yield* apply(plan);
  }), { stage }).pipe(Effect.provide(Logger.layer([Logger.make(({ message, cause }) => logs.push(inspect({ message, cause })))]))));
  const assertPrivate = () => {
    const evidence = snapshots.join('\n') + logs.join('\n') + JSON.stringify(encodeState(state));
    for (const value of ['first-synthetic-secret', 'second-synthetic-secret', 'synthetic-admin-token', 'generated-synthetic-secret', 'synthetic-doppler-token', 'unused-synthetic-secret']) assert.ok(!evidence.includes(value), 'state and framework logs must exclude values');
  };
  return { f, calls, state, snapshots, logs, run, assertPrivate, rotate() { current = 'second-synthetic-secret'; }, failSource() { failedSource = true; } };
}

test('real Alchemy engine verifies preview environment before dependent code initialization', async () => {
  const f = fixture({ generated: true });
  assert.deepEqual(await f.run(), { verified: true, initialized: true });
  assert.equal(f.calls.initialize, 1);
  assert.equal(f.f.defaultsWrites, 0);
  assert.equal(f.f.remote.SITE_URL, 'generated-synthetic-secret');
  f.assertPrivate();
});

test('unchanged resource props still observe rotations and drift on every apply', async () => {
  const f = fixture();
  await f.run();
  f.rotate();
  await f.run();
  assert.equal(f.f.remote.TOKEN, 'second-synthetic-secret');
  f.f.remote.TOKEN = 'external-synthetic-drift';
  await f.run();
  assert.equal(f.f.remote.TOKEN, 'second-synthetic-secret');
  assert.equal(f.calls.source, 3);
  assert.equal(f.calls.initialize, 3);
  f.assertPrivate();
});

test('unknown stages reject before source or authentication and plan makes no provider writes', async () => {
  const f = fixture();
  await assert.rejects(f.run({ stage: 'unknown' }));
  assert.equal(f.calls.source, 0);
  assert.equal(f.calls.token, 0);
  assert.equal(f.snapshots.length, 0);
  await f.run({ mode: 'plan' });
  assert.equal(f.calls.source, 0);
  assert.equal(f.f.writes.length, 0);
  f.assertPrivate();
});

test('failed source or verification prevents initialization and cannot leak into persisted rows', async () => {
  for (const failure of ['source', 'verification']) {
    const f = fixture();
    if (failure === 'source') f.failSource(); else f.f.failVerification();
    await assert.rejects(f.run(), (error) => { assert.ok(!inspect(error).includes('first-synthetic-secret')); return true; });
    assert.equal(f.calls.initialize, 0);
    f.assertPrivate();
  }
});

test('upstream Alchemy deployment references resolve before sync', async () => {
  const f = fixture({ upstream: true });
  assert.deepEqual(await f.run(), { verified: true, initialized: true });
  f.assertPrivate();
});

test('Alchemy destroy retains shared environment values', async () => {
  const f = fixture();
  await f.run();
  const before = { ...f.f.remote };
  const writes = f.f.writes.length;
  await f.run({ mode: 'destroy' });
  assert.deepEqual(f.f.remote, before);
  assert.equal(f.f.writes.length, writes);
  f.assertPrivate();
});


test('secret-bearing unexpected configuration is rejected before state serialization', async () => {
  const f = fixture({ unsafe: true });
  await assert.rejects(f.run());
  assert.equal(f.calls.source, 0);
  assert.equal(f.calls.token, 0);
  assert.equal(f.snapshots.length, 0);
  f.assertPrivate();
});
