import { Context, Data, DateTime, Effect, Layer, Ref } from "effect"

import type { LedgerAccount } from "./chart-account.ts"
import type {
  AppendProposalInput,
  EventProposal,
  FinancialEvent,
  PostEventInput,
  Posting,
  ReverseEventInput,
} from "./financial-event.ts"
import type { Currency } from "./money.ts"
import { TrustedSession, type Session } from "./trusted-session.ts"

export type KernelOperation =
  | "events.post"
  | "events.get"
  | "events.query"
  | "events.reverse"
  | "proposals.append"
  | "proposals.query"
  | "reports.balance"
  | "reports.activity"
  | "reports.trial_balance"

export type KernelAuthorizationReason =
  | "ledger_access_denied"
  | "account_read_denied"
  | "account_mutation_denied"

export class KernelAuthorizationError extends Data.TaggedError(
  "KernelAuthorizationError",
)<{
  readonly actorId: string
  readonly operation: KernelOperation
  readonly reason: KernelAuthorizationReason
  readonly ledgerId?: string
  readonly accountId?: string
  readonly eventId?: string
}> {}

export class EventNotFoundError extends Data.TaggedError("EventNotFoundError")<{
  readonly eventId: string
}> {}

export class InsufficientPostingsError extends Data.TaggedError(
  "InsufficientPostingsError",
)<{
  readonly postingCount: number
}> {}

export class UnbalancedEventError extends Data.TaggedError(
  "UnbalancedEventError",
)<{
  readonly sumMinor: number
}> {}

export class UnknownAccountError extends Data.TaggedError("UnknownAccountError")<{
  readonly accountId: string
}> {}

export class CrossLedgerPostingError extends Data.TaggedError(
  "CrossLedgerPostingError",
)<{
  readonly accountId: string
  readonly accountLedgerId: string
  readonly ledgerId: string
}> {}

export class CurrencyMismatchError extends Data.TaggedError(
  "CurrencyMismatchError",
)<{
  readonly expected: Currency
  readonly actual: Currency
  readonly accountId?: string
}> {}

export class DuplicateIdempotencyKeyError extends Data.TaggedError(
  "DuplicateIdempotencyKeyError",
)<{
  readonly ledgerId: string
  readonly idempotencyKey: string
}> {}

export class DuplicateReversalError extends Data.TaggedError(
  "DuplicateReversalError",
)<{
  readonly eventId: string
}> {}

export class MissingLineageTargetError extends Data.TaggedError(
  "MissingLineageTargetError",
)<{
  readonly eventId: string
}> {}

export type KernelAppendError =
  | KernelAuthorizationError
  | InsufficientPostingsError
  | UnbalancedEventError
  | UnknownAccountError
  | CrossLedgerPostingError
  | CurrencyMismatchError
  | DuplicateIdempotencyKeyError
  | DuplicateReversalError
  | MissingLineageTargetError
  | EventNotFoundError

export type KernelReadError = KernelAuthorizationError | EventNotFoundError

export interface AccountBalance {
  readonly accountId: string
  readonly amountMinor: number
}

export interface ActivityReport {
  readonly from: DateTime.Utc
  readonly to: DateTime.Utc
  readonly events: ReadonlyArray<FinancialEvent>
  readonly expenseTotalMinor: number
}

export interface TrialBalance {
  readonly at: DateTime.Utc
  readonly balances: ReadonlyArray<AccountBalance>
  readonly totalMinor: number
}

