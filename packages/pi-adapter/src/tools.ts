import { Effect } from "effect"
import { Type, type TSchema } from "typebox"

import type { CapabilityGatewayService } from "@bound/capability"
import type {
  AgentTool,
  AgentToolResult,
} from "@earendil-works/pi-agent-core"

export type LedgerCapabilityName =
  | "transactions.list"
  | "transactions.get"
  | "transactions.update_category"

export interface CapabilityToolDetails {
  readonly capabilityName: LedgerCapabilityName
  readonly output: unknown
}

const textResult = (
  capabilityName: LedgerCapabilityName,
  output: unknown,
): AgentToolResult<CapabilityToolDetails> => ({
  content: [{ type: "text", text: JSON.stringify(output) }],
  details: { capabilityName, output },
})

const runInvocation = (
  invocation: Effect.Effect<unknown, unknown>,
  signal: AbortSignal | undefined,
) =>
  signal === undefined
    ? Effect.runPromise(invocation)
    : Effect.runPromise(invocation, { signal })

const capabilityTool = <Parameters extends TSchema>(options: {
  readonly name: string
  readonly label: string
  readonly description: string
  readonly parameters: Parameters
  readonly capabilityName: LedgerCapabilityName
  readonly gateway: CapabilityGatewayService
}): AgentTool<Parameters, CapabilityToolDetails> => ({
  name: options.name,
  label: options.label,
  description: options.description,
  parameters: options.parameters,
  executionMode: "sequential",
  execute: async (_toolCallId, params, signal) => {
    const output = await runInvocation(
      options.gateway.invoke(options.capabilityName, params),
      signal,
    )

    return textResult(options.capabilityName, output)
  },
})

export const projectLedgerTools = (
  gateway: CapabilityGatewayService,
): ReadonlyArray<AgentTool<TSchema, CapabilityToolDetails>> => [
  capabilityTool({
    name: "transactions_list",
    label: "List transactions",
    description: "List readable transactions for a calendar month",
    parameters: Type.Object(
      {
        month: Type.String({
          pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
          description: "Calendar month in YYYY-MM format",
        }),
      },
      { additionalProperties: false },
    ),
    capabilityName: "transactions.list",
    gateway,
  }),
  capabilityTool({
    name: "transactions_get",
    label: "Get transaction",
    description: "Get one readable transaction by ID",
    parameters: Type.Object(
      {
        transactionId: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    capabilityName: "transactions.get",
    gateway,
  }),
  capabilityTool({
    name: "transactions_update_category",
    label: "Update transaction category",
    description: "Update the category of one mutable transaction",
    parameters: Type.Object(
      {
        transactionId: Type.String({ minLength: 1 }),
        category: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    capabilityName: "transactions.update_category",
    gateway,
  }),
]
