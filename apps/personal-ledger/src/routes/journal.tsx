import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { Button } from "@astryxdesign/core/Button"
import { DateInput, type DateInputProps } from "@astryxdesign/core/DateInput"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { HStack } from "@astryxdesign/core/HStack"
import { Heading } from "@astryxdesign/core/Heading"
import { Text } from "@astryxdesign/core/Text"
import { VStack } from "@astryxdesign/core/VStack"

import { EventTable } from "../components/event-table"
import { Page, PageHeader } from "../components/page"
import { eventsQuery } from "../ledger/queries"
import type { QueryEventsInput } from "../ledger/contracts"

const defaultRange = {
  from: "2026-07-01T00:00:00.000Z",
  to: "2026-08-01T00:00:00.000Z",
} as const

export const Route = createFileRoute("/journal")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(eventsQuery(defaultRange)),
  component: JournalPage,
})

function JournalPage() {
  const [fromDate, setFromDate] = useState("2026-07-01")
  const [toDate, setToDate] = useState("2026-07-31")
  const [range, setRange] = useState<QueryEventsInput>(defaultRange)
  const { data: events = [], isFetching } = useQuery(eventsQuery(range))

  const applyRange = () => {
    setRange({
      from: `${fromDate}T00:00:00.000Z`,
      to: `${toDate}T23:59:59.999Z`,
    })
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Posted record"
        title="Event journal"
        description="Inspect the append-only financial events that drive balances and reports."
      />
      <VStack gap={3}>
        <Heading level={2}>Reporting window</Heading>
        <HStack gap={3} align="end" wrap="wrap">
          <DateInput
            label="From"
            value={fromDate as NonNullable<DateInputProps["value"]>}
            onChange={(value) => setFromDate(value ?? fromDate)}
            format="system_date"
          />
          <DateInput
            label="Through"
            value={toDate as NonNullable<DateInputProps["value"]>}
            onChange={(value) => setToDate(value ?? toDate)}
            format="system_date"
          />
          <Button
            label="Apply range"
            variant="secondary"
            clickAction={async () => applyRange()}
          />
        </HStack>
        <Text type="supporting" color="secondary">
          {isFetching
            ? "Refreshing journal…"
            : `${events.length} posted events`}
        </Text>
      </VStack>
      {events.length === 0 ? (
        <EmptyState
          title="No posted events in this range"
          description="Choose a wider date range to inspect earlier or later activity."
        />
      ) : (
        <EventTable events={events} />
      )}
    </Page>
  )
}
