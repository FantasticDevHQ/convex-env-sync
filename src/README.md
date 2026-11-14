# Implementation boundaries

The source-checkout `core/manifest.js` and `core/plan.js` modules implement selection and read-only planning. `core/reconcile.js` adds ownership-aware sparse reconciliation without provider writes. Remaining modules are:

- `core/`: manifest validation, ownership, redacted plans and reconciliation.
- `sources/`: Doppler first, then optional independent secret-source adapters.
- `convex/`: project-default and exact-deployment operations using Distilled.
- `alchemy/`: stage/lifecycle adapter calling the shared engine.
- `cli/`: plan, apply and verification commands using the same engine.

No package entrypoints or cloud dependencies are shipped yet. See [the architecture](../docs/architecture.md).
