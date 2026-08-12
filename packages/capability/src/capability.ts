import { Data, Effect, Schema } from "effect"

import type {
  LedgerMutationError,
  LedgerService,
  Session,
} from "@bound/ledger"

export type CapabilityKind = "read" | "mutation"

export type CapabilityAttemptStage =
  | "lookup"
  | "input"
  | "authorization"
  | "execution"
  | "output"
  | "complete"

export type CapabilityAuthorization =
  | "not_reached"
  | "authorized"
  | "refused"

export interface CapabilityAttempt {
  readonly name: string
  readonly actorId: string
  readonly kind?: CapabilityKind
  readonly decodedInput?: unknown
  readonly authorization: CapabilityAuthorization
  readonly outcome: "succeeded" | "failed"
  readonly stage: CapabilityAttemptStage
  readonly errorTag?: string
}

export class DuplicateCapabilityError extends Data.TaggedError(
  "DuplicateCapabilityError",
)<{
  readonly name: string
}> {}

export class UnknownCapabilityError extends Data.TaggedError(
  "UnknownCapabilityError",
)<{
  readonly name: string
}> {}

export class InvalidCapabilityInputError extends Data.TaggedError(
  "InvalidCapabilityInputError",
)<{
  readonly name: string
  readonly details: string
}> {}

export class InvalidCapabilityOutputError extends Data.TaggedError(
  "InvalidCapabilityOutputError",
)<{
  readonly name: string
  readonly details: string
}> {}

export type CapabilityInvocationError =
  | UnknownCapabilityError
  | InvalidCapabilityInputError
  | InvalidCapabilityOutputError
  | LedgerMutationError

export interface CapabilityRuntime {
  readonly ledger: LedgerService
  readonly session: Session
}

export interface CapabilityDefinition {
  readonly name: string
  readonly description: string
  readonly kind: CapabilityKind
  readonly inputSchema: Schema.Decoder<unknown, never>
  readonly outputSchema: Schema.Decoder<unknown, never>
  readonly decodeInput: (
    input: unknown,
  ) => Effect.Effect<unknown, InvalidCapabilityInputError>
  readonly authorize: (
    input: unknown,
    runtime: CapabilityRuntime,
  ) => Effect.Effect<void, LedgerMutationError>
  readonly execute: (
    input: unknown,
    runtime: CapabilityRuntime,
  ) => Effect.Effect<unknown, LedgerMutationError>
  readonly decodeOutput: (
    output: unknown,
  ) => Effect.Effect<unknown, InvalidCapabilityOutputError>
}

export interface CapabilitySpec<Input, Output> {
  readonly name: string
  readonly description: string
  readonly kind: CapabilityKind
  readonly input: Schema.Decoder<Input, never>
  readonly output: Schema.Decoder<Output, never>
  readonly authorize: (
    input: Input,
    runtime: CapabilityRuntime,
  ) => Effect.Effect<void, LedgerMutationError>
  readonly execute: (
    input: Input,
    runtime: CapabilityRuntime,
  ) => Effect.Effect<Output, LedgerMutationError>
}

const parseOptions = {
  errors: "all",
  onExcessProperty: "error",
  reportInput: false,
} as const

export const defineCapability = <Input, Output>(
  spec: CapabilitySpec<Input, Output>,
): CapabilityDefinition => Object.freeze<CapabilityDefinition>({
  name: spec.name,
  description: spec.description,
  kind: spec.kind,
  inputSchema: spec.input,
  outputSchema: spec.output,
  decodeInput: (input) =>
    Schema.decodeUnknownEffect(spec.input, parseOptions)(input).pipe(
      Effect.mapError(
        (error) =>
          new InvalidCapabilityInputError({
            name: spec.name,
            details: error.message,
          }),
      ),
    ),
  authorize: (input, runtime) => spec.authorize(input as Input, runtime),
  execute: (input, runtime) => spec.execute(input as Input, runtime),
  decodeOutput: (output) =>
    Schema.decodeUnknownEffect(spec.output, parseOptions)(output).pipe(
      Effect.mapError(
        (error) =>
          new InvalidCapabilityOutputError({
            name: spec.name,
            details: error.message,
          }),
      ),
    ),
})
