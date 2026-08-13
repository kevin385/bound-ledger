import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"

import { Effect, Result } from "effect"

import {
  ledgerCapabilities,
  type CapabilityGatewayService,
  type CapabilityInvocationError,
} from "@bound/capability"

import {
  CodeModeAbortedError,
  type CodeModeError,
  CodeModeLimitError,
  CodeModeProgramError,
  CodeModeProtocolError,
} from "./errors.ts"
import {
  byteLength,
  isWorkerMessage,
  parseCapabilityRequest,
  type ParentMessage,
  type RuntimeLimits,
  type WorkerMessage,
} from "./protocol.ts"

const workerPath = fileURLToPath(new URL("./worker.ts", import.meta.url))

const DEFAULT_LIMITS = {
  capabilityCalls: 8,
  memoryBytes: 16 * 1024 * 1024,
  mutationCalls: 1,
  programBytes: 64 * 1024,
  recursionDepth: 1,
  resultBytes: 64 * 1024,
  stackBytes: 512 * 1024,
  runtimeMilliseconds: 1_000,
  wallClockMilliseconds: 2_000,
} as const

export interface CodeModeLimits {
  readonly capabilityCalls?: number
  readonly memoryBytes?: number
  readonly mutationCalls?: number
  readonly programBytes?: number
  readonly recursionDepth?: number
  readonly resultBytes?: number
  readonly stackBytes?: number
  readonly runtimeMilliseconds?: number
  readonly wallClockMilliseconds?: number
}

export interface ExecuteCodeOptions {
  readonly gateway: CapabilityGatewayService
  readonly signal?: AbortSignal
  readonly limits?: CodeModeLimits
}

export interface CodeModeRunResult {
  readonly output: unknown
  readonly capabilityCalls: number
  readonly mutationCalls: number
}

interface ResolvedLimits {
  readonly capabilityCalls: number
  readonly memoryBytes: number
  readonly mutationCalls: number
  readonly programBytes: number
  readonly recursionDepth: number
  readonly resultBytes: number
  readonly stackBytes: number
  readonly runtimeMilliseconds: number
  readonly wallClockMilliseconds: number
}

const capabilityKinds = new Map(
  ledgerCapabilities.map((definition) => [definition.name, definition.kind]),
)

const resolveLimits = (limits: CodeModeLimits | undefined): ResolvedLimits => ({
  capabilityCalls: limits?.capabilityCalls ?? DEFAULT_LIMITS.capabilityCalls,
  memoryBytes: limits?.memoryBytes ?? DEFAULT_LIMITS.memoryBytes,
  mutationCalls: limits?.mutationCalls ?? DEFAULT_LIMITS.mutationCalls,
  programBytes: limits?.programBytes ?? DEFAULT_LIMITS.programBytes,
  recursionDepth: limits?.recursionDepth ?? DEFAULT_LIMITS.recursionDepth,
  resultBytes: limits?.resultBytes ?? DEFAULT_LIMITS.resultBytes,
  stackBytes: limits?.stackBytes ?? DEFAULT_LIMITS.stackBytes,
  runtimeMilliseconds:
    limits?.runtimeMilliseconds ?? DEFAULT_LIMITS.runtimeMilliseconds,
  wallClockMilliseconds:
    limits?.wallClockMilliseconds ?? DEFAULT_LIMITS.wallClockMilliseconds,
})

const limitError = (
  limit: CodeModeLimitError["limit"],
  maximum: number,
  message: string,
) => new CodeModeLimitError({ limit, maximum, message })

const invocationError = (error: CapabilityInvocationError) => ({
  tag: error._tag,
  message: `Capability ${error._tag}`,
})

const send = (child: ChildProcess, message: ParentMessage): void => {
  if (!child.connected) {
    throw new CodeModeProtocolError({
      message: "sandbox child process is not connected",
    })
  }
  child.send(message)
}

