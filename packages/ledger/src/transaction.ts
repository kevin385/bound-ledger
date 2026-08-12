import { Schema } from "effect"

const NonEmptyTrimmedString = Schema.Trim.check(Schema.isNonEmpty())

const MonthSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/),
)

export const TransactionSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  month: MonthSchema,
  merchant: NonEmptyTrimmedString,
  category: NonEmptyTrimmedString,
  amountCents: Schema.Int,
})

export const TransactionListSchema = Schema.Array(TransactionSchema)

export type Transaction = Schema.Schema.Type<typeof TransactionSchema>
