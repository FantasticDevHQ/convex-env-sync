# Proposed configuration

The provider configuration below remains a design example. Source-checkout selection, planning, exact deployment apply and project defaults are implemented in the modules documented below. A packaged configuration API, CLI and Alchemy adapter are not implemented yet.

Each consuming application declares its Convex project, backend directory, Doppler project and config mapping. A Turborepo can declare multiple independent application targets. No workspace layout is hardcoded by the engine.

```ts
const configuration = {
  convexProject: "example-team:example-app",
  backendDirectory: "packages/backend",
  source: {
    provider: "doppler",
    project: "example-app",
    configs: { dev: "dev", prod: "prd", preview: "preview" },
  },
  selection: {
    defaultsManifest: "SYNC_CONVEX_DEFAULT_KEYS",
    deploymentManifest: "SYNC_CONVEX_DEPLOYMENT_KEYS",
  },
  deletionPolicy: "explicit",
};
```

Config names are user-defined. A missing preview config is an error, not permission to read production. Production, cloud development, local anonymous development and preview deployment identities are resolved explicitly by the consumer workflow. The environment type does not identify a particular preview or developer deployment.

## Manifest values in Doppler

Store each manifest as a JSON array string in the chosen config:

```dotenv
SYNC_CONVEX_DEFAULT_KEYS=["TINYBIRD_READ_TOKEN","RESEND_API_KEY"]
SYNC_CONVEX_DEPLOYMENT_KEYS=["SITE_URL"]
```

The selected keys must exist in that config. Values are not included in this example. Manifest/control variables, Doppler access tokens and Convex administrative credentials must not themselves be selected for the application runtime.

Defaults keys are written to the selected project/type and are also part of the desired baseline when reconciling an existing deployment. Deployment keys are written only to the selected deployment. The two lists are disjoint; an override of a baseline key requires an explicit overlay input so accidental overlap fails validation.

For a dedicated PR source config, resolve that config as an explicit overlay on the preview baseline. Generated inputs, such as a PR URL or local auth identity, must name the variables they override. A future Infisical adapter maps its environment/folder selection to the same defaults and override structure.

