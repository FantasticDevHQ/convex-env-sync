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

**Release target: 0.1.0.** Check [npm](https://www.npmjs.com/package/@fantastic.dev/convex-env-sync) for currently published versions. Packed consumption and independent consumer acceptance cover local isolation, cloud development apply/rotation, preview initialization/override preservation and read-only development planning. Production mappings are tested with controlled provider responses; live production delivery has not been verified. The consumer acceptance used the non-Alchemy entrypoints; the Alchemy adapter has separate pinned-runtime tests.

## Quick start

Requires Node.js 22.18+. Runtime modules are JavaScript ESM; TypeScript declarations and CommonJS entrypoints are not supplied.

Install from npm in your application:

```sh
npm install @fantastic.dev/convex-env-sync@0.1.0
# or: pnpm add @fantastic.dev/convex-env-sync@0.1.0
```

Try a selection-only plan without credentials or provider access:

```sh
node --input-type=module <<'JS'
import { plan } from '@fantastic.dev/convex-env-sync';
console.log(JSON.stringify(plan({
  source: { APP_REGION: 'example-region' },
  selection: { defaults: '["APP_REGION"]', deployment: '[]' },
}), null, 2));
JS
```

The result is a name-only plan:

```json
{"defaults":[{"name":"APP_REGION","operation":"set"}],"deployment":[]}
```

This first example selects source keys in memory. To compare with an actual destination, configure the [CLI runtime](docs/cli.md) and run a read-only plan:

```sh
npx --no-install convex-env-sync plan --stage dev --config sync.json --runtime sync-runtime.mjs
```

Core, source, writer and CLI imports work without Alchemy. Install `alchemy@2.0.0-beta.87` when using `@fantastic.dev/convex-env-sync/alchemy`; compatibility with other Alchemy versions is unverified. See [public imports and package consumption](docs/package.md). Maintainers can test a candidate before publishing using the [packed CLI fixture](docs/package.md#offline-cli-fixture).

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
Install the exact npm version in the README and run its in-memory plan first.
Report the installed artifact, commands and name-only expected operations.
For integration, identify explicit stages, source configs, selection manifests,
exact destination identities and existing credential loaders. Prepare the app's
integration PR with its required checks and evidence. Obtain authorization before
provider writes, provisioning, deployment or publication; the example does
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
