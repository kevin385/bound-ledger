import { Schema } from "effect"

export const AccountSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  workspaceId: Schema.NonEmptyString,
})

export const AccountListSchema = Schema.Array(AccountSchema)

export type Account = Schema.Schema.Type<typeof AccountSchema>
