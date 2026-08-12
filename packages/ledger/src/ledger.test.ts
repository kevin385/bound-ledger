import { it } from "@effect/vitest"
import { Effect, Exit, Ref } from "effect"
import { describe, expect } from "vitest"

import {
  decodeFixtureTransactions,
  sampleTransactionsFixture,
} from "./fixtures.ts"
import { summarizeMonth } from "./ledger.ts"

describe("summarizeMonth", () => {
  it.effect("summarizes deterministic transactions using integer cents", () =>
    Effect.gen(function* () {
      const transactions = yield* decodeFixtureTransactions(
        sampleTransactionsFixture,
      )
      const summary = yield* summarizeMonth("2026-07", transactions)

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

  it.effect("includes negative refunds in the monthly total", () =>
    Effect.gen(function* () {
      const transactions = yield* decodeFixtureTransactions([
        {
          id: "txn_purchase",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "groceries",
          amountCents: 1_000,
        },
        {
          id: "txn_refund",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "groceries",
          amountCents: -250,
        },
      ])
      const summary = yield* summarizeMonth("2026-07", transactions)

      expect(summary.totalCents).toBe(750)
      expect(summary.spendingByCategory).toEqual({ groceries: 750 })
    }),
  )

  it.effect("summarizes categories that match object prototype keys", () =>
    Effect.gen(function* () {
      const transactions = yield* decodeFixtureTransactions([
        {
          id: "txn_constructor",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "constructor",
          amountCents: 100,
        },
        {
          id: "txn_proto",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "__proto__",
          amountCents: 250,
        },
        {
          id: "txn_to_string",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "toString",
          amountCents: 400,
        },
      ])
      const summary = yield* summarizeMonth("2026-07", transactions)

      expect(Object.entries(summary.spendingByCategory)).toEqual([
        ["constructor", 100],
        ["__proto__", 250],
        ["toString", 400],
      ])
    }),
  )

  it.effect("fails invalid fixtures before invoking summary behavior", () =>
    Effect.gen(function* () {
      const summaryInvoked = yield* Ref.make(false)
      const exit = yield* Effect.exit(
        decodeFixtureTransactions([
          {
            id: "txn_invalid",
            month: "2026-13",
            merchant: "Northstar Market",
            category: "groceries",
            amountCents: 1_000,
          },
        ]).pipe(
          Effect.flatMap((transactions) =>
            Ref.set(summaryInvoked, true).pipe(
              Effect.andThen(summarizeMonth("2026-07", transactions)),
            ),
          ),
        ),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* Ref.get(summaryInvoked)).toBe(false)
    }),
  )
})
