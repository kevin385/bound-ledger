import { it } from "@effect/vitest"
import { Effect, Layer, Ref, Schema } from "effect"
import { describe, expect } from "vitest"

import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleTransactionsFixture,
  type Session,
} from "@bound/ledger"

import {
  defineCapability,
  DuplicateCapabilityError,
  InvalidCapabilityInputError,
  InvalidCapabilityOutputError,
  type CapabilityDefinition,
} from "./capability.ts"
import {
  CapabilityGateway,
  makeCapabilityGatewayLayer,
  type CapabilityGatewayService,
} from "./gateway.ts"

const primarySession: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  readableAccountIds: new Set([
    "account_checking",
    "account_credit",
  ]),
  mutableAccountIds: new Set(["account_checking"]),
}

const withSampleGateway = <A, E>(
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
    const accounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
    const sessionLayer = makeTrustedSessionLayer(
      options.session ?? primarySession,
    )
    const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
      Layer.provide(sessionLayer),
    )
    const runtimeLayer = Layer.merge(ledgerLayer, sessionLayer)
    const gatewayLayer = makeCapabilityGatewayLayer(
      options.definitions,
    ).pipe(Layer.provide(runtimeLayer))

    return yield* CapabilityGateway.use(use).pipe(
      Effect.provide(gatewayLayer),
    )
  })

