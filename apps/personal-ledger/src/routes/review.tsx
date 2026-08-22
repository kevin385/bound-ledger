import { useState } from "react"

import { useForm } from "@tanstack/react-form"
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import {
  DateTimeInput,
  type DateTimeInputProps,
} from "@astryxdesign/core/DateTimeInput"
import { Divider } from "@astryxdesign/core/Divider"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { Grid } from "@astryxdesign/core/Grid"
import { HStack } from "@astryxdesign/core/HStack"
import { Heading } from "@astryxdesign/core/Heading"
import { NumberInput } from "@astryxdesign/core/NumberInput"
import { Section } from "@astryxdesign/core/Section"
import { Selector } from "@astryxdesign/core/Selector"
import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table"
import { Text } from "@astryxdesign/core/Text"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Timestamp } from "@astryxdesign/core/Timestamp"
import { Token } from "@astryxdesign/core/Token"
import { VStack } from "@astryxdesign/core/VStack"

import { Page, PageHeader, formatMoney } from "../components/page"
import {
  confirmMutation,
  rejectMutation,
  requestExpense,
  resetLedger,
} from "../ledger/functions"
import {
  attemptsQuery,
  confirmationsQuery,
  dashboardQuery,
  proposalsQuery,
  unwrapResult,
} from "../ledger/queries"
import type {
  AttemptView,
  ConfirmationView,
  MutationResult,
} from "../ledger/contracts"

interface ConfirmationRow extends Record<string, unknown> {
  readonly id: string
  readonly capability: string
  readonly summary: string
  readonly requestId: string
  readonly confirmation: ConfirmationView
}

interface AttemptRow extends Record<string, unknown> {
  readonly id: string
  readonly name: string
  readonly outcome: AttemptView["outcome"]
  readonly stage: string
  readonly confirmation: string
}

const outcomeColor = (outcome: AttemptView["outcome"]) => {
  switch (outcome) {
    case "succeeded":
      return "green" as const
    case "pending":
      return "yellow" as const
    case "rejected":
      return "orange" as const
    case "failed":
      return "red" as const
  }
}

export const Route = createFileRoute("/review")({
  ssr: "data-only",
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(dashboardQuery),
      context.queryClient.ensureQueryData(proposalsQuery),
      context.queryClient.ensureQueryData(confirmationsQuery),
      context.queryClient.ensureQueryData(attemptsQuery),
    ]),
  component: ReviewPage,
})

