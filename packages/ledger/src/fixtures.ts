import { Data, Effect, Schema } from "effect"

import { AccountListSchema, type Account } from "./account.ts"
import { TransactionListSchema, type Transaction } from "./transaction.ts"

export class InvalidFixtureError extends Data.TaggedError(
  "InvalidFixtureError",
)<{
  readonly details: string
}> {}

export const sampleTransactionsFixture: unknown = [
  {
    id: "txn_001",
    accountId: "account_checking",
    month: "2026-07",
    merchant: "Northstar Market",
    category: "groceries",
    amountCents: 4_250,
  },
  {
    id: "txn_002",
    accountId: "account_credit",
    month: "2026-07",
    merchant: "Orbit Mobile",
    category: "utilities",
    amountCents: 1_999,
  },
  {
    id: "txn_003",
    accountId: "account_checking",
    month: "2026-07",
    merchant: "Northstar Market",
    category: "groceries",
    amountCents: 2_175,
  },
  {
    id: "txn_004",
    accountId: "account_cash",
    month: "2026-07",
    merchant: "Harbor Books",
    category: "shopping",
    amountCents: 3_500,
  },
  {
    id: "txn_005",
    accountId: "account_secondary_checking",
    month: "2026-07",
    merchant: "Cedar Grocery",
    category: "groceries",
    amountCents: 5_125,
  },
]

export const sampleAccountsFixture: unknown = [
  {
    id: "account_checking",
    workspaceId: "workspace_primary",
  },
  {
    id: "account_credit",
    workspaceId: "workspace_primary",
  },
  {
    id: "account_cash",
    workspaceId: "workspace_primary",
  },
  {
    id: "account_secondary_checking",
    workspaceId: "workspace_secondary",
  },
]

const fixtureParseOptions = {
  errors: "all",
  onExcessProperty: "error",
  reportInput: false,
} as const

export const decodeFixtureTransactions = (
  input: unknown,
): Effect.Effect<ReadonlyArray<Transaction>, InvalidFixtureError> =>
  Schema.decodeUnknownEffect(TransactionListSchema, fixtureParseOptions)(
    input,
  ).pipe(
    Effect.mapError(
      (error) => new InvalidFixtureError({ details: error.message }),
    ),
  )

export const decodeFixtureAccounts = (
  input: unknown,
): Effect.Effect<ReadonlyArray<Account>, InvalidFixtureError> =>
  Schema.decodeUnknownEffect(AccountListSchema, fixtureParseOptions)(input).pipe(
    Effect.mapError(
      (error) => new InvalidFixtureError({ details: error.message }),
    ),
  )
