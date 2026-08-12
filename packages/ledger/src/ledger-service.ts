import { Context, Data, Effect, Layer } from "effect"

import type { Transaction } from "./transaction.ts"

export class TransactionNotFoundError extends Data.TaggedError(
  "TransactionNotFoundError",
)<{
  readonly transactionId: string
}> {}

export interface LedgerService {
  readonly listTransactions: (
    month: string,
  ) => Effect.Effect<ReadonlyArray<Transaction>>
  readonly getTransaction: (
    transactionId: string,
  ) => Effect.Effect<Transaction, TransactionNotFoundError>
}

export const Ledger = Context.Service<LedgerService>("@bound/ledger/Ledger")

export const makeInMemoryLedgerLayer = (
  transactions: ReadonlyArray<Transaction>,
): Layer.Layer<LedgerService> =>
  Layer.succeed(Ledger)({
    listTransactions: Effect.fn("Ledger.listTransactions")((month: string) =>
      Effect.succeed(
        transactions.filter((transaction) => transaction.month === month),
      ),
    ),
    getTransaction: Effect.fn("Ledger.getTransaction")(
      function* (transactionId: string) {
        const transaction = transactions.find(
          (candidate) => candidate.id === transactionId,
        )

        if (transaction === undefined) {
          return yield* new TransactionNotFoundError({ transactionId })
        }

        return transaction
      },
    ),
  })
