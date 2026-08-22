import { useState } from "react"

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { Grid } from "@astryxdesign/core/Grid"
import { HStack } from "@astryxdesign/core/HStack"
import { Heading } from "@astryxdesign/core/Heading"
import { Link } from "@astryxdesign/core/Link"
import { Section } from "@astryxdesign/core/Section"
import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table"
import { Text } from "@astryxdesign/core/Text"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Timestamp } from "@astryxdesign/core/Timestamp"
import { Token } from "@astryxdesign/core/Token"
import { VStack } from "@astryxdesign/core/VStack"

import { Page, PageHeader, formatMoney } from "../components/page"
import { requestReversal } from "../ledger/functions"
import { eventQuery, unwrapResult } from "../ledger/queries"

interface PostingRow extends Record<string, unknown> {
  readonly accountId: string
  readonly accountName: string
  readonly description: string
  readonly amount: string
}

const postingColumns: ReadonlyArray<TableColumn<PostingRow>> = [
  { key: "accountName", header: "Account", width: proportional(2) },
  { key: "description", header: "Description", width: proportional(2) },
  {
    key: "amount",
    header: "Signed amount",
    width: proportional(1),
    align: "end",
    renderCell: (row) => <Text hasTabularNumbers>{row.amount}</Text>,
  },
]

export const Route = createFileRoute("/journal_/$eventId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(eventQuery(params.eventId)),
  component: EventDetailPage,
})

function EventDetailPage() {
  const { eventId } = Route.useParams()
  const { data: event } = useSuspenseQuery(eventQuery(eventId))
  const queryClient = useQueryClient()
  const [requestId, setRequestId] = useState(`reverse-${event.id}`)
  const [message, setMessage] = useState<string>()
  const reversal = useMutation({
    mutationFn: () =>
      requestReversal({ data: { eventId: event.id, requestId } }).then(
        unwrapResult,
      ),
    onSuccess: async (result) => {
      setMessage(
        result.status === "pending"
          ? `Reversal is awaiting confirmation: ${result.confirmation.id}`
          : "Reversal request updated",
      )
      await queryClient.invalidateQueries({ queryKey: ["confirmations"] })
    },
  })
  const postings: ReadonlyArray<PostingRow> = event.postings.map((posting) => ({
    accountId: posting.accountId,
    accountName: posting.accountName,
    description: posting.description ?? "—",
    amount: formatMoney(posting.amountMinor, posting.currency),
  }))

  return (
    <Page>
      <PageHeader
        eyebrow={`${event.kind} · ${event.id}`}
        title={formatMoney(event.amountMinor)}
        description="A posted event is immutable. Corrections append an exact reversal instead of editing history."
      />
      <HStack gap={2} wrap="wrap">
        <Token label="Posted" color="green" size="sm" />
        <Token
          label={`${event.postings.length} postings`}
          color="gray"
          size="sm"
        />
        {event.lineage?.reverses === undefined ? null : (
          <Token
            label={`Reverses ${event.lineage.reverses}`}
            color="orange"
            size="sm"
          />
        )}
        {event.lineage?.replaces === undefined ? null : (
          <Token
            label={`Replaces ${event.lineage.replaces}`}
            color="orange"
            size="sm"
          />
        )}
      </HStack>
      <Grid columns={{ minWidth: 280, repeat: "fit", max: 2 }} gap={4}>
        <Card padding={4}>
          <VStack gap={3}>
            <Heading level={2}>Timing and actor</Heading>
            <Text type="label" color="secondary">
              Effective
            </Text>
            <Timestamp value={event.effectiveAt} format="system_date_time" />
            <Text type="label" color="secondary">
              Recorded
            </Text>
            <Timestamp value={event.recordedAt} format="system_date_time" />
            <Text type="label" color="secondary">
              Actor
            </Text>
            <Text type="code">{event.actorId}</Text>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={3}>
            <Heading level={2}>Provenance</Heading>
            <Text type="label" color="secondary">
              Source
            </Text>
            <Text>
              {event.provenance.sourceKind} · {event.provenance.sourceReference}
            </Text>
            <Text type="label" color="secondary">
              Correlation
            </Text>
            <Text type="code">{event.provenance.correlationId}</Text>
            <Text type="label" color="secondary">
              Idempotency key
            </Text>
            <Text type="code">{event.idempotencyKey}</Text>
          </VStack>
        </Card>
      </Grid>
      <VStack gap={3}>
        <Heading level={2}>Postings</Heading>
        <Table
          data={[...postings]}
          columns={[...postingColumns]}
          idKey="accountId"
          density="compact"
          dividers="rows"
        />
      </VStack>
      <Section variant="muted" padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Request exact reversal</Heading>
          <Text as="p" color="secondary">
            This creates a preview for trusted review. Nothing is appended until
            confirmed.
          </Text>
          <TextInput
            label="Client request ID"
            value={requestId}
            onChange={setRequestId}
            isRequired
            width="100%"
          />
          <HStack gap={3} align="center" wrap="wrap">
            <Button
              label="Request reversal"
              variant="secondary"
              isDisabled={requestId.trim().length === 0}
              clickAction={async () => {
                await reversal.mutateAsync()
              }}
            />
            <Link href="/review" isStandalone>
              Open review queue
            </Link>
          </HStack>
          {message === undefined ? null : (
            <Banner
              status="warning"
              title="Confirmation required"
              description={message}
            />
          )}
        </VStack>
      </Section>
    </Page>
  )
}
