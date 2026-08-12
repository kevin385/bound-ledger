import { Effect } from "effect"

import { Ledger, type LedgerService } from "./ledger-service.ts"

export interface MonthlySummary {
  readonly month: string
  readonly transactionCount: number
  readonly totalCents: number
  readonly spendingByCategory: Readonly<Record<string, number>>
}

export const summarizeMonth = (
  month: string,
): Effect.Effect<MonthlySummary, never, LedgerService> =>
  Effect.gen(function* () {
    const ledger = yield* Ledger
    const transactions = yield* ledger.listTransactions(month)

    const spendingByCategory = new Map<string, number>()

    for (const transaction of transactions) {
      spendingByCategory.set(
        transaction.category,
        (spendingByCategory.get(transaction.category) ?? 0) +
          transaction.amountCents,
      )
    }

    return {
      month,
      transactionCount: transactions.length,
      totalCents: transactions.reduce(
        (total, transaction) => total + transaction.amountCents,
        0,
      ),
      spendingByCategory: Object.fromEntries(spendingByCategory),
    }
  })
