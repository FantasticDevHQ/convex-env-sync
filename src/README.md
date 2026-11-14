# Implementation boundaries

The source-checkout `core/manifest.js` and `core/plan.js` modules implement selection and read-only planning. Remaining modules are:

- `core/`: manifest validation, ownership, redacted plans and reconciliation.
- `sources/doppler.js`: implemented Distilled config reader.
- `sources/infisical.js`: optional caller-owned SDK client adapter with the same selection contract.
- `convex/`: project-default and exact-deployment operations using Distilled.
- `alchemy/`: stage/lifecycle adapter calling the shared engine.
- `cli/`: plan, apply and verification commands using the same engine.

Package entrypoints are not shipped yet. The Doppler adapter pins Distilled and Effect runtime dependencies. See [the architecture](../docs/architecture.md).
