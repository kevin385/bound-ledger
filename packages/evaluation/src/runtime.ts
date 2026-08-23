import { Effect, Layer } from "effect"

import {
  CapabilityGateway,
  generalLedgerCapabilities,
  makeCapabilityGatewayLayer,
  type CapabilityGatewayService,
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

export type EvaluationRuntimeProfile = "primary" | "checking_only"

const makeSession = (profile: EvaluationRuntimeProfile): Session => ({
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  activeLedgerId: "ledger_primary",
  readableAccountIds:
    profile === "checking_only"
      ? new Set(["acct_checking"])
      : new Set(primaryAccountIds),
  mutableAccountIds:
    profile === "checking_only"
      ? new Set(["acct_checking"])
      : new Set(primaryAccountIds),
})

export const makeFreshEvaluationGateway =
  (
    profile: EvaluationRuntimeProfile = "primary",
  ): Promise<CapabilityGatewayService> =>
    Effect.runPromise(
      Effect.gen(function* () {
        const transactions = yield* decodeFixtureTransactions(
          sampleTransactionsFixture,
        )
        const accounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
        const fixture = yield* decodeKernelFixture(sampleKernelFixture)
        const sessionLayer = makeTrustedSessionLayer(makeSession(profile))
        const ledgerLayer = makeInMemoryLedgerLayer(
          transactions,
          accounts,
        ).pipe(Layer.provide(sessionLayer))
        const kernelLayer = makeInMemoryLedgerKernelLayer({
          currency: fixture.currency,
          accounts: fixture.accounts,
          events: fixture.events,
          proposals: fixture.proposals,
        }).pipe(Layer.provide(sessionLayer))
        const gatewayLayer = makeCapabilityGatewayLayer(
          generalLedgerCapabilities,
        ).pipe(
          Layer.provide(
            Layer.merge(Layer.merge(ledgerLayer, kernelLayer), sessionLayer),
          ),
        )

        return yield* CapabilityGateway.use((gateway) =>
          Effect.succeed(gateway),
        ).pipe(Effect.provide(gatewayLayer))
      }),
    )
