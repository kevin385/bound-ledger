import { DateTime, Effect, Layer, ManagedRuntime } from "effect"

import {
  CapabilityGateway,
  ConfirmationRequiredError,
  InvalidCapabilityInputError,
  UnknownConfirmationError,
  makeCapabilityGatewayLayer,
  personalLedgerCapabilities,
  type CapabilityAttempt,
  type CapabilityGatewayService,
  type ConfirmationRequest,
} from "@bound/capability"
import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  decodeKernelFixture,
  makeInMemoryLedgerKernelLayer,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleKernelFixture,
  sampleTransactionsFixture,
  type EventProposal,
  type FinancialEvent,
  type LedgerAccount,
  type Provenance,
  type Session,
} from "@bound/ledger"

import type {
  AccountView,
  ApplicationErrorCode,
  AttemptView,
  ConfirmationView,
  DashboardInput,
  DashboardView,
  EventView,
  JsonValue,
  MutationResult,
  ProposalView,
  QueryEventsInput,
  RequestExpenseInput,
  RequestReversalInput,
} from "./contracts"

const primaryAccountIds = [
  "acct_checking",
  "acct_cash",
  "acct_receivable",
  "acct_investment",
  "acct_credit",
  "acct_loan",
  "acct_equity",
  "acct_income",
  "acct_groceries",
  "acct_utilities",
] as const

const session: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  activeLedgerId: "ledger_primary",
  readableAccountIds: new Set(primaryAccountIds),
  mutableAccountIds: new Set(primaryAccountIds),
}

export class LedgerApplicationError extends Error {
  readonly code: ApplicationErrorCode

  constructor(code: ApplicationErrorCode) {
    super(code)
    this.name = "LedgerApplicationError"
    this.code = code
  }
}

interface Generation {
  readonly runtime: ManagedRuntime.ManagedRuntime<
    CapabilityGatewayService,
    unknown
  >
}

const createGeneration = async (): Promise<Generation> => {
  const [transactions, legacyAccounts, fixture] = await Effect.runPromise(
    Effect.all([
      decodeFixtureTransactions(sampleTransactionsFixture),
      decodeFixtureAccounts(sampleAccountsFixture),
      decodeKernelFixture(sampleKernelFixture),
    ]),
  )
  const sessionLayer = makeTrustedSessionLayer(session)
  const legacyLayer = makeInMemoryLedgerLayer(
    transactions,
    legacyAccounts,
  ).pipe(Layer.provide(sessionLayer))
  const kernelLayer = makeInMemoryLedgerKernelLayer({
    currency: fixture.currency,
    accounts: fixture.accounts,
    events: fixture.events,
    proposals: fixture.proposals,
  }).pipe(Layer.provide(sessionLayer))
  const services = Layer.merge(
    Layer.merge(legacyLayer, kernelLayer),
    sessionLayer,
  )
  const gatewayLayer = makeCapabilityGatewayLayer(
    personalLedgerCapabilities,
  ).pipe(Layer.provide(services))
  const runtime = ManagedRuntime.make(gatewayLayer)

  await runtime.context()
  return { runtime }
}

const iso = (value: DateTime.Utc) => DateTime.formatIso(value)

const provenanceView = (provenance: Provenance) => ({
  sourceKind: provenance.sourceKind,
  sourceReference: provenance.sourceReference,
  sourceDigest: provenance.sourceDigest,
  correlationId: provenance.correlationId,
  causationId: provenance.causationId,
  evidenceReferences: provenance.evidenceReferences ?? [],
})

const accountNames = (accounts: ReadonlyArray<LedgerAccount>) =>
  new Map(accounts.map((account) => [account.id, account.name]))

const eventAmount = (event: FinancialEvent) =>
  event.postings
    .filter((posting) => posting.amountMinor > 0)
    .reduce((total, posting) => total + posting.amountMinor, 0)

const jsonValue = (value: unknown): JsonValue => {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? null : (JSON.parse(serialized) as JsonValue)
}

const eventView = (
  event: FinancialEvent,
  names: ReadonlyMap<string, string>,
): EventView => ({
  id: event.id,
  kind: event.kind,
  effectiveAt: iso(event.effectiveAt),
  recordedAt: iso(event.recordedAt),
  actorId: event.actorId,
  idempotencyKey: event.idempotencyKey,
  postings: event.postings.map((posting) => ({
    accountId: posting.accountId,
    accountName: names.get(posting.accountId) ?? posting.accountId,
    currency: posting.currency,
    amountMinor: posting.amountMinor,
    ...(posting.description === undefined
      ? {}
      : { description: posting.description }),
  })),
  amountMinor: eventAmount(event),
  provenance: provenanceView(event.provenance),
  ...(event.lineage === undefined ? {} : { lineage: event.lineage }),
})

