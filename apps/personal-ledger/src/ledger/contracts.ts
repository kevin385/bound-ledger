import { DateTime, Schema } from "effect"

export const dashboardRange = {
  from: "2026-07-01T00:00:00.000Z",
  to: "2026-08-01T00:00:00.000Z",
  at: "2026-08-01T00:00:00.000Z",
} as const

const parseOptions = {
  errors: "all",
  onExcessProperty: "error",
  reportInput: false,
} as const

const EmptyInputSchema = Schema.Record(Schema.String, Schema.Never)

export const DashboardInputSchema = Schema.Struct({
  from: Schema.DateTimeUtcFromString,
  to: Schema.DateTimeUtcFromString,
  at: Schema.DateTimeUtcFromString,
})

export const QueryEventsInputSchema = Schema.Struct({
  from: Schema.optionalKey(Schema.DateTimeUtcFromString),
  to: Schema.optionalKey(Schema.DateTimeUtcFromString),
})

export const GetEventInputSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
})

export const RequestExpenseInputSchema = Schema.Struct({
  requestId: Schema.NonEmptyString,
  effectiveAt: Schema.DateTimeUtcFromString,
  amountMinor: Schema.Int.check(Schema.isGreaterThan(0)),
  expenseAccountId: Schema.NonEmptyString,
  fundingAccountId: Schema.NonEmptyString,
  note: Schema.Trim.check(Schema.isNonEmpty()),
})

export const RequestReversalInputSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  requestId: Schema.NonEmptyString,
})

export const ConfirmationInputSchema = Schema.Struct({
  confirmationId: Schema.NonEmptyString,
})

export const EmptyApplicationInputSchema = EmptyInputSchema

export interface DashboardInput {
  readonly from: string
  readonly to: string
  readonly at: string
}

export interface QueryEventsInput {
  readonly from?: string
  readonly to?: string
}

export interface GetEventInput {
  readonly eventId: string
}

export interface RequestExpenseInput {
  readonly requestId: string
  readonly effectiveAt: string
  readonly amountMinor: number
  readonly expenseAccountId: string
  readonly fundingAccountId: string
  readonly note: string
}

export interface RequestReversalInput {
  readonly eventId: string
  readonly requestId: string
}

export interface ConfirmationInput {
  readonly confirmationId: string
}

export const decodeDashboardInput = (input: unknown): DashboardInput => {
  const value = Schema.decodeUnknownSync(
    DashboardInputSchema,
    parseOptions,
  )(input)
  return {
    from: DateTime.formatIso(value.from),
    to: DateTime.formatIso(value.to),
    at: DateTime.formatIso(value.at),
  }
}

export const decodeQueryEventsInput = (input: unknown): QueryEventsInput => {
  const value = Schema.decodeUnknownSync(
    QueryEventsInputSchema,
    parseOptions,
  )(input)
  return {
    ...(value.from === undefined
      ? {}
      : { from: DateTime.formatIso(value.from) }),
    ...(value.to === undefined ? {} : { to: DateTime.formatIso(value.to) }),
  }
}

export const decodeGetEventInput = (input: unknown): GetEventInput =>
  Schema.decodeUnknownSync(GetEventInputSchema, parseOptions)(input)

export const decodeRequestExpenseInput = (
  input: unknown,
): RequestExpenseInput => {
  const value = Schema.decodeUnknownSync(
    RequestExpenseInputSchema,
    parseOptions,
  )(input)
  return {
    ...value,
    effectiveAt: DateTime.formatIso(value.effectiveAt),
  }
}

export const decodeRequestReversalInput = (
  input: unknown,
): RequestReversalInput =>
  Schema.decodeUnknownSync(RequestReversalInputSchema, parseOptions)(input)

export const decodeConfirmationInput = (input: unknown): ConfirmationInput =>
  Schema.decodeUnknownSync(ConfirmationInputSchema, parseOptions)(input)

export const decodeEmptyInput = (input: unknown): Record<string, never> =>
  Schema.decodeUnknownSync(EmptyApplicationInputSchema, parseOptions)(input)

export interface AccountView {
  readonly id: string
  readonly name: string
  readonly class: "asset" | "liability" | "equity" | "income" | "expense"
  readonly subtype: string
  readonly currency: string
  readonly balanceMinor: number
}

export interface PostingView {
  readonly accountId: string
  readonly accountName: string
  readonly currency: string
  readonly amountMinor: number
  readonly description?: string
}

export interface ProvenanceView {
  readonly sourceKind: string
  readonly sourceReference: string
  readonly sourceDigest: string
  readonly correlationId: string
  readonly causationId: string
  readonly evidenceReferences: ReadonlyArray<string>
}

export interface LineageView {
  readonly reverses?: string
  readonly replaces?: string
}

export interface EventView {
  readonly id: string
  readonly kind: string
  readonly effectiveAt: string
  readonly recordedAt: string
  readonly actorId: string
  readonly idempotencyKey: string
  readonly postings: ReadonlyArray<PostingView>
  readonly amountMinor: number
  readonly provenance: ProvenanceView
  readonly lineage?: LineageView
}

export type JsonValue =
  | null
  | string
  | number
  | boolean
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }

export interface AssumptionView {
  readonly field: string
  readonly proposedValue: JsonValue
  readonly confidence: number
  readonly rationale: string
  readonly evidenceReference?: string
}

export interface ProposalView {
  readonly id: string
  readonly kind: string
  readonly effectiveAt: string
  readonly recordedAt: string
  readonly actorId: string
  readonly postings: ReadonlyArray<PostingView>
  readonly amountMinor: number
  readonly provenance: ProvenanceView
  readonly assumptions: ReadonlyArray<AssumptionView>
}

export interface DashboardView {
  readonly accounts: ReadonlyArray<AccountView>
  readonly eventCount: number
  readonly expenseTotalMinor: number
  readonly trialBalanceMinor: number
  readonly from: string
  readonly to: string
  readonly at: string
}

export interface ConfirmationView {
  readonly id: string
  readonly capabilityName: "events.post" | "events.reverse"
  readonly summary: string
  readonly requestId: string
  readonly eventId?: string
  readonly amountMinor?: number
  readonly expenseAccountId?: string
  readonly fundingAccountId?: string
  readonly effectiveAt?: string
  readonly note?: string
}

export interface AttemptView {
  readonly name: string
  readonly outcome: "succeeded" | "failed" | "pending" | "rejected"
  readonly stage: string
  readonly authorization: string
  readonly confirmationId?: string
  readonly confirmation?: "pending" | "approved" | "rejected"
  readonly errorCode?: string
}

export type MutationResult =
  | { readonly status: "pending"; readonly confirmation: ConfirmationView }
  | { readonly status: "completed"; readonly event: EventView }
  | { readonly status: "rejected"; readonly confirmationId: string }

export type ApplicationErrorCode =
  | "invalid_input"
  | "not_found"
  | "confirmation_not_found"
  | "duplicate_request"
  | "mutation_refused"
  | "internal_error"

export type ServerResult<A> =
  | { readonly ok: true; readonly data: A }
  | {
      readonly ok: false
      readonly error: { readonly code: ApplicationErrorCode }
    }
