import { Effect } from "effect"

export interface Transaction {
  readonly id: string
  readonly month: string
  readonly merchant: string
  readonly category: string
  readonly amountCents: number
}

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

    const spendingByCategory: Record<string, number> = {}

    for (const transaction of matching) {
      spendingByCategory[transaction.category] =
        (spendingByCategory[transaction.category] ?? 0) +
        transaction.amountCents
    }

    return {
      month,
      transactionCount: matching.length,
      totalCents: matching.reduce(
        (total, transaction) => total + transaction.amountCents,
        0,
      ),
      spendingByCategory,
    }
  })

export const sampleTransactions: ReadonlyArray<Transaction> = [
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
