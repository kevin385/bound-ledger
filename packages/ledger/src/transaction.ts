import { Schema } from "effect"

const NonEmptyTrimmedString = Schema.Trim.check(Schema.isNonEmpty())

export const CategorySchema = NonEmptyTrimmedString

const MonthSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/),
)

export const TransactionSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  accountId: Schema.NonEmptyString,
  month: MonthSchema,
  merchant: NonEmptyTrimmedString,
  category: CategorySchema,
  amountCents: Schema.Int,
})

export const TransactionListSchema = Schema.Array(TransactionSchema)

export type Transaction = Schema.Schema.Type<typeof TransactionSchema>
