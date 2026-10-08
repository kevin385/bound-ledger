# R0 bootstrap and first persistent expense slice

## Implemented scope and limits

R0 is bootstrapped in `apps/finance`, `packages/finance-core`, and
`packages/finance-agent`. One expense tracer bullet through R1/R2 works without
an account, model, API key, or accounting setup: record, persisted receipt,
history/detail, spending by currency, correction, and undo, including process
reopen. The agent root is a typed operation facade **only**, not a Pi runtime.

The R0–R4 replacement gate is **not passed**. Income, transfers, positions,
unresolved notes/drafts, broader uncertainty/party relationships, backup/export/
restore commands, Pi/provider integration, code-mode isolation and durable Pi
recovery remain unimplemented. Existing research source and wiring remain.
Synthetic-only pre-alpha; this slice is not real-data readiness certification.

## Exact decisions

| Boundary | Choice |
| --- | --- |
| Local runtime baseline | Node **24.11.1**, also checked on **26.10.0** |
| SQLite adapter | Built-in `node:sqlite` `DatabaseSync`; no added native adapter dependency |
| Storage | SQLite schema 1; synchronous API, parameter binding, `BEGIN IMMEDIATE`, busy timeout 5 seconds, `synchronous=FULL`, default DELETE journal |
| HTTP / UI | Node `node:http`, server-rendered semantic HTML and local CSS, no JavaScript framework or client scripts |
| Package manager | pnpm **11.18.0**, lockfile retained |
| New build tooling | Catalog TypeScript **7.0.2**, `@types/node` **26.2.0** |
| Browser proof | Catalog `@playwright/test` **1.62.1**, Chromium |
| Agent / model adapter | No Pi or provider runtime dependency installed in the new roots; disabled, no provider calls or secret/config loading |

The baseline `node:sqlite` API is experimental and emits its upstream warning.
A Node upgrade can change SQLite behavior; run these exact-version gates before
changing the baseline. Type definitions are newer than the minimum runtime;
actual Node 24 tests, not typechecking alone, establish API compatibility.
The earlier assessment's Pi **1.0.2** is evidence/a candidate for R3, not an
installed or verified integration in this slice. R3 must choose and pin a
compatible tested Pi release/provider adapter with explicit opt-in disclosure.
There is no automatic model configuration or implicit financial-data egress.

