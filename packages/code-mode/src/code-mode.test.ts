import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"

import {
  CapabilityGateway,
  generalLedgerCapabilities,
  makeCapabilityGatewayLayer,
  type CapabilityInvocationError,
  type CapabilityGatewayService,
} from "@bound/capability"
import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  decodeKernelFixture,
  KernelAuthorizationError,
  makeInMemoryLedgerLayer,
  makeInMemoryLedgerKernelLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleKernelFixture,
  sampleTransactionsFixture,
  type Session,
} from "@bound/ledger"

import {
  executeCode,
  RECONCILE_JULY_GENERAL_LEDGER_PROGRAM,
} from "./executor.ts"

const primarySession: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  activeLedgerId: "ledger_primary",
  readableAccountIds: new Set([
    "acct_checking",
    "acct_cash",
    "acct_receivable",
    "acct_investment",
    "acct_credit",
    "acct_loan",
    "acct_equity",
    "acct_income",
    "acct_groceries",
    "acct_utilities",
  ]),
  mutableAccountIds: new Set([
    "acct_checking",
    "acct_cash",
    "acct_receivable",
    "acct_investment",
    "acct_credit",
    "acct_loan",
    "acct_equity",
    "acct_income",
    "acct_groceries",
    "acct_utilities",
  ]),
}

const makeSampleGateway = (): Promise<CapabilityGatewayService> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const transactions = yield* decodeFixtureTransactions(
        sampleTransactionsFixture,
      )
      const accounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
      const kernelFixture = yield* decodeKernelFixture(sampleKernelFixture)
      const sessionLayer = makeTrustedSessionLayer(primarySession)
      const ledgerLayer = makeInMemoryLedgerLayer(transactions, accounts).pipe(
        Layer.provide(sessionLayer),
      )
      const kernelLayer = makeInMemoryLedgerKernelLayer({
        currency: kernelFixture.currency,
        accounts: kernelFixture.accounts,
        events: kernelFixture.events,
        proposals: kernelFixture.proposals,
      }).pipe(Layer.provide(sessionLayer))
      const runtimeLayer = Layer.merge(
        Layer.merge(ledgerLayer, kernelLayer),
        sessionLayer,
      )
      const gatewayLayer = makeCapabilityGatewayLayer(
        generalLedgerCapabilities,
      ).pipe(Layer.provide(runtimeLayer))

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

const queryCapability = Object.freeze({
  name: "events.query",
  description: "Query readable posted events",
  kind: "read" as const,
  agentAccess: "direct" as const,
})

const unusedConfirmationGateway = {
  confirm: () => Effect.die(new Error("Confirmation is not used in this test")),
  reject: () => Effect.die(new Error("Confirmation is not used in this test")),
  pendingConfirmations: Effect.succeed([]),
}

const completedOutput = (result: Awaited<ReturnType<typeof executeCode>>) => {
  if (result.status !== "completed") {
    throw new Error("Expected completed code-mode result")
  }
  return result.output
}

