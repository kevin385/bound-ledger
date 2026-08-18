import { Effect, Schema } from "effect"

import {
  LedgerAccountListSchema,
  type LedgerAccount,
} from "./chart-account.ts"
import {
  EventProposalListSchema,
  FinancialEventListSchema,
  type EventProposal,
  type FinancialEvent,
} from "./financial-event.ts"
import { InvalidFixtureError } from "./fixtures.ts"
import { CurrencySchema, type Currency } from "./money.ts"

const fixtureParseOptions = {
  errors: "all",
  onExcessProperty: "error",
  reportInput: false,
} as const

export const KernelFixtureSchema = Schema.Struct({
  currency: CurrencySchema,
  accounts: LedgerAccountListSchema,
  events: FinancialEventListSchema,
  proposals: EventProposalListSchema,
})

export type KernelFixture = Schema.Schema.Type<typeof KernelFixtureSchema>

const account = (
  id: string,
  ledgerId: string,
  name: string,
  accountClass: LedgerAccount["class"],
  subtype: LedgerAccount["subtype"],
) => ({
  id,
  ledgerId,
  name,
  currency: "USD",
  class: accountClass,
  subtype,
})

const posting = (accountId: string, amountMinor: number) => ({
  accountId,
  currency: "USD",
  amountMinor,
})

const provenance = (sourceReference: string, causationId = sourceReference) => ({
  sourceKind: "fixture",
  sourceReference,
  sourceDigest: `sha256:${sourceReference}`,
  correlationId: sourceReference,
  causationId,
})

