# Implementation boundaries

The source-checkout `core/manifest.js` and `core/plan.js` modules implement selection and read-only planning. `core/reconcile.js` adds ownership-aware sparse reconciliation without provider writes. Remaining modules are:

- `core/`: manifest validation, ownership, redacted plans, reconciliation and shared stage dispatch.
- `sources/doppler.js`: implemented Distilled config reader.
- `sources/infisical.js`: optional caller-owned SDK client adapter with the same selection contract.
- `convex/deployment.js`: exact deployment planning, scoped bulk updates and readback through Distilled. The defaults module handles project/type updates and explicit verified propagation.
- `alchemy/index.js`: pinned Alchemy resource/provider with fresh sync on every apply, dependency ordering and metadata-only state.
- `cli/main.js`: source-checkout plan/apply command, lazy runtime loading and verified metadata persistence.

Public ESM entrypoints and packed-consumer checks are described in [package consumption](../docs/package.md). The Doppler adapter pins Distilled and Effect runtime dependencies. See [the architecture](../docs/architecture.md).
