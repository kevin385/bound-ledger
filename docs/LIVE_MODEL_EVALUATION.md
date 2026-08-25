# Live-model evaluation pilot

## Purpose and boundary

Phase 19 adds a deliberately small way to measure whether a selected model can
use Bound Ledger's existing tool and controlled-code surfaces. It does not add
a model selector, credentials store, provider package, model server, chat UI,
or production model integration. The deterministic v2 corpus remains the
authority; a live run is optional local evidence.

Ordinary commands, tests, builds, browser workflows, and CI never construct a
live provider or make a model request. A live run requires both an explicit
configuration file and `BOUND_LEDGER_LIVE_EVAL=1`. `--dry-run` is validation
and planning only: it deliberately does not resolve environment values,
construct a provider, create a ledger runtime, or use the network.

## Configuration

The checked-in example is
[`evals/configs/live-model-matrix.example.json`](../evals/configs/live-model-matrix.example.json).
Copy it to an ignored/private location and keep only environment-variable names
in the JSON. Never put a key or URL in the file.

Each configuration is closed and versioned:

```ts
interface ModelConfigurationV1 {
  id: string
  provider: string
  model: string
  endpointKind: "native" | "openai_compatible" | "local"
  supportsTools: boolean
  supportsCodeMode: boolean
  baseUrlEnvironmentVariable?: string
  apiKeyEnvironmentVariable?: string
}
```

Only these provider environment names are accepted:

- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `BOUND_LEDGER_MODEL_API_KEY`
- `BOUND_LEDGER_MODEL_BASE_URL`

Native configurations use Pi's built-in provider/model catalog and must not
declare a base URL. OpenAI-compatible configurations require an HTTPS URL and
an API key. Local configurations require an HTTP or HTTPS loopback URL
(`localhost`, `127.0.0.1`, or `::1`) and may omit the key. URLs containing
credentials, remote plain HTTP, non-loopback local hosts, missing values,
unknown keys, duplicate IDs, and code support without tool support fail before
provider or ledger construction.

## Safe dry run

Run the reproducible checked-in plan:

```sh
pnpm eval:live -- --config evals/configs/live-model-matrix.example.json --dry-run
```

The JSON output names only safe configuration labels, supported modes, the
exact six task IDs, and the fixed three-trial count. It reports
`networkAccess: false` and `providerConstruction: false`.

## Opt-in live run

Set only the variables referenced by your private matrix, then opt in:

```sh
export BOUND_LEDGER_MODEL_BASE_URL="http://127.0.0.1:11434/v1"
export BOUND_LEDGER_LIVE_EVAL=1
pnpm eval:live -- --config ./private-live-model-matrix.json
```

For a hosted compatible endpoint, use HTTPS and set
`BOUND_LEDGER_MODEL_API_KEY`. For a native provider, set its allowlisted key
name. The command runs each supported mode three times for every task from a
fresh `sample-kernel-v1` fixture. Stop the run normally with the terminal's
interrupt control; cancellation is reported with the sanitized vocabulary.

The exact immutable subset references the v2 registry entries by ID:

1. `general-ledger-reconciliation`
2. `event-detail-selection`
3. `august-close-composition`
4. `expense-post-confirmation`
5. `closed-input-authority-injection`
6. `unknown-event-reversal`

Tool mode uses the existing general-ledger Pi projection. Code mode exposes
only the existing bounded `execute_code` surface. The model cannot approve or
reject confirmation requests. V2 expected facts, attempt normalization, state,
pending-confirmation, redaction, and conjunction scorers are unchanged.

## Output and disclosure policy

Each public trial records safe configuration/provider/model labels, endpoint
kind, task, mode, trial number, application revision label, status, failed
invariant names, state counts, model turns, outer and inner call counts,
invalid/blocked calls, confirmations, duration, and token/cost fields when Pi
reports them. It never publishes raw scorer candidates, capability attempts,
provider errors, prompts, tool arguments, generated code, credentials, URLs,
or trusted context.

Provider failures normalize to: `cancelled`, `malformed_output`,
`provider_unavailable`, `rate_limited`, `streaming_failed`,
`unavailable_tool`, and `usage_unavailable`. Raw provider messages are not
returned. Unsupported modes are explicit. Aggregates publish sample size, pass
count/rate, duration median/range, and observed failures per task. They never
average correctness or safety into a passing score.

Before checking in manual evidence, use
[`evals/results/live-model-pilot-template.md`](../evals/results/live-model-pilot-template.md),
retain all 18 trials per supported mode/configuration, verify synthetic fixture
data only, and search the result for every configured secret and endpoint.
Live evidence is optional and is not a phase or CI gate.

## Limitations

- This pilot assumes OpenAI-compatible custom endpoints expose tool calling.
- Configuration labels are operator-supplied; keep them descriptive and
  non-sensitive.
- A local endpoint is loopback-only, but the model server itself remains an
  operator-controlled trust dependency.
- Zero token usage is reported as `usage_unavailable`; it does not fabricate
  estimates.
- A three-trial synthetic sample is diagnostic evidence, not a production
  benchmark or a claim about real financial behavior.
