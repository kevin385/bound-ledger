import { Schema } from "effect"

import { CurrencySchema } from "./money.ts"

const NonEmptyTrimmedString = Schema.Trim.check(Schema.isNonEmpty())

export const AccountClassSchema = Schema.Literals([
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
])

export const AccountSubtypeSchema = Schema.Literals([
  "cash",
  "bank",
  "credit_card",
  "loan",
  "receivable",
  "investment",
  "expense_category",
  "income_source",
  "owner_equity",
])

export const LedgerAccountSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  ledgerId: Schema.NonEmptyString,
  name: NonEmptyTrimmedString,
  currency: CurrencySchema,
  class: AccountClassSchema,
  subtype: AccountSubtypeSchema,
})

export const LedgerAccountListSchema = Schema.Array(LedgerAccountSchema)

export type AccountClass = Schema.Schema.Type<typeof AccountClassSchema>

export type AccountSubtype = Schema.Schema.Type<typeof AccountSubtypeSchema>

export type LedgerAccount = Schema.Schema.Type<typeof LedgerAccountSchema>