export const sampleKernelFixture: unknown = {
  currency: "USD",
  accounts: [
    account("acct_checking", "ledger_primary", "Checking", "asset", "bank"),
    account("acct_cash", "ledger_primary", "Cash", "asset", "cash"),
    account("acct_receivable", "ledger_primary", "Receivable", "asset", "receivable"),
    account(
      "acct_investment",
      "ledger_primary",
      "Brokerage",
      "asset",
      "investment",
    ),
    account("acct_credit", "ledger_primary", "Visa", "liability", "credit_card"),
    account("acct_loan", "ledger_primary", "Personal loan", "liability", "loan"),
    account(
      "acct_equity",
      "ledger_primary",
      "Owner equity",
      "equity",
      "owner_equity",
    ),
    account(
      "acct_income",
      "ledger_primary",
      "Salary",
      "income",
      "income_source",
    ),
    account(
      "acct_groceries",
      "ledger_primary",
      "Groceries",
      "expense",
      "expense_category",
    ),
    account(
      "acct_utilities",
      "ledger_primary",
      "Utilities",
      "expense",
      "expense_category",
    ),
    account(
      "acct_secondary_checking",
      "ledger_secondary",
      "Secondary checking",
      "asset",
      "bank",
    ),
  ],
  events: [
    {
      id: "evt_001",
      ledgerId: "ledger_primary",
      kind: "deposit",
      effectiveAt: "2026-05-04T12:00:00.000Z",
      recordedAt: "2026-05-04T12:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-deposit-may",
      provenance: provenance("seed-deposit-may"),
      postings: [
        posting("acct_checking", 50_000),
        posting("acct_income", -50_000),
      ],
    },
    {
      id: "evt_002",
      ledgerId: "ledger_primary",
      kind: "contribution",
      effectiveAt: "2026-06-02T12:00:00.000Z",
      recordedAt: "2026-06-02T12:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-contribution-june",
      provenance: provenance("seed-contribution-june"),
      postings: [
        posting("acct_checking", 20_000),
        posting("acct_equity", -20_000),
      ],
    },
    {
      id: "evt_003",
      ledgerId: "ledger_primary",
      kind: "expense",
      effectiveAt: "2026-07-01T15:00:00.000Z",
      recordedAt: "2026-07-01T15:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-checking-expense-july",
      provenance: provenance("seed-checking-expense-july"),
      postings: [
        posting("acct_groceries", 4_250),
        posting("acct_checking", -4_250),
      ],
    },
    {
      id: "evt_004",
      ledgerId: "ledger_primary",
      kind: "expense",
      effectiveAt: "2026-07-12T18:00:00.000Z",
      recordedAt: "2026-07-12T18:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-card-expense-july",
      provenance: provenance("seed-card-expense-july"),
      postings: [
        posting("acct_utilities", 1_999),
        posting("acct_credit", -1_999),
      ],
    },
    {
      id: "evt_005",
      ledgerId: "ledger_primary",
      kind: "withdrawal",
      effectiveAt: "2026-07-20T09:00:00.000Z",
      recordedAt: "2026-07-20T09:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-cash-withdrawal-july",
      provenance: provenance("seed-cash-withdrawal-july"),
      postings: [
        posting("acct_cash", 3_500),
        posting("acct_checking", -3_500),
      ],
    },
    {
      id: "evt_006",
      ledgerId: "ledger_primary",
      kind: "transfer",
      effectiveAt: "2026-07-25T11:00:00.000Z",
      recordedAt: "2026-07-25T11:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-investment-transfer-july",
      provenance: provenance("seed-investment-transfer-july"),
      postings: [
        posting("acct_investment", 10_000),
        posting("acct_checking", -10_000),
      ],
    },
    {
      id: "evt_007",
      ledgerId: "ledger_primary",
      kind: "refund",
      effectiveAt: "2026-08-03T14:00:00.000Z",
      recordedAt: "2026-08-03T14:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-grocery-refund-august",
      provenance: provenance("seed-grocery-refund-august"),
      postings: [
        posting("acct_checking", 500),
        posting("acct_groceries", -500),
      ],
    },
    {
      id: "evt_008",
      ledgerId: "ledger_primary",
      kind: "adjustment",
      effectiveAt: "2026-08-10T10:00:00.000Z",
      recordedAt: "2026-08-10T10:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-loan-adjustment-august",
      provenance: provenance("seed-loan-adjustment-august"),
      postings: [
        posting("acct_loan", 2_000),
        posting("acct_receivable", -2_000),
      ],
    },
    {
      id: "evt_009",
      ledgerId: "ledger_primary",
      kind: "adjustment",
      effectiveAt: "2026-08-10T16:00:00.000Z",
      recordedAt: "2026-08-10T16:05:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-loan-adjustment-reversal",
      provenance: provenance("seed-loan-adjustment-reversal", "seed-loan-adjustment-august"),
      postings: [
        posting("acct_loan", -2_000),
        posting("acct_receivable", 2_000),
      ],
      lineage: { reverses: "evt_008" },
    },
    {
      id: "evt_010",
      ledgerId: "ledger_primary",
      kind: "adjustment",
      effectiveAt: "2026-08-10T16:30:00.000Z",
      recordedAt: "2026-08-10T16:35:00.000Z",
      actorId: "actor_primary_owner",
      idempotencyKey: "seed-loan-adjustment-replacement",
      provenance: provenance("seed-loan-adjustment-replacement", "seed-loan-adjustment-august"),
      postings: [
        posting("acct_loan", 1_500),
        posting("acct_receivable", -1_500),
      ],
      lineage: { replaces: "evt_008" },
    },
  ],
  proposals: [
    {
      id: "prop_001",
      ledgerId: "ledger_primary",
      kind: "expense",
      effectiveAt: "2026-07-18T13:00:00.000Z",
      recordedAt: "2026-07-18T13:05:00.000Z",
      actorId: "actor_primary_owner",
      provenance: provenance("seed-ambiguous-grocery"),
      postings: [
        posting("acct_groceries", 1_200),
        posting("acct_checking", -1_200),
      ],
      assumptions: [
        {
          field: "accountId",
          proposedValue: "acct_groceries",
          confidence: 0.6,
          rationale: "Merchant looks like a grocer, but the source is ambiguous.",
        },
      ],
    },
  ],
}

const mapFixtureError = (error: { readonly message: string }) =>
  new InvalidFixtureError({ details: error.message })

export const decodeFixtureLedgerAccounts = (
  input: unknown,
): Effect.Effect<ReadonlyArray<LedgerAccount>, InvalidFixtureError> =>
  Schema.decodeUnknownEffect(LedgerAccountListSchema, fixtureParseOptions)(
    input,
  ).pipe(Effect.mapError(mapFixtureError))

export const decodeFixtureFinancialEvents = (
  input: unknown,
): Effect.Effect<ReadonlyArray<FinancialEvent>, InvalidFixtureError> =>
  Schema.decodeUnknownEffect(FinancialEventListSchema, fixtureParseOptions)(
    input,
  ).pipe(Effect.mapError(mapFixtureError))

export const decodeFixtureEventProposals = (
  input: unknown,
): Effect.Effect<ReadonlyArray<EventProposal>, InvalidFixtureError> =>
  Schema.decodeUnknownEffect(EventProposalListSchema, fixtureParseOptions)(
    input,
  ).pipe(Effect.mapError(mapFixtureError))

export const decodeKernelFixture = (
  input: unknown,
): Effect.Effect<KernelFixture, InvalidFixtureError> =>
  Schema.decodeUnknownEffect(KernelFixtureSchema, fixtureParseOptions)(input).pipe(
    Effect.mapError(mapFixtureError),
  )

export const sampleKernelCurrency: Currency = "USD"
