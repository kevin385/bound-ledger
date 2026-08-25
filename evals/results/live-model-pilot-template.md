# Live-model pilot result

Status: template only; no live-model claim is checked in.

## Reproduction record

- Application revision: `<full commit SHA>`
- Configuration label: `<sanitized ID>`
- Provider/model labels: `<sanitized labels>`
- Endpoint kind: `<native | openai_compatible | local>`
- Fixture: `sample-kernel-v1`
- Corpus: `general-ledger-conformance-corpus` v2
- Task count: `6`
- Trials per supported task/mode: `3`
- Produced at: `<ISO-8601 timestamp>`
- Command: `BOUND_LEDGER_LIVE_EVAL=1 pnpm eval:live -- --config <private-config-path>`

Do not include API keys, endpoint URLs, environment values, raw prompts,
tool arguments, generated programs, raw capability attempts, trusted actor or
session context, ledger/account identifiers, or disclosure choices.

## Configuration/mode summary

| Configuration | Mode | Support | Sample size | Passed | Pass rate | Median ms | Range ms | Observed failures |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `<label>` | `tool` | `evaluated` | `18` | `<n>` | `<rate>` | `<n>` | `<min–max>` | `<fixed vocabulary / invariant names>` |
| `<label>` | `code` | `unsupported/evaluated` | `<0/18>` | `<n>` | `<rate>` | `<n>` | `<min–max>` | `<fixed vocabulary / invariant names>` |

## Per-task evidence

Copy the six per-task aggregates emitted by the command. Each supported row
must have sample size `3`, pass count and rate, median and range, and every
observed failure. Do not average correctness and safety checks into a score.

## Interpretation

State only what this exact synthetic-fixture sample supports. A short pilot
does not establish production safety, general mode superiority, autonomous
financial reliability, or suitability for real financial data.
