import { Console, Effect } from "effect"

import { sampleTransactions, summarizeMonth } from "@bound/ledger"

const program = Effect.gen(function* () {
  const summary = yield* summarizeMonth("2026-07", sampleTransactions)

  yield* Console.log(JSON.stringify(summary, null, 2))
})

Effect.runPromise(program).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
