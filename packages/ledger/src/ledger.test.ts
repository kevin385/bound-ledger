import { it } from "@effect/vitest"
import { Effect, Exit, Layer, Ref } from "effect"
import { describe, expect } from "vitest"

import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  sampleAccountsFixture,
  sampleTransactionsFixture,
} from "./fixtures.ts"
import { makeInMemoryLedgerLayer } from "./ledger-service.ts"
import { summarizeMonth } from "./ledger.ts"
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

const testAccountsFixture: unknown = [
  {
    id: "account_test",
    workspaceId: "workspace_primary",
  },
]

const testSession: Session = {
  actorId: "actor_test",
  activeWorkspaceId: "workspace_primary",
  readableAccountIds: new Set(["account_test"]),
  mutableAccountIds: new Set(["account_test"]),
}

const summarizeFixture = (
  month: string,
  transactionInput: unknown,
  accountInput: unknown = testAccountsFixture,
  session: Session = testSession,
) =>
  Effect.gen(function* () {
    const transactions = yield* decodeFixtureTransactions(transactionInput)
    const accounts = yield* decodeFixtureAccounts(accountInput)
    const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
      Layer.provide(makeTrustedSessionLayer(session)),
    )

    return yield* summarizeMonth(month).pipe(
      Effect.provide(ledgerLayer),
    )
  })

describe("summarizeMonth", () => {
  it.effect("summarizes deterministic transactions using integer cents", () =>
    Effect.gen(function* () {
      const summary = yield* summarizeFixture(
        "2026-07",
        sampleTransactionsFixture,
        sampleAccountsFixture,
        primarySession,
      )

      expect(summary).toEqual({
        month: "2026-07",
        transactionCount: 3,
        totalCents: 8_424,
        spendingByCategory: {
          groceries: 6_425,
          utilities: 1_999,
        },
      })
    }),
  )

  it.effect("includes negative refunds in the monthly total", () =>
    Effect.gen(function* () {
      const summary = yield* summarizeFixture("2026-07", [
        {
          id: "txn_purchase",
          accountId: "account_test",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "groceries",
          amountCents: 1_000,
        },
        {
          id: "txn_refund",
          accountId: "account_test",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "groceries",
          amountCents: -250,
        },
      ])

      expect(summary.totalCents).toBe(750)
      expect(summary.spendingByCategory).toEqual({ groceries: 750 })
    }),
  )

  it.effect("summarizes categories that match object prototype keys", () =>
    Effect.gen(function* () {
      const summary = yield* summarizeFixture("2026-07", [
        {
          id: "txn_constructor",
          accountId: "account_test",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "constructor",
          amountCents: 100,
        },
        {
          id: "txn_proto",
          accountId: "account_test",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "__proto__",
          amountCents: 250,
        },
        {
          id: "txn_to_string",
          accountId: "account_test",
          month: "2026-07",
          merchant: "Northstar Market",
          category: "toString",
          amountCents: 400,
        },
      ])

      expect(Object.entries(summary.spendingByCategory)).toEqual([
        ["constructor", 100],
        ["__proto__", 250],
        ["toString", 400],
      ])
    }),
  )

  it.effect("fails invalid fixtures before invoking summary behavior", () =>
    Effect.gen(function* () {
      const summaryInvoked = yield* Ref.make(false)
      const exit = yield* Effect.exit(
        decodeFixtureTransactions([
          {
            id: "txn_invalid",
            accountId: "account_test",
            month: "2026-13",
            merchant: "Northstar Market",
            category: "groceries",
            amountCents: 1_000,
          },
        ]).pipe(
          Effect.flatMap(() => Ref.set(summaryInvoked, true)),
        ),
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* Ref.get(summaryInvoked)).toBe(false)
    }),
  )
})
