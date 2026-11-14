<p align="center">
  <a href="https://fantastic.dev"><img src="assets/fantastic-dev-logo.svg" width="80" height="80" alt="Fantastic.Dev" /></a>
</p>

<h1 align="center">Convex Env Sync</h1>

<p align="center"><strong>A shared foundation for Convex environment synchronization.</strong></p>

[A Fantastic.Dev Project](https://fantastic.dev)

<p align="center">
  <a href="https://fantastic.dev"><img src="https://img.shields.io/badge/Fantastic.dev-94C173?style=for-the-badge&amp;logoColor=0c0e13" alt="Visit Fantastic.Dev" /></a>
  <a href="https://github.com/FantasticDevHQ"><img src="https://img.shields.io/badge/GitHub-0c0e13?style=for-the-badge&amp;logo=github&amp;logoColor=white" alt="Fantastic.Dev on GitHub" /></a>
  <a href="https://www.youtube.com/@FantasticDevHQ"><img src="https://img.shields.io/badge/YouTube-FF0033?style=for-the-badge&amp;logo=youtube&amp;logoColor=white" alt="Fantastic.Dev on YouTube" /></a>
  <a href="https://twitter.com/FantasticDevHQ"><img src="https://img.shields.io/badge/Twitter_%2F_X-0c0e13?style=for-the-badge&amp;logo=x&amp;logoColor=white" alt="Fantastic.Dev on Twitter / X" /></a>
</p>

<p align="center"><a href="#quick-start">Quick start</a> · <a href="#have-my-agent-set-this-up">Agent setup</a> · <a href="docs/architecture.md">Architecture</a></p>

---

Convex Env Sync delivers selected environment values from Doppler to Convex project defaults and exact deployments. Use its shared engine from a CLI or Alchemy, with explicit mappings for development, production, previews and anonymous local worktrees. Source adapters are replaceable; an optional Infisical adapter accepts a caller-owned client.

**Status: unpublished release candidate (`0.0.0`).** Install the local tarball below for evaluation. There is no npm release yet. Packed consumption and independent consumer acceptance cover local isolation, cloud development apply/rotation, preview initialization/override preservation and read-only development planning. Production mappings are tested with controlled provider responses; live production delivery has not been verified. The consumer acceptance used the non-Alchemy entrypoints; the Alchemy adapter has separate pinned-runtime tests.

## Quick start

Requires Git, Node.js 22.18+ and pnpm 12.18.0. Runtime modules are JavaScript ESM; TypeScript declarations and CommonJS entrypoints are not supplied.

Prepare the source and dependency store:

```sh
git clone https://github.com/FantasticDevHQ/convex-env-sync.git
cd convex-env-sync
pnpm install --frozen-lockfile
pnpm check
```

Pack the candidate and install it in a fresh directory outside the checkout. The offline install reuses the store populated above and disables lifecycle scripts and automatic peer installation:

```sh
env_sync_artifacts="$(mktemp -d)"
pnpm pack --pack-destination "$env_sync_artifacts"
env_sync_consumer="$(mktemp -d)"
cd "$env_sync_consumer"
printf '{"private":true,"type":"module"}\n' > package.json
pnpm add --offline --ignore-scripts --config.auto-install-peers=false \
  "$env_sync_artifacts/fantastic.dev-convex-env-sync-0.0.0.tgz"
```

Create an offline plan fixture. These identifiers and values are nonfunctional examples; every provider request is handled in memory:

```sh
cat > sync.json <<'JSON'
{
  "stages": {
    "dev": {
      "kind": "dev",
      "source": "offline",
      "target": {
        "kind": "cloud",
        "url": "https://example-dev.convex.cloud",
        "teamId": 1,
        "projectId": 2,
        "deploymentId": 3,
        "deploymentType": "dev"
      }
    }
  }
}
JSON
cat > runtime.mjs <<'JS'
export function createRuntime() {
  return {
    sources: {
      offline: async () => ({ defaults: { APP_REGION: 'example-region' }, deployment: {} }),
    },
    getToken: async () => 'offline-placeholder',
    fetch: async (input, options = {}) => {
      const url = new URL(input);
      if ((options.method ?? 'GET') !== 'GET' || url.origin !== 'https://example-dev.convex.cloud') {
        throw new Error('Unexpected offline request');
      }
      if (url.pathname === '/api/v1/deployment_info') {
        return Response.json({ kind: 'cloud', id: 3, projectId: 2, teamId: 1, deploymentType: 'dev' });
      }
      if (url.pathname === '/api/v1/list_environment_variables') {
        return Response.json({ environmentVariables: {} });
      }
      throw new Error('Unexpected offline endpoint');
    },
  };
}
JS
pnpm exec convex-env-sync plan --stage dev --config sync.json --runtime runtime.mjs
```

The JSON report contains `operations: [{"name":"APP_REGION","operation":"set"}]` and name-only ownership metadata for the synthetic target. It contains neither `example-region` nor the placeholder credential. This fixture makes no network call, provider write or ownership-file write. It verifies the installed CLI and shared planner; it does not establish live provider access.

Core, source, writer and CLI imports work without Alchemy. Install `alchemy@2.0.0-beta.87` when using `@fantastic.dev/convex-env-sync/alchemy`; compatibility with other Alchemy versions is unverified. See [public imports and packed consumption](docs/package.md).

## Configure a real application

Declare exact stage/source/destination mappings using the [configuration guide](docs/configuration.md). The package does not provision deployments. A cloud target includes its HTTPS URL, team, project, deployment ID and matching deployment type. Anonymous local targets use their checkout-owned identity and protected generated keys. Unknown stages fail before credential loading; there is no fallback to production.

In each Doppler config, provide both selection manifests as JSON array strings, including `[]` for an empty group:

```dotenv
SYNC_CONVEX_DEFAULT_KEYS=["APP_REGION"]
SYNC_CONVEX_DEPLOYMENT_KEYS=["SITE_URL"]
```

Selected keys must exist and the two lists must be disjoint. Invalid manifests, duplicate/conflicting names and unavailable selected values fail before writes. Source access tokens, Convex administrative credentials and control variables must not be selected as application values. Explicitly declare overlays or generated overrides for dedicated values such as a preview URL.

Project/type defaults seed new deployments; they are not live inheritance. An existing deployment changes only through an explicitly authorized update. Manage shared defaults separately from individual preview jobs, and authorize propagation to existing deployments separately.

Use trusted runtime callbacks to read fresh source values and load credentials from an existing secret loader or injected environment. Keep values out of config JSON, resource props, logs, snapshots and plaintext state. Plans and ownership metadata contain identities, names and results, never values or value hashes.

Run a read-only plan first. CLI apply requires `--approve` and a target-scoped `--ownership` file, and the operator must have authorization for that exact operation. Use one ownership path per target across cooperating applies. Unrelated keys are retained; deletion requires both prior ownership and an explicit deletion declaration. An omitted selection is not deletion permission. Apply verifies readback in memory before reporting success. Review the [CLI failure, locking and retry rules](docs/cli.md) before applying, and keep production credentials out of untrusted jobs.

## Have my agent set this up

```text
Use the Convex Env Sync README and consumer guides:
https://github.com/FantasticDevHQ/convex-env-sync
https://github.com/FantasticDevHQ/convex-env-sync/blob/main/docs/package.md
https://github.com/FantasticDevHQ/convex-env-sync/blob/main/docs/configuration.md
https://github.com/FantasticDevHQ/convex-env-sync/blob/main/docs/cli.md

Read applicable AGENTS.md files, inspect the consuming app and preserve its work.
Follow the README's unpublished tarball installation and offline CLI plan first.
Report the installed artifact, commands and name-only expected operations.
For integration, identify explicit stages, source configs, selection manifests,
exact destination identities and existing credential loaders. Prepare the app's
integration PR with its required checks and evidence. Obtain authorization before
provider writes, provisioning, deployment or publication; the offline setup does
not authorize those operations. Keep secret values out of source, state and proof.
```

## Documentation

- [Architecture and environment rules](docs/architecture.md)
- [Configuration and manifests](docs/configuration.md)
- [Alchemy lifecycle and secret-state rules](docs/alchemy.md)
- [CLI plan/apply and ownership](docs/cli.md)
- [Package exports and consumption](docs/package.md)
- [Roadmap](https://github.com/FantasticDevHQ/convex-env-sync/blob/main/docs/roadmap.md)
- [Development and worktrees](https://github.com/FantasticDevHQ/convex-env-sync/blob/main/docs/development.md)

## Contributing

Read [AGENTS.md](https://github.com/FantasticDevHQ/convex-env-sync/blob/main/AGENTS.md) and the [PR standard](https://github.com/FantasticDevHQ/convex-env-sync/blob/main/docs/pull-request-standard.md), choose an owning ticket, and run `pnpm check`. This library repository has neither an application backend nor frontend. Live integration acceptance belongs in an authorized consuming application. Publication and provider changes require owner authorization.

## License

[MIT](LICENSE).
