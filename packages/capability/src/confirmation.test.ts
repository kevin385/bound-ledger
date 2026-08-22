import { it } from "@effect/vitest"
import { DateTime, Effect, Layer, Ref, Schema } from "effect"
import { TestClock } from "effect/testing"
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
  type FinancialEvent,
  type Provenance,
  type Session,
} from "@bound/ledger"

import {
  type CapabilityInvocationError,
  type CapabilityDefinition,
  ConfirmationRequiredError,
  defineCapability,
  UnknownConfirmationError,
} from "./capability.ts"
import {
  CapabilityGateway,
  makeCapabilityGatewayLayer,
  type CapabilityGatewayService,
} from "./gateway.ts"
import { generalLedgerCapabilities } from "./general-ledger-capabilities.ts"

const RECORDED_AT_MS = Date.parse("2026-08-22T12:00:00.000Z")

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

const provenance = (sourceReference: string): Provenance => ({
  sourceKind: "manual",
  sourceReference,
  sourceDigest: `sha256:${sourceReference}`,
  correlationId: sourceReference,
  causationId: sourceReference,
})

const postInput = (
  idempotencyKey: string,
  amountMinor = 1_250,
) => ({
  kind: "expense",
  effectiveAt: "2026-07-28T10:00:00.000Z",
  idempotencyKey,
  provenance: provenance(idempotencyKey),
  postings: [
    {
      accountId: "acct_groceries",
      currency: "USD",
      amountMinor,
    },
    {
      accountId: "acct_checking",
      currency: "USD",
      amountMinor: -amountMinor,
    },
  ],
})

const withGateway = <A, E>(
  use: (gateway: CapabilityGatewayService) => Effect.Effect<A, E>,
  options: {
    readonly session?: Session
    readonly definitions?: ReadonlyArray<CapabilityDefinition>
  } = {},
) =>
  Effect.gen(function* () {
    const transactions = yield* decodeFixtureTransactions(
      sampleTransactionsFixture,
    )
    const legacyAccounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
    const fixture = yield* decodeKernelFixture(sampleKernelFixture)
    const sessionLayer = makeTrustedSessionLayer(
      options.session ?? primarySession,
    )
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
      options.definitions ?? generalLedgerCapabilities,
    ).pipe(Layer.provide(runtimeLayer))

    return yield* Effect.gen(function* () {
      yield* TestClock.setTime(RECORDED_AT_MS)
      return yield* CapabilityGateway.use(use)
    }).pipe(
      Effect.provide(gatewayLayer),
      Effect.provide(TestClock.layer()),
    )
  })

const requestOf = <A>(
  effect: Effect.Effect<A, CapabilityInvocationError>,
) =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(effect)

    if (!(error instanceof ConfirmationRequiredError)) {
      return yield* Effect.fail(error)
    }

    return error.request
  })

const eventCount = (gateway: CapabilityGatewayService) =>
  gateway.invoke("events.query", {}).pipe(Effect.map((events) => events.length))

