import { Console, Effect, Layer } from "effect"

import {
  CapabilityGateway,
  type CapabilityInvocationError,
  type ConfirmationRequest,
  ConfirmationRequiredError,
  generalLedgerCapabilities,
  makeCapabilityGatewayLayer,
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
  type FinancialEvent,
  type Provenance,
  type Session,
} from "@bound/ledger"

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

const provenance = (sourceReference: string): Provenance => ({
  sourceKind: "manual",
  sourceReference,
  sourceDigest: `sha256:${sourceReference}`,
  correlationId: "phase-12-confirmation-demo",
  causationId: sourceReference,
})

const expenseInput = (idempotencyKey: string, amountMinor: number) => ({
  kind: "expense",
  effectiveAt: "2026-07-29T12:00:00.000Z",
  idempotencyKey,
  provenance: provenance(idempotencyKey),
  postings: [
    {
      accountId: "acct_groceries",
      currency: "USD",
      amountMinor,
    },
    {
      accountId: "acct_checking",
      currency: "USD",
      amountMinor: -amountMinor,
    },
  ],
})

const confirmationFrom = <A>(
  effect: Effect.Effect<A, CapabilityInvocationError>,
): Effect.Effect<ConfirmationRequest, CapabilityInvocationError> =>
  Effect.matchEffect(effect, {
    onFailure: (error) =>
      error instanceof ConfirmationRequiredError
        ? Effect.succeed(error.request)
        : Effect.fail(error),
    onSuccess: () =>
      Effect.die(new Error("Expected a pending confirmation request")),
  })

const program = Effect.gen(function* () {
  const transactions = yield* decodeFixtureTransactions(
    sampleTransactionsFixture,
  )
  const legacyAccounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
  const fixture = yield* decodeKernelFixture(sampleKernelFixture)
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
  const runtimeLayer = Layer.merge(
    Layer.merge(legacyLayer, kernelLayer),
    sessionLayer,
  )
  const gatewayLayer = makeCapabilityGatewayLayer(
    generalLedgerCapabilities,
  ).pipe(Layer.provide(runtimeLayer))

  const result = yield* CapabilityGateway.use((gateway) =>
    Effect.gen(function* () {
      const initialEvents = yield* gateway.invoke("events.query", {})

      const rejectedRequest = yield* confirmationFrom(
        gateway.invoke(
          "events.post",
          expenseInput("phase-12-rejected", 900),
        ),
      )
      yield* gateway.reject(rejectedRequest.id)

      const postRequest = yield* confirmationFrom(
        gateway.invoke(
          "events.post",
          expenseInput("phase-12-approved", 1_250),
        ),
      )
      const posted = (yield* gateway.confirm(postRequest.id)) as FinancialEvent

      const reversalRequest = yield* confirmationFrom(
        gateway.invoke("events.reverse", {
          eventId: posted.id,
          idempotencyKey: "phase-12-reversal",
          provenance: provenance("phase-12-reversal"),
        }),
      )
      const reversal = (yield* gateway.confirm(
        reversalRequest.id,
      )) as FinancialEvent

      const replacementRequest = yield* confirmationFrom(
        gateway.invoke("events.post", {
          ...expenseInput("phase-12-replacement", 1_100),
          lineage: { replaces: posted.id },
        }),
      )
      const replacement = (yield* gateway.confirm(
        replacementRequest.id,
      )) as FinancialEvent
      const finalEvents = yield* gateway.invoke("events.query", {})
      const attempts = yield* gateway.attempts

      return {
        rejected: {
          confirmationId: rejectedRequest.id,
          appended: finalEvents.some(
            (event) => event.idempotencyKey === "phase-12-rejected",
          ),
        },
        approvedPost: {
          confirmationId: postRequest.id,
          eventId: posted.id,
          actorId: posted.actorId,
          ledgerId: posted.ledgerId,
          idempotencyKey: posted.idempotencyKey,
        },
        approvedReversal: {
          confirmationId: reversalRequest.id,
          eventId: reversal.id,
          lineage: reversal.lineage,
        },
        approvedReplacement: {
          confirmationId: replacementRequest.id,
          eventId: replacement.id,
          lineage: replacement.lineage,
        },
        eventCount: {
          before: initialEvents.length,
          after: finalEvents.length,
        },
        confirmationAttempts: attempts.filter(
          (attempt) => attempt.confirmationId !== undefined,
        ),
      }
    }),
  ).pipe(Effect.provide(gatewayLayer))

  yield* Console.log(JSON.stringify(result, null, 2))
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
