import {
  newQuickJSWASMModule,
  RELEASE_SYNC,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
} from "quickjs-emscripten"

import {
  byteLength,
  type ParentMessage,
  type RuntimeLimits,
  type WorkerMessage,
} from "./protocol.ts"

let runtime: QuickJSRuntime | undefined
let context: QuickJSContext | undefined
let generator: QuickJSHandle | undefined
let next: QuickJSHandle | undefined
let limits: RuntimeLimits | undefined
let requestId = 0
let completed = false

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>
    if (typeof record.message === "string") {
      return `${String(record.name ?? "Error")}: ${record.message}`
    }
  }
  return String(error)
}

const send = (message: WorkerMessage): void => {
  process.send?.(message)
}

const dispose = (): void => {
  next?.dispose()
  next = undefined
  generator?.dispose()
  generator = undefined
  context?.dispose()
  context = undefined
  runtime?.dispose()
  runtime = undefined
}

const finish = (message: WorkerMessage): void => {
  if (completed) return
  completed = true
  send(message)
  dispose()
  setImmediate(() => process.exit(0))
}

const fail = (error: unknown): void => {
  const message = messageOf(error).slice(0, 512)
  const lower = message.toLowerCase()
  if (lower.includes("out of memory")) {
    finish({ type: "error", kind: "limit", limit: "memory", message })
    return
  }
  if (lower.includes("stack overflow") || lower.includes("call stack")) {
    finish({ type: "error", kind: "limit", limit: "stack", message })
    return
  }
  if (lower.includes("interrupt") || lower.includes("timed out")) {
    finish({ type: "error", kind: "limit", limit: "wall_clock", message })
    return
  }
  finish({ type: "error", kind: "program", message })
}

const guestSource = (program: string): string => `
  (function* () {
    "use strict";
    const __stringify = JSON.stringify.bind(JSON);
    const __freeze = Object.freeze.bind(Object);
    const __call = function* (name, input) {
      return yield __stringify({ type: "capability_request", name, input });
    };
    const app = __freeze({
      transactions: __freeze({
        list: function* (input) {
          return yield* __call("transactions.list", input);
        },
        get: function* (input) {
          return yield* __call("transactions.get", input);
        },
        updateCategory: function* (input) {
          return yield* __call("transactions.update_category", input);
        },
      }),
    });
    const __user = (function* () {
      "use strict";
      ${program}
    })();
    let __method = "next";
    let __argument;
    while (true) {
      const __step = __user[__method](__argument);
      if (__step.done) return __stringify(__step.value);
      if (typeof __step.value !== "string") {
        throw new TypeError("generated programs may yield SDK requests only");
      }
      const __response = yield __step.value;
      if (__response && __response.ok === true) {
        __method = "next";
        __argument = __response.value;
      } else {
        const __error = new Error(
          __response?.error?.message ?? "capability invocation failed",
        );
        __error._tag = __response?.error?.tag ?? "CapabilityInvocationError";
        __method = "throw";
        __argument = __error;
      }
    }
  })()
`

const unwrap = (
  result: ReturnType<QuickJSContext["evalCode"]>,
): QuickJSHandle => {
  if (result.error) {
    const error = context?.dump(result.error)
    result.error.dispose()
    throw error
  }
  return result.value
}

const responseHandle = (
  response: ParentMessage & { readonly type: "response" },
) => {
  if (context === undefined) throw new Error("QuickJS context is unavailable")
  const serialized = JSON.stringify(response.response)
  const source = `JSON.parse(${JSON.stringify(serialized)})`
  return unwrap(context.evalCode(source))
}

const advance = (
  response?: ParentMessage & { readonly type: "response" },
): void => {
  if (
    context === undefined ||
    generator === undefined ||
    next === undefined ||
    limits === undefined
  ) {
    throw new Error("QuickJS runtime has not started")
  }

  const argument = response === undefined ? undefined : responseHandle(response)
  try {
    const called =
      argument === undefined
        ? context.callFunction(next, generator)
        : context.callFunction(next, generator, argument)
    const stepHandle = context.unwrapResult(called)
    try {
      const step = context.dump(stepHandle) as {
        readonly done?: unknown
        readonly value?: unknown
      }
      if (typeof step.done !== "boolean" || typeof step.value !== "string") {
        throw new TypeError("guest returned an invalid generator step")
      }
      if (byteLength(step.value) > limits.resultBytes) {
        finish({
          type: "error",
          kind: "limit",
          limit: "result_size",
          message: "guest message exceeds the serialized result limit",
        })
        return
      }
      if (step.done) {
        finish({ type: "result", serialized: step.value })
        return
      }
      requestId += 1
      send({ type: "request", id: requestId, serialized: step.value })
    } finally {
      stepHandle.dispose()
    }
  } finally {
    argument?.dispose()
  }
}

const start = async (message: ParentMessage & { readonly type: "start" }) => {
  if (runtime !== undefined) throw new Error("QuickJS runtime already started")
  limits = message.limits
  const QuickJS = await newQuickJSWASMModule(RELEASE_SYNC)
  runtime = QuickJS.newRuntime()
  runtime.setMemoryLimit(limits.memoryBytes)
  runtime.setMaxStackSize(limits.stackBytes)
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + limits.runtimeMilliseconds),
  )
  context = runtime.newContext()
  generator = unwrap(context.evalCode(guestSource(message.program)))
  next = context.getProp(generator, "next")
  advance()
}

process.on("message", (message: ParentMessage) => {
  if (completed) return
  if (message.type === "start") {
    void start(message).catch(fail)
    return
  }
  if (message.type === "response") {
    if (message.id !== requestId) {
      finish({
        type: "error",
        kind: "protocol",
        message: "parent response ID does not match the pending request",
      })
      return
    }
    try {
      advance(message)
    } catch (error) {
      fail(error)
    }
  }
})

process.on("disconnect", () => {
  dispose()
  process.exit(0)
})
