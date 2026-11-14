# Implementation boundaries

Runtime code is not implemented yet. The planned modules are:

- `core/`: manifest validation, ownership, redacted plans and reconciliation.
- `sources/`: Doppler first, then optional independent secret-source adapters.
- `convex/`: project-default and exact-deployment operations using Distilled.
- `alchemy/`: stage/lifecycle adapter calling the shared engine.
- `cli/`: plan, apply and verification commands using the same engine.

No runtime exports, placeholder sync functions, or cloud dependencies are shipped by this scaffold. See [the architecture](../docs/architecture.md).
