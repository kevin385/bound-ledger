import { it } from "@effect/vitest"
import { DateTime, Effect, Equal, Layer } from "effect"
import { TestClock } from "effect/testing"
import { describe, expect } from "vitest"

import type { LedgerAccount } from "./chart-account.ts"
import {
  decodeKernelFixture,
  sampleKernelFixture,
} from "./financial-fixtures.ts"
import type { PostEventInput, Provenance } from "./financial-event.ts"
import {
  CrossLedgerPostingError,
  CurrencyMismatchError,
  DuplicateIdempotencyKeyError,
  DuplicateReversalError,
  EventNotFoundError,
  InsufficientPostingsError,
  KernelAuthorizationError,
  LedgerKernel,
  makeInMemoryLedgerKernelLayer,
  MissingLineageTargetError,
  UnbalancedEventError,
  UnknownAccountError,
  type LedgerKernelService,
} from "./ledger-kernel.ts"
import {
  makeTrustedSessionLayer,
  type Session,
} from "./trusted-session.ts"

const RECORDED_AT_MS = Date.parse("2026-08-18T12:00:00.000Z")

const utc = (iso: string): DateTime.Utc =>
  DateTime.toUtc(DateTime.makeUnsafe(iso))

const posting = (
  accountId: string,
  amountMinor: number,
  currency = "USD",
) => ({
  accountId,
  currency,
  amountMinor,
})

const provenance = (sourceReference: string): Provenance => ({
  sourceKind: "fixture",
  sourceReference,
  sourceDigest: `sha256:${sourceReference}`,
  correlationId: sourceReference,
  causationId: sourceReference,
})

const primaryAccountIds = [
  "acct_checking",
  "acct_cash",
  "acct_receivable",
  "acct_investment",
  "acct_credit",
  "acct_loan",
  "acct_equity",
  "acct_income",
  "acct_groceries",
  "acct_utilities",
] as const

const primarySession: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  activeLedgerId: "ledger_primary",
  readableAccountIds: new Set(primaryAccountIds),
  mutableAccountIds: new Set(primaryAccountIds),
}

const balanceOf = (
  balances: ReadonlyArray<{ readonly accountId: string; readonly amountMinor: number }>,
  accountId: string,
) => balances.find((balance) => balance.accountId === accountId)?.amountMinor ?? 0

const withKernel = <A, E>(
  use: (
    kernel: LedgerKernelService,
    accounts: ReadonlyArray<LedgerAccount>,
  ) => Effect.Effect<A, E>,
  options: {
    readonly session?: Session
    readonly seedEvents?: boolean
    readonly seedProposals?: boolean
  } = {},
) =>
  Effect.gen(function* () {
    const fixture = yield* decodeKernelFixture(sampleKernelFixture)
    const sessionLayer = makeTrustedSessionLayer(
      options.session ?? primarySession,
    )
    const kernelLayer = makeInMemoryLedgerKernelLayer({
      currency: fixture.currency,
      accounts: fixture.accounts,
      ...(options.seedEvents === true ? { events: fixture.events } : {}),
      ...(options.seedProposals === true
        ? { proposals: fixture.proposals }
        : {}),
    }).pipe(Layer.provide(sessionLayer))

    return yield* Effect.gen(function* () {
      yield* TestClock.setTime(RECORDED_AT_MS)
      return yield* LedgerKernel.use((kernel) => use(kernel, fixture.accounts))
    }).pipe(
      Effect.provide(kernelLayer),
      Effect.provide(TestClock.layer()),
    )
  })

const post = (kernel: LedgerKernelService, input: PostEventInput) =>
  kernel.postEvent(input)

