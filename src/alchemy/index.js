import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Output from 'alchemy/Output';
import * as Provider from 'alchemy/Provider';
import { Resource } from 'alchemy/Resource';
import { Stage } from 'alchemy/Stage';
import { assertKeys, requireSources, resolveStage, runStage } from '../core/stages.js';

const Runtime = Context.Service('Fantastic.ConvexEnvSync.Runtime');
const SyncResource = Resource('Fantastic.ConvexEnvSync', { defaultRemovalPolicy: 'retain' });
class SyncFailure extends Data.TaggedError('ConvexEnvSyncError') {}
const failure = () => new SyncFailure({ message: 'Environment sync failed' });

// Preserve real Alchemy dependency expressions while validating the resolved
// metadata before it can become persisted resource props. No runtime callbacks
// or secret-bearing data are placed inside this expression.
function expression(value) {
  if (Output.isExpr(value)) return value;
  if (Array.isArray(value)) return Output.all(...value.map(expression));
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const entries = Object.entries(value);
    return Output.map(Output.all(...entries.map(([, item]) => expression(item))), (items) => Object.fromEntries(entries.map(([key], i) => [key, items[i]])));
  }
  return Output.asOutput(value);
}

/** Register one stage's metadata. Credentials/values belong only in syncProvider. */
export const Sync = (id, { stages }) => Effect.gen(function* () {
  const stage = yield* Stage;
  const runtime = yield* Runtime;
  const entry = yield* Effect.try({
    try: () => {
      if (!stages || !Object.hasOwn(stages, stage)) throw new Error();
      const selected = stages[stage];
      assertKeys(selected, ['kind', 'source', 'target', 'overlaySource', 'overlayNames', 'generatedNames', 'deletions']);
      requireSources(runtime, { ...selected, generatedNames: selected.generatedNames ?? [] });
      return selected;
    },
    catch: failure,
  });
  const props = Output.map(expression(entry), (resolved) => ({ stage, mapping: resolveStage({ [stage]: resolved }, stage) }));
  return yield* SyncResource(id, props);
});

/** Real Alchemy provider with runtime-only loaders and an always-update diff. */
export function syncProvider(runtime) {
  return Layer.mergeAll(
    Layer.succeed(Runtime, runtime),
    Provider.succeed(SyncResource, {
      version: 1,
      diff: () => Effect.succeed({ action: 'update', stables: [] }),
      reconcile: ({ news, output }) => Effect.tryPromise({
        try: () => runStage({ stages: { [news.stage]: news.mapping }, stage: news.stage, runtime, mode: 'apply', ownership: output?.ownership }),
        catch: failure,
      }),
      // Removing this virtual resource must never remove shared secrets.
      delete: () => Effect.void,
    }),
  );
}
