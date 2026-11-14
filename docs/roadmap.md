# Implementation roadmap

The current repository has source-checkout selection, redacted plans, ownership-aware reconciliation, Doppler and optional Infisical readers, exact Convex deployment operations and project/type defaults with authorized propagation. The Alchemy adapter also verifies lifecycle ordering, fresh source reads and metadata-only state. The source-checkout CLI also uses the same pipeline. Packed consumption is tested outside the source checkout. Independent consumer acceptance has passed for local isolation, cloud development apply/rotation, preview initialization/override preservation and read-only development planning. Production support is tested with controlled responses; no live production deployment has been qualified. Version 0.1.0 is published on public npmjs. Registry consumption verifies all public imports, the optional pinned Alchemy peer, a credential-free selection plan and the installed offline CLI. Automated future releases and public discovery listings are separate follow-ups.

1. Implement source-neutral selection, validation, redacted planning, ownership and explicit deletion rules. Prove behavior with synthetic providers.
2. Add Doppler reads and Convex writes using the existing Distilled SDKs. Support defaults by deployment type and exact deployment updates, including local anonymous backends.
3. Add Alchemy lifecycle integration and a reusable CLI using the same engine. Prove drift observation, rotation, credential handling, preview ordering and secret-state behavior.
4. Verify a real consumer's development and preview flows under separate authorization. Preserve isolated worktree identities. Verify a live read-only development plan and test both dev/prod mappings. Inspect production plans before any separately authorized production apply.
5. Validate packaging and publish only after consumer acceptance and owner authorization. Add an optional Infisical source adapter against the same contract.

The initial consumer is tracked separately in the maintainer's issue tracker. Consumer credentials, account identifiers and private deployment details do not belong in this public repository.

## Repository activation

The scaffold includes UbiCloud-only checks and trusted-base PR metadata tooling. Actual runner verification, base-branch metadata activation and branch protection verification are separate operational acceptance work. A green check alone does not configure merge protection.
