import { useMutation } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { GENERAL_LEDGER_RECONCILIATION_TASK_V1 } from "@bound/evaluation/task"

import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { CodeBlock } from "@astryxdesign/core/CodeBlock"
import { Collapsible } from "@astryxdesign/core/Collapsible"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { Grid } from "@astryxdesign/core/Grid"
import { HStack } from "@astryxdesign/core/HStack"
import { Heading } from "@astryxdesign/core/Heading"
import { Section } from "@astryxdesign/core/Section"
import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table"
import { Text } from "@astryxdesign/core/Text"
import { Token } from "@astryxdesign/core/Token"
import { VStack } from "@astryxdesign/core/VStack"

import { MetricGrid, Page, PageHeader } from "../components/page"
import { runComparison } from "../comparison/functions"
import type {
  ComparisonModeView,
  ComparisonServerResult,
  ComparisonView,
} from "../comparison/contracts"

interface AttemptRow extends Record<string, unknown> {
  readonly id: string
  readonly sequence: string
  readonly capability: string
  readonly tool: string
  readonly code: string
}

const attemptColumns: ReadonlyArray<TableColumn<AttemptRow>> = [
  { key: "sequence", header: "Step", width: proportional(1) },
  { key: "capability", header: "Gateway capability", width: proportional(2) },
  { key: "tool", header: "Tool mode", width: proportional(2) },
  { key: "code", header: "Code mode", width: proportional(2) },
]

const unwrapComparison = (result: ComparisonServerResult): ComparisonView => {
  if (result.ok) return result.data
  throw new Error(result.error.code)
}

export const Route = createFileRoute("/comparison")({
  ssr: "data-only",
  component: ComparisonPage,
})

function ModeCard({ mode }: { readonly mode: ComparisonModeView }) {
  return (
    <Card padding={4}>
      <VStack gap={4}>
        <HStack gap={2} align="center" wrap="wrap">
          <Heading level={2}>{mode.label}</Heading>
          <Token label="Passed" color="green" size="sm" />
        </HStack>
        <Text as="p" color="secondary">
          {mode.mode === "tool"
            ? "The model selected three explicit general-ledger tools."
            : "The model selected one code tool that composed the same three ledger reads."}
        </Text>
        <Grid columns={{ minWidth: 120, repeat: "fit", max: 4 }} gap={3}>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              Outer calls
            </Text>
            <Heading level={3} type="display-3">
              {mode.metrics.outerToolCalls}
            </Heading>
          </VStack>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              Gateway reads
            </Text>
            <Heading level={3} type="display-3">
              {mode.metrics.innerCapabilityCalls}
            </Heading>
          </VStack>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              Correctness
            </Text>
            <Heading level={3} type="display-3">
              {mode.correctness.score.toFixed(1)}
            </Heading>
          </VStack>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              Safety
            </Text>
            <Heading level={3} type="display-3">
              {mode.safety.score.toFixed(1)}
            </Heading>
          </VStack>
        </Grid>
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {mode.metrics.outerToolCalls} outer →{" "}
          {mode.metrics.innerCapabilityCalls} inner ·{" "}
          {mode.metrics.durationMilliseconds.toFixed(3)} ms diagnostic
        </Text>
      </VStack>
    </Card>
  )
}

