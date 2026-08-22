# Security Policy

## Project status

Bound Ledger is pre-alpha research software. It is not a production security
boundary and must not be used with real financial data, production credentials,
or untrusted generated code.

The documented long-term direction includes possible self-hosting, user-chosen
models, persistence, and financial source import. None of those statements
changes the current warning or makes the existing QuickJS/child-process proof
suitable for hostile workloads.

Only the current `main` branch receives security fixes.

## Report a vulnerability privately

Use GitHub's private vulnerability reporting flow:

1. Open the repository's **Security** tab.
2. Open **Advisories**.
3. Select **Report a vulnerability**.

Do not disclose vulnerability details in a public issue, discussion, pull
request, or commit message. If private reporting is unexpectedly unavailable,
open a neutral issue asking the maintainer to enable a private contact path; do
not include exploit details.

Useful reports include the affected revision, impact, reproduction steps, and a
minimal proof of concept that contains no real secrets or personal data.

## Scope

Relevant reports include:

- authorization or trusted-context bypasses;
- unintended filesystem, process, environment, or network access;
- sandbox escapes or resource-limit bypasses once code mode exists;
- credential disclosure through logs, traces, fixtures, or workflows;
- dependency or CI workflow supply-chain weaknesses.

Reports are handled on a best-effort basis while the project is pre-alpha.

## Current trust boundaries

- Fixture and trusted-session state live in the host application, not in model
  input or generated code.
- Every ledger operation must cross the capability gateway for decoding,
  authorization, execution, output decoding, and attempt recording.
- Confirmation approval and rejection are trusted application controls, not
  model tools or guest SDK operations.
- Generated JavaScript runs in a fresh QuickJS-WASM runtime inside a disposable
  child process with explicit limits, but this is experimental defense in depth
  rather than a production isolation guarantee.
- The browser application is local, in memory, single-session, and restricted
  to checked-in synthetic fixtures.

See [`docs/CODE_MODE_THREAT_MODEL.md`](docs/CODE_MODE_THREAT_MODEL.md) and
[`docs/adr/0001-experimental-code-sandbox.md`](docs/adr/0001-experimental-code-sandbox.md)
for the code-execution attacker model, evidence, residual risks, and stop
conditions.

## Required future reviews

Before any later phase permits real financial data, persistence, user-selected
models, source imports, or external connectors, its plan and threat model must
cover at least:

- encryption, secret storage, key rotation, backup, restore, export, deletion,
  and migration failure;
- authentication, session isolation, multiple-ledger access, CSRF, SSRF, and
  same-origin server-function behavior;
- what data is sent to each local or remote model, explicit user disclosure,
  redaction/minimization, provider retention, and prompt-injection handling;
- malicious CSV/OFX/QFX fields, document formulas, oversized inputs, duplicate
  imports, source provenance, and parser resource limits;
- connector token scope, webhook authenticity, replay, revocation, sync
  idempotency, and the rule that ingestion cannot post ledger facts directly;
- operating-system/container resource limits for generated code and a new
  production sandbox decision rather than relying only on this local proof;
- dependency, image, release, update, and self-hosted supply-chain behavior.

Payment initiation, automated trading, and model-callable confirmation are not
covered future capabilities and remain out of scope.
