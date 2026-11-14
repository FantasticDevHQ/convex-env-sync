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

Convex Env Sync is being built to deliver selected secrets from Doppler to Convex project defaults and individual deployments through Alchemy. It is intended for existing Convex applications, including pnpm Turborepos, with development, production and preview deployments.

**Status: unpublished implementation in progress.** Source-checkout modules provide selection, ownership, Doppler and optional Infisical readers, scoped Convex writers, Alchemy lifecycle integration and a shared plan/apply CLI. No npm release or live consumer verification has been delivered.

## Quick start

### Have my agent set this up

Copy this into your coding agent to prepare a source checkout:

```text
Prepare the Convex Env Sync source repository using these public documents:
https://github.com/FantasticDevHQ/convex-env-sync
https://github.com/FantasticDevHQ/convex-env-sync/blob/main/docs/development.md
https://github.com/FantasticDevHQ/convex-env-sync/blob/main/docs/architecture.md

This is an unpublished scaffold. Do not install a presumed npm release or wire
placeholder functions into a consuming application. Clone the source separately
from an existing app, or use its existing clean source checkout.
Read applicable AGENTS.md and AGENT.md files. Inspect Git status, package manager,
lockfile and prerequisites. Preserve existing work. Use Node.js 22.18 or newer
and the pnpm version declared in package.json.
Run pnpm install --frozen-lockfile, then pnpm check. Report the checkout path,
commands, passed checks and remaining implementation work. A passing check
validates repository tooling; it does not prove external secret synchronization.
Do not request credentials, deploy, publish, or modify any service configuration
for this credential-free setup.
```

### Manual setup

Requires Git, Node.js 22.18+ and pnpm 12.18.0. Run in the parent directory where you keep source repositories:

```sh
git clone https://github.com/FantasticDevHQ/convex-env-sync.git
cd convex-env-sync
pnpm install --frozen-lockfile
pnpm check
```

Expected result: repository checks and the PR/worktree tooling tests pass without cloud accounts or credentials. Authenticated integration tests will be introduced with the implementation. See [development](docs/development.md) for lifecycle checks and [the roadmap](docs/roadmap.md) for remaining delivery work.

## Planned behavior

- Select variables in each Doppler config using explicit manifests.
- Manage Convex project defaults independently for dev, prod and preview.
- Apply dedicated values to an exact cloud or local deployment.
- Preserve unrelated variables and require explicit deletion ownership.
- Reuse the existing Distilled SDKs and Alchemy secret loading.
- Keep the sync engine independent of its secret source.

Source-checkout APIs implement these rules. Packed consumption and live consumer acceptance remain outstanding.

## Documentation

- [Architecture and environment rules](docs/architecture.md)
- [Example configuration and manifests](docs/configuration.md)
- [Implementation roadmap](docs/roadmap.md)
- [Alchemy lifecycle and secret-state rules](docs/alchemy.md)
- [Shared plan/apply CLI](docs/cli.md)
- [Development and worktrees](docs/development.md)
- [PR requirements](docs/pull-request-standard.md)

## Contributing

Read [AGENTS.md](AGENTS.md), choose a scoped roadmap task, and run `pnpm check` before opening a PR. The repository is backend-free. Live integration acceptance belongs in an authorized consuming application. Package publication and provider writes require separate authorization.

## License

[MIT](LICENSE).
