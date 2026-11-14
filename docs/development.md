# Development

Requires Node.js 22.18+ and pnpm 12.18.0. Native TypeScript stripping is used only by the vendored worktree tooling. Core selection and planning use dependency-free JavaScript ES modules. Runtime SDK dependencies will be introduced by subsequent roadmap tasks.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs core manifest/plan tests, verifies scaffold integrity and runs the PR validator/enforcer and worktree unit/freshness tests. It does not contact Doppler or Convex, or prove real secret delivery. No application backend or frontend exists in this repository.

## Backend-free lifecycle

Commit relevant changes first; setup refuses dirty tracked work. Run from a clean checkout:

```sh
pnpm worktree:setup
pnpm worktree:start
pnpm worktree:stop
pnpm worktree:setup
pnpm worktree:start
pnpm worktree:teardown
pnpm worktree:cleanup --yes
```

Setup discovers origin's live default branch unless `scripts/worktree.config.json` declares `baseBranch`, fetches it and uses its immutable commit for new checkouts. It must preserve caller branches and changes. `stop` preserves state; `teardown` releases reservations while preserving data; explicit `cleanup --yes` removes only owned state. New-checkout setup must be verified after tooling lands on the selected base, since this bootstrap branch is not yet on that base.

The optional real Convex integration test is not part of this backend-free repository's checks. Real two-backend isolation belongs to a consuming application's acceptance.

## Vendored tooling provenance

- Full exported worktree toolkit installed with `node install.mjs` from `FantasticDevHQ/convex-worktrees` commit `442743dd58d958d6798a74f5c466a8fc2ddb333a`. Only its config is adapted to `convex: false` and `frontend: false`; preserve all exported modules, tests, profiles and license.
- PR workflow, template, validator, enforcer and tests taken from the standards reference at commit `bdc09318c912edaa7ca9e3815609735f18a83be7`, derived from the canonical Jib Factory PR standard. The workflow was checked against the canonical scheduler configuration during bootstrap. Keep trusted base code execution.
- Official Fantastic.Dev logo is copied unchanged. SHA-256: `4869b13bae195ef7f934fb3a1dd2b37e86700ce33bf88f9c863e7597e20c2075`. Canonical brand asset commit: `0ce1aebc3e8418d7e59ce171e117cf9793dd2f3a`.

## CI

GitHub Actions schedules `Repository quality gates` on `ubicloud-standard-2-ubuntu-2404`. The UbiCloud GitHub installation must include this repository and Actions must be enabled. Inspect actual job labels, runner name and conclusion before claiming UbiCloud execution passed. Never fall back to GitHub-hosted compute.

The PR metadata workflow executes trusted base code with write permissions, without installing dependencies or checking out PR head code. It activates automatically after these files land on the default branch. Before that, validate actual PR metadata locally. Required merge protection is a separate repository setting; verify it after real contexts exist.

Keep PR evidence in the PR. Independent acceptance review uses GPT-6.1 Terra with medium reasoning on the final commit. Do not merge, publish or change live environments without owner authorization.
