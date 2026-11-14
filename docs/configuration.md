# Proposed configuration

The provider configuration below remains a design example. Source-checkout selection and read-only planning are implemented as described next. No provider apply API is implemented yet.

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
are valid values. Names beginning with `DOPPLER_`, `CONVEX_` or `SYNC_CONVEX_`
are reserved for credentials and control inputs. Validation errors omit input
values and JSON parser details. Unselected source values are ignored.

Explicit overlays, destination identities, ownership, deletion and drift
reconciliation remain subsequent roadmap work.

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
