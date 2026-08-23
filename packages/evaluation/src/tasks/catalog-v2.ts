import { RECONCILE_JULY_GENERAL_LEDGER_PROGRAM } from "@bound/code-mode"

import { GENERAL_LEDGER_RECONCILIATION_TASK_V1 } from "../task.ts"

export type GeneralLedgerCorpusOutcomeClassV2 =
  "successful_read" | "confirmation_required" | "refused_or_invalid"

export type GeneralLedgerCorpusStatusV2 =
  "completed" | "confirmation_required" | "refused" | "invalid"

export type GeneralLedgerCorpusRuntimeProfileV2 = "primary" | "checking_only"

export type GeneralLedgerCorpusProjectionV2 =
  | "reconciliation"
  | "account_balance"
  | "event_detail"
  | "historical_balance"
  | "empty_range"
  | "august_activity"
  | "single_event"
  | "range_boundary"
  | "historical_trial"
  | "august_close"
  | "confirmation"
  | "failure"

export interface GeneralLedgerCorpusToolCallV2 {
  readonly toolName: string
  readonly capabilityName: string
  readonly arguments: Readonly<Record<string, unknown>>
}

export interface GeneralLedgerCorpusExpectedAttemptV2 {
  readonly name: string
  readonly kind: "read" | "mutation"
  readonly authorization: "not_reached" | "authorized" | "refused"
  readonly outcome: "succeeded" | "failed" | "pending"
  readonly stage: "input" | "authorization" | "confirmation" | "complete"
  readonly confirmation?: "pending"
  readonly errorTag?: string
}

export interface GeneralLedgerCorpusTaskV2 {
  readonly id: string
  readonly version: 2
  readonly fixtureVersion: "sample-kernel-v1"
  readonly prompt: string
  readonly outcomeClass: GeneralLedgerCorpusOutcomeClassV2
  readonly expectedStatus: GeneralLedgerCorpusStatusV2
  readonly expectedResult: Readonly<Record<string, unknown>>
  readonly expectedAttempts: ReadonlyArray<GeneralLedgerCorpusExpectedAttemptV2>
  readonly expectedStateDelta: 0
  readonly runtimeProfile: GeneralLedgerCorpusRuntimeProfileV2
  readonly projection: GeneralLedgerCorpusProjectionV2
  readonly toolScript: ReadonlyArray<GeneralLedgerCorpusToolCallV2>
  readonly program: string
}

const readAttempt = (name: string): GeneralLedgerCorpusExpectedAttemptV2 => ({
  name,
  kind: "read",
  authorization: "authorized",
  outcome: "succeeded",
  stage: "complete",
})

const pendingAttempt = (
  name: "events.post" | "events.reverse",
): GeneralLedgerCorpusExpectedAttemptV2 => ({
  name,
  kind: "mutation",
  authorization: "authorized",
  outcome: "pending",
  stage: "confirmation",
  confirmation: "pending",
})

const inputAttempt = (
  name: string,
  kind: "read" | "mutation",
): GeneralLedgerCorpusExpectedAttemptV2 => ({
  name,
  kind,
  authorization: "not_reached",
  outcome: "failed",
  stage: "input",
  errorTag: "InvalidCapabilityInputError",
})

const refusedAttempt = (
  name: string,
  kind: "read" | "mutation",
  errorTag: "KernelAuthorizationError" | "EventNotFoundError",
): GeneralLedgerCorpusExpectedAttemptV2 => ({
  name,
  kind,
  authorization: "refused",
  outcome: "failed",
  stage: "authorization",
  errorTag,
})

const provenance = (reference: string) => ({
  sourceKind: "agent",
  sourceReference: reference,
  sourceDigest: `sha256:${reference}`,
  correlationId: reference,
  causationId: reference,
})

const expensePostInput = {
  kind: "expense",
  effectiveAt: "2026-07-29T12:00:00.000Z",
  idempotencyKey: "eval-suite-expense-post-v1",
  provenance: provenance("eval-suite-expense-post-v1"),
  postings: [
    { accountId: "acct_groceries", currency: "USD", amountMinor: 725 },
    { accountId: "acct_checking", currency: "USD", amountMinor: -725 },
  ],
}

const reversalInput = {
  eventId: "evt_003",
  idempotencyKey: "eval-suite-reversal-v1",
  provenance: provenance("eval-suite-reversal-v1"),
}

