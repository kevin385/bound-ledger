import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect } from "vitest"

import {
  CapabilityGateway,
  generalLedgerCapabilities,
  generalLedgerReadCapabilities,
  makeCapabilityGatewayLayer,
  type CapabilityDefinition,
  type CapabilityGatewayService,
} from "@bound/capability"
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai"
import {
  decodeFixtureAccounts,
  decodeFixtureTransactions,
  decodeKernelFixture,
  makeInMemoryLedgerKernelLayer,
  makeInMemoryLedgerLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleKernelFixture,
  sampleTransactionsFixture,
  type Session,
} from "@bound/ledger"

import { runLedgerAgentPrompt, type LedgerAgentControl } from "./agent.ts"
import { projectGeneralLedgerTools } from "./general-ledger-tools.ts"

const primaryAccountIds = [
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
] as const

const primarySession: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  activeLedgerId: "ledger_primary",
  readableAccountIds: new Set(primaryAccountIds),
  mutableAccountIds: new Set(primaryAccountIds),
}

const withGeneralLedgerGateway = <A, E>(
  use: (gateway: CapabilityGatewayService) => Effect.Effect<A, E>,
  definitions: ReadonlyArray<CapabilityDefinition> = generalLedgerCapabilities,
) =>
  Effect.gen(function* () {
    const transactions = yield* decodeFixtureTransactions(
      sampleTransactionsFixture,
    )
    const legacyAccounts = yield* decodeFixtureAccounts(sampleAccountsFixture)
    const fixture = yield* decodeKernelFixture(sampleKernelFixture)
    const sessionLayer = makeTrustedSessionLayer(primarySession)
    const legacyLayer = makeInMemoryLedgerLayer(
      transactions,
      legacyAccounts,
    ).pipe(Layer.provide(sessionLayer))
    const kernelLayer = makeInMemoryLedgerKernelLayer({
      currency: fixture.currency,
      accounts: fixture.accounts,
      events: fixture.events,
      proposals: fixture.proposals,
    }).pipe(Layer.provide(sessionLayer))
    const gatewayLayer = makeCapabilityGatewayLayer(definitions).pipe(
      Layer.provide(
        Layer.merge(Layer.merge(legacyLayer, kernelLayer), sessionLayer),
      ),
    )

    return yield* CapabilityGateway.use(use).pipe(Effect.provide(gatewayLayer))
  })

const julyRange = {
  from: "2026-07-01T00:00:00.000Z",
  to: "2026-08-01T00:00:00.000Z",
}

const postInput = {
  kind: "expense",
  effectiveAt: "2026-07-29T12:00:00.000Z",
  idempotencyKey: "phase-13-agent-pending",
  provenance: {
    sourceKind: "agent",
    sourceReference: "phase-13-agent-pending",
    sourceDigest: "sha256:phase-13-agent-pending",
    correlationId: "phase-13-agent-pending",
    causationId: "phase-13-agent-pending",
  },
  postings: [
    {
      accountId: "acct_groceries",
      currency: "USD",
      amountMinor: 750,
    },
    {
      accountId: "acct_checking",
      currency: "USD",
      amountMinor: -750,
    },
  ],
}