function ComparisonResults({
  comparison,
}: {
  readonly comparison: ComparisonView
}) {
  const attemptRows: ReadonlyArray<AttemptRow> =
    comparison.modes.tool.attempts.map((attempt, index) => ({
      id: String(attempt.sequence),
      sequence: String(attempt.sequence),
      capability: attempt.name,
      tool: `${attempt.authorization} ${attempt.kind}`,
      code: `${comparison.modes.code.attempts[index]?.authorization ?? "missing"} ${comparison.modes.code.attempts[index]?.kind ?? "read"}`,
    }))

  return (
    <VStack gap={6}>
      <Banner
        status={comparison.comparison.passed ? "success" : "error"}
        title={
          comparison.comparison.passed
            ? "Paired comparison passed"
            : "Paired comparison diverged"
        }
        description={comparison.task.expectedAnswer}
      />
      <MetricGrid
        metrics={[
          {
            label: "July events",
            value: String(comparison.modes.tool.facts.eventCount),
            detail: "Exact posted-event count",
          },
          {
            label: "Expense total",
            value: `${comparison.modes.tool.facts.expenseTotalMinor.toLocaleString("en-US")} minor units`,
            detail: "Exact activity-report total",
          },
          {
            label: "Trial balance",
            value: comparison.modes.tool.facts.trialBalanceZero
              ? "Zero"
              : "Non-zero",
            detail: "At the August opening boundary",
            status: comparison.modes.tool.facts.trialBalanceZero
              ? "success"
              : "error",
          },
          {
            label: "Mode agreement",
            value: comparison.comparison.sameFacts ? "Exact" : "Diverged",
            detail: "Facts, attempts, and scores",
            status: comparison.comparison.passed ? "success" : "error",
          },
        ]}
      />
      <Grid columns={{ minWidth: 300, repeat: "fit", max: 2 }} gap={4}>
        <ModeCard mode={comparison.modes.tool} />
        <ModeCard mode={comparison.modes.code} />
      </Grid>
      <Section variant="transparent" padding={0}>
        <VStack gap={3}>
          <VStack gap={1}>
            <Heading level={2}>Same governed gateway path</Heading>
            <Text as="p" color="secondary">
              The outer interaction differs, but both modes record the same
              ordered authorized reads.
            </Text>
          </VStack>
          <Table
            data={[...attemptRows]}
            columns={[...attemptColumns]}
            idKey="id"
            density="compact"
            dividers="rows"
            isStriped
          />
        </VStack>
      </Section>
      <Collapsible
        trigger={<Text weight="semibold">Read-only generated program</Text>}
        defaultIsOpen={false}
      >
        <CodeBlock
          code={comparison.program}
          language="javascript"
          title="reconcile-july.js"
          hasLineNumbers
          width="100%"
        />
      </Collapsible>
      <Banner
        status="warning"
        title="Deterministic local proof"
        description={`${comparison.limitation} ${comparison.timingNote}`}
      />
    </VStack>
  )
}

function ComparisonPage() {
  const comparisonMutation = useMutation({
    mutationFn: () => runComparison({ data: {} }).then(unwrapComparison),
  })

  return (
    <Page>
      <PageHeader
        eyebrow="Research workbench · Phase 16"
        title="Tool mode and code mode, side by side"
        description="Run one fresh deterministic reconciliation and inspect how two outer interaction styles reach the same application-owned ledger boundary."
      />
      <Banner
        status="info"
        title="No live model or financial data"
        description="This page runs a fixed faux-provider task against fresh checked-in fixtures. It accepts no prompt, generated program, actor, ledger, or confirmation input."
      />
      <Card padding={4}>
        <VStack gap={3}>
          <Text type="label" color="secondary">
            Canonical prompt
          </Text>
          <Heading level={2}>
            {GENERAL_LEDGER_RECONCILIATION_TASK_V1.prompt}
          </Heading>
          <HStack gap={3} align="center" wrap="wrap">
            <Button
              label="Run fresh comparison"
              variant="primary"
              isLoading={comparisonMutation.isPending}
              isDisabled={comparisonMutation.isPending}
              clickAction={() => {
                comparisonMutation.mutate()
              }}
            />
            <Token
              label={
                comparisonMutation.isPending
                  ? "Running"
                  : comparisonMutation.isSuccess
                    ? "Fresh result"
                    : comparisonMutation.isError
                      ? "Failed"
                      : "Not run yet"
              }
              color={
                comparisonMutation.isSuccess
                  ? "green"
                  : comparisonMutation.isError
                    ? "red"
                    : comparisonMutation.isPending
                      ? "blue"
                      : "gray"
              }
            />
          </HStack>
        </VStack>
      </Card>
      {comparisonMutation.isError ? (
        <Banner
          status="error"
          title="Comparison could not run"
          description="No passing result is being shown. Retry to start again from fresh fixture and sandbox state."
        />
      ) : comparisonMutation.data === undefined ? (
        <EmptyState
          title="No comparison run yet"
          description="Run the fixed task to produce fresh paired evidence. The route itself performs no evaluation."
          isCompact
        />
      ) : (
        <ComparisonResults comparison={comparisonMutation.data} />
      )}
    </Page>
  )
}