const proposalView = (
  proposal: EventProposal,
  names: ReadonlyMap<string, string>,
): ProposalView => ({
  id: proposal.id,
  kind: proposal.kind,
  effectiveAt: iso(proposal.effectiveAt),
  recordedAt: iso(proposal.recordedAt),
  actorId: proposal.actorId,
  postings: proposal.postings.map((posting) => ({
    accountId: posting.accountId,
    accountName: names.get(posting.accountId) ?? posting.accountId,
    currency: posting.currency,
    amountMinor: posting.amountMinor,
    ...(posting.description === undefined
      ? {}
      : { description: posting.description }),
  })),
  amountMinor: proposal.postings
    .filter((posting) => posting.amountMinor > 0)
    .reduce((total, posting) => total + posting.amountMinor, 0),
  provenance: provenanceView(proposal.provenance),
  assumptions: proposal.assumptions.map((assumption) => ({
    field: assumption.field,
    proposedValue: jsonValue(assumption.proposedValue),
    confidence: assumption.confidence,
    rationale: assumption.rationale,
    ...(assumption.evidenceReference === undefined
      ? {}
      : { evidenceReference: assumption.evidenceReference }),
  })),
})

const confirmationView = (request: ConfirmationRequest): ConfirmationView => {
  const input = request.decodedInput as {
    readonly idempotencyKey?: string
    readonly effectiveAt?: DateTime.Utc | string
    readonly postings?: ReadonlyArray<{
      readonly accountId: string
      readonly amountMinor: number
      readonly description?: string
    }>
    readonly eventId?: string
  }
  const positive = input.postings?.find((posting) => posting.amountMinor > 0)
  const negative = input.postings?.find((posting) => posting.amountMinor < 0)

  return {
    id: request.id,
    capabilityName: request.capabilityName as "events.post" | "events.reverse",
    summary:
      request.capabilityName === "events.reverse"
        ? `Reverse ${input.eventId ?? "event"}`
        : `Post ${positive?.description ?? "expense"}`,
    requestId: input.idempotencyKey ?? "unknown",
    ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
    ...(positive === undefined
      ? {}
      : {
          amountMinor: positive.amountMinor,
          expenseAccountId: positive.accountId,
          note: positive.description,
        }),
    ...(negative === undefined ? {} : { fundingAccountId: negative.accountId }),
    ...(input.effectiveAt === undefined
      ? {}
      : {
          effectiveAt:
            typeof input.effectiveAt === "string"
              ? input.effectiveAt
              : iso(input.effectiveAt),
        }),
  }
}

const attemptView = (attempt: CapabilityAttempt): AttemptView => ({
  name: attempt.name,
  outcome: attempt.outcome,
  stage: attempt.stage,
  authorization: attempt.authorization,
  ...(attempt.confirmationId === undefined
    ? {}
    : { confirmationId: attempt.confirmationId }),
  ...(attempt.confirmation === undefined
    ? {}
    : { confirmation: attempt.confirmation }),
  ...(attempt.errorTag === undefined ? {} : { errorCode: attempt.errorTag }),
})

const manualProvenance = (requestId: string): Provenance => ({
  sourceKind: "manual",
  sourceReference: requestId,
  sourceDigest: `sha256:${requestId}`,
  correlationId: requestId,
  causationId: requestId,
})

const mapError = (error: unknown): LedgerApplicationError => {
  if (error instanceof LedgerApplicationError) return error
  if (error instanceof UnknownConfirmationError) {
    return new LedgerApplicationError("confirmation_not_found")
  }
  if (error instanceof InvalidCapabilityInputError) {
    return new LedgerApplicationError("invalid_input")
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "EventNotFoundError"
  ) {
    return new LedgerApplicationError("not_found")
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "DuplicateIdempotencyKeyError"
  ) {
    return new LedgerApplicationError("duplicate_request")
  }
  return new LedgerApplicationError("mutation_refused")
}

export interface PersonalLedgerApplication {
  readonly getDashboard: (input: DashboardInput) => Promise<DashboardView>
  readonly queryEvents: (
    input: QueryEventsInput,
  ) => Promise<ReadonlyArray<EventView>>
  readonly getEvent: (eventId: string) => Promise<EventView>
  readonly queryProposals: () => Promise<ReadonlyArray<ProposalView>>
  readonly getPendingConfirmations: () => Promise<
    ReadonlyArray<ConfirmationView>
  >
  readonly getAttempts: () => Promise<ReadonlyArray<AttemptView>>
  readonly requestExpense: (
    input: RequestExpenseInput,
  ) => Promise<MutationResult>
  readonly requestReversal: (
    input: RequestReversalInput,
  ) => Promise<MutationResult>
  readonly confirmMutation: (confirmationId: string) => Promise<MutationResult>
  readonly rejectMutation: (confirmationId: string) => Promise<MutationResult>
  readonly resetLedger: () => Promise<{ readonly reset: true }>
  readonly dispose: () => Promise<void>
}

