import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"

import {
  decodeFixtureTransactions,
  sampleTransactionsFixture,
} from "./fixtures.ts"
import {
  Ledger,
  makeInMemoryLedgerLayer,
  TransactionNotFoundError,
  type LedgerService,
} from "./ledger-service.ts"

const withSampleLedger = <A, E>(
  use: (ledger: LedgerService) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const transactions = yield* decodeFixtureTransactions(
      sampleTransactionsFixture,
    )

    return yield* Ledger.use(use).pipe(
      Effect.provide(makeInMemoryLedgerLayer(transactions)),
    )
  })

describe("Ledger", () => {
  it.effect("lists transactions for one month in fixture order", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const transactions = yield* ledger.listTransactions("2026-07")

        expect(transactions.map((transaction) => transaction.id)).toEqual([
          "txn_001",
          "txn_002",
          "txn_003",
        ])
      }),
    ),
  )

  it.effect("returns an empty list for a month without transactions", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const transactions = yield* ledger.listTransactions("2026-06")

        expect(transactions).toEqual([])
      }),
    ),
  )

  it.effect("gets an existing transaction by ID", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const transaction = yield* ledger.getTransaction("txn_002")

        expect(transaction.merchant).toBe("Orbit Mobile")
      }),
    ),
  )

  it.effect("fails a missing lookup with TransactionNotFoundError", () =>
    withSampleLedger((ledger) =>
      ledger.getTransaction("txn_missing").pipe(
        Effect.match({
          onFailure: (error) => {
            expect(error).toBeInstanceOf(TransactionNotFoundError)
            expect(error._tag).toBe("TransactionNotFoundError")
            expect(error.transactionId).toBe("txn_missing")
          },
          onSuccess: () => {
            throw new Error("Expected transaction lookup to fail")
          },
        }),
      ),
    ),
  )
})