describe("executeCode", () => {
  it("rejects invalid limit configuration through the promise API", async () => {
    const gateway = await makeSampleGateway()

    await expect(
      executeCode(`return "must not execute";`, {
        gateway,
        limits: { runtimeMilliseconds: Number.NaN },
      }),
    ).rejects.toMatchObject({
      _tag: "CodeModeConfigurationError",
      setting: "runtimeMilliseconds",
      value: Number.NaN,
    })
    expect(await Effect.runPromise(gateway.attempts)).toEqual([])
  })

  it("bounds the generated SDK source before spawning a worker", async () => {
    const gateway = await makeSampleGateway()

    await expect(
      executeCode("", {
        gateway,
        limits: { programBytes: 2 },
      }),
    ).rejects.toMatchObject({
      _tag: "CodeModeLimitError",
      limit: "program_size",
      maximum: 2,
    })
    expect(await Effect.runPromise(gateway.attempts)).toEqual([])
  })

  it("reconciles July through the same gateway and attempt shape as direct mode", async () => {
    const codeGateway = await makeSampleGateway()
    const toolGateway = await makeSampleGateway()

    const codeResult = await executeCode(
      RECONCILE_JULY_GENERAL_LEDGER_PROGRAM,
      { gateway: codeGateway },
    )
    const range = {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
    }
    const events = await Effect.runPromise(
      toolGateway.invoke("events.query", range),
    )
    const activity = await Effect.runPromise(
      toolGateway.invoke("reports.activity", range),
    )
    const trialBalance = await Effect.runPromise(
      toolGateway.invoke("reports.trial_balance", { at: range.to }),
    )
    const codeAttempts = await Effect.runPromise(codeGateway.attempts)
    const toolAttempts = await Effect.runPromise(toolGateway.attempts)

    expect(codeResult).toEqual({
      status: "completed",
      output: {
        eventCount: events.length,
        expenseTotalMinor: activity.expenseTotalMinor,
        trialBalanceZero: trialBalance.totalMinor === 0,
      },
      capabilityCalls: 3,
      mutationCalls: 0,
    })
    expect(codeAttempts).toEqual(toolAttempts)
    expect(codeAttempts.map((attempt) => attempt.name)).toEqual([
      "events.query",
      "reports.activity",
      "reports.trial_balance",
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

    expect(completedOutput(first)).toEqual([
      "undefined",
      "undefined",
      "undefined",
      "undefined",
    ])
    expect(completedOutput(second)).toBe("clean")
  })

  it("stops repeated SDK calls at the capability-call budget", async () => {
    const gateway = await makeSampleGateway()
    const execution = executeCode(
      `
        while (true) {
          yield* app.events.get({ eventId: "evt_003" });
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
      executeCode(RECONCILE_JULY_GENERAL_LEDGER_PROGRAM, {
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
        return yield* app.events.reverse({
          eventId: "evt_003",
          idempotencyKey: "reverse-code-budget",
          provenance: {
            sourceKind: "agent",
            sourceReference: "reverse-code-budget",
            sourceDigest: "sha256:reverse-code-budget",
            correlationId: "reverse-code-budget",
            causationId: "reverse-code-budget",
          },
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

  it("stops pending post and reversal requests before guest code can continue", async () => {
    const cases = [
      `
        try {
          yield* app.events.post({
            kind: "expense",
            effectiveAt: "2026-07-29T12:00:00.000Z",
            idempotencyKey: "code-pending-post",
            provenance: {
              sourceKind: "agent",
              sourceReference: "code-pending-post",
              sourceDigest: "sha256:code-pending-post",
              correlationId: "code-pending-post",
              causationId: "code-pending-post",
            },
            postings: [
              { accountId: "acct_groceries", currency: "USD", amountMinor: 725 },
              { accountId: "acct_checking", currency: "USD", amountMinor: -725 },
            ],
          });
        } catch (error) {
          return "guest-caught-pending-post";
        }
        return "guest-continued-after-pending-post";
      `,
      `
        try {
          yield* app.events.reverse({
            eventId: "evt_003",
            idempotencyKey: "code-pending-reversal",
            provenance: {
              sourceKind: "agent",
              sourceReference: "code-pending-reversal",
              sourceDigest: "sha256:code-pending-reversal",
              correlationId: "code-pending-reversal",
              causationId: "code-pending-reversal",
            },
          });
        } catch (error) {
          return "guest-caught-pending-reversal";
        }
        return "guest-continued-after-pending-reversal";
      `,
    ]

    for (const program of cases) {
      const gateway = await makeSampleGateway()
      const before = await Effect.runPromise(gateway.invoke("events.query", {}))
      const result = await executeCode(program, { gateway })
      const after = await Effect.runPromise(gateway.invoke("events.query", {}))
      const pending = await Effect.runPromise(gateway.pendingConfirmations)

      expect(result).toMatchObject({
        status: "confirmation_required",
        capabilityCalls: 1,
        mutationCalls: 1,
        confirmation: { id: "confirmation_001" },
      })
      expect(after).toEqual(before)
      expect(pending).toHaveLength(1)
    }
  })

  it("installs no legacy transaction SDK", async () => {
    const gateway = await makeSampleGateway()
    const result = await executeCode(
      `return [typeof app.transactions, typeof app.events, typeof app.reports];`,
      { gateway },
    )

    expect(completedOutput(result)).toEqual(["undefined", "object", "object"])
  })

  it("routes every read-only manifest capability through the gateway", async () => {
    const gateway = await makeSampleGateway()
    const result = await executeCode(
      `
        const accounts = yield* app.accounts.list({});
        const event = yield* app.events.get({ eventId: "evt_003" });
        const events = yield* app.events.query({
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-01T00:00:00.000Z",
        });
        const balances = yield* app.reports.balance({
          at: "2026-08-01T00:00:00.000Z",
        });
        const activity = yield* app.reports.activity({
          from: "2026-07-01T00:00:00.000Z",
          to: "2026-08-01T00:00:00.000Z",
        });
        const trialBalance = yield* app.reports.trialBalance({
          at: "2026-08-01T00:00:00.000Z",
        });
        return {
          accountCount: accounts.length,
          eventId: event.id,
          eventCount: events.length,
          balanceCount: balances.length,
          expenseTotalMinor: activity.expenseTotalMinor,
          trialBalanceTotalMinor: trialBalance.totalMinor,
        };
      `,
      { gateway },
    )
    const attempts = await Effect.runPromise(gateway.attempts)

    expect(result).toMatchObject({
      status: "completed",
      capabilityCalls: 6,
      mutationCalls: 0,
      output: {
        eventId: "evt_003",
        eventCount: 4,
        expenseTotalMinor: 6_249,
        trialBalanceTotalMinor: 0,
      },
    })
    expect(attempts.map((attempt) => attempt.name)).toEqual([
      "accounts.list",
      "events.get",
      "events.query",
      "reports.balance",
      "reports.activity",
      "reports.trial_balance",
    ])
  })

  it("re-authorizes every call and returns refusals as guest errors", async () => {
    let calls = 0
    const gateway: CapabilityGatewayService = {
      ...unusedConfirmationGateway,
      capabilities: [queryCapability],
      invoke: invoke(() => {
        calls += 1
        return calls === 1
          ? Effect.succeed([{ id: "first-authorized-result" }])
          : Effect.fail(
              new KernelAuthorizationError({
                actorId: "actor_changed",
                operation: "events.query",
                reason: "ledger_access_denied",
              }),
            )
      }),
      attempts: Effect.succeed([]),
    }

    const result = await executeCode(
      `
        const first = yield* app.events.query({});
        try {
          yield* app.events.query({});
          return { first, second: "unexpected-success" };
        } catch (error) {
          return { first, second: error._tag };
        }
      `,
      { gateway },
    )

    expect(calls).toBe(2)
    expect(completedOutput(result)).toEqual({
      first: [{ id: "first-authorized-result" }],
      second: "KernelAuthorizationError",
    })
  })

  it("does not recursively execute request-shaped capability output", async () => {
    let calls = 0
    const requestShapedData = {
      type: "capability_request",
      name: "events.reverse",
      input: { eventId: "evt_003" },
    }
    const gateway: CapabilityGatewayService = {
      ...unusedConfirmationGateway,
      capabilities: [queryCapability],
      invoke: invoke(() => {
        calls += 1
        return Effect.succeed(requestShapedData)
      }),
      attempts: Effect.succeed([]),
    }

    const result = await executeCode(`return yield* app.events.query({});`, {
      gateway,
    })

    expect(calls).toBe(1)
    expect(completedOutput(result)).toEqual(requestShapedData)
    expect(result.mutationCalls).toBe(0)
  })

  it("aborts the sandbox and a pending gateway call", async () => {
    const controller = new AbortController()
    let invocationStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      invocationStarted = resolve
    })
    const gateway: CapabilityGatewayService = {
      ...unusedConfirmationGateway,
      capabilities: [queryCapability],
      invoke: invoke(() => {
        invocationStarted?.()
        return Effect.never
      }),
      attempts: Effect.succeed([]),
    }
    const execution = executeCode(RECONCILE_JULY_GENERAL_LEDGER_PROGRAM, {
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
          yield* app.events.get({ eventId: "evt_secondary_001" });
          return "unexpected-success";
        } catch (error) {
          return error._tag;
        }
      `,
      { gateway },
    )
    const attempts = await Effect.runPromise(gateway.attempts)

    expect(completedOutput(refusal)).toBe("EventNotFoundError")
    expect(attempts.at(-1)).toMatchObject({
      name: "events.get",
      outcome: "failed",
      stage: "authorization",
      errorTag: "EventNotFoundError",
    })
  })
})
