import { Console, Effect } from "effect"

import {
  decodeFixtureTransactions,
  sampleTransactionsFixture,
  summarizeMonth,
} from "@bound/ledger"

const program = Effect.gen(function* () {
  const transactions = yield* decodeFixtureTransactions(
    sampleTransactionsFixture,
  )
  const summary = yield* summarizeMonth("2026-07", transactions)

  yield* Console.log(JSON.stringify(summary, null, 2))
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
