# Proposed configuration

All shapes below are design examples. No `defineSync`, `plan`, or `apply` API is implemented yet.

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
