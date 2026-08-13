import ivm from "isolated-vm";
import {
  newQuickJSWASMModule,
  RELEASE_SYNC,
  shouldInterruptAfterDeadline,
} from "quickjs-emscripten";

const MEMORY_LIMIT_BYTES = 16 * 1024 * 1024;
const PROGRAM_LIMIT_BYTES = 64 * 1024;
const RESULT_LIMIT_BYTES = 64 * 1024;
const RUNTIME_TIMEOUT_MS = 75;

type Candidate = "isolated-vm" | "quickjs-wasm";
type Probe =
  | "safe-value"
  | "global-surface"
  | "constructor-escape"
  | "indirect-eval"
  | "dynamic-import"
  | "infinite-loop"
  | "large-allocation"
  | "output-flood"
  | "oversized-program"
  | "non-serializable";

type Outcome = {
  candidate: Candidate;
  probe: Probe;
  status: "ok" | "denied" | "limited" | "rejected" | "error";
  value?: unknown;
  detail?: string;
};

const unavailableGlobals = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "process",
  "require",
  "module",
  "Deno",
  "Bun",
  "setTimeout",
  "setInterval",
  "Buffer",
];

const programs: Record<Exclude<Probe, "dynamic-import" | "oversized-program">, string> = {
  "safe-value": `JSON.stringify({ answer: 6 * 7 })`,
  "global-surface": `JSON.stringify(
    ${JSON.stringify(unavailableGlobals)}.filter((name) => typeof globalThis[name] !== "undefined")
  )`,
  "constructor-escape": `({}).constructor.constructor("return typeof process")()`,
  "indirect-eval": `(0, eval)("typeof process")`,
  "infinite-loop": `while (true) {}`,
  "large-allocation": `
    const retained = [];
    while (true) retained.push(new Array(250000).fill("bound-ledger"));
  `,
  "output-flood": `"x".repeat(${RESULT_LIMIT_BYTES * 4})`,
  "non-serializable": `JSON.stringify(() => 42)`,
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return `${String(record.name ?? "Error")}: ${record.message}`;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function enforceHostPolicies(code: string, value: unknown): string {
  if (Buffer.byteLength(code) > PROGRAM_LIMIT_BYTES) {
    throw new RangeError("program exceeds the 64 KiB host limit");
  }
  if (typeof value !== "string") {
    throw new TypeError("runtime output must be a serialized string");
  }
  if (Buffer.byteLength(value) > RESULT_LIMIT_BYTES) {
    throw new RangeError("result exceeds the 64 KiB host limit");
  }
  return value;
}

function probeCode(probe: Probe): string {
  if (probe === "oversized-program") {
    return `"${"x".repeat(PROGRAM_LIMIT_BYTES + 1)}"`;
  }
  if (probe === "dynamic-import") {
    return `import("node:fs")`;
  }
  return programs[probe];
}

async function evaluateQuickJS(probe: Probe, code: string): Promise<unknown> {
  if (Buffer.byteLength(code) > PROGRAM_LIMIT_BYTES) {
    throw new RangeError("program exceeds the 64 KiB host limit");
  }

  const QuickJS = await newQuickJSWASMModule(RELEASE_SYNC);
  if (probe === "dynamic-import") {
    const runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
    runtime.setMaxStackSize(512 * 1024);
    runtime.setInterruptHandler(
      shouldInterruptAfterDeadline(Date.now() + RUNTIME_TIMEOUT_MS),
    );
    const context = runtime.newContext();
    try {
      const evaluated = context.evalCode(code);
      if (evaluated.error) {
        const error = context.dump(evaluated.error);
        evaluated.error.dispose();
        throw error;
      }

      const promise = evaluated.value;
      try {
        runtime.executePendingJobs();
        const state = context.getPromiseState(promise);
        if (state.type === "rejected") {
          const error = context.dump(state.error);
          state.error.dispose();
          throw error;
        }
        if (state.type === "pending") {
          throw new Error("dynamic import did not settle inside the runtime deadline");
        }
        state.value.dispose();
        return JSON.stringify({ moduleLoading: "allowed" });
      } finally {
        promise.dispose();
      }
    } finally {
      context.dispose();
      runtime.dispose();
    }
  }

  return QuickJS.evalCode(code, {
    memoryLimitBytes: MEMORY_LIMIT_BYTES,
    maxStackSizeBytes: 512 * 1024,
    shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + RUNTIME_TIMEOUT_MS),
  });
}

async function evaluateIsolatedVM(probe: Probe, code: string): Promise<unknown> {
  if (Buffer.byteLength(code) > PROGRAM_LIMIT_BYTES) {
    throw new RangeError("program exceeds the 64 KiB host limit");
  }

  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_BYTES / 1024 / 1024 });
  try {
    const context = isolate.createContextSync();
    if (probe === "dynamic-import") {
      return await context.eval(code, {
        timeout: RUNTIME_TIMEOUT_MS,
        promise: true,
        copy: true,
      });
    }

    return context.evalSync(code, { timeout: RUNTIME_TIMEOUT_MS });
  } finally {
    if (!isolate.isDisposed) isolate.dispose();
  }
}

function classify(probe: Probe, error: unknown): Outcome["status"] {
  if (probe === "dynamic-import") return "denied";
  if (probe === "infinite-loop" || probe === "large-allocation") return "limited";
  if (
    probe === "output-flood" ||
    probe === "oversized-program" ||
    probe === "non-serializable"
  ) {
    return "rejected";
  }
  return "error";
}

async function main(): Promise<void> {
  const candidate = process.argv[2] as Candidate;
  const probe = process.argv[3] as Probe;
  if (!(["isolated-vm", "quickjs-wasm"] as const).includes(candidate)) {
    throw new Error(`unknown candidate: ${candidate}`);
  }
  if (!Object.hasOwn(programs, probe) && !["dynamic-import", "oversized-program"].includes(probe)) {
    throw new Error(`unknown probe: ${probe}`);
  }

  const code = probeCode(probe);
  try {
    const raw =
      candidate === "quickjs-wasm"
        ? await evaluateQuickJS(probe, code)
        : await evaluateIsolatedVM(probe, code);
    const value = enforceHostPolicies(code, raw);
    const outcome: Outcome = { candidate, probe, status: "ok", value };
    process.stdout.write(JSON.stringify(outcome));
  } catch (error) {
    const outcome: Outcome = {
      candidate,
      probe,
      status: classify(probe, error),
      detail: messageOf(error).slice(0, 512),
    };
    process.stdout.write(JSON.stringify(outcome));
  }
}

await main();