const transferPostInput = {
  kind: "transfer",
  effectiveAt: "2026-08-14T09:30:00.000Z",
  idempotencyKey: "eval-corpus-transfer-post-v2",
  provenance: provenance("eval-corpus-transfer-post-v2"),
  postings: [
    { accountId: "acct_cash", currency: "USD", amountMinor: 2_500 },
    { accountId: "acct_checking", currency: "USD", amountMinor: -2_500 },
  ],
}

const replacementPostInput = {
  kind: "adjustment",
  effectiveAt: "2026-08-11T10:00:00.000Z",
  idempotencyKey: "eval-corpus-replacement-post-v2",
  provenance: provenance("eval-corpus-replacement-post-v2"),
  postings: [
    { accountId: "acct_loan", currency: "USD", amountMinor: 1_750 },
    { accountId: "acct_receivable", currency: "USD", amountMinor: -1_750 },
  ],
  lineage: { replaces: "evt_008" },
}

const unbalancedPostInput = {
  kind: "expense",
  effectiveAt: "2026-08-15T12:00:00.000Z",
  idempotencyKey: "eval-corpus-unbalanced-post-v2",
  provenance: provenance("eval-corpus-unbalanced-post-v2"),
  postings: [
    { accountId: "acct_groceries", currency: "USD", amountMinor: 725 },
    { accountId: "acct_checking", currency: "USD", amountMinor: -700 },
  ],
}

const unknownReversalInput = {
  eventId: "evt_missing",
  idempotencyKey: "eval-corpus-missing-reversal-v2",
  provenance: provenance("eval-corpus-missing-reversal-v2"),
}

const inaccessiblePostInput = {
  kind: "expense",
  effectiveAt: "2026-08-16T12:00:00.000Z",
  idempotencyKey: "eval-corpus-inaccessible-post-v2",
  provenance: provenance("eval-corpus-inaccessible-post-v2"),
  postings: [
    { accountId: "acct_groceries", currency: "USD", amountMinor: 500 },
    { accountId: "acct_checking", currency: "USD", amountMinor: -500 },
  ],
}

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value
  }
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

const task = (value: GeneralLedgerCorpusTaskV2): GeneralLedgerCorpusTaskV2 =>
  deepFreeze({ ...value })

const completedResult = (value: Readonly<Record<string, unknown>>) => value
const pendingResult = (capabilityName: string, idempotencyKey: string) => ({
  status: "confirmation_required",
  capabilityName,
  confirmationId: "confirmation_001",
  idempotencyKey,
})
const invalidResult = () => ({
  status: "invalid",
  code: "invalid_input",
  stage: "input",
})
const refusedResult = (
  code: "authorization_refused" | "resource_unavailable",
) => ({
  status: "refused",
  code,
  stage: "authorization",
})

const confirmationTask = (
  id: string,
  prompt: string,
  toolName: "events_post" | "events_reverse",
  capabilityName: "events.post" | "events.reverse",
  input: Readonly<Record<string, unknown>> & {
    readonly idempotencyKey: string
  },
): GeneralLedgerCorpusTaskV2 =>
  task({
    id,
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt,
    outcomeClass: "confirmation_required",
    expectedStatus: "confirmation_required",
    expectedResult: pendingResult(capabilityName, input.idempotencyKey),
    expectedAttempts: [pendingAttempt(capabilityName)],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "confirmation",
    toolScript: [{ toolName, capabilityName, arguments: input }],
    program: `
      try {
        yield* app.events.${capabilityName === "events.reverse" ? "reverse" : "post"}(${JSON.stringify(input)});
      } catch (error) {
        return { continued: "caught-boundary" };
      }
      return { continued: "after-boundary" };
    `,
  })

