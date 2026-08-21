import { Effect, Schema } from "effect"

import {
  AccountBalanceListSchema,
  ActivityReportSchema,
  FinancialEventListSchema,
  FinancialEventSchema,
  KernelAuthorizationError,
  LedgerAccountListSchema,
  TrialBalanceSchema,
  type KernelOperation,
} from "@bound/ledger"

import {
  defineCapability,
  type CapabilityDefinition,
  type CapabilityRuntime,
} from "./capability.ts"

export const ListAccountsInputSchema = Schema.Record(
  Schema.String,
  Schema.Never,
)

export const GetEventInputSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
})

export const QueryEventsInputSchema = Schema.Struct({
  from: Schema.optionalKey(Schema.DateTimeUtcFromString),
  to: Schema.optionalKey(Schema.DateTimeUtcFromString),
})

export const BalanceReportInputSchema = Schema.Struct({
  at: Schema.DateTimeUtcFromString,
})

export const ActivityReportInputSchema = Schema.Struct({
  from: Schema.DateTimeUtcFromString,
  to: Schema.DateTimeUtcFromString,
})

export const TrialBalanceReportInputSchema = Schema.Struct({
  at: Schema.DateTimeUtcFromString,
})

export type ListAccountsInput = Schema.Schema.Type<
  typeof ListAccountsInputSchema
>
export type GetEventInput = Schema.Schema.Type<typeof GetEventInputSchema>
export type QueryEventsInput = Schema.Schema.Type<typeof QueryEventsInputSchema>
export type BalanceReportInput = Schema.Schema.Type<
  typeof BalanceReportInputSchema
>
export type ActivityReportInput = Schema.Schema.Type<
  typeof ActivityReportInputSchema
>
export type TrialBalanceReportInput = Schema.Schema.Type<
  typeof TrialBalanceReportInputSchema
>

const authorizeActiveLedger = (
  operation: KernelOperation,
  runtime: CapabilityRuntime,
) =>
  runtime.session.activeLedgerId === undefined
    ? Effect.fail(
        new KernelAuthorizationError({
          actorId: runtime.session.actorId,
          operation,
          reason: "ledger_access_denied",
        }),
      )
    : Effect.void

export const generalLedgerReadCapabilities: ReadonlyArray<CapabilityDefinition> =
  Object.freeze([
    defineCapability({
      name: "accounts.list",
      description: "List readable accounts in the active ledger",
      kind: "read",
      input: ListAccountsInputSchema,
      output: LedgerAccountListSchema,
      authorize: (_input, runtime) =>
        authorizeActiveLedger("accounts.list", runtime),
      execute: (_input, { kernel }) => kernel.listAccounts(),
    }),
    defineCapability({
      name: "events.get",
      description: "Get one readable posted financial event by ID",
      kind: "read",
      input: GetEventInputSchema,
      output: Schema.toType(FinancialEventSchema),
      authorize: (input, { kernel }) =>
        kernel.getEvent(input.eventId).pipe(Effect.asVoid),
      execute: (input, { kernel }) => kernel.getEvent(input.eventId),
    }),
    defineCapability({
      name: "events.query",
      description:
        "Query readable posted events in an optional half-open effective-time range",
      kind: "read",
      input: QueryEventsInputSchema,
      output: Schema.toType(FinancialEventListSchema),
      authorize: (_input, runtime) =>
        authorizeActiveLedger("events.query", runtime),
      execute: (input, { kernel }) => kernel.queryEvents(input),
    }),
    defineCapability({
      name: "reports.balance",
      description: "Return debit-positive account balances before an instant",
      kind: "read",
      input: BalanceReportInputSchema,
      output: AccountBalanceListSchema,
      authorize: (_input, runtime) =>
        authorizeActiveLedger("reports.balance", runtime),
      execute: (input, { kernel }) => kernel.balancesAt(input.at),
    }),
    defineCapability({
      name: "reports.activity",
      description:
        "Return posted activity and net expense debits for a half-open time range",
      kind: "read",
      input: ActivityReportInputSchema,
      output: ActivityReportSchema,
      authorize: (_input, runtime) =>
        authorizeActiveLedger("reports.activity", runtime),
      execute: (input, { kernel }) =>
        kernel.activityForRange(input.from, input.to),
    }),
    defineCapability({
      name: "reports.trial_balance",
      description: "Return account balances and their signed total before an instant",
      kind: "read",
      input: TrialBalanceReportInputSchema,
      output: TrialBalanceSchema,
      authorize: (_input, runtime) =>
        authorizeActiveLedger("reports.trial_balance", runtime),
      execute: (input, { kernel }) => kernel.trialBalanceAt(input.at),
    }),
  ])
