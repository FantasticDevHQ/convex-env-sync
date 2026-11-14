# Alchemy lifecycle integration

The source-checkout adapter is implemented in `src/alchemy/index.js` and verified
against Alchemy 2.0.0-beta.87 with Effect 4.1.4. Alchemy is an optional peer, so
core and provider-only consumers do not need it. The [source-checkout CLI](cli.md) shares the pipeline. There is no published
package yet.

## Stage mapping and runtime loaders

`Sync(id, { stages })` uses Alchemy's current `Stage`. Only an exact own key in
`stages` is accepted. Each mapping declares `kind`, a non-secret `source`
reference, and the exact `target` documented in [configuration](configuration.md).
Kinds `dev`, `prod` and `preview` require a cloud target of that deployment type;
`local` requires an anonymous target. `project-defaults` is a separate central
operation with an explicit project/type target. A preview deployment mapping
always uses the exact deployment writer and never updates defaults.

`syncProvider(runtime)` supplies runtime-only callbacks:

- `sources`: an own-key map of async loaders returning the shared
  `{ defaults, deployment }` selected-string records. Each loader is bound to
  one explicit source config or environment/folder.
- `getToken({ stage, kind, target })`: loads the exact destination credential in
  memory. Source loading and validation finish before this callback runs.
- `generated({ stage, target })`: optional async loader for explicitly declared
  generated overrides. Callback target metadata is copied so it cannot redirect
  the operation.
- `fetch`: optional HTTP transport, primarily for credential-free tests.

Use the existing `loadDoppler` reader or `loadInfisical` adapter inside source
callbacks. Read source values afresh on every invocation. Alchemy's existing
secret loaders may supply runtime credentials or configuration, but a cached
selection must not replace a fresh source read when rotation matters. Callbacks
must not log values or use persistent plaintext caches. Stage mappings and runtime
registrations belong to trusted consumer code. Preview CI supplies sandbox
credentials; stage validation does not sandbox arbitrary JavaScript.

An optional `overlaySource` names another source loader; `overlayNames` must
exactly declare the names it returns. `generatedNames` must exactly declare the
generated loader's result. Composition order is baseline defaults, baseline
deployment values, explicit source overlay, then explicit generated overrides.
Each source's defaults/deployment groups are disjoint. Missing or undeclared
overrides fail before destination authentication. Project defaults mappings
reject overlays and generated values.

The shared `runStage({ stages, stage, runtime, mode, ownership })` in
`src/core/stages.js` uses the same pipeline without importing Alchemy. Its mode
must explicitly be `plan` or `apply`. Provider plans observe without writes;
Alchemy's own plan only declares lifecycle work and does not invoke secret
loaders or provider writes.

## Resource composition

This source-checkout helper illustrates the complete registration shape. The
consumer supplies its approved target, state layer and fresh runtime loaders.
No credentials are resource inputs.

```js
import * as Effect from 'effect/Effect';
import { Stack } from 'alchemy/Stack';
import { Sync, syncProvider } from './src/alchemy/index.js';

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
