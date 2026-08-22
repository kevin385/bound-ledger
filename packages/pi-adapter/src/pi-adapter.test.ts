import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { describe, expect } from "vitest"

import {
  CapabilityGateway,
  generalLedgerCapabilities,
  makeCapabilityGatewayLayer,
  type CapabilityGatewayService,
} from "@bound/capability"
import {
  RECONCILE_JULY_GENERAL_LEDGER_PROGRAM,
  type CodeModeRunResult,
} from "@bound/code-mode"
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
  makeInMemoryLedgerLayer,
  makeInMemoryLedgerKernelLayer,
  makeTrustedSessionLayer,
  sampleAccountsFixture,
  sampleKernelFixture,
  sampleTransactionsFixture,
  type Session,
} from "@bound/ledger"

import { runLedgerAgentPrompt } from "./agent.ts"
import { inspectCodeMode, projectCodeModeTools } from "./code-tools.ts"
import { projectLedgerTools } from "./tools.ts"
import { projectGeneralLedgerTools } from "./general-ledger-tools.ts"

const primarySession: Session = {
  actorId: "actor_primary_owner",
  activeWorkspaceId: "workspace_primary",
  activeLedgerId: "ledger_primary",
  readableAccountIds: new Set([
    "account_checking",
    "account_credit",
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
    "account_checking",
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

const withSampleGateway = <A, E>(
  use: (gateway: CapabilityGatewayService) => Effect.Effect<A, E>,
  definitions?: Parameters<typeof makeCapabilityGatewayLayer>[0],
) =>
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
    const gatewayLayer = makeCapabilityGatewayLayer(definitions).pipe(
      Layer.provide(
        Layer.merge(Layer.merge(ledgerLayer, kernelLayer), sessionLayer),
      ),
    )

    return yield* CapabilityGateway.use(use).pipe(Effect.provide(gatewayLayer))
  })

const withGeneralLedgerGateway = <A, E>(
  use: (gateway: CapabilityGatewayService) => Effect.Effect<A, E>,
) => withSampleGateway(use, generalLedgerCapabilities)

const reconciliationPrompt =
  "Reconcile July 2026. Report the posted event count, expense total in minor units, and whether the trial balance is zero at the start of August."
const julyRange = {
  from: "2026-07-01T00:00:00.000Z",
  to: "2026-08-01T00:00:00.000Z",
}
const reconciliationAnswer =
  "July 2026 reconciled: 4 posted events, 6249 expense minor units, trial balance zero: yes."

describe("Pi adapter", () => {
  it.effect("projects all ledger capabilities as sequential Pi tools", () =>
    withSampleGateway((gateway) =>
      Effect.gen(function* () {
        const tools = projectLedgerTools(gateway)

        expect(tools.map((tool) => tool.name)).toEqual([
          "transactions_list",
          "transactions_get",
          "transactions_update_category",
        ])
        expect(tools.every((tool) => tool.executionMode === "sequential")).toBe(
          true,
        )

        yield* Effect.promise(async () => {
          const listed = await tools[0]?.execute("call_list", {
            month: "2026-07",
          })
          const found = await tools[1]?.execute("call_get", {
            transactionId: "txn_001",
          })
          const updated = await tools[2]?.execute("call_update", {
            transactionId: "txn_001",
            category: "household",
          })

          expect(listed?.details.capabilityName).toBe("transactions.list")
          expect(found?.details.capabilityName).toBe("transactions.get")
          expect(updated?.details).toMatchObject({
            capabilityName: "transactions.update_category",
            output: { id: "txn_001", category: "household" },
          })
        })

        const attempts = yield* gateway.attempts

        expect(attempts.map((attempt) => attempt.name)).toEqual([
          "transactions.list",
          "transactions.get",
          "transactions.update_category",
        ])
      }),
    ),
  )

  it.effect(
    "lists transactions through Pi Agent Core and the real capability gateway",
    () =>
      withSampleGateway((gateway) =>
        Effect.gen(function* () {
          const faux = fauxProvider({
            provider: "bound-ledger-test",
            tokenSize: { min: 12, max: 12 },
          })
          const models = createModels()

          models.setProvider(faux.provider)
          faux.setResponses([
            fauxAssistantMessage(
              fauxToolCall(
                "transactions_list",
                { month: "2026-07" },
                { id: "call_list_july" },
              ),
              { stopReason: "toolUse" },
            ),
            (context) => {
              const toolResult = context.messages.findLast(
                (message) => message.role === "toolResult",
              )

              if (toolResult?.role !== "toolResult") {
                return fauxAssistantMessage(
                  "The transaction tool did not run.",
                  {
                    stopReason: "error",
                    errorMessage: "Missing tool result",
                  },
                )
              }

              const text = toolResult.content.find(
                (content) => content.type === "text",
              )?.text
              const transactions = JSON.parse(text ?? "[]") as ReadonlyArray<{
                readonly id: string
              }>

              return fauxAssistantMessage(
                fauxText(
                  `Found ${transactions.length} July transactions: ${transactions
                    .map((transaction) => transaction.id)
                    .join(", ")}.`,
                ),
              )
            },
          ])

          const result = yield* Effect.promise(() =>
            runLedgerAgentPrompt("List my July 2026 transactions.", {
              gateway,
              model: faux.getModel(),
              streamFn: models.streamSimple.bind(models),
            }),
          )
          const attempts = yield* gateway.attempts

          expect(result.text).toBe(
            "Found 3 July transactions: txn_001, txn_002, txn_003.",
          )
          expect(faux.state.callCount).toBe(2)
          expect(faux.getPendingResponseCount()).toBe(0)
          expect(attempts).toEqual([
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
          expect(
            result.events.filter((event) => event.type !== "text_delta"),
          ).toEqual([
            {
              type: "tool_started",
              toolCallId: "call_list_july",
              toolName: "transactions_list",
              args: { month: "2026-07" },
            },
            {
              type: "tool_finished",
              toolCallId: "call_list_july",
              toolName: "transactions_list",
              isError: false,
            },
          ])
          expect(
            result.events
              .filter((event) => event.type === "text_delta")
              .map((event) => event.delta)
              .join(""),
          ).toBe(result.text)
        }),
      ),
  )

  it.effect(
    "projects explicit discovery and execution tools from the general-ledger manifest",
    () =>
      withGeneralLedgerGateway((gateway) =>
        Effect.gen(function* () {
          const tools = projectCodeModeTools(gateway)
          const guide = inspectCodeMode(gateway)

          expect(tools.map((tool) => tool.name)).toEqual([
            "inspect_capabilities",
            "execute_code",
          ])
          expect(
            tools.every((tool) => tool.executionMode === "sequential"),
          ).toBe(true)
          expect(guide.capabilities).toHaveLength(8)
          expect(
            guide.capabilities.map((capability) => capability.name),
          ).toEqual([
            "accounts.list",
            "events.get",
            "events.query",
            "reports.balance",
            "reports.activity",
            "reports.trial_balance",
            "events.post",
            "events.reverse",
          ])
          expect(Object.isFrozen(guide)).toBe(true)
          expect(Object.isFrozen(guide.capabilities)).toBe(true)

          const detailed = yield* Effect.promise(() =>
            tools[0]!.execute("inspect_reports", {
              query: "trial",
              detail: "declaration",
            }),
          )
          expect(detailed.details).toMatchObject({
            capabilities: [
              {
                name: "reports.trial_balance",
                sdkPath: "app.reports.trialBalance",
                declaration:
                  "reports.trialBalance(input: { at: ISODateTime }): TrialBalance",
              },
            ],
          })
          expect(yield* gateway.attempts).toEqual([])
        }),
      ),
  )

  it.effect(
    "produces equivalent tool and code results through one Pi loop per mode",
    () =>
      withGeneralLedgerGateway((toolGateway) =>
        withGeneralLedgerGateway((codeGateway) =>
          Effect.gen(function* () {
            const toolFaux = fauxProvider({
              provider: "bound-ledger-paired-tool-test",
              tokenSize: { min: 12, max: 12 },
            })
            const codeFaux = fauxProvider({
              provider: "bound-ledger-paired-code-test",
              tokenSize: { min: 12, max: 12 },
            })
            const toolModels = createModels()
            const codeModels = createModels()
            let toolOutput:
              | {
                  readonly eventCount: number
                  readonly expenseTotalMinor: number
                  readonly trialBalanceZero: boolean
                }
              | undefined
            let codeOutput: CodeModeRunResult | undefined
            let codeSystemPrompt = ""
            let codeToolNames: ReadonlyArray<string> = []

            toolModels.setProvider(toolFaux.provider)
            codeModels.setProvider(codeFaux.provider)
            toolFaux.setResponses([
              fauxAssistantMessage(
                [
                  fauxToolCall("events_query", julyRange, {
                    id: "call_tool_events",
                  }),
                  fauxToolCall("reports_activity", julyRange, {
                    id: "call_tool_activity",
                  }),
                  fauxToolCall(
                    "reports_trial_balance",
                    { at: julyRange.to },
                    { id: "call_tool_trial_balance" },
                  ),
                ],
                { stopReason: "toolUse" },
              ),
              (context) => {
                const results = context.messages
                  .filter((message) => message.role === "toolResult")
                  .map(
                    (message) =>
                      JSON.parse(
                        message.content.find((item) => item.type === "text")
                          ?.text ?? "null",
                      ) as {
                        readonly capabilityName: string
                        readonly output: any
                      },
                  )
                const outputs = new Map(
                  results.map((result) => [
                    result.capabilityName,
                    result.output,
                  ]),
                )
                toolOutput = {
                  eventCount: outputs.get("events.query").length,
                  expenseTotalMinor:
                    outputs.get("reports.activity").expenseTotalMinor,
                  trialBalanceZero:
                    outputs.get("reports.trial_balance").totalMinor === 0,
                }
                return fauxAssistantMessage(fauxText(reconciliationAnswer))
              },
            ])
            codeFaux.setResponses([
              (context) => {
                codeSystemPrompt = context.systemPrompt ?? ""
                codeToolNames = context.tools?.map((tool) => tool.name) ?? []
                return fauxAssistantMessage(
                  fauxToolCall(
                    "execute_code",
                    { program: RECONCILE_JULY_GENERAL_LEDGER_PROGRAM },
                    { id: "call_code_reconciliation" },
                  ),
                  { stopReason: "toolUse" },
                )
              },
              (context) => {
                const result = context.messages.findLast(
                  (message) => message.role === "toolResult",
                )
                const text =
                  result?.role === "toolResult"
                    ? result.content.find((item) => item.type === "text")?.text
                    : undefined
                codeOutput = JSON.parse(text ?? "null") as CodeModeRunResult
                return fauxAssistantMessage(fauxText(reconciliationAnswer))
              },
            ])

            const toolRun = yield* Effect.promise(() =>
              runLedgerAgentPrompt(reconciliationPrompt, {
                gateway: toolGateway,
                mode: "general_ledger",
                model: toolFaux.getModel(),
                streamFn: toolModels.streamSimple.bind(toolModels),
              }),
            )
            const codeRun = yield* Effect.promise(() =>
              runLedgerAgentPrompt(reconciliationPrompt, {
                gateway: codeGateway,
                mode: "code",
                systemPrompt: "Custom code assistant.",
                model: codeFaux.getModel(),
                streamFn: codeModels.streamSimple.bind(codeModels),
              }),
            )
            const toolAttempts = yield* toolGateway.attempts
            const codeAttempts = yield* codeGateway.attempts

            expect(codeRun.text).toBe(toolRun.text)
            expect(codeOutput?.status).toBe("completed")
            expect(
              codeOutput?.status === "completed"
                ? codeOutput.output
                : undefined,
            ).toEqual(toolOutput)
            expect(codeOutput).toMatchObject({
              status: "completed",
              capabilityCalls: 3,
              mutationCalls: 0,
            })
            expect(codeAttempts).toEqual(toolAttempts)
            expect(toolFaux.state.callCount).toBe(2)
            expect(codeFaux.state.callCount).toBe(2)
            expect(toolFaux.getPendingResponseCount()).toBe(0)
            expect(codeFaux.getPendingResponseCount()).toBe(0)
            expect(codeToolNames).toEqual([
              "inspect_capabilities",
              "execute_code",
            ])
            expect(codeSystemPrompt).toContain("Custom code assistant.")
            expect(codeSystemPrompt).toContain("inspect_capabilities")
            expect(codeSystemPrompt).not.toContain("app.events.query")
            expect(codeSystemPrompt).toContain('"capabilityCalls":8')
            expect(
              codeRun.events.filter((event) => event.type !== "text_delta"),
            ).toEqual([
              {
                type: "tool_started",
                toolCallId: "call_code_reconciliation",
                toolName: "execute_code",
                args: { program: RECONCILE_JULY_GENERAL_LEDGER_PROGRAM },
              },
              {
                type: "tool_finished",
                toolCallId: "call_code_reconciliation",
                toolName: "execute_code",
                isError: false,
              },
            ])
            expect(
              codeRun.events
                .filter((event) => event.type === "text_delta")
                .map((event) => event.delta)
                .join(""),
            ).toBe(codeRun.text)
          }),
        ),
      ),
  )

  it.effect(
    "stops equivalent tool and code post requests at the same confirmation",
    () =>
      withGeneralLedgerGateway((toolGateway) =>
        withGeneralLedgerGateway((codeGateway) =>
          Effect.gen(function* () {
            const postInput = {
              kind: "expense",
              effectiveAt: "2026-07-29T12:00:00.000Z",
              idempotencyKey: "paired-pending-post",
              provenance: {
                sourceKind: "agent",
                sourceReference: "paired-pending-post",
                sourceDigest: "sha256:paired-pending-post",
                correlationId: "paired-pending-post",
                causationId: "paired-pending-post",
              },
              postings: [
                {
                  accountId: "acct_groceries",
                  currency: "USD",
                  amountMinor: 725,
                },
                {
                  accountId: "acct_checking",
                  currency: "USD",
                  amountMinor: -725,
                },
              ],
            }
            const tool = projectGeneralLedgerTools(toolGateway).find(
              (candidate) => candidate.name === "events_post",
            )
            const code = projectCodeModeTools(codeGateway).find(
              (candidate) => candidate.name === "execute_code",
            )

            expect(tool).toBeDefined()
            expect(code).toBeDefined()

            const [toolBefore, codeBefore] = yield* Effect.all([
              toolGateway.invoke("events.query", {}),
              codeGateway.invoke("events.query", {}),
            ])
            const toolResult = yield* Effect.promise(() =>
              tool!.execute("paired_tool_post", postInput),
            )
            const codeResult = yield* Effect.promise(() =>
              code!.execute("paired_code_post", {
                program: `return yield* app.events.post(${JSON.stringify(postInput)});`,
              }),
            )
            const [toolAfter, codeAfter] = yield* Effect.all([
              toolGateway.invoke("events.query", {}),
              codeGateway.invoke("events.query", {}),
            ])
            const [toolPending, codePending] = yield* Effect.all([
              toolGateway.pendingConfirmations,
              codeGateway.pendingConfirmations,
            ])

            expect((toolResult.details as any).status).toBe(
              "confirmation_required",
            )
            expect((codeResult.details as any).status).toBe(
              "confirmation_required",
            )
            expect(codeResult.details as any).toMatchObject({
              capabilityCalls: 1,
              mutationCalls: 1,
            })
            expect((codeResult.details as any).confirmation).toEqual(
              (toolResult.details as any).confirmation,
            )
            expect(toolPending).toEqual(codePending)
            expect(toolAfter).toEqual(toolBefore)
            expect(codeAfter).toEqual(codeBefore)
          }),
        ),
      ),
  )
})
