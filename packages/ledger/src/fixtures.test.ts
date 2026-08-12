import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"

import {
  decodeFixtureTransactions,
  InvalidFixtureError,
  sampleTransactionsFixture,
} from "./fixtures.ts"

const validFixture = (overrides: Readonly<Record<string, unknown>> = {}) => [
  {
    id: "txn_test",
    month: "2026-07",
    merchant: "Northstar Market",
    category: "groceries",
    amountCents: 1_000,
    ...overrides,
  },
]

const expectInvalidFixture = (input: unknown, field: string) =>
  decodeFixtureTransactions(input).pipe(
    Effect.match({
      onFailure: (error) => {
        expect(error).toBeInstanceOf(InvalidFixtureError)
        expect(error._tag).toBe("InvalidFixtureError")
        expect(error.details).toContain(field)
      },
      onSuccess: () => {
        throw new Error("Expected fixture decoding to fail")
      },
    }),
  )

describe("decodeFixtureTransactions", () => {
  it.effect("decodes the deterministic July fixture", () =>
    Effect.gen(function* () {
      const transactions = yield* decodeFixtureTransactions(
        sampleTransactionsFixture,
      )

      expect(transactions).toHaveLength(3)
      expect(transactions[0]?.id).toBe("txn_001")
    }),
  )

  for (const month of ["2026-00", "2026-13", "2026-7", "July 2026"]) {
    it.effect(`rejects invalid month ${month}`, () =>
      expectInvalidFixture(validFixture({ month }), "month"),
    )
  }

  it.effect("rejects an empty transaction id", () =>
    expectInvalidFixture(validFixture({ id: "" }), "id"),
  )

  for (const [field, value] of [
    ["merchant", ""],
    ["merchant", "   "],
    ["category", ""],
    ["category", "   "],
  ] as const) {
    it.effect(`rejects a blank ${field}`, () =>
      expectInvalidFixture(validFixture({ [field]: value }), field),
    )
  }

  it.effect("trims merchant and category names while decoding", () =>
    Effect.gen(function* () {
      const transactions = yield* decodeFixtureTransactions(
        validFixture({
          merchant: "  Northstar Market  ",
          category: " groceries ",
        }),
      )

      expect(transactions[0]?.merchant).toBe("Northstar Market")
      expect(transactions[0]?.category).toBe("groceries")
    }),
  )

  for (const amountCents of [
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    it.effect(`rejects invalid integer cents ${String(amountCents)}`, () =>
      expectInvalidFixture(validFixture({ amountCents }), "amountCents"),
    )
  }

  it.effect("accepts a negative refund amount", () =>
    Effect.gen(function* () {
      const transactions = yield* decodeFixtureTransactions(
        validFixture({ amountCents: -425 }),
      )

      expect(transactions[0]?.amountCents).toBe(-425)
    }),
  )

  it.effect("rejects unexpected fixture properties", () =>
    expectInvalidFixture(
      validFixture({ unexpectedField: "stale fixture data" }),
      "unexpectedField",
    ),
  )

  it.effect(
    "reports useful failure details without retaining raw fixture values",
    () =>
      decodeFixtureTransactions(
        validFixture({ id: "private-fixture-id", merchant: "   " }),
      ).pipe(
        Effect.match({
          onFailure: (error) => {
            expect(error._tag).toBe("InvalidFixtureError")
            expect(error.details).toContain("merchant")
            expect(error.details).not.toContain("private-fixture-id")
          },
          onSuccess: () => {
            throw new Error("Expected fixture decoding to fail")
          },
        }),
      ),
  )
})