export const createPersonalLedgerApplication =
  async (): Promise<PersonalLedgerApplication> => {
    let generation = await createGeneration()

    const runRaw = <A>(
      use: (gateway: CapabilityGatewayService) => Effect.Effect<A, unknown>,
    ): Promise<A> => generation.runtime.runPromise(CapabilityGateway.use(use))

    const run = <A>(
      use: (gateway: CapabilityGatewayService) => Effect.Effect<A, unknown>,
    ): Promise<A> =>
      runRaw(use).catch((error: unknown) => Promise.reject(mapError(error)))

    const listAccounts = () =>
      run((gateway) => gateway.invoke("accounts.list", {}))

    const viewConfirmedEvent = async (output: unknown): Promise<EventView> => {
      const event = output as FinancialEvent
      const accounts = await listAccounts()
      return eventView(event, accountNames(accounts))
    }

    const requestConfirmation = async (
      effect: (
        gateway: CapabilityGatewayService,
      ) => Effect.Effect<FinancialEvent, unknown>,
    ): Promise<MutationResult> => {
      try {
        await runRaw(effect)
        throw new LedgerApplicationError("internal_error")
      } catch (error) {
        if (error instanceof ConfirmationRequiredError) {
          return {
            status: "pending",
            confirmation: confirmationView(error.request),
          }
        }
        throw mapError(error)
      }
    }

    return {
      async getDashboard(input) {
        const [accounts, activity, balances, trialBalance] = await Promise.all([
          listAccounts(),
          run((gateway) =>
            gateway.invoke("reports.activity", {
              from: input.from,
              to: input.to,
            }),
          ),
          run((gateway) => gateway.invoke("reports.balance", { at: input.at })),
          run((gateway) =>
            gateway.invoke("reports.trial_balance", { at: input.at }),
          ),
        ])
        const balanceByAccount = new Map(
          balances.map((balance) => [balance.accountId, balance.amountMinor]),
        )

        return {
          accounts: accounts.map<AccountView>((account) => ({
            id: account.id,
            name: account.name,
            class: account.class,
            subtype: account.subtype,
            currency: account.currency,
            balanceMinor: balanceByAccount.get(account.id) ?? 0,
          })),
          eventCount: activity.events.length,
          expenseTotalMinor: activity.expenseTotalMinor,
          trialBalanceMinor: trialBalance.totalMinor,
          from: input.from,
          to: input.to,
          at: input.at,
        }
      },

      async queryEvents(input) {
        const [events, accounts] = await Promise.all([
          run((gateway) => gateway.invoke("events.query", input)),
          listAccounts(),
        ])
        const names = accountNames(accounts)
        return events.map((event) => eventView(event, names))
      },

      async getEvent(eventId) {
        const [event, accounts] = await Promise.all([
          run((gateway) => gateway.invoke("events.get", { eventId })),
          listAccounts(),
        ])
        return eventView(event, accountNames(accounts))
      },

      async queryProposals() {
        const [proposals, accounts] = await Promise.all([
          run((gateway) => gateway.invoke("proposals.query", {})),
          listAccounts(),
        ])
        const names = accountNames(accounts)
        return proposals.map((proposal) => proposalView(proposal, names))
      },

      async getPendingConfirmations() {
        return run((gateway) =>
          gateway.pendingConfirmations.pipe(
            Effect.map((requests) => requests.map(confirmationView)),
          ),
        )
      },

      async getAttempts() {
        return run((gateway) =>
          gateway.attempts.pipe(
            Effect.map((attempts) => attempts.map(attemptView)),
          ),
        )
      },

      requestExpense(input) {
        const provenance = manualProvenance(input.requestId)
        return requestConfirmation((gateway) =>
          gateway.invoke("events.post", {
            kind: "expense",
            effectiveAt: input.effectiveAt,
            idempotencyKey: input.requestId,
            provenance,
            postings: [
              {
                accountId: input.expenseAccountId,
                currency: "USD",
                amountMinor: input.amountMinor,
                description: input.note,
              },
              {
                accountId: input.fundingAccountId,
                currency: "USD",
                amountMinor: -input.amountMinor,
                description: input.note,
              },
            ],
          }),
        )
      },

      requestReversal(input) {
        return requestConfirmation((gateway) =>
          gateway.invoke("events.reverse", {
            eventId: input.eventId,
            idempotencyKey: input.requestId,
            provenance: manualProvenance(input.requestId),
          }),
        )
      },

      async confirmMutation(confirmationId) {
        const output = await run((gateway) => gateway.confirm(confirmationId))
        return { status: "completed", event: await viewConfirmedEvent(output) }
      },

      async rejectMutation(confirmationId) {
        await run((gateway) => gateway.reject(confirmationId))
        return { status: "rejected", confirmationId }
      },

      async resetLedger() {
        const next = await createGeneration()
        const previous = generation
        generation = next
        await previous.runtime.dispose()
        return { reset: true }
      },

      dispose: () => generation.runtime.dispose(),
    }
  }

const singletonKey = Symbol.for("bound.personal-ledger.application")
const globalApplications = globalThis as typeof globalThis & {
  [singletonKey]?: Promise<PersonalLedgerApplication>
}

export const getPersonalLedgerApplication = () => {
  globalApplications[singletonKey] ??= createPersonalLedgerApplication()
  return globalApplications[singletonKey]
}
