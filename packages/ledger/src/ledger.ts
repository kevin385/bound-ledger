import { Effect } from "effect"

import type { Transaction } from "./transaction.ts"

export interface MonthlySummary {
  readonly month: string
  readonly transactionCount: number
  readonly totalCents: number
  readonly spendingByCategory: Readonly<Record<string, number>>
}

export const summarizeMonth = (
  month: string,
  transactions: ReadonlyArray<Transaction>,
): Effect.Effect<MonthlySummary> =>
  Effect.sync(() => {
    const matching = transactions.filter(
      (transaction) => transaction.month === month,
    )

    const spendingByCategory = new Map<string, number>()

    for (const transaction of matching) {
      spendingByCategory.set(
        transaction.category,
        (spendingByCategory.get(transaction.category) ?? 0) +
          transaction.amountCents,
      )
    }

    return {
      month,
      transactionCount: matching.length,
      totalCents: matching.reduce(
        (total, transaction) => total + transaction.amountCents,
        0,
      ),
      spendingByCategory: Object.fromEntries(spendingByCategory),
    }
  })