Doppler project tags may be used for project discovery only. They are not individual-secret routing metadata. Reference: [Doppler project tags](https://docs.doppler.com/docs/tags).

## Read-only source-checkout API

Import `plan` from `src/core/plan.js`. It accepts an in-memory `source` record
of string values and `selection` with `defaults` and `deployment` JSON array
strings. Both manifests are required, including explicit `[]` for an empty list.
It returns separate `defaults` and `deployment` arrays of `{ name, operation:
'set' }`, sorted by name. It does not read a provider, observe current values,
authorize an apply, or imply that defaults propagate to existing deployments.

`selectValues` in `src/core/manifest.js` returns the selected string records for
future adapters. Its return value contains secrets. Keep it in memory and never
serialize or log it. Only the plan is safe to serialize.

Names must match `[A-Z][A-Z0-9_]*`. Duplicate names, overlap between manifests,
missing selected values and non-string values fail validation. Empty strings
are valid values. Names beginning with `DOPPLER_`, `INFISICAL_`, `CONVEX_` or `SYNC_CONVEX_`
are reserved for credentials and control inputs. Validation errors omit input
values and JSON parser details. Unselected source values are ignored.

Explicit overlays and provider identity verification remain subsequent roadmap work.
Ownership-aware reconciliation is described below.

## Ownership-aware reconciliation

`reconcile` from `src/core/reconcile.js` accepts an exact non-secret `target`
identity, complete string-valued `desired` and `actual` records, optional
`ownership`, and an explicit `deletions` array. The provider adapter must resolve
and verify that identity before writing. This pure function has no provider calls.
Await and validate source reads first. Never substitute `{}` for a failed read.
Undefined, error objects, non-string records and unsupported ownership versions
are rejected.

The result has `operations` containing sorted `{ name, operation }` records,
where `operation` is `set` or `delete`, and candidate `ownership` with only
`target`, `managedNames` and `syncVersion: 1`. Neither result contains values or
value hashes. The desired/actual input records remain secret-bearing in memory.
Writers construct a sparse change set from the operations and desired values,
then verify readback before persisting candidate ownership. A plan is not proof
that any values have been applied.

Selected names acquire ownership, including an already-equal value. Unrelated
and omitted names produce no operation. Previously owned names remain tracked
when omitted, so omission alone never deletes or relinquishes ownership. A delete
requires a previously owned name for the same target, explicit declaration, and
absence from desired values. If an explicitly deleted owned key is already
absent, no write is needed and candidate ownership drops that name. To delete a
selected key, remove it from the desired selection and declare the deletion.

Ownership is an authorization input supplied by the trusted consumer. Do not
accept an untrusted PR's claimed ownership metadata as authority to delete keys.
Provider writers and lifecycle persistence are subsequent roadmap work.

## Doppler source-checkout reader

`loadDoppler` from `src/sources/doppler.js` accepts explicit `project`, `config`
and `token` strings and returns the same secret-bearing `{ defaults, deployment }`
records as `selectValues`. Supply credentials in memory from the caller's secret
loader. Never pass them to persistent resource inputs or log the result.

The reader uses pinned Distilled `listSecrets` and Effect's fetch client. It
reads `SYNC_CONVEX_DEFAULT_KEYS` and `SYNC_CONVEX_DEPLOYMENT_KEYS` from the exact
config. Application values use Doppler's computed values so references resolve.
Missing, masked, restricted or non-string selected values fail closed. It does
not fall back to raw values or a different config. Dynamic secrets and managed
secrets are disabled. There are no adapter logs, state writes or destination
calls. Errors are replaced with a fixed message without the SDK cause, which
may contain credentials or response data.

Requests use the standard Doppler endpoint, reject redirects, bypass fetch
caching, disable SDK automatic retries and have a 30-second timeout. Callers may
retry the whole read explicitly. An optional `fetch` implementation allows
credential-free HTTP-boundary testing. A passing synthetic test is not proof of
live Doppler access or Convex delivery.

## Exact Convex deployment operations

`planDeployment`, `applyDeployment` and `deploymentIdentity` are source-checkout
exports from `src/convex/deployment.js`. Supply a flat, complete `desired` record
of selected application strings, an in-memory `token`, optional target-scoped
`ownership` and explicit `deletions`. The caller finishes source loading before
invoking these operations. Neither function provisions a deployment or updates
project defaults.

Cloud targets require `kind: 'cloud'`, an HTTPS `url` under `convex.cloud`, including regional subdomains,
positive numeric `teamId`, `projectId` and `deploymentId`, and an explicit
`deploymentType` of `dev`, `prod` or `preview`. The authenticated Distilled
`getDeploymentInfo` response must match every identifier and type.

Local targets require `kind: 'local'`, a loopback HTTP `url` with the toolkit's
allocated port, the exact `anonymous-...` `instanceName`, and an explicit
`protectedNames` array of generated local auth variable names. Use `[]` only when
the consumer has no generated identity variables. The consumer's existing
worktree toolkit supplies this identity and its local admin credential. The
writer reads the public `/instance_name` health endpoint, then requires an
authenticated SDK `getDeploymentInfo` response of `selfHosted`. Distilled does
not expose the public health endpoint, so only that identity read uses fetch
directly. Application variable reads and writes always use Distilled.

Identity is checked before observation, again immediately before a write and
during verification. The URL rejects credentials, paths, queries, fragments and
redirects. Inputs are snapshotted before network awaits. Local protected names
cannot appear in desired values or deletion declarations. `deploymentIdentity`
returns a non-secret canonical string for ownership; local identities include
both the instance name and URL, so two worktrees with the same backend-directory
name still have different ownership scopes.

`planDeployment` observes current values and returns the target identity,
name-only operations and candidate ownership. It performs no updates.
`applyDeployment` sends at most one sparse `updateEnvironmentVariables` call,
then reads actual values and compares selected values, deletions and previously
observed unrelated keys in memory. Equal values skip the update call. A success
returns the redacted plan, verified ownership and `verified: true`; no raw values
or hashes are returned. Persist ownership only after this success. A write may
have succeeded even when subsequent verification fails. Re-observe and reconcile
before retrying; no rollback or atomic compare-and-swap is claimed. Consumers
must serialize overlapping operations for the same target.

Distilled Convex 1.0.0-rc.20 and Effect 4.1.4 are pinned. Requests disable retries
and caching, reject redirects and time out after 30 seconds. Errors are sanitized
without SDK causes. Tests use synthetic HTTP responses through the real SDK,
including two simulated local targets. Real anonymous-backend isolation remains
consumer acceptance work. This backend-free package does not provision a backend
for its tests.

## Optional Infisical reader

`loadInfisical` from `src/sources/infisical.js` accepts `client`, `projectId`,
`environment` and an absolute `secretPath`. The caller supplies an authenticated
[official Infisical SDK client](https://infisical.com/docs/sdks/languages/node).
The adapter follows the `secrets().listSecrets` contract inspected in
`@infisical/sdk` 5.3.1. It does not import or install that SDK. A Doppler-only
consumer resolves no Infisical dependency. Authentication, endpoint configuration
and client lifecycle belong to the caller and must stay out of persistent
secret-bearing resource inputs.

Both `SYNC_CONVEX_DEFAULT_KEYS` and `SYNC_CONVEX_DEPLOYMENT_KEYS` must exist in the
selected environment/folder as JSON array strings. The result is the same
secret-bearing `{ defaults, deployment }` input used by Doppler. Reference
expansion is enabled, imports and recursion are disabled, values are requested
unmasked, and process-environment attachment is explicitly disabled. Hidden or
missing selected values, duplicate response keys and malformed selections fail.
No environment or folder fallback occurs. Errors omit SDK causes and response
contents. The adapter does not log, persist state or call destination updates.
Configure caller-owned clients without secret logging or persistent value caches.

Tests use the SDK's response shape and a caller-supplied test client, compare the
result with Doppler's real-SDK HTTP-boundary output, and run Doppler under an
import hook that rejects Infisical resolution. No live account access is claimed.

## Project defaults and authorized propagation

`planDefaults`, `applyDefaults` and `defaultsIdentity` from
`src/convex/defaults.js` operate on an explicit `{ teamId, projectId,
deploymentType }` target. Type is required and must be `dev`, `prod` or
`preview`. Supply only the selected baseline as `desired`, an in-memory team
`token`, and optional ownership/deletions using the same explicit rules as exact
deployments. Generated deployment-specific values belong in per-target overrides,
not project defaults.

The management SDK verifies project/team identity and reads defaults filtered to
the exact type. Wrong-type rows, duplicate keys and incomplete paginated results
fail closed before writes. The pinned SDK exposes no cursor parameter for this
operation, so a response with `pagination.hasMore: true` is rejected rather than
planning from partial data. Plans contain only target identity, operations and
candidate ownership. Ordinary apply changes defaults only, with
`applyToExistingDeployments: false` on every change. Existing deployments retain
their values; defaults are not live inheritance.

Optional `propagation` requires `authorized: true` and an explicit `targets`
array. Each entry has an exact cloud `target` in the same project/team/type,
optional string-valued `overrides`, and its own ownership/deletions. The helper
combines the complete desired baseline with these declared overrides, preflights
every destination before any mutation, then reconciles only the listed targets
through `applyDeployment`. Duplicate deployments and cross-project/type targets
are rejected. Anonymous local backends use exact deployment operations directly.
No deployment discovery or implicit propagation to unlisted destinations occurs.

For example, a dedicated preview URL stays in that target's `overrides` when the
baseline rotates. Default deletions do not imply deployment deletions; those need
separate target ownership and declarations. Raw overwrite-all propagation is
unsupported: passing `applyToExistingDeployments: true` fails before network calls.
This avoids Convex's [bulk overwrite behavior](https://docs.convex.dev/production/environment-variables#applying-default-changes-to-existing-deployments).

Success requires in-memory readback verification of the defaults and every
explicit propagation target. The result includes redacted `propagation` reports
and `verified: true` only after all those operations complete. Planning is read-only.
A failed propagated verification may follow successful earlier writes; no atomic
multi-target transaction or rollback is promised. Re-observe before retrying,
serialize operations per target and persist ownership only after overall success.
No secret values or value hashes are returned in any report.