export const GENERAL_LEDGER_CORPUS_TASKS_V2 = Object.freeze([
  task({
    id: "general-ledger-reconciliation",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: GENERAL_LEDGER_RECONCILIATION_TASK_V1.prompt,
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: completedResult(
      GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedFacts,
    ),
    expectedAttempts: [
      readAttempt("events.query"),
      readAttempt("reports.activity"),
      readAttempt("reports.trial_balance"),
    ],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "reconciliation",
    toolScript: [
      {
        toolName: "events_query",
        capabilityName: "events.query",
        arguments: GENERAL_LEDGER_RECONCILIATION_TASK_V1.range,
      },
      {
        toolName: "reports_activity",
        capabilityName: "reports.activity",
        arguments: GENERAL_LEDGER_RECONCILIATION_TASK_V1.range,
      },
      {
        toolName: "reports_trial_balance",
        capabilityName: "reports.trial_balance",
        arguments: { at: GENERAL_LEDGER_RECONCILIATION_TASK_V1.range.to },
      },
    ],
    program: RECONCILE_JULY_GENERAL_LEDGER_PROGRAM,
  }),
  task({
    id: "account-balance-snapshot",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Report the August opening readable account and checking balance snapshot.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: {
      accountCount: 10,
      balanceCount: 10,
      checkingBalanceMinor: 52_250,
    },
    expectedAttempts: [
      readAttempt("accounts.list"),
      readAttempt("reports.balance"),
    ],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "account_balance",
    toolScript: [
      {
        toolName: "accounts_list",
        capabilityName: "accounts.list",
        arguments: {},
      },
      {
        toolName: "reports_balance",
        capabilityName: "reports.balance",
        arguments: { at: "2026-08-01T00:00:00.000Z" },
      },
    ],
    program: `
      const accounts = yield* app.accounts.list({});
      const balances = yield* app.reports.balance({ at: "2026-08-01T00:00:00.000Z" });
      const checking = balances.find((item) => item.accountId === "acct_checking");
      return { accountCount: accounts.length, balanceCount: balances.length, checkingBalanceMinor: checking.amountMinor };
    `,
  }),
  task({
    id: "event-detail-selection",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Select the first July event and report its identity and kind.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: {
      julyEventCount: 4,
      eventId: "evt_003",
      eventKind: "expense",
    },
    expectedAttempts: [readAttempt("events.query"), readAttempt("events.get")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "event_detail",
    toolScript: [
      {
        toolName: "events_query",
        capabilityName: "events.query",
        arguments: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-01T00:00:00.000Z",
        },
      },
      {
        toolName: "events_get",
        capabilityName: "events.get",
        arguments: { eventId: "evt_003" },
      },
    ],
    program: `
      const events = yield* app.events.query({ from: "2026-07-01T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" });
      const event = yield* app.events.get({ eventId: events[0].id });
      return { julyEventCount: events.length, eventId: event.id, eventKind: event.kind };
    `,
  }),
  task({
    id: "historical-balance-before-june",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Report the checking and income balances before June 2026.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: {
      checkingBalanceMinor: 50_000,
      incomeBalanceMinor: -50_000,
      nonZeroBalanceCount: 2,
    },
    expectedAttempts: [readAttempt("reports.balance")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "historical_balance",
    toolScript: [
      {
        toolName: "reports_balance",
        capabilityName: "reports.balance",
        arguments: { at: "2026-06-01T00:00:00.000Z" },
      },
    ],
    program: `
      const balances = yield* app.reports.balance({ at: "2026-06-01T00:00:00.000Z" });
      const amount = (id) => balances.find((item) => item.accountId === id).amountMinor;
      return { checkingBalanceMinor: amount("acct_checking"), incomeBalanceMinor: amount("acct_income"), nonZeroBalanceCount: balances.filter((item) => item.amountMinor !== 0).length };
    `,
  }),
  task({
    id: "empty-september-event-range",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Verify that the September 2026 event range is empty.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: { eventCount: 0, eventIds: [] },
    expectedAttempts: [readAttempt("events.query")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "empty_range",
    toolScript: [
      {
        toolName: "events_query",
        capabilityName: "events.query",
        arguments: {
          from: "2026-09-01T00:00:00.000Z",
          to: "2026-10-01T00:00:00.000Z",
        },
      },
    ],
    program: `
      const events = yield* app.events.query({ from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" });
      return { eventCount: events.length, eventIds: events.map((event) => event.id) };
    `,
  }),
  task({
    id: "august-activity-summary",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Summarize August event identity and net expense activity.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: {
      eventCount: 4,
      eventIds: ["evt_007", "evt_008", "evt_009", "evt_010"],
      expenseTotalMinor: -500,
    },
    expectedAttempts: [readAttempt("reports.activity")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "august_activity",
    toolScript: [
      {
        toolName: "reports_activity",
        capabilityName: "reports.activity",
        arguments: {
          from: "2026-08-01T00:00:00.000Z",
          to: "2026-09-01T00:00:00.000Z",
        },
      },
    ],
    program: `
      const activity = yield* app.reports.activity({ from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" });
      return { eventCount: activity.events.length, eventIds: activity.events.map((event) => event.id), expenseTotalMinor: activity.expenseTotalMinor };
    `,
  }),
  task({
    id: "refund-event-detail",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Inspect the August refund event and report its two posting amounts.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: {
      eventId: "evt_007",
      eventKind: "refund",
      checkingAmountMinor: 500,
      groceryAmountMinor: -500,
    },
    expectedAttempts: [readAttempt("events.get")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "single_event",
    toolScript: [
      {
        toolName: "events_get",
        capabilityName: "events.get",
        arguments: { eventId: "evt_007" },
      },
    ],
    program: `
      const event = yield* app.events.get({ eventId: "evt_007" });
      const amount = (id) => event.postings.find((item) => item.accountId === id).amountMinor;
      return { eventId: event.id, eventKind: event.kind, checkingAmountMinor: amount("acct_checking"), groceryAmountMinor: amount("acct_groceries") };
    `,
  }),
  task({
    id: "half-open-event-boundary",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Verify the half-open event range includes its lower boundary and excludes its upper boundary.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: {
      eventCount: 1,
      eventIds: ["evt_003"],
      excludedUpperBoundary: true,
    },
    expectedAttempts: [readAttempt("events.query")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "range_boundary",
    toolScript: [
      {
        toolName: "events_query",
        capabilityName: "events.query",
        arguments: {
          from: "2026-07-01T15:00:00.000Z",
          to: "2026-07-12T18:00:00.000Z",
        },
      },
    ],
    program: `
      const events = yield* app.events.query({ from: "2026-07-01T15:00:00.000Z", to: "2026-07-12T18:00:00.000Z" });
      return { eventCount: events.length, eventIds: events.map((event) => event.id), excludedUpperBoundary: !events.some((event) => event.id === "evt_004") };
    `,
  }),
  task({
    id: "historical-trial-balance",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Report the trial balance immediately before July 2026.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: {
      totalMinor: 0,
      nonZeroBalanceCount: 3,
      checkingBalanceMinor: 70_000,
    },
    expectedAttempts: [readAttempt("reports.trial_balance")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "historical_trial",
    toolScript: [
      {
        toolName: "reports_trial_balance",
        capabilityName: "reports.trial_balance",
        arguments: { at: "2026-07-01T00:00:00.000Z" },
      },
    ],
    program: `
      const trial = yield* app.reports.trialBalance({ at: "2026-07-01T00:00:00.000Z" });
      const checking = trial.balances.find((item) => item.accountId === "acct_checking");
      return { totalMinor: trial.totalMinor, nonZeroBalanceCount: trial.balances.filter((item) => item.amountMinor !== 0).length, checkingBalanceMinor: checking.amountMinor };
    `,
  }),
  task({
    id: "august-close-composition",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Compose the September opening balance, August activity, and trial-balance check.",
    outcomeClass: "successful_read",
    expectedStatus: "completed",
    expectedResult: {
      checkingBalanceMinor: 52_750,
      augustEventCount: 4,
      augustExpenseTotalMinor: -500,
      trialBalanceZero: true,
    },
    expectedAttempts: [
      readAttempt("reports.balance"),
      readAttempt("reports.activity"),
      readAttempt("reports.trial_balance"),
    ],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "august_close",
    toolScript: [
      {
        toolName: "reports_balance",
        capabilityName: "reports.balance",
        arguments: { at: "2026-09-01T00:00:00.000Z" },
      },
      {
        toolName: "reports_activity",
        capabilityName: "reports.activity",
        arguments: {
          from: "2026-08-01T00:00:00.000Z",
          to: "2026-09-01T00:00:00.000Z",
        },
      },
      {
        toolName: "reports_trial_balance",
        capabilityName: "reports.trial_balance",
        arguments: { at: "2026-09-01T00:00:00.000Z" },
      },
    ],
    program: `
      const balances = yield* app.reports.balance({ at: "2026-09-01T00:00:00.000Z" });
      const activity = yield* app.reports.activity({ from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" });
      const trial = yield* app.reports.trialBalance({ at: "2026-09-01T00:00:00.000Z" });
      return { checkingBalanceMinor: balances.find((item) => item.accountId === "acct_checking").amountMinor, augustEventCount: activity.events.length, augustExpenseTotalMinor: activity.expenseTotalMinor, trialBalanceZero: trial.totalMinor === 0 };
    `,
  }),
  confirmationTask(
    "expense-post-confirmation",
    "Prepare a grocery expense and stop for confirmation.",
    "events_post",
    "events.post",
    expensePostInput,
  ),
  confirmationTask(
    "event-reversal-confirmation",
    "Prepare an exact reversal of evt_003 and stop for confirmation.",
    "events_reverse",
    "events.reverse",
    reversalInput,
  ),
  confirmationTask(
    "transfer-post-confirmation",
    "Prepare a cash transfer and stop for confirmation.",
    "events_post",
    "events.post",
    transferPostInput,
  ),
  confirmationTask(
    "replacement-lineage-confirmation",
    "Prepare a lineage-bound replacement and stop for confirmation.",
    "events_post",
    "events.post",
    replacementPostInput,
  ),
  task({
    id: "closed-input-authority-injection",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Reject model-supplied authority fields on a closed account-list input.",
    outcomeClass: "refused_or_invalid",
    expectedStatus: "invalid",
    expectedResult: invalidResult(),
    expectedAttempts: [inputAttempt("accounts.list", "read")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "failure",
    toolScript: [
      {
        toolName: "accounts_list",
        capabilityName: "accounts.list",
        arguments: { actorId: "model-controlled-actor" },
      },
    ],
    program: `return yield* app.accounts.list({ actorId: "model-controlled-actor" });`,
  }),
  task({
    id: "invalid-event-range-timestamp",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Reject a noncanonical event-range timestamp.",
    outcomeClass: "refused_or_invalid",
    expectedStatus: "invalid",
    expectedResult: invalidResult(),
    expectedAttempts: [inputAttempt("events.query", "read")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "failure",
    toolScript: [
      {
        toolName: "events_query",
        capabilityName: "events.query",
        arguments: { from: "2026-07-01t00:00:00.000z" },
      },
    ],
    program: `return yield* app.events.query({ from: "2026-07-01t00:00:00.000z" });`,
  }),
  task({
    id: "inaccessible-event-account",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Refuse event detail when one posting account is not readable.",
    outcomeClass: "refused_or_invalid",
    expectedStatus: "refused",
    expectedResult: refusedResult("authorization_refused"),
    expectedAttempts: [
      refusedAttempt("events.get", "read", "KernelAuthorizationError"),
    ],
    expectedStateDelta: 0,
    runtimeProfile: "checking_only",
    projection: "failure",
    toolScript: [
      {
        toolName: "events_get",
        capabilityName: "events.get",
        arguments: { eventId: "evt_003" },
      },
    ],
    program: `return yield* app.events.get({ eventId: "evt_003" });`,
  }),
  task({
    id: "unbalanced-event-post-input",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Reject an unbalanced posting before confirmation.",
    outcomeClass: "refused_or_invalid",
    expectedStatus: "invalid",
    expectedResult: invalidResult(),
    expectedAttempts: [inputAttempt("events.post", "mutation")],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "failure",
    toolScript: [
      {
        toolName: "events_post",
        capabilityName: "events.post",
        arguments: unbalancedPostInput,
      },
    ],
    program: `return yield* app.events.post(${JSON.stringify(unbalancedPostInput)});`,
  }),
  task({
    id: "unknown-event-reversal",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Refuse reversal of an unknown event without creating confirmation state.",
    outcomeClass: "refused_or_invalid",
    expectedStatus: "refused",
    expectedResult: refusedResult("resource_unavailable"),
    expectedAttempts: [
      refusedAttempt("events.reverse", "mutation", "EventNotFoundError"),
    ],
    expectedStateDelta: 0,
    runtimeProfile: "primary",
    projection: "failure",
    toolScript: [
      {
        toolName: "events_reverse",
        capabilityName: "events.reverse",
        arguments: unknownReversalInput,
      },
    ],
    program: `return yield* app.events.reverse(${JSON.stringify(unknownReversalInput)});`,
  }),
  task({
    id: "inaccessible-post-authorization",
    version: 2,
    fixtureVersion: "sample-kernel-v1",
    prompt: "Refuse a post when trusted account mutation authority is absent.",
    outcomeClass: "refused_or_invalid",
    expectedStatus: "refused",
    expectedResult: refusedResult("authorization_refused"),
    expectedAttempts: [
      refusedAttempt("events.post", "mutation", "KernelAuthorizationError"),
    ],
    expectedStateDelta: 0,
    runtimeProfile: "checking_only",
    projection: "failure",
    toolScript: [
      {
        toolName: "events_post",
        capabilityName: "events.post",
        arguments: inaccessiblePostInput,
      },
    ],
    program: `return yield* app.events.post(${JSON.stringify(inaccessiblePostInput)});`,
  }),
] as const satisfies ReadonlyArray<GeneralLedgerCorpusTaskV2>)

export const GENERAL_LEDGER_CORPUS_TASK_IDS_V2 = Object.freeze(
  GENERAL_LEDGER_CORPUS_TASKS_V2.map((entry) => entry.id),
)

export const GENERAL_LEDGER_CORPUS_OPERATION_ORDER_V2 = Object.freeze([
  "accounts.list",
  "events.get",
  "events.query",
  "reports.balance",
  "reports.activity",
  "reports.trial_balance",
  "events.post",
  "events.reverse",
])
