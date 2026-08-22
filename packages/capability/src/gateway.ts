import { Context, Effect, Layer, Ref } from "effect"

import {
  Ledger,
  LedgerKernel,
  TrustedSession,
  type AccountBalance,
  type ActivityReport,
  type FinancialEvent,
  type EventProposal,
  type LedgerAccount,
  type LedgerKernelService,
  type LedgerService,
  type Session,
  type Transaction,
  type TrialBalance,
} from "@bound/ledger"

import {
  type CapabilityAttempt,
  type CapabilityAuthorization,
  type CapabilityDefinition,
  type CapabilityInvocationError,
  type CapabilityMetadata,
  type ConfirmationRequest,
  ConfirmationContextChangedError,
  ConfirmationRequiredError,
  DuplicateCapabilityError,
  UnknownConfirmationError,
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
    name: "accounts.list",
    input: unknown,
  ): Effect.Effect<ReadonlyArray<LedgerAccount>, CapabilityInvocationError>
  (
    name: "events.get",
    input: unknown,
  ): Effect.Effect<FinancialEvent, CapabilityInvocationError>
  (
    name: "events.query",
    input: unknown,
  ): Effect.Effect<ReadonlyArray<FinancialEvent>, CapabilityInvocationError>
  (
    name: "reports.balance",
    input: unknown,
  ): Effect.Effect<ReadonlyArray<AccountBalance>, CapabilityInvocationError>
  (
    name: "reports.activity",
    input: unknown,
  ): Effect.Effect<ActivityReport, CapabilityInvocationError>
  (
    name: "reports.trial_balance",
    input: unknown,
  ): Effect.Effect<TrialBalance, CapabilityInvocationError>
  (
    name: "events.post" | "events.reverse",
    input: unknown,
  ): Effect.Effect<FinancialEvent, CapabilityInvocationError>
  (
    name: "proposals.query",
    input: unknown,
  ): Effect.Effect<ReadonlyArray<EventProposal>, CapabilityInvocationError>
  (
    name: string,
    input: unknown,
  ): Effect.Effect<unknown, CapabilityInvocationError>
}

export interface CapabilityGatewayService {
  readonly capabilities: ReadonlyArray<CapabilityMetadata>
  readonly invoke: Invoke
  readonly confirm: (
    confirmationId: string,
  ) => Effect.Effect<unknown, CapabilityInvocationError>
  readonly reject: (
    confirmationId: string,
  ) => Effect.Effect<void, UnknownConfirmationError>
  readonly pendingConfirmations: Effect.Effect<
    ReadonlyArray<ConfirmationRequest>
  >
  readonly attempts: Effect.Effect<ReadonlyArray<CapabilityAttempt>>
}

export const CapabilityGateway = Context.Service<CapabilityGatewayService>(
  "@bound/capability/CapabilityGateway",
)

const errorTag = (error: CapabilityInvocationError): string => error._tag

interface PendingConfirmation {
  readonly request: ConfirmationRequest
  readonly definition: CapabilityDefinition
  readonly decodedInput: unknown
}

const freezeDeep = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value
  }

  for (const child of Object.values(value)) {
    freezeDeep(child)
  }

  return Object.freeze(value)
}

const immutablePreview = (value: unknown): unknown => {
  const serialized = JSON.stringify(value)

  return serialized === undefined
    ? undefined
    : freezeDeep(JSON.parse(serialized) as unknown)
}

export const makeCapabilityGatewayLayer = (
  definitions: ReadonlyArray<CapabilityDefinition> = ledgerCapabilities,
): Layer.Layer<
  CapabilityGatewayService,
  DuplicateCapabilityError,
  LedgerKernelService | LedgerService | Session
