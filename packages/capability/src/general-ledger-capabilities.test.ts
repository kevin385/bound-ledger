import { it } from "@effect/vitest"
import { DateTime, Effect, Layer } from "effect"
import { describe, expect } from "vitest"

import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  decodeKernelFixture,
  makeInMemoryLedgerKernelLayer,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleKernelFixture,
  sampleTransactionsFixture,
  type Session,
} from "@bound/ledger"

import {
  CapabilityGateway,
  makeCapabilityGatewayLayer,
  type CapabilityGatewayService,
} from "./gateway.ts"
import { InvalidCapabilityInputError } from "./capability.ts"
import { generalLedgerReadCapabilities } from "./general-ledger-capabilities.ts"

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
  mutableAccountIds: new Set(),
}

const withGeneralLedgerGateway = <A, E>(
  use: (gateway: CapabilityGatewayService) => Effect.Effect<A, E>,
  session: Session = primarySession,
) =>
  Effect.gen(function* () {
    const transactions = yield* decodeFixtureTransactions(
      sampleTransactionsFixture,
    )
    const legacyAccounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
    const fixture = yield* decodeKernelFixture(sampleKernelFixture)
    const sessionLayer = makeTrustedSessionLayer(session)
    const legacyLayer = makeInMemoryLedgerLayer(
      transactions,
      legacyAccounts,
    ).pipe(Layer.provide(sessionLayer))
    const kernelLayer = makeInMemoryLedgerKernelLayer({
      currency: fixture.currency,
      accounts: fixture.accounts,
      events: fixture.events,
      proposals: fixture.proposals,
    }).pipe(Layer.provide(sessionLayer))
    const runtimeLayer = Layer.merge(
      Layer.merge(legacyLayer, kernelLayer),
      sessionLayer,
    )
    const gatewayLayer = makeCapabilityGatewayLayer(
      generalLedgerReadCapabilities,
    ).pipe(Layer.provide(runtimeLayer))

    return yield* CapabilityGateway.use(use).pipe(Effect.provide(gatewayLayer))
  })

describe("general-ledger read capabilities", () => {
  it.effect("invokes all six operations through one validated gateway path", () =>
    withGeneralLedgerGateway((gateway) =>
      Effect.gen(function* () {
        const accounts = yield* gateway.invoke("accounts.list", {})
        const events = yield* gateway.invoke("events.query", {
          from: "2026-07-01T05:30:00+05:30",
          to: "2026-08-01T00:00:00.000Z",
        })
        const event = yield* gateway.invoke("events.get", {
          eventId: "evt_003",
        })
        const balances = yield* gateway.invoke("reports.balance", {
          at: "2026-08-01T00:00:00.000Z",
        })
        const activity = yield* gateway.invoke("reports.activity", {
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-01T00:00:00.000Z",
        })
        const trialBalance = yield* gateway.invoke(
          "reports.trial_balance",
          { at: "2026-08-01T00:00:00.000Z" },
        )
        const attempts = yield* gateway.attempts

        expect(accounts).toHaveLength(10)
        expect(accounts.every((account) => account.ledgerId === "ledger_primary"))
          .toBe(true)
        expect(events.map((item) => item.id)).toEqual([
          "evt_003",
          "evt_004",
          "evt_005",
          "evt_006",
        ])
        expect(event.id).toBe("evt_003")
        expect(balances).toHaveLength(10)
        expect(activity.events.map((item) => item.id)).toEqual(
          events.map((item) => item.id),
        )
        expect(activity.expenseTotalMinor).toBe(6_249)
        expect(trialBalance.totalMinor).toBe(0)
        expect(attempts.map((attempt) => attempt.name)).toEqual([
          "accounts.list",
          "events.query",
          "events.get",
          "reports.balance",
          "reports.activity",
          "reports.trial_balance",
        ])
        expect(
          attempts.every(
            (attempt) =>
              attempt.authorization === "authorized" &&
              attempt.outcome === "succeeded" &&
              attempt.stage === "complete",
          ),
        ).toBe(true)

        const queryInput = attempts[1]?.decodedInput as {
          readonly from: DateTime.Utc
        }
        expect(DateTime.formatIso(queryInput.from)).toBe(
          "2026-07-01T00:00:00.000Z",
        )
      }),
    ),
  )

  it.effect("rejects invalid timestamps and unexpected authority input", () =>
    withGeneralLedgerGateway((gateway) =>
      Effect.gen(function* () {
        const invalidTimestamp = yield* Effect.flip(
          gateway.invoke("events.query", {
            from: "not-an-instant",
          }),
        )
        const injectedAuthority = yield* Effect.flip(
          gateway.invoke("accounts.list", {
            actorId: "model-controlled-actor",
          }),
        )
        const attempts = yield* gateway.attempts

        expect(invalidTimestamp).toBeInstanceOf(InvalidCapabilityInputError)
        expect(injectedAuthority).toBeInstanceOf(InvalidCapabilityInputError)
        expect(attempts).toHaveLength(2)
        expect(
          attempts.every(
            (attempt) =>
              attempt.stage === "input" &&
              attempt.authorization === "not_reached",
          ),
        ).toBe(true)
      }),
    ),
  )

  it.effect("records missing active-ledger authority as a refusal", () =>
    withGeneralLedgerGateway(
      (gateway) =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(
            gateway.invoke("accounts.list", {}),
          )
          const attempts = yield* gateway.attempts

          expect(error).toMatchObject({
            _tag: "KernelAuthorizationError",
            operation: "accounts.list",
            reason: "ledger_access_denied",
          })
          expect(attempts).toEqual([
            {
              name: "accounts.list",
              actorId: "actor_primary_owner",
              kind: "read",
              decodedInput: {},
              authorization: "refused",
              outcome: "failed",
              stage: "authorization",
              errorTag: "KernelAuthorizationError",
            },
          ])
        }),
      {
        actorId: "actor_primary_owner",
        activeWorkspaceId: "workspace_primary",
        readableAccountIds: new Set(primaryAccountIds),
        mutableAccountIds: new Set(),
      },
    ),
  )

  it.effect("refuses an event whose postings are not fully readable", () =>
    withGeneralLedgerGateway(
      (gateway) =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(
            gateway.invoke("events.get", { eventId: "evt_003" }),
          )
          const attempts = yield* gateway.attempts

          expect(error).toMatchObject({
            _tag: "KernelAuthorizationError",
            operation: "events.get",
            reason: "account_read_denied",
            accountId: "acct_groceries",
          })
          expect(attempts[0]).toMatchObject({
            name: "events.get",
            authorization: "refused",
            outcome: "failed",
            stage: "authorization",
            errorTag: "KernelAuthorizationError",
          })
        }),
      {
        ...primarySession,
        readableAccountIds: new Set(["acct_checking"]),
      },
    ),
  )
})
