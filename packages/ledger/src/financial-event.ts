import { Schema } from "effect"

import { AmountMinorSchema, CurrencySchema } from "./money.ts"

const NonEmptyTrimmedString = Schema.Trim.check(Schema.isNonEmpty())

export const EventKindSchema = Schema.Literals([
  "deposit",
  "contribution",
  "transfer",
  "withdrawal",
  "expense",
  "refund",
  "adjustment",
])

export const SourceKindSchema = Schema.Literals([
  "fixture",
  "manual",
  "note",
  "csv",
  "agent",
  "reversal",
])

export const PostingSchema = Schema.Struct({
  accountId: Schema.NonEmptyString,
  currency: CurrencySchema,
  amountMinor: AmountMinorSchema,
  description: Schema.optionalKey(NonEmptyTrimmedString),
})

export const ProvenanceSchema = Schema.Struct({
  sourceKind: SourceKindSchema,
  sourceReference: Schema.NonEmptyString,
  sourceDigest: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
  causationId: Schema.NonEmptyString,
  evidenceReferences: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
})

export const LineageSchema = Schema.Struct({
  reverses: Schema.optionalKey(Schema.NonEmptyString),
  replaces: Schema.optionalKey(Schema.NonEmptyString),
})

export const AssumptionSchema = Schema.Struct({
  field: Schema.NonEmptyString,
  proposedValue: Schema.Unknown,
  confidence: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  rationale: NonEmptyTrimmedString,
  evidenceReference: Schema.optionalKey(Schema.NonEmptyString),
})

export const FinancialEventSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  ledgerId: Schema.NonEmptyString,
  kind: EventKindSchema,
  effectiveAt: Schema.DateTimeUtcFromString,
  recordedAt: Schema.DateTimeUtcFromString,
  actorId: Schema.NonEmptyString,
  idempotencyKey: Schema.NonEmptyString,
  provenance: ProvenanceSchema,
  postings: Schema.Array(PostingSchema),
  lineage: Schema.optionalKey(LineageSchema),
})

export const EventProposalSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  ledgerId: Schema.NonEmptyString,
  kind: EventKindSchema,
  effectiveAt: Schema.DateTimeUtcFromString,
  recordedAt: Schema.DateTimeUtcFromString,
  actorId: Schema.NonEmptyString,
  provenance: ProvenanceSchema,
  postings: Schema.Array(PostingSchema),
  assumptions: Schema.Array(AssumptionSchema),
})

export const PostEventInputSchema = Schema.Struct({
  kind: EventKindSchema,
  effectiveAt: Schema.DateTimeUtcFromString,
  idempotencyKey: Schema.NonEmptyString,
  provenance: ProvenanceSchema,
  postings: Schema.Array(PostingSchema),
  lineage: Schema.optionalKey(LineageSchema),
})

export const ReverseEventInputSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  idempotencyKey: Schema.NonEmptyString,
  provenance: ProvenanceSchema,
})

export const AppendProposalInputSchema = Schema.Struct({
  kind: EventKindSchema,
  effectiveAt: Schema.DateTimeUtcFromString,
  provenance: ProvenanceSchema,
  postings: Schema.Array(PostingSchema),
  assumptions: Schema.Array(AssumptionSchema),
})

export const FinancialEventListSchema = Schema.Array(FinancialEventSchema)

export const EventProposalListSchema = Schema.Array(EventProposalSchema)

export type EventKind = Schema.Schema.Type<typeof EventKindSchema>

export type SourceKind = Schema.Schema.Type<typeof SourceKindSchema>

export type Posting = Schema.Schema.Type<typeof PostingSchema>

export type Provenance = Schema.Schema.Type<typeof ProvenanceSchema>

export type Lineage = Schema.Schema.Type<typeof LineageSchema>

export type Assumption = Schema.Schema.Type<typeof AssumptionSchema>

export type FinancialEvent = Schema.Schema.Type<typeof FinancialEventSchema>

export type EventProposal = Schema.Schema.Type<typeof EventProposalSchema>

export type PostEventInput = Schema.Schema.Type<typeof PostEventInputSchema>

export type ReverseEventInput = Schema.Schema.Type<typeof ReverseEventInputSchema>

export type AppendProposalInput = Schema.Schema.Type<typeof AppendProposalInputSchema>