describe("general-ledger Pi tools", () => {
  it.effect("projects only capabilities present in the supplied gateway", () =>
    withGeneralLedgerGateway(
      (gateway) =>
        Effect.sync(() => {
          expect(
            projectGeneralLedgerTools(gateway).map((tool) => tool.name),
          ).toEqual([
            "accounts_list",
            "events_get",
            "events_query",
            "reports_balance",
            "reports_activity",
            "reports_trial_balance",
          ])
        }),
      generalLedgerReadCapabilities,
    ),
  )

  it.effect(
    "projects the exact closed sequential catalog and invokes every read",
    () =>
      withGeneralLedgerGateway((gateway) =>
        Effect.gen(function* () {
          const tools = projectGeneralLedgerTools(gateway)

          expect(tools.map((tool) => tool.name)).toEqual([
            "accounts_list",
            "events_get",
            "events_query",
            "reports_balance",
            "reports_activity",
            "reports_trial_balance",
            "events_post",
            "events_reverse",
          ])
          expect(
            tools.every((tool) => tool.executionMode === "sequential"),
          ).toBe(true)
          expect(
            tools.every(
              (tool) =>
                (tool.parameters as { readonly additionalProperties?: unknown })
                  .additionalProperties === false,
            ),
          ).toBe(true)

          const inputs = [
            {},
            { eventId: "evt_003" },
            julyRange,
            { at: julyRange.to },
            julyRange,
            { at: julyRange.to },
          ] as const

          yield* Effect.promise(async () => {
            for (const [index, input] of inputs.entries()) {
              const result = await tools[index]?.execute(
                `call_read_${index}`,
                input,
              )
              expect(result?.details).toMatchObject({ status: "succeeded" })
            }
          })

          const attempts = yield* gateway.attempts
          expect(attempts.map((attempt) => attempt.name)).toEqual([
            "accounts.list",
            "events.get",
            "events.query",
            "reports.balance",
            "reports.activity",
            "reports.trial_balance",
          ])
          expect(
            attempts.every((attempt) => attempt.outcome === "succeeded"),
          ).toBe(true)
        }),
      ),
  )

  it.effect(
    "presents an exact pending mutation without exposing trusted controls",
    () =>
      withGeneralLedgerGateway((gateway) =>
        Effect.gen(function* () {
          const tools = projectGeneralLedgerTools(gateway)
          const before = yield* gateway.invoke("events.query", {})
          const postTool = tools.find((tool) => tool.name === "events_post")

          const result = yield* Effect.promise(() =>
            postTool!.execute("call_pending_post", postInput),
          )
          const after = yield* gateway.invoke("events.query", {})
          const pending = yield* gateway.pendingConfirmations
          const attempts = yield* gateway.attempts

          expect(
            tools.some((tool) => /confirm|approve|reject/.test(tool.name)),
          ).toBe(false)
          expect(result.details).toEqual({
            status: "confirmation_required",
            capabilityName: "events.post",
            confirmation: pending[0],
          })
          expect(pending).toHaveLength(1)
          expect(pending[0]?.decodedInput).toEqual(postInput)
          expect(after).toEqual(before)
          expect(
            attempts.find((attempt) => attempt.name === "events.post"),
          ).toMatchObject({
            outcome: "pending",
            stage: "confirmation",
            confirmation: "pending",
          })
        }),
      ),
  )

  it.effect("reconciles July through three ordered real gateway calls", () =>
    withGeneralLedgerGateway((gateway) =>
      Effect.gen(function* () {
        const faux = fauxProvider({
          provider: "bound-ledger-general-ledger-reconciliation-test",
          tokenSize: { min: 12, max: 12 },
        })
        const models = createModels()

        models.setProvider(faux.provider)
        faux.setResponses([
          fauxAssistantMessage(
            [
              fauxToolCall("events_query", julyRange, {
                id: "call_july_events",
              }),
              fauxToolCall("reports_activity", julyRange, {
                id: "call_july_activity",
              }),
              fauxToolCall(
                "reports_trial_balance",
                { at: julyRange.to },
                { id: "call_august_trial_balance" },
              ),
            ],
            { stopReason: "toolUse" },
          ),
          (context) => {
            const results = context.messages
              .filter((message) => message.role === "toolResult")
              .map((message) => {
                const text = message.content.find(
                  (content) => content.type === "text",
                )?.text
                return JSON.parse(text ?? "null") as {
                  readonly capabilityName: string
                  readonly output: unknown
                }
              })
            const outputByCapability = new Map(
              results.map((result) => [result.capabilityName, result.output]),
            )
            const events = outputByCapability.get(
              "events.query",
            ) as ReadonlyArray<unknown>
            const activity = outputByCapability.get("reports.activity") as {
              readonly expenseTotalMinor: number
            }
            const trialBalance = outputByCapability.get(
              "reports.trial_balance",
            ) as { readonly totalMinor: number }

            return fauxAssistantMessage(
              fauxText(
                `July 2026 reconciled: ${events.length} posted events, ${activity.expenseTotalMinor} expense minor units, trial balance zero: ${trialBalance.totalMinor === 0 ? "yes" : "no"}.`,
              ),
            )
          },
        ])

        const result = yield* Effect.promise(() =>
          runLedgerAgentPrompt(
            "Reconcile July 2026. Report the posted event count, expense total in minor units, and whether the trial balance is zero at the start of August.",
            {
              gateway,
              mode: "general_ledger",
              model: faux.getModel(),
              streamFn: models.streamSimple.bind(models),
            },
          ),
        )
        const attempts = yield* gateway.attempts

        expect(result.text).toBe(
          "July 2026 reconciled: 4 posted events, 6249 expense minor units, trial balance zero: yes.",
        )
        expect(
          result.events.filter((event) => event.type !== "text_delta"),
        ).toEqual([
          {
            type: "tool_started",
            toolCallId: "call_july_events",
            toolName: "events_query",
            args: julyRange,
          },
          {
            type: "tool_finished",
            toolCallId: "call_july_events",
            toolName: "events_query",
            isError: false,
          },
          {
            type: "tool_started",
            toolCallId: "call_july_activity",
            toolName: "reports_activity",
            args: julyRange,
          },
          {
            type: "tool_finished",
            toolCallId: "call_july_activity",
            toolName: "reports_activity",
            isError: false,
          },
          {
            type: "tool_started",
            toolCallId: "call_august_trial_balance",
            toolName: "reports_trial_balance",
            args: { at: julyRange.to },
          },
          {
            type: "tool_finished",
            toolCallId: "call_august_trial_balance",
            toolName: "reports_trial_balance",
            isError: false,
          },
        ])
        expect(attempts.map((attempt) => attempt.name)).toEqual([
          "events.query",
          "reports.activity",
          "reports.trial_balance",
        ])
        expect(faux.state.callCount).toBe(2)
      }),
    ),
  )

  it.effect("queues steering for the next model turn", () =>
    withGeneralLedgerGateway((gateway) =>
      Effect.gen(function* () {
        const faux = fauxProvider({
          provider: "bound-ledger-general-ledger-steering-test",
          tokenSize: { min: 12, max: 12 },
        })
        const models = createModels()
        let control: LedgerAgentControl | undefined

        models.setProvider(faux.provider)
        faux.setResponses([
          fauxAssistantMessage(
            fauxToolCall("events_query", julyRange, {
              id: "call_before_steer",
            }),
            { stopReason: "toolUse" },
          ),
          (context) => {
            const steering = context.messages.findLast(
              (message) => message.role === "user",
            )
            expect(
              steering?.role === "user" ? steering.content : undefined,
            ).toBe("Use the trial balance only.")
            return fauxAssistantMessage(fauxText("Steering received."))
          },
        ])

        const result = yield* Effect.promise(() =>
          runLedgerAgentPrompt("Start a July reconciliation.", {
            gateway,
            mode: "general_ledger",
            model: faux.getModel(),
            streamFn: models.streamSimple.bind(models),
            onControl: (nextControl) => {
              control = nextControl
            },
            onEvent: (event) => {
              if (
                event.type === "tool_finished" &&
                event.toolCallId === "call_before_steer"
              ) {
                control?.steer("Use the trial balance only.")
              }
            },
          }),
        )

        expect(result.text).toBe("Steering received.")
        expect(faux.state.callCount).toBe(2)
      }),
    ),
  )

  it.effect("aborts an active streamed run", () =>
    withGeneralLedgerGateway((gateway) =>
      Effect.gen(function* () {
        const faux = fauxProvider({
          provider: "bound-ledger-general-ledger-abort-test",
          tokenSize: { min: 1, max: 1 },
        })
        const models = createModels()
        let control: LedgerAgentControl | undefined

        models.setProvider(faux.provider)
        faux.setResponses([
          fauxAssistantMessage(
            fauxText("This response should be cancelled before it completes."),
          ),
        ])

        yield* Effect.promise(async () => {
          await expect(
            runLedgerAgentPrompt("Begin.", {
              gateway,
              mode: "general_ledger",
              model: faux.getModel(),
              streamFn: models.streamSimple.bind(models),
              onControl: (nextControl) => {
                control = nextControl
              },
              onEvent: (event) => {
                if (event.type === "text_delta") {
                  control?.abort()
                }
              },
            }),
          ).rejects.toThrow(/abort/i)
        })
      }),
    ),
  )
})
