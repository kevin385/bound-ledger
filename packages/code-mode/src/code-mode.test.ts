import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

import {
  CapabilityGateway,
  makeCapabilityGatewayLayer,
  type CapabilityInvocationError,
  type CapabilityGatewayService,
} from "@bound/capability"
import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  LedgerAuthorizationError,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleTransactionsFixture,
  type Session,
} from "@bound/ledger"

import {
  executeCode,
  LIST_JULY_TRANSACTIONS_PROGRAM,
} from "./executor.ts"

const primarySession: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  readableAccountIds: new Set(["account_checking", "account_credit"]),
  mutableAccountIds: new Set(["account_checking"]),
}

const makeSampleGateway = (): Promise<CapabilityGatewayService> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const transactions = yield* decodeFixtureTransactions(
        sampleTransactionsFixture,
      )
      const accounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
      const sessionLayer = makeTrustedSessionLayer(primarySession)
      const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
        Layer.provide(sessionLayer),
      )
      const runtimeLayer = Layer.merge(ledgerLayer, sessionLayer)
      const gatewayLayer = makeCapabilityGatewayLayer().pipe(
        Layer.provide(runtimeLayer),
      )

      return yield* CapabilityGateway.use((gateway) =>
        Effect.succeed(gateway),
      ).pipe(Effect.provide(gatewayLayer))
    }),
  )

const invoke = (
  implementation: (
    name: string,
    input: unknown,
  ) => Effect.Effect<unknown, CapabilityInvocationError>,
): CapabilityGatewayService["invoke"] =>
  implementation as CapabilityGatewayService["invoke"]

