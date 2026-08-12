import { Data, Effect, Schema } from "effect"

import { TransactionListSchema, type Transaction } from "./transaction.ts"

export class InvalidFixtureError extends Data.TaggedError(
  "InvalidFixtureError",
)<{
  readonly details: string
}> {}

export const sampleTransactionsFixture: unknown = [
  {
    id: "txn_001",
    month: "2026-07",
    merchant: "Northstar Market",
    category: "groceries",
    amountCents: 4_250,
  },
  {
    id: "txn_002",
    month: "2026-07",
    merchant: "Orbit Mobile",
    category: "utilities",
    amountCents: 1_999,
  },
  {
    id: "txn_003",
    month: "2026-07",
    merchant: "Northstar Market",
    category: "groceries",
    amountCents: 2_175,
  },
]

export const decodeFixtureTransactions = (
  input: unknown,
): Effect.Effect<ReadonlyArray<Transaction>, InvalidFixtureError> =>
  Schema.decodeUnknownEffect(TransactionListSchema, {
    errors: "all",
    onExcessProperty: "error",
    reportInput: false,
  })(input).pipe(
    Effect.mapError(
      (error) => new InvalidFixtureError({ details: error.message }),
    ),
  )
