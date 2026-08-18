import { it } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"

import { InvalidFixtureError } from "./fixtures.ts"
import {
  decodeFixtureFinancialEvents,
  decodeFixtureLedgerAccounts,
  decodeKernelFixture,
  sampleKernelFixture,
} from "./financial-fixtures.ts"

const kernelAccounts = () =>
  (sampleKernelFixture as { readonly accounts: ReadonlyArray<unknown> }).accounts

const kernelEvents = () =>
  (sampleKernelFixture as { readonly events: ReadonlyArray<unknown> }).events

const validAccount = (overrides: Readonly<Record<string, unknown>> = {}) => [
  {
    id: "acct_test",
    ledgerId: "ledger_primary",
    name: "Checking",
    currency: "USD",
    class: "asset",
    subtype: "bank",
    ...overrides,
  },
]

const validEvent = (overrides: Readonly<Record<string, unknown>> = {}) => [
  {
    id: "evt_test",
    ledgerId: "ledger_primary",
    kind: "deposit",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    recordedAt: "2026-07-01T00:01:00.000Z",
    actorId: "actor_primary_owner",
    idempotencyKey: "evt-test",
    provenance: {
      sourceKind: "fixture",
      sourceReference: "evt-test",
      sourceDigest: "sha256:evt-test",
      correlationId: "evt-test",
      causationId: "evt-test",
    },
    postings: [
      {
        accountId: "acct_checking",
        currency: "USD",
        amountMinor: 1_000,
      },
      {
        accountId: "acct_income",
        currency: "USD",
        amountMinor: -1_000,
      },
    ],
    ...overrides,
  },
]

const expectInvalidAccounts = (input: unknown, field: string) =>
  decodeFixtureLedgerAccounts(input).pipe(
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

const expectInvalidEvents = (input: unknown, field: string) =>
  decodeFixtureFinancialEvents(input).pipe(
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

describe("decodeKernelFixture", () => {
  it.effect("decodes the deterministic kernel fixture", () =>
    Effect.gen(function* () {
      const fixture = yield* decodeKernelFixture(sampleKernelFixture)

      expect(fixture.currency).toBe("USD")
      expect(fixture.accounts).toHaveLength(11)
      expect(fixture.events).toHaveLength(10)
      expect(fixture.proposals).toHaveLength(1)
      expect(fixture.accounts[0]?.id).toBe("acct_checking")
      expect(fixture.events[0]?.id).toBe("evt_001")
      expect(fixture.proposals[0]?.assumptions[0]?.field).toBe("accountId")
    }),
  )
})

describe("decodeFixtureLedgerAccounts", () => {
  it.effect("decodes every seeded account class and subtype", () =>
    Effect.gen(function* () {
      const accounts = yield* decodeFixtureLedgerAccounts(kernelAccounts())
      const classes = new Set(accounts.map((account) => account.class))
      const subtypes = new Set(accounts.map((account) => account.subtype))

      expect(classes).toEqual(
        new Set(["asset", "liability", "equity", "income", "expense"]),
      )
      expect(subtypes.has("cash")).toBe(true)
      expect(subtypes.has("bank")).toBe(true)
      expect(subtypes.has("credit_card")).toBe(true)
      expect(subtypes.has("owner_equity")).toBe(true)
      expect(accounts.some((account) => account.ledgerId === "ledger_secondary"))
        .toBe(true)
    }),
  )

  it.effect("rejects a blank account name", () =>
    expectInvalidAccounts(validAccount({ name: "   " }), "name"),
  )

  it.effect("rejects an unknown account class", () =>
    expectInvalidAccounts(validAccount({ class: "revenue" }), "class"),
  )

  it.effect("rejects a lowercase currency code", () =>
    expectInvalidAccounts(validAccount({ currency: "usd" }), "currency"),
  )
})

describe("decodeFixtureFinancialEvents", () => {
  it.effect("decodes seeded provenance, lineage, and postings", () =>
    Effect.gen(function* () {
      const events = yield* decodeFixtureFinancialEvents(kernelEvents())
      const reversal = events.find((event) => event.id === "evt_009")
      const replacement = events.find((event) => event.id === "evt_010")

      expect(reversal?.lineage?.reverses).toBe("evt_008")
      expect(replacement?.lineage?.replaces).toBe("evt_008")
      expect(events[0]?.postings[0]?.amountMinor).toBe(50_000)
    }),
  )

  it.effect("rejects a fractional minor unit", () =>
    expectInvalidEvents(
      validEvent({
        postings: [
          {
            accountId: "acct_checking",
            currency: "USD",
            amountMinor: 1.5,
          },
          {
            accountId: "acct_income",
            currency: "USD",
            amountMinor: -1.5,
          },
        ],
      }),
      "amountMinor",
    ),
  )

  it.effect("rejects an unsafe integer amount", () =>
    expectInvalidEvents(
      validEvent({
        postings: [
          {
            accountId: "acct_checking",
            currency: "USD",
            amountMinor: Number.MAX_SAFE_INTEGER + 1,
          },
          {
            accountId: "acct_income",
            currency: "USD",
            amountMinor: -(Number.MAX_SAFE_INTEGER + 1),
          },
        ],
      }),
      "amountMinor",
    ),
  )

  it.effect("rejects a NaN amount", () =>
    expectInvalidEvents(
      validEvent({
        postings: [
          {
            accountId: "acct_checking",
            currency: "USD",
            amountMinor: Number.NaN,
          },
          {
            accountId: "acct_income",
            currency: "USD",
            amountMinor: 0,
          },
        ],
      }),
      "amountMinor",
    ),
  )

  it.effect("rejects a posting with the wrong currency shape", () =>
    expectInvalidEvents(
      validEvent({
        postings: [
          {
            accountId: "acct_checking",
            currency: "US",
            amountMinor: 1_000,
          },
          {
            accountId: "acct_income",
            currency: "USD",
            amountMinor: -1_000,
          },
        ],
      }),
      "currency",
    ),
  )

  it.effect("rejects an invalid event kind", () =>
    expectInvalidEvents(validEvent({ kind: "payment" }), "kind"),
  )

  it.effect("rejects an invalid effective instant", () =>
    expectInvalidEvents(validEvent({ effectiveAt: "not-an-instant" }), "effectiveAt"),
  )

  it.effect(
    "reports useful failure details without retaining raw fixture values",
    () =>
      decodeFixtureFinancialEvents(
        validEvent({
          idempotencyKey: "private-fixture-key",
          postings: [
            {
              accountId: "acct_checking",
              currency: "USD",
              amountMinor: 1.25,
            },
          ],
        }),
      ).pipe(
        Effect.match({
          onFailure: (error) => {
            expect(error._tag).toBe("InvalidFixtureError")
            expect(error.details).toContain("amountMinor")
            expect(error.details).not.toContain("private-fixture-key")
          },
          onSuccess: () => {
            throw new Error("Expected fixture decoding to fail")
          },
        }),
      ),
  )
})
