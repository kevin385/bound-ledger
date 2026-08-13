import {
  Agent,
  type AgentEvent,
  type StreamFn,
} from "@earendil-works/pi-agent-core"
import type {
  AssistantMessage,
  Model,
} from "@earendil-works/pi-ai"

import type { CapabilityGatewayService } from "@bound/capability"

import { projectLedgerTools } from "./tools.ts"
import {
  formatCodeModeGuide,
  projectCodeModeTools,
} from "./code-tools.ts"

export type LedgerAgentMode = "tool" | "code"

export type LedgerAgentEvent =
  | { readonly type: "text_delta"; readonly delta: string }
  | {
      readonly type: "tool_started"
      readonly toolCallId: string
      readonly toolName: string
      readonly args: unknown
    }
  | {
      readonly type: "tool_finished"
      readonly toolCallId: string
      readonly toolName: string
      readonly isError: boolean
    }

export interface LedgerAgentOptions {
  readonly gateway: CapabilityGatewayService
  readonly model: Model<any>
  readonly streamFn: StreamFn
  readonly mode?: LedgerAgentMode
  readonly systemPrompt?: string
  readonly onEvent?: (event: LedgerAgentEvent) => void | Promise<void>
}

export interface LedgerAgentRunResult {
  readonly text: string
  readonly events: ReadonlyArray<LedgerAgentEvent>
}

export const translatePiEvent = (
  event: AgentEvent,
): LedgerAgentEvent | undefined => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    return {
      type: "text_delta",
      delta: event.assistantMessageEvent.delta,
    }
  }

  if (event.type === "tool_execution_start") {
    return {
      type: "tool_started",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.args,
    }
  }

  if (event.type === "tool_execution_end") {
    return {
      type: "tool_finished",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      isError: event.isError,
    }
  }

  return undefined
}

const assistantText = (message: AssistantMessage): string =>
  message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")

export const runLedgerAgentPrompt = async (
  prompt: string,
  options: LedgerAgentOptions,
): Promise<LedgerAgentRunResult> => {
  const events: Array<LedgerAgentEvent> = []
  const mode = options.mode ?? "tool"
  const baseSystemPrompt =
    options.systemPrompt ??
    (mode === "code"
      ? "You are the Bound Ledger assistant. Use execute_code for ledger facts."
      : "You are the Bound Ledger assistant. Use ledger tools for ledger facts.")
  const systemPrompt =
    mode === "code"
      ? `${baseSystemPrompt}\n\nCode-mode guide: ${formatCodeModeGuide(options.gateway)}`
      : baseSystemPrompt
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: options.model,
      tools:
        mode === "code"
          ? [...projectCodeModeTools(options.gateway)]
          : [...projectLedgerTools(options.gateway)],
    },
    streamFn: options.streamFn,
    toolExecution: "sequential",
  })

  agent.subscribe(async (piEvent) => {
    const event = translatePiEvent(piEvent)

    if (event !== undefined) {
      events.push(event)
      await options.onEvent?.(event)
    }
  })

  await agent.prompt(prompt)

  const finalAssistant = agent.state.messages.findLast(
    (message): message is AssistantMessage => message.role === "assistant",
  )

  if (finalAssistant === undefined) {
    throw new Error("Pi Agent Core completed without an assistant message")
  }

  if (
    finalAssistant.stopReason === "error" ||
    finalAssistant.stopReason === "aborted"
  ) {
    throw new Error(
      finalAssistant.errorMessage ?? "Pi Agent Core returned an error",
    )
  }

  return {
    text: assistantText(finalAssistant),
    events,
  }
}