export const executeCode = (
  program: string,
  options: ExecuteCodeOptions,
): Promise<CodeModeRunResult> => {
  const limits = resolveLimits(options.limits)
  if (byteLength(program) > limits.programBytes) {
    return Promise.reject(
      limitError(
        "program_size",
        limits.programBytes,
        "generated program exceeds the program-size limit",
      ),
    )
  }

  if (options.signal?.aborted === true) {
    return Promise.reject(
      new CodeModeAbortedError({ message: "code-mode execution was aborted" }),
    )
  }

  const runtimeLimits: RuntimeLimits = {
    memoryBytes: limits.memoryBytes,
    resultBytes: limits.resultBytes,
    stackBytes: limits.stackBytes,
    runtimeMilliseconds: limits.runtimeMilliseconds,
  }
  const child = spawn(process.execPath, [workerPath], {
    env: { PATH: process.env.PATH },
    stdio: ["ignore", "ignore", "pipe", "ipc"],
  })
  const controller = new AbortController()

  return new Promise<CodeModeRunResult>((resolve, reject) => {
    let settled = false
    let capabilityCalls = 0
    let mutationCalls = 0
    let requestDepth = 0
    let stderr = ""

    const cleanup = (): void => {
      clearTimeout(timeout)
      options.signal?.removeEventListener("abort", abort)
      child.removeAllListeners()
      child.stderr?.removeAllListeners()
      if (child.connected) child.disconnect()
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL")
      }
    }

    const fail = (error: CodeModeError): void => {
      if (settled) return
      settled = true
      controller.abort()
      cleanup()
      reject(error)
    }

    const succeed = (result: CodeModeRunResult): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const abort = (): void =>
      fail(
        new CodeModeAbortedError({
          message: "code-mode execution was aborted",
        }),
      )

    const timeout = setTimeout(() => {
      fail(
        limitError(
          "wall_clock",
          limits.wallClockMilliseconds,
          "code-mode execution exceeded the parent wall-clock limit",
        ),
      )
    }, limits.wallClockMilliseconds)

    const handleRequest = async (
      message: WorkerMessage & { readonly type: "request" },
    ): Promise<void> => {
      requestDepth += 1
      if (requestDepth > limits.recursionDepth) {
        fail(
          limitError(
            "recursion",
            limits.recursionDepth,
            "sandbox emitted a recursive capability request",
          ),
        )
        return
      }

      try {
        if (byteLength(message.serialized) > limits.resultBytes) {
          fail(
            limitError(
              "result_size",
              limits.resultBytes,
              "serialized capability request exceeds the result-size limit",
            ),
          )
          return
        }
        const request = parseCapabilityRequest(message.serialized)
        if (request === undefined) {
          fail(
            new CodeModeProtocolError({
              message: "sandbox yielded an invalid capability request",
            }),
          )
          return
        }
        const kind = capabilityKinds.get(request.name)
        if (kind === undefined) {
          fail(
            new CodeModeProtocolError({
              message: `sandbox requested unknown capability ${request.name}`,
            }),
          )
          return
        }

        capabilityCalls += 1
        if (capabilityCalls > limits.capabilityCalls) {
          fail(
            limitError(
              "capability_calls",
              limits.capabilityCalls,
              "generated program exceeded the capability-call budget",
            ),
          )
          return
        }
        if (kind === "mutation") {
          mutationCalls += 1
          if (mutationCalls > limits.mutationCalls) {
            fail(
              limitError(
                "mutation_calls",
                limits.mutationCalls,
                "generated program exceeded the mutation-call budget",
              ),
            )
            return
          }
        }

        const invocation = await Effect.runPromise(
          Effect.result(options.gateway.invoke(request.name, request.input)),
          { signal: controller.signal },
        )
        if (settled) return

        const response: ParentMessage = Result.isSuccess(invocation)
          ? {
              type: "response",
              id: message.id,
              response: { ok: true, value: invocation.success },
            }
          : {
              type: "response",
              id: message.id,
              response: {
                ok: false,
                error: invocationError(invocation.failure),
              },
            }
        const serializedResponse = JSON.stringify(response)
        if (byteLength(serializedResponse) > limits.resultBytes) {
          fail(
            limitError(
              "result_size",
              limits.resultBytes,
              "serialized capability response exceeds the result-size limit",
            ),
          )
          return
        }
        send(child, response)
      } catch (error) {
        if (controller.signal.aborted) return
        fail(
          new CodeModeProtocolError({
            message: `capability bridge failed: ${String(error)}`.slice(0, 512),
          }),
        )
      } finally {
        requestDepth -= 1
      }
    }

    const handleMessage = (message: unknown): void => {
      if (settled) return
      if (!isWorkerMessage(message)) {
        fail(
          new CodeModeProtocolError({
            message: "sandbox child emitted an invalid protocol message",
          }),
        )
        return
      }
      if (message.type === "request") {
        void handleRequest(message)
        return
      }
      if (message.type === "result") {
        if (byteLength(message.serialized) > limits.resultBytes) {
          fail(
            limitError(
              "result_size",
              limits.resultBytes,
              "generated result exceeds the result-size limit",
            ),
          )
          return
        }
        try {
          succeed({
            output: JSON.parse(message.serialized),
            capabilityCalls,
            mutationCalls,
          })
        } catch {
          fail(
            new CodeModeProtocolError({
              message: "generated result is not serializable JSON",
            }),
          )
        }
        return
      }

      if (message.kind === "limit" && message.limit !== undefined) {
        fail(
          limitError(
            message.limit,
            message.limit === "result_size"
              ? limits.resultBytes
              : message.limit === "memory"
                ? limits.memoryBytes
                : message.limit === "stack"
                  ? limits.stackBytes
                  : limits.runtimeMilliseconds,
            message.message,
          ),
        )
      } else if (message.kind === "protocol") {
        fail(new CodeModeProtocolError({ message: message.message }))
      } else {
        fail(new CodeModeProgramError({ message: message.message }))
      }
    }

    options.signal?.addEventListener("abort", abort, { once: true })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-2_048)
    })
    child.on("message", handleMessage)
    child.on("error", (error) => {
      fail(
        new CodeModeProtocolError({
          message: `sandbox child process failed: ${error.message}`,
        }),
      )
    })
    child.on("exit", (code, signal) => {
      if (!settled) {
        fail(
          new CodeModeProgramError({
            message:
              `sandbox child exited before returning a result ` +
              `(code ${String(code)}, signal ${String(signal)}) ${stderr}`,
          }),
        )
      }
    })

    try {
      send(child, { type: "start", program, limits: runtimeLimits })
    } catch (error) {
      fail(
        error instanceof CodeModeProtocolError
          ? error
          : new CodeModeProtocolError({
              message: `failed to start sandbox child: ${String(error)}`,
            }),
      )
    }
  })
}

export const LIST_JULY_TRANSACTIONS_PROGRAM = `
  const transactions = yield* app.transactions.list({ month: "2026-07" });
  return transactions;
`