describe("executeCode", () => {
  it("lists July transactions through the same gateway and attempt shape as tool mode", async () => {
    const codeGateway = await makeSampleGateway()
    const toolGateway = await makeSampleGateway()

    const codeResult = await executeCode(LIST_JULY_TRANSACTIONS_PROGRAM, {
      gateway: codeGateway,
    })
    const toolResult = await Effect.runPromise(
      toolGateway.invoke("transactions.list", { month: "2026-07" }),
    )
    const codeAttempts = await Effect.runPromise(codeGateway.attempts)
    const toolAttempts = await Effect.runPromise(toolGateway.attempts)

    expect(codeResult.output).toEqual(toolResult)
    expect(codeResult).toMatchObject({ capabilityCalls: 1, mutationCalls: 0 })
    expect(codeAttempts).toEqual(toolAttempts)
    expect(codeAttempts).toEqual([
      {
        name: "transactions.list",
        actorId: "actor_primary_owner",
        kind: "read",
        decodedInput: { month: "2026-07" },
        authorization: "authorized",
        outcome: "succeeded",
        stage: "complete",
      },
    ])
  })

  it("exposes no host globals or constructor path and retains no guest state", async () => {
    const gateway = await makeSampleGateway()
    const first = await executeCode(
      `
        Object.prototype.boundLedgerLeak = "present";
        return [
          typeof process,
          typeof fetch,
          typeof require,
          ({}).constructor.constructor("return typeof process")(),
        ];
      `,
      { gateway },
    )
    const second = await executeCode(
      `return Object.prototype.boundLedgerLeak ?? "clean";`,
      { gateway },
    )

    expect(first.output).toEqual([
      "undefined",
      "undefined",
      "undefined",
      "undefined",
    ])
    expect(second.output).toBe("clean")
  })

  it("stops repeated SDK calls at the capability-call budget", async () => {
    const gateway = await makeSampleGateway()
    const execution = executeCode(
      `
        while (true) {
          yield* app.transactions.get({ transactionId: "txn_001" });
        }
      `,
      { gateway, limits: { capabilityCalls: 2 } },
    )

    await expect(execution).rejects.toMatchObject({
      _tag: "CodeModeLimitError",
      limit: "capability_calls",
      maximum: 2,
    })
    expect(await Effect.runPromise(gateway.attempts)).toHaveLength(2)
  })

  it("enforces the configured in-flight request recursion depth", async () => {
    const gateway = await makeSampleGateway()

    await expect(
      executeCode(LIST_JULY_TRANSACTIONS_PROGRAM, {
        gateway,
        limits: { recursionDepth: 0 },
      }),
    ).rejects.toMatchObject({
      _tag: "CodeModeLimitError",
      limit: "recursion",
      maximum: 0,
    })
    expect(await Effect.runPromise(gateway.attempts)).toEqual([])
  })

  it("rejects mutations before the gateway when the mutation budget is zero", async () => {
    const gateway = await makeSampleGateway()
    const execution = executeCode(
      `
        return yield* app.transactions.updateCategory({
          transactionId: "txn_001",
          category: "household",
        });
      `,
      { gateway, limits: { mutationCalls: 0 } },
    )

    await expect(execution).rejects.toMatchObject({
      _tag: "CodeModeLimitError",
      limit: "mutation_calls",
      maximum: 0,
    })
    expect(await Effect.runPromise(gateway.attempts)).toEqual([])
  })

  it("re-authorizes every call and returns refusals as guest errors", async () => {
    let calls = 0
    const gateway: CapabilityGatewayService = {
      invoke: invoke(() => {
        calls += 1
        return calls === 1
          ? Effect.succeed([{ id: "first-authorized-result" }])
          : Effect.fail(
              new LedgerAuthorizationError({
                actorId: "actor_changed",
                operation: "transactions.get",
                reason: "workspace_access_denied",
                transactionId: "txn_001",
              }),
            )
      }),
      attempts: Effect.succeed([]),
    }

    const result = await executeCode(
      `
        const first = yield* app.transactions.list({ month: "2026-07" });
        try {
          yield* app.transactions.list({ month: "2026-07" });
          return { first, second: "unexpected-success" };
        } catch (error) {
          return { first, second: error._tag };
        }
      `,
      { gateway },
    )

    expect(calls).toBe(2)
    expect(result.output).toEqual({
      first: [{ id: "first-authorized-result" }],
      second: "LedgerAuthorizationError",
    })
  })

  it("does not recursively execute request-shaped capability output", async () => {
    let calls = 0
    const requestShapedData = {
      type: "capability_request",
      name: "transactions.update_category",
      input: { transactionId: "txn_001", category: "shopping" },
    }
    const gateway: CapabilityGatewayService = {
      invoke: invoke(() => {
        calls += 1
        return Effect.succeed(requestShapedData)
      }),
      attempts: Effect.succeed([]),
    }

    const result = await executeCode(
      `return yield* app.transactions.list({ month: "2026-07" });`,
      { gateway },
    )

    expect(calls).toBe(1)
    expect(result.output).toEqual(requestShapedData)
    expect(result.mutationCalls).toBe(0)
  })

  it("aborts the sandbox and a pending gateway call", async () => {
    const controller = new AbortController()
    let invocationStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      invocationStarted = resolve
    })
    const gateway: CapabilityGatewayService = {
      invoke: invoke(() => {
        invocationStarted?.()
        return Effect.never
      }),
      attempts: Effect.succeed([]),
    }
    const execution = executeCode(LIST_JULY_TRANSACTIONS_PROGRAM, {
      gateway,
      signal: controller.signal,
    })

    await started
    controller.abort()

    await expect(execution).rejects.toMatchObject({
      _tag: "CodeModeAbortedError",
    })
  })

  it("enforces program, result, and interpreter deadlines", async () => {
    const gateway = await makeSampleGateway()

    await expect(
      executeCode("x".repeat(256), {
        gateway,
        limits: { programBytes: 128 },
      }),
    ).rejects.toMatchObject({ limit: "program_size", maximum: 128 })

    await expect(
      executeCode(`return "x".repeat(1024);`, {
        gateway,
        limits: { resultBytes: 128 },
      }),
    ).rejects.toMatchObject({ limit: "result_size", maximum: 128 })

    await expect(
      executeCode(`while (true) {}`, {
        gateway,
        limits: {
          runtimeMilliseconds: 50,
          wallClockMilliseconds: 750,
        },
      }),
    ).rejects.toMatchObject({ limit: "wall_clock" })

    await expect(
      executeCode(
        `
          function recurse() { return recurse(); }
          return recurse();
        `,
        { gateway },
      ),
    ).rejects.toMatchObject({
      limit: "stack",
      maximum: 512 * 1024,
    })
  })

  it("terminates retained allocation pressure at the interpreter memory limit", async () => {
    const gateway = await makeSampleGateway()

    await expect(
      executeCode(
        `
          const retained = [];
          while (true) {
            retained.push(new Array(250000).fill("bound-ledger"));
          }
        `,
        {
          gateway,
          limits: {
            runtimeMilliseconds: 500,
            wallClockMilliseconds: 4_000,
          },
        },
      ),
    ).rejects.toMatchObject({
      _tag: "CodeModeLimitError",
      limit: "memory",
      maximum: 16 * 1024 * 1024,
    })
  })

  it("rejects non-serialized output and inaccessible resource identifiers", async () => {
    const gateway = await makeSampleGateway()

    await expect(
      executeCode(`return () => 42;`, { gateway }),
    ).rejects.toMatchObject({ _tag: "CodeModeProgramError" })

    const refusal = await executeCode(
      `
        try {
          yield* app.transactions.get({ transactionId: "txn_005" });
          return "unexpected-success";
        } catch (error) {
          return error._tag;
        }
      `,
      { gateway },
    )
    const attempts = await Effect.runPromise(gateway.attempts)

    expect(refusal.output).toBe("LedgerAuthorizationError")
    expect(attempts.at(-1)).toMatchObject({
      name: "transactions.get",
      authorization: "refused",
      outcome: "failed",
      stage: "authorization",
    })
  })
})