describe("capability confirmation", () => {
  it.effect("keeps unconfirmed and rejected mutations out of ledger state", () =>
    withGateway((gateway) =>
      Effect.gen(function* () {
        const before = yield* eventCount(gateway)
        const request = yield* requestOf(
          gateway.invoke("events.post", postInput("rejected-post")),
        )

        expect(yield* eventCount(gateway)).toBe(before)
        expect(yield* gateway.pendingConfirmations).toEqual([request])
        expect(
          (yield* gateway.attempts).find(
            (item) => item.confirmationId === request.id,
          ),
        ).toMatchObject({
          name: "events.post",
          outcome: "pending",
          stage: "confirmation",
          confirmation: "pending",
        })

        yield* gateway.reject(request.id)

        expect(yield* eventCount(gateway)).toBe(before)
        expect(yield* gateway.pendingConfirmations).toEqual([])
        expect(
          yield* Effect.flip(gateway.confirm(request.id)),
        ).toBeInstanceOf(UnknownConfirmationError)

        const attempt = (yield* gateway.attempts).find(
          (item) => item.confirmationId === request.id,
        )
        expect(attempt).toMatchObject({
          name: "events.post",
          outcome: "rejected",
          stage: "confirmation",
          confirmation: "rejected",
        })
      }),
    ),
  )

  it.effect("stores exact input privately and reauthorizes before execution", () =>
    Effect.gen(function* () {
      const authorizationCalls = yield* Ref.make(0)
      const executedInput = yield* Ref.make<string | undefined>(undefined)
      const definition = defineCapability({
        name: "test.confirmed_mutation",
        description: "Prove exact confirmation binding",
        kind: "mutation",
        agentAccess: "confirmation_required",
        input: Schema.Struct({ value: Schema.String }),
        output: Schema.Struct({ value: Schema.String }),
        authorize: () =>
          Ref.update(authorizationCalls, (current) => current + 1),
        execute: (input) =>
          Ref.set(executedInput, input.value).pipe(Effect.as(input)),
      })

      yield* withGateway(
        (gateway) =>
          Effect.gen(function* () {
            const rawInput = { value: "approved-value" }
            const request = yield* requestOf(
              gateway.invoke("test.confirmed_mutation", rawInput),
            )
            const preview = request.decodedInput as { value: string }

            rawInput.value = "altered-raw-input"

            expect(request).toMatchObject({
              capabilityName: "test.confirmed_mutation",
              actorId: "actor_primary_owner",
              ledgerId: "ledger_primary",
            })
            expect(Object.isFrozen(request)).toBe(true)
            expect(Object.isFrozen(preview)).toBe(true)
            expect(() => {
              preview.value = "altered-value"
            }).toThrow(TypeError)

            const output = yield* gateway.confirm(request.id)
            expect(output).toEqual({ value: "approved-value" })
            expect(
              yield* Effect.flip(gateway.confirm(request.id)),
            ).toBeInstanceOf(UnknownConfirmationError)
          }),
        { definitions: [definition] },
      )

      expect(yield* Ref.get(authorizationCalls)).toBe(2)
      expect(yield* Ref.get(executedInput)).toBe("approved-value")
    }),
  )

  it.effect("posts only after approval using trusted audit context", () =>
    withGateway((gateway) =>
      Effect.gen(function* () {
        const input = postInput("approved-post")
        const request = yield* requestOf(
          gateway.invoke("events.post", input),
        )
        const changedRequest = yield* requestOf(
          gateway.invoke("events.post", postInput("different-post", 2_500)),
        )
        const posted = (yield* gateway.confirm(request.id)) as FinancialEvent

        expect(posted).toMatchObject({
          ledgerId: "ledger_primary",
          actorId: "actor_primary_owner",
          idempotencyKey: "approved-post",
        })
        expect(DateTime.formatIso(posted.recordedAt)).toBe(
          "2026-08-22T12:00:00.000Z",
        )
        expect(posted.postings.map((item) => item.amountMinor)).toEqual([
          1_250,
          -1_250,
        ])

        const events = yield* gateway.invoke("events.query", {})
        expect(events.some((event) => event.idempotencyKey === "approved-post"))
          .toBe(true)
        expect(events.some((event) => event.idempotencyKey === "different-post"))
          .toBe(false)

        yield* gateway.reject(changedRequest.id)
      }),
    ),
  )

  it.effect("approves an exact reversal followed by a balanced replacement", () =>
    withGateway((gateway) =>
      Effect.gen(function* () {
        const original = yield* gateway.invoke("events.get", {
          eventId: "evt_003",
        })
        const reversalRequest = yield* requestOf(
          gateway.invoke("events.reverse", {
            eventId: original.id,
            idempotencyKey: "reverse-evt-003",
            provenance: provenance("reverse-evt-003"),
          }),
        )
        const reversal = (yield* gateway.confirm(
          reversalRequest.id,
        )) as FinancialEvent

        expect(reversal.lineage).toEqual({ reverses: original.id })
        expect(reversal.postings).toEqual(
          original.postings.map((posting) => ({
            accountId: posting.accountId,
            currency: posting.currency,
            amountMinor: -posting.amountMinor,
          })),
        )

        const replacementInput = {
          ...postInput("replacement-evt-003", 4_000),
          lineage: { replaces: original.id },
        }
        const replacementRequest = yield* requestOf(
          gateway.invoke("events.post", replacementInput),
        )
        const replacement = (yield* gateway.confirm(
          replacementRequest.id,
        )) as FinancialEvent
        const preservedOriginal = yield* gateway.invoke("events.get", {
          eventId: original.id,
        })

        expect(replacement.lineage).toEqual({ replaces: original.id })
        expect(replacement.postings.map((posting) => posting.amountMinor)).toEqual([
          4_000,
          -4_000,
        ])
        expect(preservedOriginal).toEqual(original)
      }),
    ),
  )

  it.effect("fails authorization before creating confirmation state", () =>
    Effect.gen(function* () {
      const noLedgerError = yield* Effect.flip(
        withGateway(
          (gateway) => gateway.invoke("events.post", postInput("no-ledger")),
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
      const accountError = yield* Effect.flip(
        withGateway(
          (gateway) =>
            gateway.invoke("events.post", postInput("denied-account")),
          {
            session: {
              ...primarySession,
              readableAccountIds: new Set(["acct_checking"]),
              mutableAccountIds: new Set(["acct_checking"]),
            },
          },
        ),
      )
      const missingEvent = yield* Effect.flip(
        withGateway((gateway) =>
          gateway.invoke("events.reverse", {
            eventId: "evt_missing",
            idempotencyKey: "missing-reversal",
            provenance: provenance("missing-reversal"),
          }),
        ),
      )

      expect(noLedgerError).toMatchObject({
        _tag: "KernelAuthorizationError",
        reason: "ledger_access_denied",
      })
      expect(accountError).toMatchObject({
        _tag: "KernelAuthorizationError",
        reason: "account_read_denied",
        accountId: "acct_groceries",
      })
      expect(missingEvent).toMatchObject({
        _tag: "EventNotFoundError",
        eventId: "evt_missing",
      })
    }),
  )

  it.effect("settles invalid confirmed mutations as failures without appending", () =>
    withGateway((gateway) =>
      Effect.gen(function* () {
        const before = yield* eventCount(gateway)
        const balancedInput = postInput("unbalanced-post")
        const unbalanced = {
          ...balancedInput,
          postings: balancedInput.postings.map((posting, index) => ({
            ...posting,
            amountMinor: index === 1 ? -1_000 : posting.amountMinor,
          })),
        }
        const unbalancedRequest = yield* requestOf(
          gateway.invoke("events.post", unbalanced),
        )
        const unbalancedError = yield* Effect.flip(
          gateway.confirm(unbalancedRequest.id),
        )
        const duplicateRequest = yield* requestOf(
          gateway.invoke("events.post", postInput("seed-deposit-may")),
        )
        const duplicateError = yield* Effect.flip(
          gateway.confirm(duplicateRequest.id),
        )

        expect(unbalancedError).toMatchObject({ _tag: "UnbalancedEventError" })
        expect(duplicateError).toMatchObject({
          _tag: "DuplicateIdempotencyKeyError",
          idempotencyKey: "seed-deposit-may",
        })
        expect(yield* eventCount(gateway)).toBe(before)

        const attempts = yield* gateway.attempts
        expect(
          attempts.find(
            (attempt) => attempt.confirmationId === unbalancedRequest.id,
          ),
        ).toMatchObject({
          outcome: "failed",
          stage: "execution",
          confirmation: "approved",
          errorTag: "UnbalancedEventError",
        })
      }),
    ),
  )
})
