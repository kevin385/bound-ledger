import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect } from "vitest"

import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  sampleAccountsFixture,
  sampleTransactionsFixture,
} from "./fixtures.ts"
import {
  InvalidCategoryError,
  Ledger,
  LedgerAuthorizationError,
  makeInMemoryLedgerLayer,
  TransactionNotFoundError,
  type LedgerService,
} from "./ledger-service.ts"
import {
  makeTrustedSessionLayer,
  type Session,
} from "./trusted-session.ts"

const primarySession: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  readableAccountIds: new Set([
    "account_checking",
    "account_credit",
  ]),
  mutableAccountIds: new Set(["account_checking"]),
}

const withSampleLedger = <A, E>(
  use: (ledger: LedgerService) => Effect.Effect<A, E>,
  session: Session = primarySession,
) =>
  Effect.gen(function* () {
    const transactions = yield* decodeFixtureTransactions(
      sampleTransactionsFixture,
    )
    const accounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
    const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
      Layer.provide(makeTrustedSessionLayer(session)),
    )

    return yield* Ledger.use(use).pipe(Effect.provide(ledgerLayer))
  })

describe("Ledger", () => {
  it.effect("lists only readable transactions in the active workspace", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const transactions = yield* ledger.listTransactions("2026-07")

        expect(transactions.map((transaction) => transaction.id)).toEqual([
          "txn_001",
          "txn_002",
          "txn_003",
        ])
      }),
    ),
  )

  it.effect("returns an empty list for a month without transactions", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const transactions = yield* ledger.listTransactions("2026-06")

        expect(transactions).toEqual([])
      }),
    ),
  )

  it.effect("gets an existing readable transaction by ID", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const transaction = yield* ledger.getTransaction("txn_002")

        expect(transaction.merchant).toBe("Orbit Mobile")
      }),
    ),
  )

  it.effect("fails a missing lookup with TransactionNotFoundError", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          ledger.getTransaction("txn_missing"),
        )

        expect(error).toBeInstanceOf(TransactionNotFoundError)
        expect(error._tag).toBe("TransactionNotFoundError")
        expect(error.transactionId).toBe("txn_missing")
      }),
    ),
  )

  it.effect("denies reads and mutations in another workspace", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const readError = yield* Effect.flip(
          ledger.getTransaction("txn_005"),
        )
        const mutationError = yield* Effect.flip(
          ledger.updateCategory("txn_005", "utilities"),
        )

        expect(readError).toMatchObject({
          _tag: "LedgerAuthorizationError",
          actorId: "actor_primary_owner",
          reason: "workspace_access_denied",
          operation: "transactions.get",
        })
        expect(mutationError).toMatchObject({
          _tag: "LedgerAuthorizationError",
          reason: "workspace_access_denied",
          operation: "transactions.update_category",
        })
      }),
    ),
  )

  it.effect("denies reads and mutations on an inaccessible account", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const readError = yield* Effect.flip(
          ledger.getTransaction("txn_004"),
        )
        const mutationError = yield* Effect.flip(
          ledger.updateCategory("txn_004", "household"),
        )

        expect(readError).toBeInstanceOf(LedgerAuthorizationError)
        expect(readError).toMatchObject({
          reason: "account_read_denied",
          operation: "transactions.get",
        })
        expect(mutationError).toMatchObject({
          _tag: "LedgerAuthorizationError",
          reason: "account_read_denied",
          operation: "transactions.update_category",
        })
      }),
    ),
  )

  it.effect("updates an allowed category and persists it in memory", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const updated = yield* ledger.updateCategory(
          "txn_001",
          "  household  ",
        )
        const persisted = yield* ledger.getTransaction("txn_001")

        expect(updated.category).toBe("household")
        expect(persisted.category).toBe("household")
      }),
    ),
  )

  it.effect("denies mutation without changing readable state", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const before = yield* ledger.getTransaction("txn_002")
        const error = yield* Effect.flip(
          ledger.updateCategory("txn_002", "shopping"),
        )
        const after = yield* ledger.getTransaction("txn_002")

        expect(error).toMatchObject({
          _tag: "LedgerAuthorizationError",
          reason: "account_mutation_denied",
          operation: "transactions.update_category",
        })
        expect(after).toEqual(before)
      }),
    ),
  )

  it.effect("rejects a blank category without changing state", () =>
    withSampleLedger((ledger) =>
      Effect.gen(function* () {
        const before = yield* ledger.getTransaction("txn_001")
        const error = yield* Effect.flip(
          ledger.updateCategory("txn_001", "   "),
        )
        const after = yield* ledger.getTransaction("txn_001")

        if (!(error instanceof InvalidCategoryError)) {
          throw new Error("Expected InvalidCategoryError")
        }

        expect(error.details).toContain("length")
        expect(after).toEqual(before)
      }),
    ),
  )
})