describe("LedgerKernel", () => {
  it.effect("posts a deposit that increases the asset and income balances", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        yield* post(kernel, {
          kind: "deposit",
          effectiveAt: utc("2026-05-04T12:00:00.000Z"),
          idempotencyKey: "deposit-1",
          provenance: provenance("deposit-1"),
          postings: [
            posting("acct_checking", 50_000),
            posting("acct_income", -50_000),
          ],
        })
        const balances = yield* kernel.balancesAt(utc("2026-05-05T00:00:00.000Z"))

        expect(balanceOf(balances, "acct_checking")).toBe(50_000)
        expect(balanceOf(balances, "acct_income")).toBe(-50_000)
      }),
    ),
  )

  it.effect("posts a contribution that increases the asset and equity balances", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        yield* post(kernel, {
          kind: "contribution",
          effectiveAt: utc("2026-06-02T12:00:00.000Z"),
          idempotencyKey: "contribution-1",
          provenance: provenance("contribution-1"),
          postings: [
            posting("acct_checking", 20_000),
            posting("acct_equity", -20_000),
          ],
        })
        const balances = yield* kernel.balancesAt(utc("2026-06-03T00:00:00.000Z"))

        expect(balanceOf(balances, "acct_checking")).toBe(20_000)
        expect(balanceOf(balances, "acct_equity")).toBe(-20_000)
      }),
    ),
  )

  it.effect("posts a checking expense that reduces the asset and increases expenses", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        yield* post(kernel, {
          kind: "expense",
          effectiveAt: utc("2026-07-01T15:00:00.000Z"),
          idempotencyKey: "checking-expense-1",
          provenance: provenance("checking-expense-1"),
          postings: [
            posting("acct_groceries", 4_250),
            posting("acct_checking", -4_250),
          ],
        })
        const at = utc("2026-07-02T00:00:00.000Z")
        const balances = yield* kernel.balancesAt(at)
        const activity = yield* kernel.activityForRange(
          utc("2026-07-01T00:00:00.000Z"),
          utc("2026-08-01T00:00:00.000Z"),
        )

        expect(balanceOf(balances, "acct_checking")).toBe(-4_250)
        expect(balanceOf(balances, "acct_groceries")).toBe(4_250)
        expect(activity.expenseTotalMinor).toBe(4_250)
      }),
    ),
  )

  it.effect("posts a credit-card expense without changing cash", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        yield* post(kernel, {
          kind: "expense",
          effectiveAt: utc("2026-07-12T18:00:00.000Z"),
          idempotencyKey: "card-expense-1",
          provenance: provenance("card-expense-1"),
          postings: [
            posting("acct_utilities", 1_999),
            posting("acct_credit", -1_999),
          ],
        })
        const balances = yield* kernel.balancesAt(utc("2026-07-13T00:00:00.000Z"))

        expect(balanceOf(balances, "acct_cash")).toBe(0)
        expect(balanceOf(balances, "acct_checking")).toBe(0)
        expect(balanceOf(balances, "acct_utilities")).toBe(1_999)
        expect(balanceOf(balances, "acct_credit")).toBe(-1_999)
      }),
    ),
  )

  it.effect("posts a checking-to-cash withdrawal with no expense", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        yield* post(kernel, {
          kind: "withdrawal",
          effectiveAt: utc("2026-07-20T09:00:00.000Z"),
          idempotencyKey: "withdrawal-1",
          provenance: provenance("withdrawal-1"),
          postings: [
            posting("acct_cash", 3_500),
            posting("acct_checking", -3_500),
          ],
        })
        const at = utc("2026-07-21T00:00:00.000Z")
        const balances = yield* kernel.balancesAt(at)
        const activity = yield* kernel.activityForRange(
          utc("2026-07-01T00:00:00.000Z"),
          utc("2026-08-01T00:00:00.000Z"),
        )

        expect(balanceOf(balances, "acct_cash")).toBe(3_500)
        expect(balanceOf(balances, "acct_checking")).toBe(-3_500)
        expect(balanceOf(balances, "acct_groceries")).toBe(0)
        expect(activity.expenseTotalMinor).toBe(0)
      }),
    ),
  )

  it.effect("posts a transfer that nets to zero across two accounts", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        yield* post(kernel, {
          kind: "transfer",
          effectiveAt: utc("2026-07-25T11:00:00.000Z"),
          idempotencyKey: "transfer-1",
          provenance: provenance("transfer-1"),
          postings: [
            posting("acct_investment", 10_000),
            posting("acct_checking", -10_000),
          ],
        })
        const balances = yield* kernel.balancesAt(utc("2026-07-26T00:00:00.000Z"))

        expect(balanceOf(balances, "acct_investment")).toBe(10_000)
        expect(balanceOf(balances, "acct_checking")).toBe(-10_000)
        expect(
          balanceOf(balances, "acct_investment") +
            balanceOf(balances, "acct_checking"),
        ).toBe(0)
      }),
    ),
  )

  it.effect("posts a refund as the contra of an expense", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        yield* post(kernel, {
          kind: "expense",
          effectiveAt: utc("2026-07-01T15:00:00.000Z"),
          idempotencyKey: "expense-before-refund",
          provenance: provenance("expense-before-refund"),
          postings: [
            posting("acct_groceries", 4_250),
            posting("acct_checking", -4_250),
          ],
        })
        yield* post(kernel, {
          kind: "refund",
          effectiveAt: utc("2026-08-03T14:00:00.000Z"),
          idempotencyKey: "refund-1",
          provenance: provenance("refund-1"),
          postings: [
            posting("acct_checking", 500),
            posting("acct_groceries", -500),
          ],
        })
        const balances = yield* kernel.balancesAt(utc("2026-08-04T00:00:00.000Z"))
        const activity = yield* kernel.activityForRange(
          utc("2026-07-01T00:00:00.000Z"),
          utc("2026-09-01T00:00:00.000Z"),
        )

        expect(balanceOf(balances, "acct_checking")).toBe(-3_750)
        expect(balanceOf(balances, "acct_groceries")).toBe(3_750)
        expect(activity.expenseTotalMinor).toBe(3_750)
      }),
    ),
  )

  it.effect("keeps a proposal queryable without changing balances", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        const before = yield* kernel.balancesAt(utc("2026-08-01T00:00:00.000Z"))
        const proposal = yield* kernel.appendProposal({
          kind: "expense",
          effectiveAt: utc("2026-07-18T13:00:00.000Z"),
          provenance: provenance("ambiguous-grocery"),
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
        })
        const after = yield* kernel.balancesAt(utc("2026-08-01T00:00:00.000Z"))
        const proposals = yield* kernel.queryProposals()

        expect(proposal.id).toBe("prop_001")
        expect(proposals).toHaveLength(1)
        expect(proposals[0]?.assumptions[0]?.field).toBe("accountId")
        expect(after).toEqual(before)
      }),
    ),
  )

  it.effect("derives half-open activity and a balanced trial balance", () =>
    withKernel(
      (kernel) =>
        Effect.gen(function* () {
          const july = yield* kernel.activityForRange(
            utc("2026-07-01T00:00:00.000Z"),
            utc("2026-08-01T00:00:00.000Z"),
          )
          const augustStart = yield* kernel.activityForRange(
            utc("2026-08-01T00:00:00.000Z"),
            utc("2026-08-01T00:00:00.001Z"),
          )
          const trial = yield* kernel.trialBalanceAt(
            utc("2026-09-01T00:00:00.000Z"),
          )
          const julyEndBalances = yield* kernel.balancesAt(
            utc("2026-08-01T00:00:00.000Z"),
          )

          expect(july.events.map((event) => event.id)).toEqual([
            "evt_003",
            "evt_004",
            "evt_005",
            "evt_006",
          ])
          expect(july.expenseTotalMinor).toBe(4_250 + 1_999)
          expect(augustStart.events).toEqual([])
          expect(trial.totalMinor).toBe(0)
          expect(balanceOf(julyEndBalances, "acct_checking")).toBe(
            50_000 + 20_000 - 4_250 - 3_500 - 10_000,
          )
        }),
      { seedEvents: true },
    ),
  )

  it.effect("reverses an event exactly and posts a balanced replacement", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        const original = yield* post(kernel, {
          kind: "adjustment",
          effectiveAt: utc("2026-08-10T10:00:00.000Z"),
          idempotencyKey: "adjust-original",
          provenance: provenance("adjust-original"),
          postings: [
            posting("acct_loan", 2_000),
            posting("acct_receivable", -2_000),
          ],
        })
        const reversal = yield* kernel.reverseEvent({
          eventId: original.id,
          idempotencyKey: "adjust-reversal",
          provenance: provenance("adjust-reversal"),
        })
        const replacement = yield* post(kernel, {
          kind: "adjustment",
          effectiveAt: utc("2026-08-10T16:30:00.000Z"),
          idempotencyKey: "adjust-replacement",
          provenance: provenance("adjust-replacement"),
          postings: [
            posting("acct_loan", 1_500),
            posting("acct_receivable", -1_500),
          ],
          lineage: { replaces: original.id },
        })
        const events = yield* kernel.queryEvents()
        const balances = yield* kernel.balancesAt(utc("2026-08-11T00:00:00.000Z"))
        const duplicate = yield* Effect.flip(
          kernel.reverseEvent({
            eventId: original.id,
            idempotencyKey: "adjust-reversal-again",
            provenance: provenance("adjust-reversal-again"),
          }),
        )

        expect(reversal.lineage?.reverses).toBe(original.id)
        expect(reversal.postings.map((item) => item.amountMinor)).toEqual([
          -2_000,
          2_000,
        ])
        expect(replacement.lineage?.replaces).toBe(original.id)
        expect(events.map((event) => event.id)).toEqual([
          original.id,
          reversal.id,
          replacement.id,
        ])
        expect(balanceOf(balances, "acct_loan")).toBe(1_500)
        expect(balanceOf(balances, "acct_receivable")).toBe(-1_500)
        expect(duplicate).toBeInstanceOf(DuplicateReversalError)
        expect(original.actorId).toBe("actor_primary_owner")
        expect(DateTime.toEpochMillis(original.recordedAt)).toBe(RECORDED_AT_MS)
        expect(DateTime.toEpochMillis(reversal.recordedAt)).toBe(RECORDED_AT_MS)
      }),
    ),
  )

  it.effect("rebuilds identical projections by replaying posted events", () =>
    withKernel((kernel, accounts) =>
      Effect.gen(function* () {
        yield* post(kernel, {
          kind: "deposit",
          effectiveAt: utc("2026-05-04T12:00:00.000Z"),
          idempotencyKey: "replay-deposit",
          provenance: provenance("replay-deposit"),
          postings: [
            posting("acct_checking", 50_000),
            posting("acct_income", -50_000),
          ],
        })
        yield* post(kernel, {
          kind: "expense",
          effectiveAt: utc("2026-07-01T15:00:00.000Z"),
          idempotencyKey: "replay-expense",
          provenance: provenance("replay-expense"),
          postings: [
            posting("acct_groceries", 4_250),
            posting("acct_checking", -4_250),
          ],
        })
        const at = utc("2026-08-01T00:00:00.000Z")
        const events = yield* kernel.queryEvents()
        const originalBalances = yield* kernel.balancesAt(at)
        const originalTrial = yield* kernel.trialBalanceAt(at)
        const replayLayer = makeInMemoryLedgerKernelLayer({
          currency: "USD",
          accounts,
          events,
        }).pipe(Layer.provide(makeTrustedSessionLayer(primarySession)))
        const replayed = yield* LedgerKernel.use((replayedKernel) =>
          Effect.gen(function* () {
            const balances = yield* replayedKernel.balancesAt(at)
            const trial = yield* replayedKernel.trialBalanceAt(at)

            return { balances, trial }
          }),
        ).pipe(Effect.provide(replayLayer))

        expect(Equal.equals(replayed.balances, originalBalances)).toBe(true)
        expect(replayed.trial.totalMinor).toBe(originalTrial.totalMinor)
        expect(replayed.balances).toEqual(originalBalances)
      }),
    ),
  )

  it.effect("rejects invalid appends without changing state", () =>
    withKernel((kernel) =>
      Effect.gen(function* () {
        const posted = yield* post(kernel, {
          kind: "deposit",
          effectiveAt: utc("2026-05-04T12:00:00.000Z"),
          idempotencyKey: "kept-deposit",
          provenance: provenance("kept-deposit"),
          postings: [
            posting("acct_checking", 50_000),
            posting("acct_income", -50_000),
          ],
        })
        const before = yield* kernel.queryEvents()
        const unbalanced = yield* Effect.flip(
          post(kernel, {
            kind: "deposit",
            effectiveAt: utc("2026-05-04T12:00:00.000Z"),
            idempotencyKey: "unbalanced",
            provenance: provenance("unbalanced"),
            postings: [
              posting("acct_checking", 50_000),
              posting("acct_income", -40_000),
            ],
          }),
        )
        const onePosting = yield* Effect.flip(
          post(kernel, {
            kind: "deposit",
            effectiveAt: utc("2026-05-04T12:00:00.000Z"),
            idempotencyKey: "one-posting",
            provenance: provenance("one-posting"),
            postings: [posting("acct_checking", 50_000)],
          }),
        )
        const unknown = yield* Effect.flip(
          post(kernel, {
            kind: "deposit",
            effectiveAt: utc("2026-05-04T12:00:00.000Z"),
            idempotencyKey: "unknown-account",
            provenance: provenance("unknown-account"),
            postings: [
              posting("acct_missing", 50_000),
              posting("acct_income", -50_000),
            ],
          }),
        )
        const crossLedger = yield* Effect.flip(
          post(kernel, {
            kind: "transfer",
            effectiveAt: utc("2026-05-04T12:00:00.000Z"),
            idempotencyKey: "cross-ledger",
            provenance: provenance("cross-ledger"),
            postings: [
              posting("acct_secondary_checking", 50_000),
              posting("acct_checking", -50_000),
            ],
          }),
        )
        const wrongCurrency = yield* Effect.flip(
          post(kernel, {
            kind: "deposit",
            effectiveAt: utc("2026-05-04T12:00:00.000Z"),
            idempotencyKey: "eur-deposit",
            provenance: provenance("eur-deposit"),
            postings: [
              posting("acct_checking", 50_000, "EUR"),
              posting("acct_income", -50_000, "EUR"),
            ],
          }),
        )
        const duplicate = yield* Effect.flip(
          post(kernel, {
            kind: "deposit",
            effectiveAt: utc("2026-05-04T12:00:00.000Z"),
            idempotencyKey: "kept-deposit",
            provenance: provenance("kept-deposit-duplicate"),
            postings: [
              posting("acct_checking", 50_000),
              posting("acct_income", -50_000),
            ],
          }),
        )
        const missingTarget = yield* Effect.flip(
          post(kernel, {
            kind: "adjustment",
            effectiveAt: utc("2026-08-10T16:30:00.000Z"),
            idempotencyKey: "replace-missing",
            provenance: provenance("replace-missing"),
            postings: [
              posting("acct_loan", 1_500),
              posting("acct_receivable", -1_500),
            ],
            lineage: { replaces: "evt_missing" },
          }),
        )
        const after = yield* kernel.queryEvents()

        expect(unbalanced).toBeInstanceOf(UnbalancedEventError)
        expect(onePosting).toBeInstanceOf(InsufficientPostingsError)
        expect(unknown).toBeInstanceOf(UnknownAccountError)
        expect(crossLedger).toBeInstanceOf(CrossLedgerPostingError)
        expect(wrongCurrency).toBeInstanceOf(CurrencyMismatchError)
        expect(duplicate).toBeInstanceOf(DuplicateIdempotencyKeyError)
        expect(missingTarget).toBeInstanceOf(MissingLineageTargetError)
        expect(after.map((event) => event.id)).toEqual([posted.id])
        expect(before).toEqual(after)
      }),
    ),
  )

  it.effect("hides another ledger's events and rejects cross-ledger appends", () =>
    withKernel(
      (kernel) =>
        Effect.gen(function* () {
          const events = yield* kernel.queryEvents()
          const hidden = yield* Effect.flip(kernel.getEvent("evt_001"))
          const append = yield* Effect.flip(
            post(kernel, {
              kind: "deposit",
              effectiveAt: utc("2026-05-04T12:00:00.000Z"),
              idempotencyKey: "secondary-to-primary",
              provenance: provenance("secondary-to-primary"),
              postings: [
                posting("acct_checking", 50_000),
                posting("acct_income", -50_000),
              ],
            }),
          )

          expect(events).toEqual([])
          expect(hidden).toBeInstanceOf(EventNotFoundError)
          expect(append).toBeInstanceOf(CrossLedgerPostingError)
        }),
      {
        seedEvents: true,
        session: {
          actorId: "actor_secondary",
          activeWorkspaceId: "workspace_secondary",
          activeLedgerId: "ledger_secondary",
          readableAccountIds: new Set(["acct_secondary_checking"]),
          mutableAccountIds: new Set(["acct_secondary_checking"]),
        },
      },
    ),
  )

  it.effect("denies a session without an active ledger", () =>
    withKernel(
      (kernel) =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(
            kernel.queryEvents(),
          )

          expect(error).toBeInstanceOf(KernelAuthorizationError)
          expect(error).toMatchObject({
            reason: "ledger_access_denied",
            operation: "events.query",
          })
        }),
      {
        session: {
          actorId: "actor_primary_owner",
          activeWorkspaceId: "workspace_primary",
          readableAccountIds: new Set(primaryAccountIds),
          mutableAccountIds: new Set(primaryAccountIds),
        },
      },
    ),
  )

  it.effect("denies posting to an unreadable account without state change", () =>
    withKernel(
      (kernel) =>
        Effect.gen(function* () {
          const before = yield* kernel.queryEvents()
          const error = yield* Effect.flip(
            post(kernel, {
              kind: "withdrawal",
              effectiveAt: utc("2026-07-20T09:00:00.000Z"),
              idempotencyKey: "hidden-cash",
              provenance: provenance("hidden-cash"),
              postings: [
                posting("acct_cash", 3_500),
                posting("acct_checking", -3_500),
              ],
            }),
          )
          const after = yield* kernel.queryEvents()

          expect(error).toMatchObject({
            _tag: "KernelAuthorizationError",
            reason: "account_read_denied",
            accountId: "acct_cash",
          })
          expect(after).toEqual(before)
        }),
      {
        session: {
          actorId: "actor_primary_owner",
          activeWorkspaceId: "workspace_primary",
          activeLedgerId: "ledger_primary",
          readableAccountIds: new Set(
            primaryAccountIds.filter((id) => id !== "acct_cash"),
          ),
          mutableAccountIds: new Set(
            primaryAccountIds.filter((id) => id !== "acct_cash"),
          ),
        },
      },
    ),
  )

  it.effect("denies mutation of a read-only account without state change", () =>
    withKernel(
      (kernel) =>
        Effect.gen(function* () {
          const before = yield* kernel.queryEvents()
          const error = yield* Effect.flip(
            post(kernel, {
              kind: "expense",
              effectiveAt: utc("2026-07-12T18:00:00.000Z"),
              idempotencyKey: "readonly-card",
              provenance: provenance("readonly-card"),
              postings: [
                posting("acct_utilities", 1_999),
                posting("acct_credit", -1_999),
              ],
            }),
          )
          const after = yield* kernel.queryEvents()

          expect(error).toMatchObject({
            _tag: "KernelAuthorizationError",
            reason: "account_mutation_denied",
            accountId: "acct_credit",
          })
          expect(after).toEqual(before)
        }),
      {
        session: {
          actorId: "actor_primary_owner",
          activeWorkspaceId: "workspace_primary",
          activeLedgerId: "ledger_primary",
          readableAccountIds: new Set(primaryAccountIds),
          mutableAccountIds: new Set(
            primaryAccountIds.filter((id) => id !== "acct_credit"),
          ),
        },
      },
    ),
  )
})
