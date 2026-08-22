import { Data, Effect, Schema } from "effect"

import type {
  KernelAppendError,
  LedgerMutationError,
  LedgerKernelService,
  LedgerService,
  Session,
} from "@bound/ledger"

export type CapabilityKind = "read" | "mutation"
export type CapabilityAgentAccess = "direct" | "confirmation_required"

export interface CapabilityMetadata {
  readonly name: string
  readonly description: string
  readonly kind: CapabilityKind
  readonly agentAccess: CapabilityAgentAccess
}

export type CapabilityAttemptStage =
  | "lookup"
  | "input"
  | "authorization"
  | "confirmation"
  | "execution"
  | "output"
  | "complete"

export type CapabilityAuthorization =
  | "not_reached"
  | "authorized"
  | "refused"

export type CapabilityConfirmation =
  | "pending"
  | "approved"
  | "rejected"

export interface ConfirmationRequest {
  readonly id: string
  readonly capabilityName: string
  readonly actorId: string
  readonly ledgerId: string
  readonly decodedInput: unknown
}

export interface CapabilityAttempt {
  readonly name: string
  readonly actorId: string
  readonly kind?: CapabilityKind
  readonly decodedInput?: unknown
  readonly authorization: CapabilityAuthorization
  readonly outcome: "succeeded" | "failed" | "pending" | "rejected"
  readonly stage: CapabilityAttemptStage
  readonly confirmationId?: string
  readonly confirmation?: CapabilityConfirmation
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

export class ConfirmationRequiredError extends Data.TaggedError(
  "ConfirmationRequiredError",
)<{
  readonly request: ConfirmationRequest
}> {}

export class UnknownConfirmationError extends Data.TaggedError(
  "UnknownConfirmationError",
)<{
  readonly confirmationId: string
}> {}

export class ConfirmationContextChangedError extends Data.TaggedError(
  "ConfirmationContextChangedError",
)<{
  readonly confirmationId: string
  readonly actorId: string
  readonly ledgerId?: string
}> {}

export type CapabilityInvocationError =
  | UnknownCapabilityError
  | InvalidCapabilityInputError
  | InvalidCapabilityOutputError
  | ConfirmationRequiredError
  | UnknownConfirmationError
  | ConfirmationContextChangedError
  | CapabilityDomainError

export type CapabilityDomainError = LedgerMutationError | KernelAppendError

export interface CapabilityRuntime {
  readonly ledger: LedgerService
  readonly kernel: LedgerKernelService
  readonly session: Session
}

export interface CapabilityDefinition {
  readonly name: string
  readonly description: string
  readonly kind: CapabilityKind
  readonly agentAccess: CapabilityAgentAccess
  readonly inputSchema: Schema.Decoder<unknown, never>
  readonly outputSchema: Schema.Decoder<unknown, never>
  readonly decodeInput: (
    input: unknown,
  ) => Effect.Effect<unknown, InvalidCapabilityInputError>
  readonly authorize: (
    input: unknown,
    runtime: CapabilityRuntime,
  ) => Effect.Effect<void, CapabilityDomainError>
  readonly execute: (
    input: unknown,
    runtime: CapabilityRuntime,
  ) => Effect.Effect<unknown, CapabilityDomainError>
  readonly decodeOutput: (
    output: unknown,
  ) => Effect.Effect<unknown, InvalidCapabilityOutputError>
}

export interface CapabilitySpec<Input, Output> {
  readonly name: string
  readonly description: string
  readonly kind: CapabilityKind
  readonly agentAccess?: CapabilityAgentAccess
  readonly input: Schema.Decoder<Input, never>
  readonly output: Schema.Decoder<Output, never>
  readonly authorize: (
    input: Input,
    runtime: CapabilityRuntime,
  ) => Effect.Effect<void, CapabilityDomainError>
  readonly execute: (
    input: Input,
    runtime: CapabilityRuntime,
  ) => Effect.Effect<Output, CapabilityDomainError>
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
  agentAccess: spec.agentAccess ?? "direct",
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
