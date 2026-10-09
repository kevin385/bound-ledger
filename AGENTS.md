# Contributor and coding-agent guidance

Read `PLAN.md`, `docs/INITIAL_PLAN.md`, and `CONTRIBUTING.md` before changing code.
They define the active independent rewrite. `docs/archive/` is historical and
its phase gates do not govern replacement work.

- Current step: R0 is bootstrapped and a first persistent, model-free expense
  slice through R1/R2 exists in `apps/finance`, `packages/finance-core`, and
  `packages/finance-agent` (typed operation facade only, no Pi/provider runtime).
  The initial-base replacement gate has not passed; broader R1/R2 and R3/R4 remain.
  See `docs/FINANCE_SLICE.md` for implemented contracts, commands, and limits.
- New source must not import or wrap the old apps/packages. Shared repository
  tooling and third-party libraries may be used; financial behavior is independently
  implemented. Keep the core independent of Pi and the UI.
- Keep the research prototype runnable until the documented initial-base gate
  passes, then remove its implementation and runtime wiring through R5. The
  user has already selected this replacement strategy; do not reintroduce the
  archived Phase 20 restrictions or compatibility requirements.
- Financial concepts define the model. Do not require CSV imports, reconciliation,
  accounting setup, or a particular note template for ordinary use.
- Validate every agent operation in application code. Persist domain facts
  separately from assistant state; use atomic revisions and idempotent receipts.
- Routine requested recording is distinct from external financial execution.
  Preserve uncertainty and recovery without adding an approval queue to every entry.
- Only synthetic fixtures belong in source control. Never commit personal notes,
  credentials, private runtime data, or local `.pi/` state.
- Keep status, implemented commands, security claims, and current-step markers
  consistent. Run checks appropriate to the change, including documentation links
  and whitespace when changing documentation.

`apps/personal-ledger/AGENTS.md` is scoped to the legacy application. Its UI
instructions do not select the framework or component system for the replacement.
