import { Effect } from "effect"
import { Type, type TSchema } from "typebox"

import {
  ConfirmationRequiredError,
  type CapabilityGatewayService,
  type ConfirmationRequest,
} from "@bound/capability"
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"

export type GeneralLedgerCapabilityName =
  | "accounts.list"
  | "events.get"
  | "events.query"
  | "reports.balance"
  | "reports.activity"
  | "reports.trial_balance"
  | "events.post"
  | "events.reverse"

export type GeneralLedgerToolDetails =
  | {
      readonly status: "succeeded"
      readonly capabilityName: GeneralLedgerCapabilityName
      readonly output: unknown
    }
  | {
      readonly status: "confirmation_required"
      readonly capabilityName: "events.post" | "events.reverse"
      readonly confirmation: ConfirmationRequest
    }

const ClosedEmptyObject = Type.Object({}, { additionalProperties: false })

const DateTimeString = Type.String({
  format: "date-time",
  description: "ISO 8601 timestamp with a UTC offset",
})

const Provenance = Type.Object(
  {
    sourceKind: Type.Union([
      Type.Literal("fixture"),
      Type.Literal("manual"),
      Type.Literal("note"),
      Type.Literal("csv"),
      Type.Literal("agent"),
      Type.Literal("reversal"),
    ]),
    sourceReference: Type.String({ minLength: 1 }),
    sourceDigest: Type.String({ minLength: 1 }),
    correlationId: Type.String({ minLength: 1 }),
    causationId: Type.String({ minLength: 1 }),
    evidenceReferences: Type.Optional(
      Type.Array(Type.String({ minLength: 1 })),
    ),
  },
  { additionalProperties: false },
)

const Posting = Type.Object(
  {
    accountId: Type.String({ minLength: 1 }),
    currency: Type.String({ pattern: "^[A-Z]{3}$" }),
    amountMinor: Type.Integer(),
    description: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

const Lineage = Type.Object(
  {
    reverses: Type.Optional(Type.String({ minLength: 1 })),
    replaces: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
)

const EventKind = Type.Union([
  Type.Literal("deposit"),
  Type.Literal("contribution"),
  Type.Literal("transfer"),
  Type.Literal("withdrawal"),
  Type.Literal("expense"),
  Type.Literal("refund"),
  Type.Literal("adjustment"),
])

interface GeneralLedgerToolProjection {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: TSchema
  readonly capabilityName: GeneralLedgerCapabilityName
}

const projections: ReadonlyArray<GeneralLedgerToolProjection> = [
  {
    name: "accounts_list",
    label: "List accounts",
    description: "List readable accounts in the active ledger",
    parameters: ClosedEmptyObject,
    capabilityName: "accounts.list",
  },
  {
    name: "events_get",
    label: "Get event",
    description: "Get one readable posted financial event by ID",
    parameters: Type.Object(
      { eventId: Type.String({ minLength: 1 }) },
      { additionalProperties: false },
    ),
    capabilityName: "events.get",
  },
  {
    name: "events_query",
    label: "Query events",
    description:
      "Query readable posted events in an optional half-open effective-time range",
    parameters: Type.Object(
      {
        from: Type.Optional(DateTimeString),
        to: Type.Optional(DateTimeString),
      },
      { additionalProperties: false },
    ),
    capabilityName: "events.query",
  },
  {
    name: "reports_balance",
    label: "Account balances",
    description: "Return debit-positive account balances before an instant",
    parameters: Type.Object(
      { at: DateTimeString },
      { additionalProperties: false },
    ),
    capabilityName: "reports.balance",
  },
  {
    name: "reports_activity",
    label: "Activity report",
    description:
      "Return posted activity and net expense debits for a half-open time range",
    parameters: Type.Object(
      { from: DateTimeString, to: DateTimeString },
      { additionalProperties: false },
    ),
    capabilityName: "reports.activity",
  },
  {
    name: "reports_trial_balance",
    label: "Trial balance",
    description:
      "Return account balances and their signed total before an instant",
    parameters: Type.Object(
      { at: DateTimeString },
      { additionalProperties: false },
    ),
    capabilityName: "reports.trial_balance",
  },
  {
    name: "events_post",
    label: "Request event posting",
    description:
      "Request confirmation to post one balanced financial event; this does not approve or execute the mutation",
    parameters: Type.Object(
      {
        kind: EventKind,
        effectiveAt: DateTimeString,
        idempotencyKey: Type.String({ minLength: 1 }),
        provenance: Provenance,
        postings: Type.Array(Posting, { minItems: 2 }),
        lineage: Type.Optional(Lineage),
      },
      { additionalProperties: false },
    ),
    capabilityName: "events.post",
  },
  {
    name: "events_reverse",
    label: "Request event reversal",
    description:
      "Request confirmation to append an exact reversal; this does not approve or execute the mutation",
    parameters: Type.Object(
      {
        eventId: Type.String({ minLength: 1 }),
        idempotencyKey: Type.String({ minLength: 1 }),
        provenance: Provenance,
      },
      { additionalProperties: false },
    ),
    capabilityName: "events.reverse",
  },
]

const toolResult = (
  details: GeneralLedgerToolDetails,
): AgentToolResult<GeneralLedgerToolDetails> => ({
  content: [{ type: "text", text: JSON.stringify(details) }],
  details,
})

const runInvocation = (
  gateway: CapabilityGatewayService,
  capabilityName: GeneralLedgerCapabilityName,
  input: unknown,
  signal: AbortSignal | undefined,
) =>
  signal === undefined
    ? Effect.runPromise(gateway.invoke(capabilityName, input))
    : Effect.runPromise(gateway.invoke(capabilityName, input), { signal })

const capabilityTool = (
  projection: GeneralLedgerToolProjection,
  gateway: CapabilityGatewayService,
): AgentTool<TSchema, GeneralLedgerToolDetails> => ({
  name: projection.name,
  label: projection.label,
  description: projection.description,
  parameters: projection.parameters,
  executionMode: "sequential",
  execute: async (_toolCallId, params, signal) => {
    try {
      const output = await runInvocation(
        gateway,
        projection.capabilityName,
        params,
        signal,
      )

      return toolResult({
        status: "succeeded",
        capabilityName: projection.capabilityName,
        output,
      })
    } catch (error) {
      if (
        error instanceof ConfirmationRequiredError &&
        (projection.capabilityName === "events.post" ||
          projection.capabilityName === "events.reverse") &&
        error.request.capabilityName === projection.capabilityName
      ) {
        return toolResult({
          status: "confirmation_required",
          capabilityName: projection.capabilityName,
          confirmation: error.request,
        })
      }

      throw error
    }
  },
})

export const projectGeneralLedgerTools = (
  gateway: CapabilityGatewayService,
): ReadonlyArray<AgentTool<TSchema, GeneralLedgerToolDetails>> => {
  const available = new Set(
    gateway.capabilities.map((capability) => capability.name),
  )

  return projections
    .filter((projection) => available.has(projection.capabilityName))
    .map((projection) => capabilityTool(projection, gateway))
}
