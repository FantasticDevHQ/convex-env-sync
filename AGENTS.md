# Convex Env Sync

This is a backend-free library published on npm as @fantastic.dev/convex-env-sync, with verified registry consumption and separately authorized consumer acceptance. Keep release claims aligned with docs/roadmap.md: live production verification has not been delivered. Keep public documentation consumer-neutral.

Read docs/architecture.md and docs/development.md before changing implementation. Use pnpm and preserve its lockfile. Node.js 22.18+ is required for native TypeScript worktree scripts. Run `pnpm check` before handoff.

Reuse @distilled.cloud/convex and @distilled.cloud/doppler, and Alchemy's existing secret loaders where useful. Source adapters must remain replaceable. Never write secret values into logs, snapshots, source, plaintext state or PR evidence. Target exact deployments, preserve unrelated keys and require explicit deletion ownership. Never treat project defaults as live inheritance.

Keep worktree implementation/tests under scripts/worktree/. This repository has neither an application backend nor frontend. Never provision a Convex backend just to test this library. Maintain upstream provenance when updating vendored tooling.

Ordinary CI and release verification use UbiCloud, with `ubicloud-standard-2-ubuntu-2404` as default. The owner approved only the npm OIDC/provenance publishing job in release.yml on GitHub-hosted `ubuntu-24.04`; no other hosted-runner exception is granted. Preserve trusted base execution for the write-token PR workflow. Follow docs/pull-request-standard.md and the organization default PR template from FantasticDevHQ/.github; evidence belongs in PRs, never committed evidence files.

Independent final-commit acceptance review uses GPT-6.1 Terra with medium reasoning. Obtain a fresh review after material changes. Do not merge, publish packages, apply remote environment changes, or deploy without the user's authorization.

## Generated releases

The owner approved Better Stripe-style auto-merge for metadata-only Release Please PRs from the existing FantasticDev npm releases App after protected checks. Those generated PRs need no new per-version Linear ticket or Terra acceptance, but retain the five PR sections and actual workflow identity. Trusted-base validation restricts them to a consistent version/manifest increase, appended changelog and README version text. Source-changing PRs retain normal ticket and independent final-commit review requirements. See docs/releasing.md; repository settings and npm publisher binding must be verified separately from code.
