import { Context, Data, Effect, Layer, Ref, Schema } from "effect"

import type { Account } from "./account.ts"
import {
  CategorySchema,
  type Transaction,
} from "./transaction.ts"
import {
  TrustedSession,
  type Session,
} from "./trusted-session.ts"

export class TransactionNotFoundError extends Data.TaggedError(
  "TransactionNotFoundError",
)<{
  readonly transactionId: string
}> {}

export type LedgerOperation =
  | "transactions.get"
  | "transactions.update_category"

export type LedgerAuthorizationReason =
  | "workspace_access_denied"
  | "account_read_denied"
  | "account_mutation_denied"
  | "account_not_found"

export class LedgerAuthorizationError extends Data.TaggedError(
  "LedgerAuthorizationError",
)<{
  readonly actorId: string
  readonly operation: LedgerOperation
  readonly reason: LedgerAuthorizationReason
  readonly transactionId: string
}> {}

export class InvalidCategoryError extends Data.TaggedError(
  "InvalidCategoryError",
)<{
  readonly details: string
}> {}

export type LedgerReadError =
  | TransactionNotFoundError
  | LedgerAuthorizationError

export type LedgerMutationError = LedgerReadError | InvalidCategoryError

export interface LedgerService {
  readonly listTransactions: (
    month: string,
  ) => Effect.Effect<ReadonlyArray<Transaction>>
  readonly getTransaction: (
    transactionId: string,
  ) => Effect.Effect<Transaction, LedgerReadError>
  readonly updateCategory: (
    transactionId: string,
    category: string,
  ) => Effect.Effect<Transaction, LedgerMutationError>
}

export const Ledger = Context.Service<LedgerService>("@bound/ledger/Ledger")

export const makeInMemoryLedgerLayer = (
  transactions: ReadonlyArray<Transaction>,
  accounts: ReadonlyArray<Account>,
): Layer.Layer<LedgerService, never, Session> =>
  Layer.effect(Ledger)(
    Effect.gen(function* () {
      const session = yield* TrustedSession
      const state = yield* Ref.make(transactions)
      const accountsById = new Map(
        accounts.map((account) => [account.id, account] as const),
      )

      const authorizationError = (
        operation: LedgerOperation,
        reason: LedgerAuthorizationReason,
        transactionId: string,
      ) =>
        new LedgerAuthorizationError({
          actorId: session.actorId,
          operation,
          reason,
          transactionId,
        })

      const getAuthorizedTransaction = (
        transactionId: string,
        operation: LedgerOperation,
      ): Effect.Effect<Transaction, LedgerReadError> =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state)
          const transaction = current.find(
            (candidate) => candidate.id === transactionId,
          )

          if (transaction === undefined) {
            return yield* new TransactionNotFoundError({ transactionId })
          }

          const account = accountsById.get(transaction.accountId)

          if (account === undefined) {
            return yield* authorizationError(
              operation,
              "account_not_found",
              transactionId,
            )
          }

          if (account.workspaceId !== session.activeWorkspaceId) {
            return yield* authorizationError(
              operation,
              "workspace_access_denied",
              transactionId,
            )
          }

          if (!session.readableAccountIds.has(account.id)) {
            return yield* authorizationError(
              operation,
              "account_read_denied",
              transactionId,
            )
          }

          if (
            operation === "transactions.update_category" &&
            !session.mutableAccountIds.has(account.id)
          ) {
            return yield* authorizationError(
              operation,
              "account_mutation_denied",
              transactionId,
            )
          }

          return transaction
        })

      return {
        listTransactions: Effect.fn("Ledger.listTransactions")(
          (month: string) =>
            Ref.get(state).pipe(
              Effect.map((current) =>
                current.filter((transaction) => {
                  const account = accountsById.get(transaction.accountId)

                  return (
                    transaction.month === month &&
                    account?.workspaceId === session.activeWorkspaceId &&
                    session.readableAccountIds.has(transaction.accountId)
                  )
                }),
              ),
            ),
        ),
        getTransaction: Effect.fn("Ledger.getTransaction")(
          (transactionId: string) =>
            getAuthorizedTransaction(transactionId, "transactions.get"),
        ),
        updateCategory: Effect.fn("Ledger.updateCategory")(
          function* (transactionId: string, categoryInput: string) {
            const category = yield* Schema.decodeUnknownEffect(CategorySchema, {
              reportInput: false,
            })(categoryInput).pipe(
              Effect.mapError(
                (error) =>
                  new InvalidCategoryError({ details: error.message }),
              ),
            )
            const transaction = yield* getAuthorizedTransaction(
              transactionId,
              "transactions.update_category",
            )
            const updated = { ...transaction, category }

            yield* Ref.update(state, (current) =>
              current.map((candidate) =>
                candidate.id === transactionId ? updated : candidate,
              ),
            )

            return updated
          },
        ),
      }
    }),
  )
