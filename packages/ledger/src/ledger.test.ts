import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"

import { sampleTransactions, summarizeMonth } from "./ledger.ts"

describe("summarizeMonth", () => {
  it.effect("summarizes deterministic transactions using integer cents", () =>
    Effect.gen(function* () {
      const summary = yield* summarizeMonth("2026-07", sampleTransactions)

      expect(summary).toEqual({
        month: "2026-07",
        transactionCount: 3,
        totalCents: 8_424,
        spendingByCategory: {
          groceries: 6_425,
          utilities: 1_999,
        },
      })
    }),
  )
})