export interface LedgerKernelService {
  readonly appendProposal: (
    input: AppendProposalInput,
  ) => Effect.Effect<EventProposal, KernelAppendError>
  readonly queryProposals: () => Effect.Effect<
    ReadonlyArray<EventProposal>,
    KernelAuthorizationError
  >
  readonly postEvent: (
    input: PostEventInput,
  ) => Effect.Effect<FinancialEvent, KernelAppendError>
  readonly getEvent: (
    eventId: string,
  ) => Effect.Effect<FinancialEvent, KernelReadError>
  readonly queryEvents: (input?: {
    readonly from?: DateTime.Utc
    readonly to?: DateTime.Utc
  }) => Effect.Effect<ReadonlyArray<FinancialEvent>, KernelAuthorizationError>
  readonly reverseEvent: (
    input: ReverseEventInput,
  ) => Effect.Effect<FinancialEvent, KernelAppendError>
  readonly balancesAt: (
    at: DateTime.Utc,
  ) => Effect.Effect<ReadonlyArray<AccountBalance>, KernelAuthorizationError>
  readonly activityForRange: (
    from: DateTime.Utc,
    to: DateTime.Utc,
  ) => Effect.Effect<ActivityReport, KernelAuthorizationError>
  readonly trialBalanceAt: (
    at: DateTime.Utc,
  ) => Effect.Effect<TrialBalance, KernelAuthorizationError>
}

export const LedgerKernel = Context.Service<LedgerKernelService>(
  "@bound/ledger/LedgerKernel",
)

interface KernelState {
  readonly events: ReadonlyArray<FinancialEvent>
  readonly proposals: ReadonlyArray<EventProposal>
  readonly nextEventSeq: number
  readonly nextProposalSeq: number
}

const formatSeq = (prefix: string, seq: number) =>
  `${prefix}${String(seq).padStart(3, "0")}`

const nextSeq = (ids: ReadonlyArray<string>, prefix: string) => {
  let max = 0

  for (const id of ids) {
    if (!id.startsWith(prefix)) {
      continue
    }

    const parsed = Number(id.slice(prefix.length))

    if (Number.isSafeInteger(parsed) && parsed > max) {
      max = parsed
    }
  }

  return max + 1
}

const instantMillis = (instant: DateTime.Utc) => DateTime.toEpochMillis(instant)

const inHalfOpenRange = (
  instant: DateTime.Utc,
  from: DateTime.Utc | undefined,
  to: DateTime.Utc | undefined,
) => {
  const millis = instantMillis(instant)

  return (
    (from === undefined || millis >= instantMillis(from)) &&
    (to === undefined || millis < instantMillis(to))
  )
}

const copyPosting = (posting: Posting, amountMinor: number): Posting =>
  posting.description === undefined
    ? {
        accountId: posting.accountId,
        currency: posting.currency,
        amountMinor,
      }
    : {
        accountId: posting.accountId,
        currency: posting.currency,
        amountMinor,
        description: posting.description,
      }

