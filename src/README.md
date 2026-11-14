# Implementation boundaries

The source-checkout `core/manifest.js` and `core/plan.js` modules implement selection and read-only planning. `core/reconcile.js` adds ownership-aware sparse reconciliation without provider writes. Remaining modules are:

- `core/`: manifest validation, ownership, redacted plans and reconciliation.
- `sources/doppler.js`: implemented Distilled config reader. Other source adapters remain future work.
- `convex/deployment.js`: exact deployment planning, scoped bulk updates and readback through Distilled. Project defaults remain future work.
- `alchemy/`: stage/lifecycle adapter calling the shared engine.
- `cli/`: plan, apply and verification commands using the same engine.

Package entrypoints are not shipped yet. The Doppler adapter pins Distilled and Effect runtime dependencies. See [the architecture](../docs/architecture.md).
