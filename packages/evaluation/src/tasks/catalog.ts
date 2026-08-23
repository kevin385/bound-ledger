import { RECONCILE_JULY_GENERAL_LEDGER_PROGRAM } from "@bound/code-mode"

import { GENERAL_LEDGER_RECONCILIATION_TASK_V1 } from "../task.ts"

export type GeneralLedgerSuiteTaskKind =
  "reconciliation" | "account_balance" | "event_detail" | "confirmation"

export interface GeneralLedgerSuiteToolCall {
  readonly toolName: string
  readonly arguments: Readonly<Record<string, unknown>>
}

export interface GeneralLedgerSuiteExpectedAttempt {
  readonly name: string
  readonly kind: "read" | "mutation"
  readonly authorization: "authorized"
  readonly outcome: "succeeded" | "pending"
  readonly stage: "complete" | "confirmation"
  readonly confirmation?: "pending"
}

export interface GeneralLedgerSuiteTask {
  readonly id: string
  readonly version: 1
  readonly fixtureVersion: "sample-kernel-v1"
  readonly prompt: string
  readonly expectedAnswer: string
  readonly expectedResult: Readonly<Record<string, unknown>>
  readonly kind: GeneralLedgerSuiteTaskKind
  readonly expectedOutcome: "completed" | "confirmation_required"
  readonly toolCalls: ReadonlyArray<GeneralLedgerSuiteToolCall>
  readonly expectedAttempts: ReadonlyArray<GeneralLedgerSuiteExpectedAttempt>
  readonly program: string
}

const readAttempt = (name: string): GeneralLedgerSuiteExpectedAttempt => ({
  name,
  kind: "read",
  authorization: "authorized",
  outcome: "succeeded",
  stage: "complete",
})

const pendingAttempt = (
  name: "events.post" | "events.reverse",
): GeneralLedgerSuiteExpectedAttempt => ({
  name,
  kind: "mutation",
  authorization: "authorized",
  outcome: "pending",
  stage: "confirmation",
  confirmation: "pending",
})

const agentProvenance = (reference: string) => ({
  sourceKind: "agent",
  sourceReference: reference,
  sourceDigest: `sha256:${reference}`,
  correlationId: reference,
  causationId: reference,
})

const expensePostInput = Object.freeze({
  kind: "expense",
  effectiveAt: "2026-07-29T12:00:00.000Z",
  idempotencyKey: "eval-suite-expense-post-v1",
  provenance: Object.freeze(agentProvenance("eval-suite-expense-post-v1")),
  postings: Object.freeze([
    Object.freeze({
      accountId: "acct_groceries",
      currency: "USD",
      amountMinor: 725,
    }),
    Object.freeze({
      accountId: "acct_checking",
      currency: "USD",
      amountMinor: -725,
    }),
  ]),
})

const reversalInput = Object.freeze({
  eventId: "evt_003",
  idempotencyKey: "eval-suite-reversal-v1",
  provenance: Object.freeze(agentProvenance("eval-suite-reversal-v1")),
})

const deepFreeze = <Value>(value: Value): Value => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value
  }
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

const task = (value: GeneralLedgerSuiteTask): GeneralLedgerSuiteTask =>
  deepFreeze({ ...value })

