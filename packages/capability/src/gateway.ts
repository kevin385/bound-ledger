import { Context, Effect, Layer, Ref } from "effect"

import {
  Ledger,
  TrustedSession,
  type LedgerService,
  type Session,
  type Transaction,
} from "@bound/ledger"

import {
  type CapabilityAttempt,
  type CapabilityAuthorization,
  type CapabilityDefinition,
  type CapabilityInvocationError,
  type CapabilityMetadata,
  DuplicateCapabilityError,
  UnknownCapabilityError,
} from "./capability.ts"
import { ledgerCapabilities } from "./ledger-capabilities.ts"

type Invoke = {
  (
    name: "transactions.list",
    input: unknown,
  ): Effect.Effect<ReadonlyArray<Transaction>, CapabilityInvocationError>
  (
    name: "transactions.get",
    input: unknown,
  ): Effect.Effect<Transaction, CapabilityInvocationError>
  (
    name: "transactions.update_category",
    input: unknown,
  ): Effect.Effect<Transaction, CapabilityInvocationError>
  (
    name: string,
    input: unknown,
  ): Effect.Effect<unknown, CapabilityInvocationError>
}

export interface CapabilityGatewayService {
  readonly capabilities: ReadonlyArray<CapabilityMetadata>
  readonly invoke: Invoke
  readonly attempts: Effect.Effect<ReadonlyArray<CapabilityAttempt>>
}

export const CapabilityGateway = Context.Service<CapabilityGatewayService>(
  "@bound/capability/CapabilityGateway",
)

const errorTag = (error: CapabilityInvocationError): string => error._tag

export const makeCapabilityGatewayLayer = (
  definitions: ReadonlyArray<CapabilityDefinition> = ledgerCapabilities,
): Layer.Layer<
  CapabilityGatewayService,
  DuplicateCapabilityError,
  LedgerService | Session
> =>
  Layer.effect(CapabilityGateway)(
    Effect.gen(function* () {
      const ledger = yield* Ledger
      const session = yield* TrustedSession
      const registry = new Map<string, CapabilityDefinition>()

      for (const definition of definitions) {
        if (registry.has(definition.name)) {
          return yield* new DuplicateCapabilityError({
            name: definition.name,
          })
        }

        registry.set(definition.name, definition)
      }

      const capabilities: ReadonlyArray<CapabilityMetadata> = Object.freeze(
        [...registry.values()].map((definition) =>
          Object.freeze<CapabilityMetadata>({
            name: definition.name,
            description: definition.description,
            kind: definition.kind,
          }),
        ),
      )

      const attemptLog = yield* Ref.make<ReadonlyArray<CapabilityAttempt>>([])
      const record = (attempt: CapabilityAttempt) =>
        Ref.update(attemptLog, (current) => [...current, attempt])

      const fail = (
        definition: CapabilityDefinition | undefined,
        stage: CapabilityAttempt["stage"],
        authorization: CapabilityAuthorization,
        error: CapabilityInvocationError,
        decodedInput?: unknown,
      ): Effect.Effect<never, CapabilityInvocationError> =>
        Effect.gen(function* () {
          yield* record({
            name:
              definition?.name ??
              (error instanceof UnknownCapabilityError
                ? error.name
                : "unknown"),
            actorId: session.actorId,
            ...(definition === undefined ? {} : { kind: definition.kind }),
            ...(decodedInput === undefined ? {} : { decodedInput }),
            authorization,
            outcome: "failed",
            stage,
            errorTag: errorTag(error),
          })

          return yield* error
        })

      const invokeUnknown = (
        name: string,
        input: unknown,
      ): Effect.Effect<unknown, CapabilityInvocationError> =>
        Effect.gen(function* () {
          const definition = registry.get(name)

          if (definition === undefined) {
            return yield* fail(
              undefined,
              "lookup",
              "not_reached",
              new UnknownCapabilityError({ name }),
            )
          }

          const decodedInput = yield* definition.decodeInput(input).pipe(
            Effect.catch((error) =>
              fail(definition, "input", "not_reached", error),
            ),
          )

          yield* definition.authorize(decodedInput, { ledger, session }).pipe(
            Effect.catch((error) =>
              fail(
                definition,
                "authorization",
                "refused",
                error,
                decodedInput,
              ),
            ),
          )

          const output = yield* definition
            .execute(decodedInput, { ledger, session })
            .pipe(
              Effect.catch((error) =>
                fail(
                  definition,
                  "execution",
                  "authorized",
                  error,
                  decodedInput,
                ),
              ),
            )

          const decodedOutput = yield* definition.decodeOutput(output).pipe(
            Effect.catch((error) =>
              fail(
                definition,
                "output",
                "authorized",
                error,
                decodedInput,
              ),
            ),
          )

          yield* record({
            name: definition.name,
            actorId: session.actorId,
            kind: definition.kind,
            decodedInput,
            authorization: "authorized",
            outcome: "succeeded",
            stage: "complete",
          })

          return decodedOutput
        })

      return {
        capabilities,
        invoke: invokeUnknown as Invoke,
        attempts: Ref.get(attemptLog).pipe(
          Effect.map((attempts) => [...attempts]),
        ),
      }
    }),
  )