Primary API references used: [Node 24.11.1 SQLite](https://nodejs.org/download/release/v24.11.1/docs/api/sqlite.html),
[Node 24.11.1 HTTP](https://nodejs.org/download/release/v24.11.1/docs/api/http.html),
and the [Fetch Origin-header algorithm](https://fetch.spec.whatwg.org/#append-a-request-origin-header).
A `same-origin` referrer policy is intentional: `no-referrer` makes native
Chromium form POSTs carry `Origin: null`. The server still rejects null and
cross-origin requests; it does not bypass origin checks to make the form work.

## Commands

From the repository root, on either tested Node version:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm build:finance
pnpm check:finance
pnpm --filter @bound/finance exec playwright install chromium
pnpm test:e2e:finance
pnpm dev:finance
```

Open the printed `http://127.0.0.1:4318` address. Only that numeric loopback
host is accepted; `localhost`, a LAN address, or a DNS alias is not accepted.
After a build, `pnpm --filter @bound/finance start --port 4319` selects a port.
No runtime directory/path, owner, provider or arbitrary-file flag exists.
Stop with Ctrl-C. Reopen with the same command: saved records and receipts remain.
Use only synthetic data. Do not expose the port through a reverse proxy/tunnel.

Each new package has `build`, `typecheck`, `test`, and `check` commands.
Consumer scripts build their public core dependency first, including from a
fresh checkout; they do not import legacy source or internal package paths.
`check:finance` covers all three roots, plus strict browser-test typechecking;
`test:e2e:finance` runs actual Chromium against separate application processes.
The original `start`, development, build, check and browser commands remain.
The existing legacy code-mode memory-limit timing failure is not weakened/fixed
by this slice. New CI is a separate job on both exact Node versions.

## Domain contract

- The app derives a single `local` workspace and `local-owner`; callers cannot
  supply authority through the form. Core authority is host-owned and each
  workspace's owner is persisted; reopening with a different owner fails.
- The supported meaning is an explicitly entered **actual expense** belonging
  to that owner. It records a cost, not proof of a completed payment or balance.
  Account is an optional funding-location **label**, not a position/account
  entity or owner. Evidence is an optional unverified source note, not an asset.
- USD/EUR/GBP accept positive decimal strings with at most two fractional
  digits; JPY accepts whole units only. No exponents, negative values, zero,
  unsupported currencies, floating-point input, rounding, or FX. Values and
  per-currency active-spending totals must fit `Number.MAX_SAFE_INTEGER` minor
  units. Parsing/summing uses checked `BigInt`; an overflowing write rolls back.
  Display also uses integer arithmetic rather than floating-point division.
- Description is required (1–500 characters, not whitespace-only). Account is
  null or 1–200 characters; evidence null or 1–2000. Control characters are
  restricted. Empty optional form fields mean unspecified. Unknown input fields
  are rejected, not treated as facts. Incomplete/unsupported event kinds are
  rejected here; a persisted unresolved-draft workflow is still deferred.
- Effective date is `{precision: 'unknown'}` by default, or a validated
  `{precision: 'day', value: 'YYYY-MM-DD'}` / `{precision: 'month', value:
  'YYYY-MM'}` with a real calendar day/month (years 0001–9999). No day is invented
  for a month. Unknown plus a supplied value is rejected. No timezone/date
  default is inferred. Receipt `recordedAt` is a UTC host-clock recording time,
  not an effective date or independently authenticated evidence.
- Every event has an opaque UUID, revision, owner, active/void status and latest
  receipt ID. Receipts have UUID, workspace, operation, request key, recording
  time, immutable after-snapshot and before-snapshot. Revision snapshots remain
  even when an expense is voided. No assistant state participates in this schema.
- Spending counts current active expense snapshots once, separately per native
  currency and across all effective-date precisions. Omitted or supplied account
  labels do not establish balances: position balance is always **unknown/null**.
  An empty spending list means no recorded active expenses, not a known balance.

### Requests and correction / undo

Keys are 1–128 ASCII letters/digits or `_.:-`. A key is unique **within a
workspace**, including across operations. Validated payload fields have a fixed
canonical order; amount is normalized to minor units, omitted optionals to null,
and date keys to their declared precision. Equivalent supported formatting and
object-key ordering retry the same receipt. Changed canonical payload or
operation under an existing key fails. Identical expenses with **different keys**
are separate records; descriptions/amounts are not duplicate detection.

`recordExpense`, `correctExpense` and `undo` persist effect, revision and stable
receipt together in one SQLite transaction. A retried receipt is returned before
applying another effect, even if the record has since changed. All three forms
preserve their hidden request UUID, operation, target and original expected
revision through supported validation/recovery responses. Editable expense fields
retain the submitted monetary/date/account/evidence text, including leading
newlines in evidence. A truly new form has a new UUID.

The HTTP write boundary and all recovery responses use **one native-form shape
contract**, before any domain call or expected-revision coercion. TAB and DEL are
supported unchanged in description, account and evidence. Scalar text inputs do
not support CR/LF: Chromium strips those from input values. Evidence is a
textarea: its DOM value uses LF, but native URL-encoded submission uses CRLF.
Only paired CRLF is supported in submitted evidence, including leading/multiple
newlines. Raw HTTP bare CR/LF or mixed newline sequences are refused, not silently
normalized into another payload under the same key. NUL and the other
domain-forbidden C0 controls remain refused. These are HTTP/native-form limits;
the core's existing text semantics are unchanged.

Correction/undo target IDs must be UUID-shaped and submitted `expectedRevision`
must contain 1–16 ASCII decimal digits denoting a positive safe integer. Validation
precedes `Number`: hexadecimal/binary/octal, exponents, signs, fractional notation,
whitespace and unsafe integers cannot become writes. Supported decimal text is
retained verbatim in the retry form; recovery never substitutes a current revision.

After restarting on the **same local address and port**, submit the still-open
original form. Its expired session/CSRF check returns **403 without invoking a
financial write**, together with a script-free review form and refreshed local
credentials. Review the preserved fields and explicitly submit **Save expense**,
**Save changes**, or **Retry Undo**. Nothing is automatically saved or retried.
The same non-mutating review is available for invalid local credentials only
when the Host/Origin and bounded supported form shape pass the recovery checks;
it grants no authority beyond the already-permitted local GET.

After an uncertain outcome, retry **unchanged** with that original identity, not
with a new entry/key. An earlier committed operation returns its original receipt,
including a correction/undo whose record now has a different revision. A changed
canonical payload under a committed key fails instead of creating another effect.
If the server can return a generic 500 after a domain call, its review form retains
the original request and explicitly labels the outcome uncertain. A supported
validation error returns 400 with editable inputs and the same identity. Corrections
never substitute today's revision for the submitted one; an uncommitted stale
correction still fails and requires a separate intentional edit from current detail.
Malformed/unknown fields, missing or invalid identities, oversized inputs and
unsupported currency/precision selections fail safely without a replacement form.

There is no persisted browser draft, offline outbox or automatic network retry
queue. If the connection fails before a recovery response arrives, use the
browser's original form/POST resubmission (Back when available); this app cannot
reconstruct a discarded browser form. Reopening a new entry or changing the
listener's port does not recover the old request. Recovery cannot infer whether
two independently keyed entries represent the same intended expense.

Corrections require the exact current safe-integer revision and an active
expense; they append a revision, never overwrite history. Undo is a **new
compensating revision** tied to the latest record/correction receipt:

- Undo record: mark it void and exclude it from spending, without deleting it.
- Undo correction: restore the previous supported facts as a new revision.
- Stale targets/revisions, subsequent edits, repeated undo under a new key, and
  undoing an undo are refused. Retrying the same successful undo key returns its
  original receipt. There is no redo or arbitrary historical rewind.
- Undo never moves money, reverses a bank payment, restores external side effects,
  or erases evidence. Old receipts are labelled historical and omit Undo.

## Schema and local-data lifecycle

Implemented: `apps/finance/.local/ledger.sqlite`, private app runtime directory
0700 and database 0600, Git-ignored. Existing unsafe permissions, symlinks,
non-regular/hardlinked databases and owner mismatch are refused without repairing
or chmodding them. No arbitrary browser/CLI file paths. Tests inject a trusted
synthetic private temporary directory in the host API only.

Failed listener startup disposes the opened SQLite ledger without replacing the
original bind error. Graceful `close()` caches one shutdown promise: all callers
wait for HTTP completion and SQLite disposal, including error cleanup. It does
not force-close in-flight forms or discard committed facts; normal HTTP request
timeouts still apply. Stopping acceptance and draining the listener is not an
implemented backup/export/restore command.

Schema 1 contains workspaces, current expenses, append-only revision snapshots,
and canonical request/receipt rows. Receipt uniqueness and revision/receipt
foreign keys complement domain validation. An empty version-0 DB migrates to
schema 1 atomically, with `application_id=1112296519`. Foreign/unversioned
nonempty databases, unsupported versions or application identities fail closed;
there is no automatic reset or destructive downgrade. Future migrations must
be explicit, transactional and tested against a restorable backup. Do not edit
SQLite files by hand. Same-user/local malware is outside this boundary.

**Backup / export / restore below is a lifecycle DESIGN, not implemented commands.**
R2 is not complete until the supported workflow is implemented and exercised.

1. Backup: stop accepting writes, finish requests and gracefully close SQLite;
   copy the closed authoritative database to a separate private destination,
   including any journal needed for crash recovery if the source was not cleanly
   closed. Prefer a validated SQLite backup/snapshot API for future online
   backup; never copy only a live main DB while ignoring its journal. Store a
   manifest with format/schema/runtime compatibility metadata and checksum.
   Validate integrity and the saved receipts/revisions on a synthetic reopen.
2. Export: a future versioned lossless format must include workspace/owner,
   current records, **all** revisions, immutable receipts and canonical request
   identities. A spending CSV is a view, not a restorable backup. Assistant
   transcripts, if introduced, are a separate optional archive, never domain truth.
3. Restore: while stopped, validate into a new private staging location. Reject
   unsupported schema/manifest, failed checksum/integrity, inconsistent receipt/
   revision links, invalid amounts or ownership. Preserve retry identities; do
   not replay restored effects. Keep the previous database as a private recovery
   copy, then atomically replace and reopen. Prove spending, history and retry
   behavior before discarding the prior copy. Never overwrite the current DB on
   validation failure. There is no web file-upload/restore endpoint in this slice.
4. Retention: records, evidence, receipts and revisions have no automatic expiry.
   Deleting `.local` destroys all of them and retry history. Deleting assistant
   history must never delete domain data. Backup/restore/recovery, encryption and
   retention controls need further implementation; backups must be private too.

Storage is **not encrypted**; operating-system access and private permissions
are the implemented protection. No secrets or user data are logged, collected
from existing files, or sent to a provider. No real financial fixtures are used.

## Implemented local HTTP boundary and residual risks

The listener binds only 127.0.0.1. Host must exactly match its numeric address and
port. Origin must match for every POST; supplied foreign/null origins are also
rejected on reads. Every write needs a process-lifetime random CSRF token and
matching HttpOnly, SameSite=Strict local session cookie. Restart rotates both.
A rejected credential check never calls a financial operation. For an eligible
same-origin form it may return a 403 review response that refreshes credentials
and preserves the request for a **separate explicit retry**; missing/null/foreign
Origin or wrong Host never receives that recovery view or credentials. There is
no permissive CORS. Same-origin referrers never go cross-origin.
HTML escapes supplied text; CSP disallows scripts/embedding/base overrides and
permits only same-origin styles/forms. No-store and nosniff apply to responses.
Transport accepts URL-encoded forms only, with no duplicate/unsupported fields,
16 KiB streamed/body-length budget, 8 KiB headers and 10-second header/request
limits. SQL/internal errors are generic; values and SQL are never logged.

This is one trusted local owner, not multi-user authentication. HTTP cookies are
not Secure on loopback HTTP. Same-user processes, malicious browser extensions,
root, filesystem compromise, denial of service and unaudited packaging remain
risks. Linux/POSIX ownership checks are implemented; Windows portability is not
claimed. No payment execution, arbitrary-file operation, provider, sandbox or
Pi isolation claim exists. Remote access requires a separate security design.

## Verification contract

Core tests use actual file-backed SQLite, not mocks: close/reopen, canonical
retry/mismatch, separate identical requests, currency/date precision, integer
limits, stale corrections, compensation, competing gated child processes,
SIGKILL after domain commit before receipt delivery, and SQLite-triggered receipt
insertion failures proving record/correction/undo effects and revisions roll back.
The commit-gap test is **domain recovery**, not Pi durable recovery.
HTTP tests exercise malicious text, precision/input recovery, host/origin/CSRF,
private-file checks, body/type/duplicate/header limits and persisted manual views.
Lifecycle regressions count Linux `/proc/self/fd` SQLite handles after repeated
failed binds, hold a real incomplete POST through concurrent shutdown callers,
and fault the drained server's close callback to verify SQLite error cleanup.
Recovery regressions cover non-mutating credential refusal, preserved original
revisions despite competing edits, unknown/malformed targets, operation-specific
unknown fields, changed-payload key conflicts and real post-commit response faults
for record/correct/undo.
Chromium tests exercise separate-process reopen and the complete workflow, plus
mobile precision errors, inert malicious text, absence of horizontal overflow,
and no unexpected browser errors/dialogs. Additional **JavaScript-disabled native
form** tests restart on the same port, preserve all original record/correction/undo
identities through 403 review, require an explicit retry and check persisted effects.
They include already-committed response gaps, a historical correction receipt
with a newer current revision, TAB/DEL in description/account/evidence,
multiline/leading-newline evidence, and record/correction precision validation
retaining inputs/key/target/revision. Decoded native POST payloads are compared
before and after recovery (only refreshed CSRF or the explicitly corrected amount
may differ). HTTP negatives prove non-native scalar/textarea controls and
non-decimal revisions never reach the domain, with authenticated and expired
credentials sharing the same shape contract. No provider or network
is needed at execution time; only dependency/browser installation uses downloads.

Independent parent review/re-execution and broader R1–R4 work remain required.