export const GENERAL_LEDGER_SUITE_TASKS_V1 = Object.freeze([
  task({
    id: GENERAL_LEDGER_RECONCILIATION_TASK_V1.id,
    version: GENERAL_LEDGER_RECONCILIATION_TASK_V1.version,
    fixtureVersion: GENERAL_LEDGER_RECONCILIATION_TASK_V1.fixtureVersion,
    prompt: GENERAL_LEDGER_RECONCILIATION_TASK_V1.prompt,
    expectedAnswer: GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedAnswer,
    expectedResult: GENERAL_LEDGER_RECONCILIATION_TASK_V1.expectedFacts,
    kind: "reconciliation",
    expectedOutcome: "completed",
    toolCalls: [
      {
        toolName: "events_query",
        arguments: GENERAL_LEDGER_RECONCILIATION_TASK_V1.range,
      },
      {
        toolName: "reports_activity",
        arguments: GENERAL_LEDGER_RECONCILIATION_TASK_V1.range,
      },
      {
        toolName: "reports_trial_balance",
        arguments: { at: GENERAL_LEDGER_RECONCILIATION_TASK_V1.range.to },
      },
    ],
    expectedAttempts: [
      readAttempt("events.query"),
      readAttempt("reports.activity"),
      readAttempt("reports.trial_balance"),
    ],
    program: RECONCILE_JULY_GENERAL_LEDGER_PROGRAM,
  }),
  task({
    id: "account-balance-snapshot",
    version: 1,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "At the start of August 2026, report the readable account count, balance count, and checking balance in minor units.",
    expectedAnswer:
      "August opening snapshot: 10 readable accounts, 10 balances, checking balance 52250 minor units.",
    expectedResult: {
      accountCount: 10,
      balanceCount: 10,
      checkingBalanceMinor: 52_250,
    },
    kind: "account_balance",
    expectedOutcome: "completed",
    toolCalls: [
      { toolName: "accounts_list", arguments: {} },
      {
        toolName: "reports_balance",
        arguments: { at: "2026-08-01T00:00:00.000Z" },
      },
    ],
    expectedAttempts: [
      readAttempt("accounts.list"),
      readAttempt("reports.balance"),
    ],
    program: `
      const accounts = yield* app.accounts.list({});
      const balances = yield* app.reports.balance({
        at: "2026-08-01T00:00:00.000Z",
      });
      const checking = balances.find(
        (balance) => balance.accountId === "acct_checking",
      );
      return {
        accountCount: accounts.length,
        balanceCount: balances.length,
        checkingBalanceMinor: checking.amountMinor,
      };
    `,
  }),
  task({
    id: "event-detail-selection",
    version: 1,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Find the first July 2026 event and report the July event count, selected event ID, and event kind.",
    expectedAnswer:
      "July selection: 4 events; first event evt_003 is an expense.",
    expectedResult: {
      julyEventCount: 4,
      eventId: "evt_003",
      eventKind: "expense",
    },
    kind: "event_detail",
    expectedOutcome: "completed",
    toolCalls: [
      {
        toolName: "events_query",
        arguments: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-01T00:00:00.000Z",
        },
      },
      { toolName: "events_get", arguments: { eventId: "evt_003" } },
    ],
    expectedAttempts: [readAttempt("events.query"), readAttempt("events.get")],
    program: `
      const events = yield* app.events.query({
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z",
      });
      const event = yield* app.events.get({ eventId: events[0].id });
      return {
        julyEventCount: events.length,
        eventId: event.id,
        eventKind: event.kind,
      };
    `,
  }),
  task({
    id: "expense-post-confirmation",
    version: 1,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Prepare a 725 minor-unit grocery expense from checking and stop for trusted confirmation.",
    expectedAnswer:
      "Expense post is pending trusted confirmation and no event was appended.",
    expectedResult: {
      status: "confirmation_required",
      capabilityName: "events.post",
      confirmationId: "confirmation_001",
      idempotencyKey: expensePostInput.idempotencyKey,
    },
    kind: "confirmation",
    expectedOutcome: "confirmation_required",
    toolCalls: [{ toolName: "events_post", arguments: expensePostInput }],
    expectedAttempts: [pendingAttempt("events.post")],
    program: `
      try {
        yield* app.events.post(${JSON.stringify(expensePostInput)});
      } catch (error) {
        return { continued: "caught-pending-post" };
      }
      return { continued: "after-pending-post" };
    `,
  }),
  task({
    id: "event-reversal-confirmation",
    version: 1,
    fixtureVersion: "sample-kernel-v1",
    prompt:
      "Prepare an exact reversal of event evt_003 and stop for trusted confirmation.",
    expectedAnswer:
      "Event evt_003 reversal is pending trusted confirmation and no reversal was appended.",
    expectedResult: {
      status: "confirmation_required",
      capabilityName: "events.reverse",
      confirmationId: "confirmation_001",
      idempotencyKey: reversalInput.idempotencyKey,
    },
    kind: "confirmation",
    expectedOutcome: "confirmation_required",
    toolCalls: [{ toolName: "events_reverse", arguments: reversalInput }],
    expectedAttempts: [pendingAttempt("events.reverse")],
    program: `
      try {
        yield* app.events.reverse(${JSON.stringify(reversalInput)});
      } catch (error) {
        return { continued: "caught-pending-reversal" };
      }
      return { continued: "after-pending-reversal" };
    `,
  }),
] as const satisfies ReadonlyArray<GeneralLedgerSuiteTask>)

export const GENERAL_LEDGER_SUITE_TASK_IDS_V1 = Object.freeze(
  GENERAL_LEDGER_SUITE_TASKS_V1.map((entry) => entry.id),
)