describe("CapabilityGateway", () => {
  it.effect("invokes all three ledger operations through one path", () =>
    withSampleGateway((gateway) =>
      Effect.gen(function* () {
        const listed = yield* gateway.invoke("transactions.list", {
          month: "2026-07",
        })
        const found = yield* gateway.invoke("transactions.get", {
          transactionId: "txn_001",
        })
        const updated = yield* gateway.invoke(
          "transactions.update_category",
          {
            transactionId: "txn_001",
            category: "  household  ",
          },
        )
        const persisted = yield* gateway.invoke("transactions.get", {
          transactionId: "txn_001",
        })
        const attempts = yield* gateway.attempts

        expect(listed.map((transaction) => transaction.id)).toEqual([
          "txn_001",
          "txn_002",
          "txn_003",
        ])
        expect(found.merchant).toBe("Northstar Market")
        expect(updated.category).toBe("household")
        expect(persisted.category).toBe("household")
        expect(attempts).toHaveLength(4)
        expect(attempts.map((attempt) => attempt.name)).toEqual([
          "transactions.list",
          "transactions.get",
          "transactions.update_category",
          "transactions.get",
        ])
        expect(
          attempts.every(
            (attempt) =>
              attempt.authorization === "authorized" &&
              attempt.outcome === "succeeded" &&
              attempt.stage === "complete",
          ),
        ).toBe(true)
        expect(attempts[2]?.decodedInput).toEqual({
          transactionId: "txn_001",
          category: "household",
        })
      }),
    ),
  )

  it.effect("rejects invalid input before authorization or execution", () =>
    Effect.gen(function* () {
      const authorizationCalls = yield* Ref.make(0)
      const executionCalls = yield* Ref.make(0)
      const definition = defineCapability({
        name: "test.boundary",
        description: "Exercise the validation boundary",
        kind: "read",
        input: Schema.Struct({ value: Schema.String }),
        output: Schema.Struct({ value: Schema.String }),
        authorize: () => Ref.update(authorizationCalls, (count) => count + 1),
        execute: (input) =>
          Ref.update(executionCalls, (count) => count + 1).pipe(
            Effect.as(input),
          ),
      })

      yield* withSampleGateway(
        (gateway) =>
          Effect.gen(function* () {
            const error = yield* Effect.flip(
              gateway.invoke("test.boundary", {
                value: 42,
                privateValue: "must-not-appear",
              }),
            )
            const attempts = yield* gateway.attempts

            if (!(error instanceof InvalidCapabilityInputError)) {
              throw new Error("Expected InvalidCapabilityInputError")
            }

            expect(error.details).not.toContain("must-not-appear")
            expect(attempts).toEqual([
              {
                name: "test.boundary",
                actorId: "actor_primary_owner",
                kind: "read",
                authorization: "not_reached",
                outcome: "failed",
                stage: "input",
                errorTag: "InvalidCapabilityInputError",
              },
            ])
          }),
        { definitions: [definition] },
      )

      expect(yield* Ref.get(authorizationCalls)).toBe(0)
      expect(yield* Ref.get(executionCalls)).toBe(0)
    }),
  )

  it.effect("rejects unexpected input properties", () =>
    withSampleGateway((gateway) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          gateway.invoke("transactions.list", {
            month: "2026-07",
            actorId: "model-controlled-actor",
          }),
        )

        if (!(error instanceof InvalidCapabilityInputError)) {
          throw new Error("Expected InvalidCapabilityInputError")
        }

        expect(error.details).toContain("actorId")
      }),
    ),
  )

  it.effect("fails closed for unknown capability names and records the attempt", () =>
    withSampleGateway((gateway) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          gateway.invoke("transactions.delete", { transactionId: "txn_001" }),
        )
        const attempts = yield* gateway.attempts

        expect(error).toMatchObject({
          _tag: "UnknownCapabilityError",
          name: "transactions.delete",
        })
        expect(attempts).toEqual([
          {
            name: "transactions.delete",
            actorId: "actor_primary_owner",
            authorization: "not_reached",
            outcome: "failed",
            stage: "lookup",
            errorTag: "UnknownCapabilityError",
          },
        ])
      }),
    ),
  )

  it.effect("records authorization refusal without mutating state", () =>
    withSampleGateway((gateway) =>
      Effect.gen(function* () {
        const before = yield* gateway.invoke("transactions.get", {
          transactionId: "txn_002",
        })
        const error = yield* Effect.flip(
          gateway.invoke("transactions.update_category", {
            transactionId: "txn_002",
            category: "shopping",
          }),
        )
        const after = yield* gateway.invoke("transactions.get", {
          transactionId: "txn_002",
        })
        const attempts = yield* gateway.attempts

        expect(error).toMatchObject({
          _tag: "LedgerAuthorizationError",
          operation: "transactions.update_category",
          reason: "account_mutation_denied",
        })
        expect(after).toEqual(before)
        expect(attempts[1]).toMatchObject({
          name: "transactions.update_category",
          authorization: "refused",
          outcome: "failed",
          stage: "authorization",
          errorTag: "LedgerAuthorizationError",
        })
      }),
    ),
  )

  it.effect("rejects successful operation output that violates its schema", () =>
    {
      const definition = defineCapability({
        name: "test.invalid_output",
        description: "Return deliberately invalid output",
        kind: "read",
        input: Schema.Struct({}),
        output: Schema.Struct({ value: Schema.String }),
        authorize: () => Effect.void,
        execute: () =>
          Effect.succeed(
            { value: 42 } as unknown as { readonly value: string },
          ),
      })

      return withSampleGateway(
        (gateway) =>
          Effect.gen(function* () {
            const error = yield* Effect.flip(
              gateway.invoke("test.invalid_output", {}),
            )
            const attempts = yield* gateway.attempts

            expect(error).toBeInstanceOf(InvalidCapabilityOutputError)
            expect(attempts[0]).toMatchObject({
              authorization: "authorized",
              outcome: "failed",
              stage: "output",
              errorTag: "InvalidCapabilityOutputError",
            })
          }),
        { definitions: [definition] },
      )
    },
  )

  it.effect("rejects duplicate capability names during composition", () => {
    const definition = defineCapability({
      name: "test.duplicate",
      description: "Duplicate registry entry",
      kind: "read",
      input: Schema.Struct({}),
      output: Schema.Struct({}),
      authorize: () => Effect.void,
      execute: () => Effect.succeed({}),
    })

    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        withSampleGateway(() => Effect.void, {
          definitions: [definition, definition],
        }),
      )

      expect(error).toBeInstanceOf(DuplicateCapabilityError)
      expect(error.name).toBe("test.duplicate")
    })
  })
})
