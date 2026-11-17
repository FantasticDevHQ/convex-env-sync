# Standalone CLI

The installed command reads selected source values and reconciles them with an
explicit Convex destination. It requires Node.js 22.18+ and the installed npm
package. Alchemy is not required or imported. The JavaScript API and optional
Alchemy adapter call the same `runStage` pipeline.

```sh
npx --no-install convex-env-sync plan --stage preview --config sync.json --runtime sync-runtime.mjs
mkdir -p .worktree
npx --no-install convex-env-sync apply --stage preview --config sync.json --runtime sync-runtime.mjs --ownership .worktree/env-sync-ownership.json --approve
```

Apply requires both `--approve` and an explicit ownership file. Approval is an
intentional command option, not permission to use production credentials in an
untrusted job. The consumer still authorizes the exact target and supplies only
the credentials allowed in that workflow. Unknown commands, flags, repeated
flags, missing values and unknown stages fail with a nonzero exit code.

The ownership file's parent directory must already exist; the example creates
it before apply. The CLI creates the ownership file after successful verification
and uses a sibling lock file while applying.

## Configuration and runtime separation

The config file is JSON containing only `stages`. Mappings use the kinds, exact
targets and explicit override declarations described in
[stage mappings and runtime callbacks](configuration.md#stage-mappings-and-runtime-callbacks). For example, replace the synthetic identifiers
below with the consumer's approved sandbox destination:

```json
{
  "stages": {
    "preview": {
      "kind": "preview",
      "source": "preview-baseline",
      "target": {
        "kind": "cloud",
        "url": "https://example-preview.convex.cloud",
        "teamId": 1,
        "projectId": 2,
        "deploymentId": 3,
        "deploymentType": "preview"
      }
    }
  }
}
```

The CLI reads and validates that static mapping before importing the runtime
module. Unknown stages therefore cannot execute runtime authentication code.
The module exports `createRuntime({ stage, kind, target, mode })`, returning the
source and credential callbacks described in the configuration guide.

This installed-consumer example reads credentials from the caller's
injected environment only when its callback runs:

```js
import { loadDoppler } from '@fantastic.dev/convex-env-sync/sources/doppler';

export function createRuntime() {
  return {
    sources: {
      'preview-baseline': () => loadDoppler({
        project: 'example',
        config: 'preview',
        token: process.env.DOPPLER_TOKEN,
      }),
    },
    getToken: async () => process.env.CONVEX_ACCESS_TOKEN,
  };
}
```

Runtime modules are trusted executable code. Keep their source free of credential
values, defer authentication to callbacks and keep source reads fresh. An
existing secret loader or `op run` can supply the child process environment;
never print credential values. Alchemy is not imported by the CLI.

## When to run sync

A Doppler edit does not trigger this command. Run `apply` manually or from a
trusted CI/deployment job to deliver the current selected values. Every apply
reads the source again and verifies the destination after reconciliation.
`plan` observes current drift without applying it.

There is no built-in watcher, scheduler or webhook handler. For automatic
rotation, the consuming application must supply a scheduled job or authenticated
webhook handler that invokes apply with the approved target and credentials.
Project-defaults applies affect defaults only; existing deployments require
separate exact-target updates or explicitly authorized propagation.

## Plans, output and ownership

Plan observes the selected source and destination without a provider update.
It writes one redacted JSON report to stdout. A plan may read an optional
`--ownership` file but never creates or modifies it. Apply re-observes inputs,
uses the shared writers, verifies readback, and prints JSON only after successful
verification and ownership persistence. Reports contain identities, key names,
operations and verification results, with no values or value hashes.

Ownership JSON contains exactly `target`, `managedNames` and `syncVersion`.
Existing metadata must match the selected target and supported version before
the runtime module is imported. Source, authentication and verification errors
produce fixed messages on stderr without raw causes or parser input. Exit code
`0` means the command completed, `2` means command/static-stage validation failed,
and `1` means state, runtime, provider or verification failed.

Apply takes an exclusive sibling `.lock` file for the supplied ownership path.
Use one ownership path per target across cooperating processes. Concurrent
applies using that path reject before runtime loading; this is not a global lock
for callers using different paths. The lock records a PID and non-secret target
identity. Cleanup only unlinks the lock inode created by that invocation.

Verified ownership is written to a private temporary file and atomically renamed
over the metadata file. Symlink ownership files and non-regular files are
rejected. Source or readback verification failures preserve prior ownership. A
provider or persistence failure can follow successful remote changes. Run plan
before retrying.
An interrupted process can leave a lock; inspect its owner and confirm no apply
is active before removing it. No automatic stale-lock or process cleanup runs.

Tests use the real shared engine and SDKs with synthetic HTTP responses, including
an actual Node subprocess for the command entrypoint and two concurrent applies
sharing a live lock. They do not establish real provider delivery.
