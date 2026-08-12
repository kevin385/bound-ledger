import { Console, Effect, Layer } from "effect"

import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleTransactionsFixture,
  summarizeMonth,
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
  const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
    Layer.provide(makeTrustedSessionLayer(session)),
  )
  const summary = yield* summarizeMonth("2026-07").pipe(
    Effect.provide(ledgerLayer),
  )

  yield* Console.log(JSON.stringify(summary, null, 2))
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
