# Implementation roadmap

The current repository has source-checkout manifest validation, read-only selection plans, ownership-aware reconciliation, a Doppler config reader and repository checks. No live sync, package release or consumer installation is delivered yet.

1. Implement source-neutral selection, validation, redacted planning, ownership and explicit deletion rules. Prove behavior with synthetic providers.
2. Add Doppler reads and Convex writes using the existing Distilled SDKs. Support defaults by deployment type and exact deployment updates, including local anonymous backends.
3. Add Alchemy lifecycle integration and a reusable CLI using the same engine. Prove drift observation, rotation, credential handling, preview ordering and secret-state behavior.
4. Verify a real consumer's development and preview flows under separate authorization. Preserve isolated worktree identities. Inspect production plans before any production apply.
5. Validate packaging and publish only after consumer acceptance and owner authorization. Add an optional Infisical source adapter against the same contract.

The initial consumer is tracked separately in the maintainer's issue tracker. Consumer credentials, account identifiers and private deployment details do not belong in this public repository.

## Repository activation

The scaffold includes UbiCloud-only checks and trusted-base PR metadata tooling. Actual runner verification, base-branch metadata activation and branch protection verification are separate operational acceptance work. A green check alone does not configure merge protection.