export const makeInMemoryLedgerKernelLayer = (options: {
  readonly currency: Currency
  readonly accounts: ReadonlyArray<LedgerAccount>
  readonly events?: ReadonlyArray<FinancialEvent>
  readonly proposals?: ReadonlyArray<EventProposal>
}): Layer.Layer<LedgerKernelService, never, Session> =>
  Layer.effect(LedgerKernel)(
    Effect.gen(function* () {
      const session = yield* TrustedSession
      const accountsById = new Map(
        options.accounts.map((account) => [account.id, account] as const),
      )
      const seededEvents = options.events ?? []
      const seededProposals = options.proposals ?? []
      const state = yield* Ref.make<KernelState>({
        events: seededEvents,
        proposals: seededProposals,
        nextEventSeq: nextSeq(
          seededEvents.map((event) => event.id),
          "evt_",
        ),
        nextProposalSeq: nextSeq(
          seededProposals.map((proposal) => proposal.id),
          "prop_",
        ),
      })

      const authorizationError = (
        operation: KernelOperation,
        reason: KernelAuthorizationReason,
        extras: {
          readonly ledgerId?: string
          readonly accountId?: string
          readonly eventId?: string
        } = {},
      ) =>
        new KernelAuthorizationError({
          actorId: session.actorId,
          operation,
          reason,
          ...extras,
        })

      const requireActiveLedger = (
        operation: KernelOperation,
      ): Effect.Effect<string, KernelAuthorizationError> => {
        const ledgerId = session.activeLedgerId

        if (ledgerId === undefined) {
          return Effect.fail(
            authorizationError(operation, "ledger_access_denied"),
          )
        }

        return Effect.succeed(ledgerId)
      }

      const postingAccounts = (postings: ReadonlyArray<Posting>) =>
        postings.map((posting) => posting.accountId)

      const allAccountsReadable = (accountIds: ReadonlyArray<string>) =>
        accountIds.every((accountId) => session.readableAccountIds.has(accountId))

      const visibleEvent = (event: FinancialEvent, ledgerId: string) =>
        event.ledgerId === ledgerId &&
        allAccountsReadable(postingAccounts(event.postings))

      const visibleProposal = (proposal: EventProposal, ledgerId: string) =>
        proposal.ledgerId === ledgerId &&
        allAccountsReadable(postingAccounts(proposal.postings))

      const validatePostings = (
        postings: ReadonlyArray<Posting>,
        operation: KernelOperation,
        ledgerId: string,
        access: "read" | "mutate",
      ): Effect.Effect<void, KernelAppendError> =>
        Effect.gen(function* () {
          if (postings.length < 2) {
            return yield* new InsufficientPostingsError({
              postingCount: postings.length,
            })
          }

          let sumMinor = 0

          for (const posting of postings) {
            if (posting.currency !== options.currency) {
              return yield* new CurrencyMismatchError({
                expected: options.currency,
                actual: posting.currency,
                accountId: posting.accountId,
              })
            }

            const account = accountsById.get(posting.accountId)

            if (account === undefined) {
              return yield* new UnknownAccountError({
                accountId: posting.accountId,
              })
            }

            if (account.ledgerId !== ledgerId) {
              return yield* new CrossLedgerPostingError({
                accountId: account.id,
                accountLedgerId: account.ledgerId,
                ledgerId,
              })
            }

            if (account.currency !== options.currency) {
              return yield* new CurrencyMismatchError({
                expected: options.currency,
                actual: account.currency,
                accountId: account.id,
              })
            }

            if (!session.readableAccountIds.has(account.id)) {
              return yield* authorizationError(
                operation,
                "account_read_denied",
                { ledgerId, accountId: account.id },
              )
            }

            if (access === "mutate" && !session.mutableAccountIds.has(account.id)) {
              return yield* authorizationError(
                operation,
                "account_mutation_denied",
                { ledgerId, accountId: account.id },
              )
            }

            sumMinor += posting.amountMinor
          }

          if (access === "mutate" && sumMinor !== 0) {
            return yield* new UnbalancedEventError({ sumMinor })
          }
        })

      const findDuplicateKey = (
        events: ReadonlyArray<FinancialEvent>,
        ledgerId: string,
        idempotencyKey: string,
      ) =>
        events.find(
          (event) =>
            event.ledgerId === ledgerId && event.idempotencyKey === idempotencyKey,
        )

      const balancesFromEvents = (
        events: ReadonlyArray<FinancialEvent>,
        ledgerId: string,
        at: DateTime.Utc,
      ) => {
        const amounts = new Map<string, number>()

        for (const account of options.accounts) {
          if (
            account.ledgerId === ledgerId &&
            session.readableAccountIds.has(account.id)
          ) {
            amounts.set(account.id, 0)
          }
        }

        for (const event of events) {
          if (!visibleEvent(event, ledgerId)) {
            continue
          }

          if (instantMillis(event.effectiveAt) >= instantMillis(at)) {
            continue
          }

          for (const posting of event.postings) {
            amounts.set(
              posting.accountId,
              (amounts.get(posting.accountId) ?? 0) + posting.amountMinor,
            )
          }
        }

        return [...amounts.entries()].map(([accountId, amountMinor]) => ({
          accountId,
          amountMinor,
        }))
      }

      const expenseTotal = (events: ReadonlyArray<FinancialEvent>) => {
        let total = 0

        for (const event of events) {
          for (const posting of event.postings) {
            const account = accountsById.get(posting.accountId)

            if (account?.class === "expense") {
              total += posting.amountMinor
            }
          }
        }

        return total
      }

      return {
        appendProposal: Effect.fn("LedgerKernel.appendProposal")(function* (
          input: AppendProposalInput,
        ) {
          const ledgerId = yield* requireActiveLedger("proposals.append")
          yield* validatePostings(
            input.postings,
            "proposals.append",
            ledgerId,
            "read",
          )
          const recordedAt = yield* DateTime.now
          const proposal = yield* Ref.modify(state, (current) => {
            const proposal: EventProposal = {
              id: formatSeq("prop_", current.nextProposalSeq),
              ledgerId,
              kind: input.kind,
              effectiveAt: input.effectiveAt,
              recordedAt,
              actorId: session.actorId,
              provenance: input.provenance,
              postings: input.postings,
              assumptions: input.assumptions,
            }

            return [
              proposal,
              {
                ...current,
                proposals: [...current.proposals, proposal],
                nextProposalSeq: current.nextProposalSeq + 1,
              },
            ]
          })

          return proposal
        }),
        queryProposals: Effect.fn("LedgerKernel.queryProposals")(function* () {
          const ledgerId = yield* requireActiveLedger("proposals.query")
          const current = yield* Ref.get(state)

          return current.proposals.filter((proposal) =>
            visibleProposal(proposal, ledgerId),
          )
        }),
        postEvent: Effect.fn("LedgerKernel.postEvent")(function* (
          input: PostEventInput,
        ) {
          const ledgerId = yield* requireActiveLedger("events.post")
          yield* validatePostings(
            input.postings,
            "events.post",
            ledgerId,
            "mutate",
          )
          const recordedAt = yield* DateTime.now
          const current = yield* Ref.get(state)

          if (
            findDuplicateKey(current.events, ledgerId, input.idempotencyKey)
          ) {
            return yield* new DuplicateIdempotencyKeyError({
              ledgerId,
              idempotencyKey: input.idempotencyKey,
            })
          }

          const targetId = input.lineage?.replaces ?? input.lineage?.reverses

          if (targetId !== undefined) {
            const target = current.events.find(
              (event) => event.id === targetId && event.ledgerId === ledgerId,
            )

            if (target === undefined) {
              return yield* new MissingLineageTargetError({ eventId: targetId })
            }
          }

          const baseEvent = {
            id: formatSeq("evt_", current.nextEventSeq),
            ledgerId,
            kind: input.kind,
            effectiveAt: input.effectiveAt,
            recordedAt,
            actorId: session.actorId,
            idempotencyKey: input.idempotencyKey,
            provenance: input.provenance,
            postings: input.postings,
          }
          const event: FinancialEvent =
            input.lineage === undefined
              ? baseEvent
              : { ...baseEvent, lineage: input.lineage }

          yield* Ref.set(state, {
            ...current,
            events: [...current.events, event],
            nextEventSeq: current.nextEventSeq + 1,
          })

          return event
        }),
        getEvent: Effect.fn("LedgerKernel.getEvent")(function* (eventId: string) {
          const ledgerId = yield* requireActiveLedger("events.get")
          const current = yield* Ref.get(state)
          const event = current.events.find((candidate) => candidate.id === eventId)

          if (event === undefined || event.ledgerId !== ledgerId) {
            return yield* new EventNotFoundError({ eventId })
          }

          if (!allAccountsReadable(postingAccounts(event.postings))) {
            const denied = postingAccounts(event.postings).find(
              (accountId) => !session.readableAccountIds.has(accountId),
            )

            if (denied !== undefined) {
              return yield* authorizationError(
                "events.get",
                "account_read_denied",
                {
                  ledgerId,
                  accountId: denied,
                  eventId,
                },
              )
            }
          }

          return event
        }),
        queryEvents: Effect.fn("LedgerKernel.queryEvents")(function* (input?: {
          readonly from?: DateTime.Utc
          readonly to?: DateTime.Utc
        }) {
          const ledgerId = yield* requireActiveLedger("events.query")
          const current = yield* Ref.get(state)

          return current.events.filter(
            (event) =>
              visibleEvent(event, ledgerId) &&
              inHalfOpenRange(event.effectiveAt, input?.from, input?.to),
          )
        }),
        reverseEvent: Effect.fn("LedgerKernel.reverseEvent")(function* (
          input: ReverseEventInput,
        ) {
          const ledgerId = yield* requireActiveLedger("events.reverse")
          const recordedAt = yield* DateTime.now
          const current = yield* Ref.get(state)
          const original = current.events.find(
            (event) => event.id === input.eventId,
          )

          if (original === undefined || original.ledgerId !== ledgerId) {
            return yield* new EventNotFoundError({ eventId: input.eventId })
          }

          if (
            current.events.some(
              (event) => event.lineage?.reverses === original.id,
            )
          ) {
            return yield* new DuplicateReversalError({ eventId: original.id })
          }

          if (
            findDuplicateKey(current.events, ledgerId, input.idempotencyKey)
          ) {
            return yield* new DuplicateIdempotencyKeyError({
              ledgerId,
              idempotencyKey: input.idempotencyKey,
            })
          }

          const denied = postingAccounts(original.postings).find(
            (accountId) => !session.mutableAccountIds.has(accountId),
          )

          if (denied !== undefined) {
            const reason = session.readableAccountIds.has(denied)
              ? "account_mutation_denied"
              : "account_read_denied"

            return yield* authorizationError("events.reverse", reason, {
              ledgerId,
              accountId: denied,
              eventId: original.id,
            })
          }

          const event: FinancialEvent = {
            id: formatSeq("evt_", current.nextEventSeq),
            ledgerId,
            kind: original.kind,
            effectiveAt: original.effectiveAt,
            recordedAt,
            actorId: session.actorId,
            idempotencyKey: input.idempotencyKey,
            provenance: input.provenance,
            postings: original.postings.map((item) =>
              copyPosting(item, -item.amountMinor),
            ),
            lineage: { reverses: original.id },
          }

          yield* Ref.set(state, {
            ...current,
            events: [...current.events, event],
            nextEventSeq: current.nextEventSeq + 1,
          })

          return event
        }),
        balancesAt: Effect.fn("LedgerKernel.balancesAt")(function* (
          at: DateTime.Utc,
        ) {
          const ledgerId = yield* requireActiveLedger("reports.balance")
          const current = yield* Ref.get(state)

          return balancesFromEvents(current.events, ledgerId, at)
        }),
        activityForRange: Effect.fn("LedgerKernel.activityForRange")(function* (
          from: DateTime.Utc,
          to: DateTime.Utc,
        ) {
          const ledgerId = yield* requireActiveLedger("reports.activity")
          const current = yield* Ref.get(state)
          const events = current.events.filter(
            (event) =>
              visibleEvent(event, ledgerId) &&
              inHalfOpenRange(event.effectiveAt, from, to),
          )

          return {
            from,
            to,
            events,
            expenseTotalMinor: expenseTotal(events),
          }
        }),
        trialBalanceAt: Effect.fn("LedgerKernel.trialBalanceAt")(function* (
          at: DateTime.Utc,
        ) {
          const ledgerId = yield* requireActiveLedger("reports.trial_balance")
          const current = yield* Ref.get(state)
          const balances = balancesFromEvents(current.events, ledgerId, at)

          return {
            at,
            balances,
            totalMinor: balances.reduce(
              (total, balance) => total + balance.amountMinor,
              0,
            ),
          }
        }),
      }
    }),
  )
