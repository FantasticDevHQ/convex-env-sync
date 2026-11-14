# Packed package consumption

The package is private and unpublished. A local tarball is the supported artifact
for prerelease evaluation. Packing does not publish, deploy or authorize provider
writes. Node.js 22.18+ is required. Runtime modules are JavaScript ES modules;
TypeScript declarations and CommonJS entrypoints are not provided.

From the source checkout, install pinned dependencies and verify it:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm pack --pack-destination /tmp/convex-env-sync-artifacts
```

Install the resulting tarball into an existing consumer. Adjust its path to the
actual output from pack:

```sh
pnpm add /tmp/convex-env-sync-artifacts/fantastic.dev-convex-env-sync-0.0.0.tgz
```

Keep the dependency and lockfile together. Repack after source changes; a tarball
is an immutable snapshot, not a link to a moving checkout. Do not commit tarballs,
credentials, test logs or acceptance evidence to this source repository.

## Public imports

| Import | Exports | Purpose |
| --- | --- | --- |
| `@fantastic.dev/convex-env-sync` | `selectValues`, `plan`, `reconcile`, `resolveStage`, `runStage` | Selection, redacted planning and the shared stage pipeline |
| `@fantastic.dev/convex-env-sync/sources/doppler` | `loadDoppler` | Distilled source reader |
| `@fantastic.dev/convex-env-sync/sources/infisical` | `loadInfisical` | Adapter for a caller-owned Infisical SDK client |
| `@fantastic.dev/convex-env-sync/convex/deployment` | `deploymentIdentity`, `planDeployment`, `applyDeployment` | Exact deployment operations |
| `@fantastic.dev/convex-env-sync/convex/defaults` | `defaultsIdentity`, `planDefaults`, `applyDefaults` | Project/type defaults and explicit propagation |
| `@fantastic.dev/convex-env-sync/alchemy` | `Sync`, `syncProvider` | Alchemy resource/provider |
| `@fantastic.dev/convex-env-sync/cli` | `runCli` | Command runner with injectable output sinks |

Internal files are not public package imports. Root, source, writer and CLI
entrypoints do not import Alchemy. Consumers using `/alchemy` must install the
optional peer `alchemy@2.0.0-beta.87`. Tests use that exact version; compatibility
with other versions has not been established. The Infisical adapter accepts an
existing client and does not install its SDK.

For example, selection-only planning runs entirely in memory:

```js
import { plan } from '@fantastic.dev/convex-env-sync';

const report = plan({
  source: { APP_REGION: 'example-region' },
  selection: { defaults: '["APP_REGION"]', deployment: '[]' },
});
// { defaults: [{ name: 'APP_REGION', operation: 'set' }], deployment: [] }
```

This selection-only `plan` does not observe a destination. Use `runStage` with
`mode: 'plan'` or the command below to observe current values and compute drift.
See [configuration](configuration.md) and [Alchemy integration](alchemy.md) for
input contracts and authorization boundaries.

## Installed command

```sh
pnpm exec convex-env-sync plan --stage preview --config sync.json --runtime sync-runtime.mjs
```

Use the configuration and runtime factory in [CLI documentation](cli.md). In an
installed consumer, replace the source-checkout Doppler import with:

```js
import { loadDoppler } from '@fantastic.dev/convex-env-sync/sources/doppler';
```

For Alchemy replace the source-checkout integration import with
`@fantastic.dev/convex-env-sync/alchemy`. Keep credentials in runtime callbacks,
never resource props or config JSON. Apply requires an exact approved target,
`--approve` and an ownership file, as described in the CLI documentation.

## Artifact checks

`pnpm check` packs a temporary source copy containing deliberate synthetic
credential/evidence canaries. It audits every archive path and file content,
then installs the tarball into a clean directory outside the source checkout
with lifecycle scripts disabled and the registry pointed at an unavailable
loopback endpoint. Installation uses the populated pnpm store in offline mode.

The fixture imports every public entrypoint, verifies non-Alchemy use without
the optional peer, and executes the installed command against synthetic SDK HTTP
responses. Any update request fails the fixture. Alchemy import is checked after
installing its pinned peer from the same offline store. The artifact includes
runtime JavaScript, selected consumer documentation, the logo and license. Tests,
fixture modules, tooling, ownership state and evidence are excluded.

These checks establish packed consumption, not real provider delivery or npm
publication. Live consumer isolation and authorized cloud verification remain
separate acceptance work.
