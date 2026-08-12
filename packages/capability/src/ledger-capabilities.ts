import { Effect, Schema } from "effect"

import {
  CategorySchema,
  LedgerAuthorizationError,
  MonthSchema,
  TransactionListSchema,
  TransactionSchema,
} from "@bound/ledger"

import {
  defineCapability,
  type CapabilityDefinition,
} from "./capability.ts"

export const ListTransactionsInputSchema = Schema.Struct({
  month: MonthSchema,
})

export const GetTransactionInputSchema = Schema.Struct({
  transactionId: Schema.NonEmptyString,
})

export const UpdateCategoryInputSchema = Schema.Struct({
  transactionId: Schema.NonEmptyString,
  category: CategorySchema,
})

export type ListTransactionsInput = Schema.Schema.Type<
  typeof ListTransactionsInputSchema
>
export type GetTransactionInput = Schema.Schema.Type<
  typeof GetTransactionInputSchema
>
export type UpdateCategoryInput = Schema.Schema.Type<
  typeof UpdateCategoryInputSchema
>

export const ledgerCapabilities: ReadonlyArray<CapabilityDefinition> =
  Object.freeze([
    defineCapability({
      name: "transactions.list",
      description: "List readable transactions for a calendar month",
      kind: "read",
      input: ListTransactionsInputSchema,
      output: TransactionListSchema,
      authorize: () => Effect.void,
      execute: (input, { ledger }) => ledger.listTransactions(input.month),
    }),
    defineCapability({
      name: "transactions.get",
      description: "Get one readable transaction by ID",
      kind: "read",
      input: GetTransactionInputSchema,
      output: TransactionSchema,
      authorize: (input, { ledger }) =>
        ledger
          .authorizeTransaction(input.transactionId, "transactions.get")
          .pipe(Effect.asVoid),
      execute: (input, { ledger }) =>
        ledger.getTransaction(input.transactionId),
    }),
    defineCapability({
      name: "transactions.update_category",
      description: "Update the category of one mutable transaction",
      kind: "mutation",
      input: UpdateCategoryInputSchema,
      output: TransactionSchema,
      authorize: (input, { ledger, session }) =>
        Effect.gen(function* () {
          const transaction = yield* ledger.authorizeTransaction(
            input.transactionId,
            "transactions.update_category",
          )

          if (!session.mutableAccountIds.has(transaction.accountId)) {
            return yield* new LedgerAuthorizationError({
              actorId: session.actorId,
              operation: "transactions.update_category",
              reason: "account_mutation_denied",
              transactionId: input.transactionId,
            })
          }
        }),
      execute: (input, { ledger }) =>
        ledger.updateCategory(input.transactionId, input.category),
    }),
  ])
