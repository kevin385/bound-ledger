import { Type, type TSchema } from "typebox"

import {
  CODE_MODE_DEFAULT_LIMITS,
  discoverCodeModeCapabilities,
  executeCode,
  resolveCodeModeManifest,
  type CodeModeCapabilitySummary,
  type CodeModeDiscoveryInput,
  type CodeModeRunResult,
} from "@bound/code-mode"
import type { CapabilityGatewayService } from "@bound/capability"
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"

const InspectCapabilitiesParameters = Type.Object(
  {
    query: Type.Optional(
      Type.String({
        minLength: 1,
        description: "Optional capability name or description search",
      }),
    ),
    detail: Type.Optional(
      Type.Union([Type.Literal("summary"), Type.Literal("declaration")]),
    ),
  },
  { additionalProperties: false },
)

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

export interface CodeModeGuide {
  readonly syntax: string
  readonly discovery: string
  readonly confirmation: string
  readonly limits: typeof CODE_MODE_DEFAULT_LIMITS
}

export interface CodeModeDiscoveryResult {
  readonly capabilities: ReadonlyArray<CodeModeCapabilitySummary>
}

export type CodeModeToolDetails = CodeModeDiscoveryResult | CodeModeRunResult

export const inspectCodeMode = (
  gateway: CapabilityGatewayService,
  input: CodeModeDiscoveryInput = {},
): CodeModeDiscoveryResult =>
  Object.freeze({
    capabilities: discoverCodeModeCapabilities(
      resolveCodeModeManifest(gateway.capabilities),
      input,
    ),
  })

export const formatCodeModeGuide = (): string =>
  JSON.stringify(
    Object.freeze<CodeModeGuide>({
      syntax:
        "Provide a generator body to execute_code. Use yield* for app SDK calls and return JSON-serializable data.",
      discovery:
        "Call inspect_capabilities to search summaries or request compact declarations before writing code.",
      confirmation:
        "A confirmation-required mutation stops the program and returns an exact pending preview. The model cannot approve or reject it.",
      limits: CODE_MODE_DEFAULT_LIMITS,
    }),
  )

const toolResult = <Details>(details: Details): AgentToolResult<Details> => ({
  content: [{ type: "text", text: JSON.stringify(details) }],
  details,
})

export const projectCodeModeTools = (
  gateway: CapabilityGatewayService,
): ReadonlyArray<AgentTool<TSchema, CodeModeToolDetails>> => [
  {
    name: "inspect_capabilities",
    label: "Inspect ledger capabilities",
    description:
      "Search the bounded ledger SDK and optionally return compact declarations",
    parameters: InspectCapabilitiesParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params) =>
      toolResult(inspectCodeMode(gateway, params as CodeModeDiscoveryInput)),
  },
  {
    name: "execute_code",
    label: "Execute bounded ledger code",
    description:
      "Execute a generator body against the discovered bounded Bound Ledger SDK",
    parameters: ExecuteCodeParameters,
    executionMode: "sequential",
    execute: async (_toolCallId, params, signal) => {
      const { program } = params as { readonly program: string }
      return toolResult(
        await executeCode(program, {
          gateway,
          ...(signal === undefined ? {} : { signal }),
        }),
      )
    },
  },
]
