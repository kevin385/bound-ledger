import { Console, Effect, Layer } from "effect"

import {
  CapabilityGateway,
  makeCapabilityGatewayLayer,
} from "@bound/capability"
import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleTransactionsFixture,
  summarizeTransactions,
  type Session,
} from "@bound/ledger"

const session: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  readableAccountIds: new Set([
    "account_checking",
    "account_credit",
  ]),
  mutableAccountIds: new Set(["account_checking"]),
}

const program = Effect.gen(function* () {
  const transactions = yield* decodeFixtureTransactions(
    sampleTransactionsFixture,
  )
  const accounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
  const sessionLayer = makeTrustedSessionLayer(session)
  const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
    Layer.provide(sessionLayer),
  )
  const capabilityLayer = makeCapabilityGatewayLayer().pipe(
    Layer.provide(Layer.merge(ledgerLayer, sessionLayer)),
  )
  const result = yield* CapabilityGateway.use((gateway) =>
    Effect.gen(function* () {
      const visibleTransactions = yield* gateway.invoke("transactions.list", {
        month: "2026-07",
      })

      return {
        summary: summarizeTransactions("2026-07", visibleTransactions),
        capabilityAttempts: yield* gateway.attempts,
      }
    }),
  ).pipe(
    Effect.provide(capabilityLayer),
  )

  yield* Console.log(JSON.stringify(result, null, 2))
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
