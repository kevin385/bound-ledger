import { Type } from "typebox"

import {
  CODE_MODE_DEFAULT_LIMITS,
  executeCode,
  type CodeModeRunResult,
} from "@bound/code-mode"
import type {
  CapabilityGatewayService,
  CapabilityKind,
} from "@bound/capability"
import type {
  AgentTool,
  AgentToolResult,
} from "@earendil-works/pi-agent-core"

const ExecuteCodeParameters = Type.Object(
  {
    program: Type.String({
      minLength: 1,
      description:
        "Generator body using yield* for app capability calls; return a JSON-serializable value",
    }),
  },
  { additionalProperties: false },
)

interface CodeCapabilityProjection {
  readonly name: string
  readonly call: string
}

const codeCapabilityProjections: ReadonlyArray<CodeCapabilityProjection> = [
  {
    name: "transactions.list",
    call: 'yield* app.transactions.list({ month: "YYYY-MM" })',
  },
  {
    name: "transactions.get",
    call: "yield* app.transactions.get({ transactionId })",
  },
  {
    name: "transactions.update_category",
    call: "yield* app.transactions.updateCategory({ transactionId, category })",
  },
]

export interface CodeCapabilityGuideEntry {
  readonly name: string
  readonly description: string
  readonly kind: CapabilityKind
  readonly call: string
}

export interface CodeModeGuide {
  readonly syntax: string
  readonly capabilities: ReadonlyArray<CodeCapabilityGuideEntry>
  readonly limits: typeof CODE_MODE_DEFAULT_LIMITS
}

export type CodeModeToolDetails = CodeModeRunResult

export const inspectCodeMode = (
  gateway: CapabilityGatewayService,
): CodeModeGuide => {
  const metadata = new Map(
    gateway.capabilities.map((capability) => [capability.name, capability]),
  )
  const capabilities = codeCapabilityProjections.flatMap((projection) => {
    const capability = metadata.get(projection.name)
    if (capability === undefined) return []
    return [
      Object.freeze({
        name: capability.name,
        description: capability.description,
        kind: capability.kind,
        call: projection.call,
      }),
    ]
  })

  return Object.freeze({
    syntax:
      "Provide a generator body. Use yield* for SDK calls and return JSON-serializable data.",
    capabilities: Object.freeze(capabilities),
    limits: CODE_MODE_DEFAULT_LIMITS,
  })
}

export const formatCodeModeGuide = (
  gateway: CapabilityGatewayService,
): string => JSON.stringify(inspectCodeMode(gateway))

const codeResult = (
  result: CodeModeRunResult,
): AgentToolResult<CodeModeToolDetails> => ({
  content: [{ type: "text", text: JSON.stringify(result) }],
  details: result,
})

export const projectCodeModeTools = (
  gateway: CapabilityGatewayService,
): ReadonlyArray<AgentTool<typeof ExecuteCodeParameters, CodeModeToolDetails>> => [
  {
    name: "execute_code",
    label: "Execute bounded ledger code",
    description:
      "Execute a generator body against the bounded Bound Ledger SDK described in the system prompt",
    parameters: ExecuteCodeParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) =>
      codeResult(
        await executeCode(params.program, {
          gateway,
          ...(signal === undefined ? {} : { signal }),
        }),
      ),
  },
]
