import { Console, Effect, Layer } from "effect"

import {
  CapabilityGateway,
  generalLedgerReadCapabilities,
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
  type Session,
} from "@bound/ledger"

const readableAccountIds = [
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
  readableAccountIds: new Set(readableAccountIds),
  mutableAccountIds: new Set(),
}

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
    generalLedgerReadCapabilities,
  ).pipe(Layer.provide(runtimeLayer))

  const result = yield* CapabilityGateway.use((gateway) =>
    Effect.gen(function* () {
      const accounts = yield* gateway.invoke("accounts.list", {})
      const activity = yield* gateway.invoke("reports.activity", {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z",
      })
      const balances = yield* gateway.invoke("reports.balance", {
        at: "2026-08-01T00:00:00.000Z",
      })
      const trialBalance = yield* gateway.invoke(
        "reports.trial_balance",
        { at: "2026-08-01T00:00:00.000Z" },
      )

      return {
        ledgerId: session.activeLedgerId,
        period: {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-01T00:00:00.000Z",
        },
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          class: account.class,
          subtype: account.subtype,
        })),
        activity: {
          eventIds: activity.events.map((event) => event.id),
          expenseTotalMinor: activity.expenseTotalMinor,
        },
        balances,
        trialBalance,
        capabilityAttempts: yield* gateway.attempts,
      }
    }),
  ).pipe(Effect.provide(gatewayLayer))

  yield* Console.log(JSON.stringify(result, null, 2))
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