> =>
  Layer.effect(CapabilityGateway)(
    Effect.gen(function* () {
      const ledger = yield* Ledger
      const kernel = yield* LedgerKernel
      const session = yield* TrustedSession
      const runtime = { ledger, kernel, session }
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
            agentAccess: definition.agentAccess,
          }),
        ),
      )

      const attemptLog = yield* Ref.make<ReadonlyArray<CapabilityAttempt>>([])
      const pendingConfirmations = yield* Ref.make<
        ReadonlyMap<string, PendingConfirmation>
      >(new Map())
      const nextConfirmationSequence = yield* Ref.make(1)
      const record = (attempt: CapabilityAttempt) =>
        Ref.update(attemptLog, (current) => [...current, attempt])

      const settleConfirmationAttempt = (
        confirmationId: string,
        patch: Partial<CapabilityAttempt>,
      ) =>
        Ref.update(attemptLog, (current) =>
          current.map((attempt) =>
            attempt.confirmationId === confirmationId
              ? { ...attempt, ...patch }
              : attempt,
          ),
        )

      const takePendingConfirmation = (confirmationId: string) =>
        Ref.modify(pendingConfirmations, (current) => {
          const pending = current.get(confirmationId)

          if (pending === undefined) {
            return [undefined, current] as const
          }

          const next = new Map(current)
          next.delete(confirmationId)
          return [pending, next] as const
        })

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

      const requestConfirmation = (
        definition: CapabilityDefinition,
        decodedInput: unknown,
      ): Effect.Effect<never, CapabilityInvocationError> =>
        Effect.gen(function* () {
          const ledgerId = session.activeLedgerId

          if (ledgerId === undefined) {
            return yield* fail(
              definition,
              "authorization",
              "refused",
              new ConfirmationContextChangedError({
                confirmationId: "unassigned",
                actorId: session.actorId,
              }),
              decodedInput,
            )
          }

          const sequence = yield* Ref.modify(
            nextConfirmationSequence,
            (current) => [current, current + 1] as const,
          )
          const confirmationId = `confirmation_${String(sequence).padStart(3, "0")}`
          const request = Object.freeze<ConfirmationRequest>({
            id: confirmationId,
            capabilityName: definition.name,
            actorId: session.actorId,
            ledgerId,
            decodedInput: immutablePreview(decodedInput),
          })

          yield* Ref.update(pendingConfirmations, (current) => {
            const next = new Map(current)
            next.set(confirmationId, {
              request,
              definition,
              decodedInput,
            })
            return next
          })
          yield* record({
            name: definition.name,
            actorId: session.actorId,
            kind: definition.kind,
            decodedInput: request.decodedInput,
            authorization: "authorized",
            outcome: "pending",
            stage: "confirmation",
            confirmationId,
            confirmation: "pending",
          })

          return yield* new ConfirmationRequiredError({ request })
        })

      const failConfirmation = (
        pending: PendingConfirmation,
        stage: CapabilityAttempt["stage"],
        authorization: CapabilityAuthorization,
        error: CapabilityInvocationError,
      ): Effect.Effect<never, CapabilityInvocationError> =>
        Effect.gen(function* () {
          yield* settleConfirmationAttempt(pending.request.id, {
            authorization,
            outcome: "failed",
            stage,
            confirmation: "approved",
            errorTag: errorTag(error),
          })

          return yield* error
        })

      const confirm = (
        confirmationId: string,
      ): Effect.Effect<unknown, CapabilityInvocationError> =>
        Effect.gen(function* () {
          const pending = yield* takePendingConfirmation(confirmationId)

          if (pending === undefined) {
            return yield* new UnknownConfirmationError({ confirmationId })
          }

          if (
            pending.request.actorId !== session.actorId ||
            pending.request.ledgerId !== session.activeLedgerId
          ) {
            return yield* failConfirmation(
              pending,
              "authorization",
              "refused",
              new ConfirmationContextChangedError({
                confirmationId,
                actorId: session.actorId,
                ...(session.activeLedgerId === undefined
                  ? {}
                  : { ledgerId: session.activeLedgerId }),
              }),
            )
          }

          yield* pending.definition
            .authorize(pending.decodedInput, runtime)
            .pipe(
              Effect.catch((error) =>
                failConfirmation(pending, "authorization", "refused", error),
              ),
            )

          const output = yield* pending.definition
            .execute(pending.decodedInput, runtime)
            .pipe(
              Effect.catch((error) =>
                failConfirmation(pending, "execution", "authorized", error),
              ),
            )

          const decodedOutput = yield* pending.definition
            .decodeOutput(output)
            .pipe(
              Effect.catch((error) =>
                failConfirmation(pending, "output", "authorized", error),
              ),
            )

          yield* settleConfirmationAttempt(confirmationId, {
            authorization: "authorized",
            outcome: "succeeded",
            stage: "complete",
            confirmation: "approved",
          })

          return decodedOutput
        })

      const reject = (
        confirmationId: string,
      ): Effect.Effect<void, UnknownConfirmationError> =>
        Effect.gen(function* () {
          const pending = yield* takePendingConfirmation(confirmationId)

          if (pending === undefined) {
            return yield* new UnknownConfirmationError({ confirmationId })
          }

          yield* settleConfirmationAttempt(confirmationId, {
            outcome: "rejected",
            stage: "confirmation",
            confirmation: "rejected",
          })
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

          const decodedInput = yield* definition
            .decodeInput(input)
            .pipe(
              Effect.catch((error) =>
                fail(definition, "input", "not_reached", error),
              ),
            )

          yield* definition
            .authorize(decodedInput, runtime)
            .pipe(
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

          if (definition.agentAccess === "confirmation_required") {
            return yield* requestConfirmation(definition, decodedInput)
          }

          const output = yield* definition
            .execute(decodedInput, runtime)
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

          const decodedOutput = yield* definition
            .decodeOutput(output)
            .pipe(
              Effect.catch((error) =>
                fail(definition, "output", "authorized", error, decodedInput),
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
        confirm,
        reject,
        pendingConfirmations: Ref.get(pendingConfirmations).pipe(
          Effect.map((pending) =>
            [...pending.values()].map((entry) => entry.request),
          ),
        ),
        attempts: Ref.get(attemptLog).pipe(
          Effect.map((attempts) => [...attempts]),
        ),
      }
    }),
  )
