# Security Policy

## Project status

Bound is pre-alpha research software. It is not a production security boundary
and must not be used with real financial data, production credentials, or
untrusted generated code.

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
