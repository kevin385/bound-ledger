import { Schema } from "effect"

export const CurrencySchema = Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/))

export const AmountMinorSchema = Schema.Int

export type Currency = Schema.Schema.Type<typeof CurrencySchema>

export type AmountMinor = Schema.Schema.Type<typeof AmountMinorSchema>
