# Convex Env Sync

This is an unpublished, backend-free library with tested packed consumption and separately authorized consumer acceptance. Keep release claims aligned with docs/roadmap.md: no npm release or live production verification has been delivered. Keep public documentation consumer-neutral.

Read docs/architecture.md and docs/development.md before changing implementation. Use pnpm and preserve its lockfile. Node.js 22.18+ is required for native TypeScript worktree scripts. Run `pnpm check` before handoff.

Reuse @distilled.cloud/convex and @distilled.cloud/doppler, and Alchemy's existing secret loaders where useful. Source adapters must remain replaceable. Never write secret values into logs, snapshots, source, plaintext state or PR evidence. Target exact deployments, preserve unrelated keys and require explicit deletion ownership. Never treat project defaults as live inheritance.

Keep worktree implementation/tests under scripts/worktree/. This repository has neither an application backend nor frontend. Never provision a Convex backend just to test this library. Maintain upstream provenance when updating vendored tooling.

CI uses UbiCloud, with `ubicloud-standard-2-ubuntu-2404` as default. Preserve trusted base execution for the write-token PR workflow. Follow docs/pull-request-standard.md and the PR template; evidence belongs in PRs, never committed evidence files.

Independent final-commit acceptance review uses GPT-6.1 Terra with medium reasoning. Obtain a fresh review after material changes. Do not merge, publish packages, apply remote environment changes, or deploy without the user's authorization.
