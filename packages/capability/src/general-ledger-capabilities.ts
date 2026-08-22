import { Effect, Schema } from "effect"

import {
  AccountBalanceListSchema,
  ActivityReportSchema,
  EventProposalListSchema,
  FinancialEventListSchema,
  FinancialEventSchema,
  KernelAuthorizationError,
  LedgerAccountListSchema,
  PostEventInputSchema,
  ReverseEventInputSchema,
  TrialBalanceSchema,
  type KernelOperation,
  type Posting,
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

export const QueryProposalsInputSchema = Schema.Record(
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
export type QueryProposalsInput = Schema.Schema.Type<
  typeof QueryProposalsInputSchema
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

const authorizeMutableAccounts = (
  operation: "events.post" | "events.reverse",
  postings: ReadonlyArray<Posting>,
  runtime: CapabilityRuntime,
) =>
  Effect.gen(function* () {
    const ledgerId = runtime.session.activeLedgerId

    if (ledgerId === undefined) {
      return yield* new KernelAuthorizationError({
        actorId: runtime.session.actorId,
        operation,
        reason: "ledger_access_denied",
      })
    }

    for (const posting of postings) {
      if (!runtime.session.readableAccountIds.has(posting.accountId)) {
        return yield* new KernelAuthorizationError({
          actorId: runtime.session.actorId,
          operation,
          reason: "account_read_denied",
          ledgerId,
          accountId: posting.accountId,
        })
      }

      if (!runtime.session.mutableAccountIds.has(posting.accountId)) {
        return yield* new KernelAuthorizationError({
          actorId: runtime.session.actorId,
          operation,
          reason: "account_mutation_denied",
          ledgerId,
          accountId: posting.accountId,
        })
      }
    }
  })

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
      description:
        "Return account balances and their signed total before an instant",
      kind: "read",
      input: TrialBalanceReportInputSchema,
      output: TrialBalanceSchema,
      authorize: (_input, runtime) =>
        authorizeActiveLedger("reports.trial_balance", runtime),
      execute: (input, { kernel }) => kernel.trialBalanceAt(input.at),
    }),
  ])

export const generalLedgerMutationCapabilities: ReadonlyArray<CapabilityDefinition> =
  Object.freeze([
    defineCapability({
      name: "events.post",
      description: "Post one approved balanced financial event",
      kind: "mutation",
      agentAccess: "confirmation_required",
      input: PostEventInputSchema,
      output: Schema.toType(FinancialEventSchema),
      authorize: (input, runtime) =>
        authorizeMutableAccounts("events.post", input.postings, runtime),
      execute: (input, { kernel }) => kernel.postEvent(input),
    }),
    defineCapability({
      name: "events.reverse",
      description: "Append an approved exact reversal of one posted event",
      kind: "mutation",
      agentAccess: "confirmation_required",
      input: ReverseEventInputSchema,
      output: Schema.toType(FinancialEventSchema),
      authorize: (input, runtime) =>
        Effect.gen(function* () {
          const event = yield* runtime.kernel.getEvent(input.eventId)
          yield* authorizeMutableAccounts(
            "events.reverse",
            event.postings,
            runtime,
          )
        }),
      execute: (input, { kernel }) => kernel.reverseEvent(input),
    }),
  ])

export const proposalReadCapabilities: ReadonlyArray<CapabilityDefinition> =
  Object.freeze([
    defineCapability({
      name: "proposals.query",
      description: "List readable unposted proposals in the active ledger",
      kind: "read",
      input: QueryProposalsInputSchema,
      output: Schema.toType(EventProposalListSchema),
      authorize: (_input, runtime) =>
        authorizeActiveLedger("proposals.query", runtime),
      execute: (_input, { kernel }) => kernel.queryProposals(),
    }),
  ])

export const generalLedgerCapabilities: ReadonlyArray<CapabilityDefinition> =
  Object.freeze([
    ...generalLedgerReadCapabilities,
    ...generalLedgerMutationCapabilities,
  ])

export const personalLedgerCapabilities: ReadonlyArray<CapabilityDefinition> =
  Object.freeze([...generalLedgerCapabilities, ...proposalReadCapabilities])