function ReviewPage() {
  const queryClient = useQueryClient()
  const { data: dashboard } = useSuspenseQuery(dashboardQuery)
  const { data: proposals } = useSuspenseQuery(proposalsQuery)
  const { data: confirmations } = useSuspenseQuery(confirmationsQuery)
  const { data: attempts } = useSuspenseQuery(attemptsQuery)
  const [notice, setNotice] = useState<{
    readonly status: "info" | "success" | "warning" | "error"
    readonly title: string
    readonly description: string
  }>()

  const refreshLedger = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["events"] }),
      queryClient.invalidateQueries({ queryKey: ["event"] }),
      queryClient.invalidateQueries({ queryKey: ["proposals"] }),
      queryClient.invalidateQueries({ queryKey: ["confirmations"] }),
      queryClient.invalidateQueries({ queryKey: ["attempts"] }),
    ])
  }

  const handleMutationResult = async (result: MutationResult) => {
    if (result.status === "pending") {
      setNotice({
        status: "warning",
        title: "Confirmation required",
        description: `${result.confirmation.summary} is staged as ${result.confirmation.id}. No event has been appended.`,
      })
    } else if (result.status === "completed") {
      setNotice({
        status: "success",
        title: "Mutation completed",
        description: `${result.event.id} was appended exactly once. Reports now include the posted event.`,
      })
    } else {
      setNotice({
        status: "info",
        title: "Request rejected",
        description: `${result.confirmationId} was rejected. The ledger remains unchanged.`,
      })
    }
    await refreshLedger()
  }

  const confirmationMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      readonly id: string
      readonly action: "confirm" | "reject"
    }) =>
      (action === "confirm"
        ? confirmMutation({ data: { confirmationId: id } })
        : rejectMutation({ data: { confirmationId: id } })
      ).then(unwrapResult),
    onSuccess: handleMutationResult,
    onError: (error) =>
      setNotice({
        status: "error",
        title: "Request could not be settled",
        description: error.message,
      }),
  })

  const resetMutation = useMutation({
    mutationFn: () => resetLedger({ data: {} }).then(unwrapResult),
    onSuccess: async () => {
      setNotice({
        status: "success",
        title: "Ledger reset",
        description:
          "Fixtures, proposal, confirmation queue, and attempt log are back to the checked-in baseline.",
      })
      await refreshLedger()
    },
    onError: (error) =>
      setNotice({
        status: "error",
        title: "Reset failed",
        description: error.message,
      }),
  })

  const expenseAccounts = dashboard.accounts.filter(
    (account) => account.class === "expense",
  )
  const fundingAccounts = dashboard.accounts.filter(
    (account) => account.class === "asset" || account.class === "liability",
  )
  const expenseForm = useForm({
    defaultValues: {
      requestId: "expense-july-market",
      effectiveAt: "2026-07-29T12:00:00.000Z",
      amountMinor: 725,
      expenseAccountId: expenseAccounts[0]?.id ?? "acct_groceries",
      fundingAccountId: fundingAccounts[0]?.id ?? "acct_checking",
      note: "Market groceries",
    },
    onSubmit: async ({ value }) => {
      const result = await requestExpense({ data: value }).then(unwrapResult)
      await handleMutationResult(result)
    },
  })

  const confirmationRows: ReadonlyArray<ConfirmationRow> = confirmations.map(
    (confirmation) => ({
      id: confirmation.id,
      capability: confirmation.capabilityName,
      summary: confirmation.summary,
      requestId: confirmation.requestId,
      confirmation,
    }),
  )
  const confirmationColumns: ReadonlyArray<TableColumn<ConfirmationRow>> = [
    { key: "id", header: "Confirmation", width: proportional(1) },
    { key: "summary", header: "Preview", width: proportional(2) },
    { key: "requestId", header: "Request ID", width: proportional(1) },
    {
      key: "actions",
      header: "Trusted decision",
      width: proportional(2),
      renderCell: (row) => (
        <HStack gap={2} wrap="wrap">
          <Button
            label={`Confirm ${row.id}`}
            variant="primary"
            size="sm"
            clickAction={async () => {
              await confirmationMutation.mutateAsync({
                id: row.id,
                action: "confirm",
              })
            }}
          >
            Confirm
          </Button>
          <Button
            label={`Reject ${row.id}`}
            variant="secondary"
            size="sm"
            clickAction={async () => {
              await confirmationMutation.mutateAsync({
                id: row.id,
                action: "reject",
              })
            }}
          >
            Reject
          </Button>
        </HStack>
      ),
    },
  ]
  const attemptRows: ReadonlyArray<AttemptRow> = attempts
    .slice(-12)
    .reverse()
    .map((attempt, index) => ({
      id: `${attempt.name}-${attempt.confirmationId ?? index}`,
      name: attempt.name,
      outcome: attempt.outcome,
      stage: attempt.stage,
      confirmation: attempt.confirmation ?? "—",
    }))
  const attemptColumns: ReadonlyArray<TableColumn<AttemptRow>> = [
    { key: "name", header: "Capability", width: proportional(2) },
    {
      key: "outcome",
      header: "Outcome",
      width: proportional(1),
      renderCell: (row) => (
        <Token
          label={row.outcome}
          color={outcomeColor(row.outcome)}
          size="sm"
        />
      ),
    },
    { key: "stage", header: "Stage", width: proportional(1) },
    { key: "confirmation", header: "Decision", width: proportional(1) },
  ]

  return (
    <Page>
      <PageHeader
        eyebrow="Human control plane"
        title="Review and post"
        description="Compare immutable proposals, prepare narrow mutation requests, and explicitly settle trusted confirmations."
      />
      <HStack gap={3} align="center" wrap="wrap">
        <Token label={`${proposals.length} unposted proposal`} color="purple" />
        <Token label={`${confirmations.length} pending`} color="yellow" />
        <Button
          label="Reset fixture ledger"
          variant="ghost"
          clickAction={async () => {
            await resetMutation.mutateAsync()
          }}
        />
      </HStack>
      {notice === undefined ? null : (
        <Banner
          status={notice.status}
          title={notice.title}
          description={notice.description}
          isDismissable
          onDismiss={() => setNotice(undefined)}
        />
      )}
      <Section variant="transparent" padding={0}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={2}>Unposted proposals</Heading>
            <Text as="p" color="secondary">
              Proposals preserve ambiguity and assumptions. They never alter
              ledger reports.
            </Text>
          </VStack>
          {proposals.length === 0 ? (
            <EmptyState
              title="No proposals to review"
              description="The fixture proposal returns after a deterministic reset."
              isCompact
            />
          ) : (
            <Grid columns={{ minWidth: 320, repeat: "fit", max: 2 }} gap={4}>
              {proposals.map((proposal) => (
                <Card key={proposal.id} padding={4}>
                  <VStack gap={3}>
                    <HStack gap={2} align="center" wrap="wrap">
                      <Token label="Unposted" color="purple" size="sm" />
                      <Text type="code">{proposal.id}</Text>
                    </HStack>
                    <Heading level={3}>
                      {proposal.kind} · {formatMoney(proposal.amountMinor)}
                    </Heading>
                    <Timestamp
                      value={proposal.effectiveAt}
                      format="system_date_time"
                    />
                    <Divider />
                    {proposal.assumptions.map((assumption) => (
                      <VStack key={assumption.field} gap={1}>
                        <Text type="label">Assumption: {assumption.field}</Text>
                        <Text as="p">{assumption.rationale}</Text>
                        <Text type="supporting" color="secondary">
                          Proposed {String(assumption.proposedValue)} ·{" "}
                          {Math.round(assumption.confidence * 100)}% confidence
                        </Text>
                      </VStack>
                    ))}
                  </VStack>
                </Card>
              ))}
            </Grid>
          )}
        </VStack>
      </Section>
      <Divider />
      <Grid
        columns={{ minWidth: 360, repeat: "fit", max: 2 }}
        gap={6}
        align="start"
      >
        <Section variant="section" padding={4}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void expenseForm.handleSubmit()
            }}
          >
            <VStack gap={4}>
              <VStack gap={1}>
                <Heading level={2}>Prepare an expense</Heading>
                <Text as="p" color="secondary">
                  Amounts are entered in USD minor units and mapped server-side
                  to balanced postings.
                </Text>
              </VStack>
              <expenseForm.Field name="requestId">
                {(field) => (
                  <TextInput
                    label="Client request ID"
                    value={field.state.value}
                    onChange={field.handleChange}
                    isRequired
                    width="100%"
                  />
                )}
              </expenseForm.Field>
              <expenseForm.Field name="effectiveAt">
                {(field) => (
                  <DateTimeInput
                    label="Effective time"
                    value={
                      field.state.value as NonNullable<
                        DateTimeInputProps["value"]
                      >
                    }
                    onChange={(value) =>
                      value === undefined
                        ? undefined
                        : field.handleChange(value)
                    }
                    hourFormat="24h"
                    isRequired
                    width="100%"
                  />
                )}
              </expenseForm.Field>
              <expenseForm.Field name="amountMinor">
                {(field) => (
                  <NumberInput
                    label="Amount in cents"
                    description="Positive whole minor units"
                    value={field.state.value}
                    onChange={field.handleChange}
                    min={1}
                    step={1}
                    isIntegerOnly
                    isRequired
                    width="100%"
                  />
                )}
              </expenseForm.Field>
              <expenseForm.Field name="expenseAccountId">
                {(field) => (
                  <Selector
                    label="Expense account"
                    options={expenseAccounts.map((account) => ({
                      value: account.id,
                      label: account.name,
                    }))}
                    value={field.state.value}
                    onChange={field.handleChange}
                    isRequired
                    width="100%"
                  />
                )}
              </expenseForm.Field>
              <expenseForm.Field name="fundingAccountId">
                {(field) => (
                  <Selector
                    label="Funding account"
                    options={fundingAccounts.map((account) => ({
                      value: account.id,
                      label: account.name,
                    }))}
                    value={field.state.value}
                    onChange={field.handleChange}
                    isRequired
                    width="100%"
                  />
                )}
              </expenseForm.Field>
              <expenseForm.Field name="note">
                {(field) => (
                  <TextInput
                    label="Note"
                    value={field.state.value}
                    onChange={field.handleChange}
                    isRequired
                    width="100%"
                  />
                )}
              </expenseForm.Field>
              <expenseForm.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
              >
                {([canSubmit, isSubmitting]) => (
                  <Button
                    label="Request expense confirmation"
                    type="submit"
                    variant="primary"
                    isDisabled={!canSubmit}
                    isLoading={Boolean(isSubmitting)}
                  />
                )}
              </expenseForm.Subscribe>
            </VStack>
          </form>
        </Section>
        <Section variant="muted" padding={4}>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={2}>Pending confirmations</Heading>
              <Text as="p" color="secondary">
                Confirm uses the stored decoded input. The browser cannot
                replace its authority or payload.
              </Text>
            </VStack>
            {confirmationRows.length === 0 ? (
              <EmptyState
                title="No pending confirmations"
                description="Prepare an expense or request an event reversal to stage a preview."
                isCompact
              />
            ) : (
              <Table
                data={[...confirmationRows]}
                columns={[...confirmationColumns]}
                idKey="id"
                density="compact"
                dividers="rows"
                verticalAlign="top"
              />
            )}
          </VStack>
        </Section>
      </Grid>
      <Divider />
      <VStack gap={3}>
        <Heading level={2}>Capability attempts</Heading>
        <Text as="p" color="secondary">
          The latest structured outcomes distinguish pending, rejected, failed,
          and completed work.
        </Text>
        {attemptRows.length === 0 ? (
          <EmptyState
            title="No capability attempts"
            description="Read and mutation evidence will appear as the application is used."
            isCompact
          />
        ) : (
          <Table
            data={[...attemptRows]}
            columns={[...attemptColumns]}
            idKey="id"
            density="compact"
            dividers="rows"
          />
        )}
      </VStack>
    </Page>
  )
}
