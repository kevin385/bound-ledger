# Security Policy

## Project status

Bound Ledger is pre-alpha. The existing fixture-backed research implementation
remains temporarily while an independent replacement is built. No replacement
application or production security boundary is implemented by the planning docs.
Use synthetic data and test credentials until the relevant implemented controls
and their verification permit broader use.

Only the current `main` branch receives security fixes. The active product and
implementation scope are in [PLAN.md](PLAN.md) and
[docs/INITIAL_PLAN.md](docs/INITIAL_PLAN.md). Passing the initial-base replacement
gate permits removal of old code; it is not a production security certification.

## Report a vulnerability privately

Use GitHub's private vulnerability reporting flow: open the repository's
**Security** tab, then **Advisories**, then **Report a vulnerability**.
Do not publish exploit details in an issue, discussion, PR, or commit. If private
reporting is unavailable, open a neutral issue asking for a private contact path.

Include the affected revision, impact, and a minimal reproduction with synthetic
data and no secrets. Reports are handled on a best-effort basis during pre-alpha.

Relevant reports include authorization bypass, financial-state corruption or
repeated effects, sandbox/host-access failures, credential or financial-data
exposure, unsafe backup/restore/migrations, and dependency or CI weaknesses.

## Existing research boundaries

The old application uses in-memory fixtures and trusted local-session state.
Its capability gateway validates/authorizes operations, and its confirmation
controls remain outside model tools. Its custom QuickJS-WASM executor uses a
bounded disposable child process. Those are prototype-specific properties,
not promises about the replacement or production isolation.

[The old threat model](docs/CODE_MODE_THREAT_MODEL.md) and
[ADR 0001](docs/adr/0001-experimental-code-sandbox.md) remain applicable to that
source while it exists. They do not select or approve Pi's different worker
boundary. The isolated [Pi spike](experiments/pi-refresh/README.md) demonstrates
limited behavior and does not establish escape resistance or general replay safety.

## Requirements for the replacement

The implementation must make these boundaries concrete before claiming them:

- One local owner, loopback access, host-derived workspace authority, and protected
  local state-changing endpoints. Remote/multi-user exposure needs a separate
  identity and authorization design.
- Validated financial inputs/outputs, checked numeric precision, coherent effects,
  revisions, and transactions that atomically persist effects and request receipts.
  Recovery across the domain/Pi commit gap must not repeat a committed write.
- Local domain data independent of assistant transcripts; reset, compaction, fork,
  cancellation, or provider failure cannot erase or rewrite financial facts.
- Private data paths and access permissions, consistent backup/export/restore,
  migration failure behavior, and documented retention/deletion. Describe whether
  encryption is present; do not imply local storage is encrypted by default.
- Explicit provider/data-scope disclosure and opt-in model configuration. Secrets
  stay in host configuration and out of prompts, generated code, traces, fixtures,
  and source control. Treat supplied text and model output as untrusted data.
- Every nested code-mode operation crosses application validation and authority.
  The guest receives bounded operations, not raw SQL, database handles, credentials,
  or ambient filesystem/network access. Pin the runtime and verify host isolation,
  time/memory/output/call limits, cancellation, and packaged worker/WASM loading.
- Replay-safe declarations backed by operation and whole-script evidence. Task
  recovery is not an exactly-once guarantee, and script failure is not rollback.

Write the replacement threat model and runtime decision against its actual
implementation, and keep ordinary CI provider-free. The initial scope records
and explains finances; it does not execute payments, trading, or other external
money movement. Later integrations need their own authorization, disclosure,
credential, replay, and completion-verification contracts.
