# Optional Alchemy integration

The `@fantastic.dev/convex-env-sync/alchemy` adapter is verified
against Alchemy 2.0.0-beta.87 with Effect 4.1.4. Alchemy is an optional peer, so
standalone CLI and JavaScript consumers do not need it. Use this adapter only
when you want an existing Alchemy stack to apply environment sync. The [CLI](cli.md) shares the pipeline. See [package installation](package.md).

## Stage mapping and runtime loaders

This optional adapter uses Alchemy's current `Stage` to select one exact entry
from the shared [stage mappings](configuration.md#stage-mappings-and-runtime-callbacks).
`syncProvider(runtime)` registers the same source and credential callbacks used
by the standalone JavaScript API. `Sync(id, { stages })` declares the resource.
The core engine and CLI neither import nor require this adapter.

Alchemy's own plan declares lifecycle work without invoking source loaders or
provider writes. Use the standalone CLI's `plan` or `runStage` with `mode: 'plan'`
when you need to observe current source and destination values.

## Add sync to an existing stack

Register `syncProvider(runtime)` alongside your existing providers and declare
`Sync` inside the stack. Supply the stage mapping and fresh runtime loaders from
the shared configuration contract. The adapter does not create deployments.

## Resource composition

This installed-consumer helper illustrates the complete registration shape. The
consumer supplies its approved target, state layer and fresh runtime loaders.
No credentials are resource inputs.

```js
import * as Effect from 'effect/Effect';
import { Stack } from 'alchemy/Stack';
import { Sync, syncProvider } from '@fantastic.dev/convex-env-sync/alchemy';

export function previewStack({ target, state, loadSelected, loadToken }) {
  return Stack('example', {
    state,
    providers: syncProvider({
      sources: { 'preview-baseline': loadSelected },
      getToken: loadToken,
    }),
  }, Effect.gen(function* () {
    const environment = yield* Sync('environment', {
      stages: {
        preview: { kind: 'preview', source: 'preview-baseline', target },
      },
    });
    return { environmentReady: environment.verified };
  }));
}
```

Target fields may be Alchemy output expressions from the consumer's existing
provisioning workflow. They resolve and validate before sync. The adapter does
not create deployments. Generated overrides can derive from resolved target
metadata or the consumer's existing provisioning workflow.

The resource that initializes backend code must depend on `environment.verified`
through its supported dependency inputs. Registration order alone does not
establish apply order. The lifecycle test uses an actual dependent Alchemy
resource and asserts that required values already exist when initialization runs.
A failed source read or verification prevents that dependent resource from running.

## When an Alchemy apply updates secrets

A Doppler change alone does not run Alchemy or this adapter. The next Alchemy
apply containing this resource reads fresh selected source values and reconciles
the exact destination. There is no built-in watcher, scheduler or webhook handler.
Consumer-owned automation can invoke the standalone CLI/API or the Alchemy stack.

## Drift, state and teardown

The provider returns an update diff on every apply and declares no stable output
attributes. This forces fresh source reads and observation even when source IDs
and resource props are unchanged. It does not use an input-hashed Alchemy Action.
Unchanged values produce no provider update; rotations and external drift are
reconciled and verified by the shared writers.

Resource props contain only the selected stage, source references, validated
target metadata and declared key names. Source callbacks, credentials, selected
values and generated values stay in runtime memory. Attributes contain only the
redacted writer result and ownership metadata. Unsafe extra configuration fields
are rejected before state serialization. Moving existing ownership to another
target fails; use a separate logical resource for a different destination.

Alchemy 2.0.0-beta.87's `StateEncoding.encodeState` writes the inner value of an
Effect `Redacted` wrapper. Such a wrapper is not an encrypted-state strategy.
The adapter therefore never passes secret-bearing values as resource props or
attributes. Tests inspect the actual encoder output for every state write, as
well as framework logs, during success, rotation, drift and failure.

The virtual resource defaults to `retain`; its delete handler performs no
provider mutation. Destroying an Alchemy stack retains shared defaults and
application secrets. Removing a key requires an explicit deletion declaration
and matching previously verified ownership during reconciliation. Ownership is
persisted only after writer verification succeeds.

These tests exercise the real pinned Alchemy engine and Distilled SDKs against
synthetic HTTP responses. They do not prove live account access, real preview
provisioning or consumer backend isolation.
