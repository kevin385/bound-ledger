import { Link } from "@astryxdesign/core/Link"
import { StatusDot } from "@astryxdesign/core/StatusDot"
import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table"
import { Text } from "@astryxdesign/core/Text"
import { Timestamp } from "@astryxdesign/core/Timestamp"

import type { EventView } from "../ledger/contracts"
import { formatMoney } from "./page"

interface EventRow extends Record<string, unknown> {
  readonly id: string
  readonly kind: string
  readonly effectiveAt: string
  readonly postingCount: number
  readonly amountMinor: number
  readonly lineage: string
}

const columns: ReadonlyArray<TableColumn<EventRow>> = [
  {
    key: "id",
    header: "Event",
    width: proportional(1),
    renderCell: (row) => (
      <Link href={`/journal/${row.id}`} isStandalone weight="semibold">
        {row.id}
      </Link>
    ),
  },
  {
    key: "kind",
    header: "Kind",
    width: proportional(1),
    renderCell: (row) => <Text>{row.kind}</Text>,
  },
  {
    key: "effectiveAt",
    header: "Effective",
    width: proportional(2),
    renderCell: (row) => (
      <Timestamp value={row.effectiveAt} format="system_date_time" />
    ),
  },
  {
    key: "postingCount",
    header: "Postings",
    width: proportional(1),
    align: "end",
  },
  {
    key: "amountMinor",
    header: "Amount",
    width: proportional(1),
    align: "end",
    renderCell: (row) => (
      <Text hasTabularNumbers weight="semibold">
        {formatMoney(row.amountMinor)}
      </Text>
    ),
  },
  {
    key: "lineage",
    header: "Lineage",
    width: proportional(1),
    renderCell: (row) =>
      row.lineage === "Posted" ? (
        <Text color="secondary">Posted</Text>
      ) : (
        <Text>
          <StatusDot variant="warning" label={row.lineage} /> {row.lineage}
        </Text>
      ),
  },
]

export function EventTable({
  events,
}: {
  readonly events: ReadonlyArray<EventView>
}) {
  const rows: ReadonlyArray<EventRow> = events.map((event) => ({
    id: event.id,
    kind: event.kind,
    effectiveAt: event.effectiveAt,
    postingCount: event.postings.length,
    amountMinor: event.amountMinor,
    lineage:
      event.lineage?.reverses === undefined
        ? event.lineage?.replaces === undefined
          ? "Posted"
          : `Replaces ${event.lineage.replaces}`
        : `Reverses ${event.lineage.reverses}`,
  }))

  return (
    <Table
      data={[...rows]}
      columns={[...columns]}
      idKey="id"
      density="compact"
      dividers="rows"
      hasHover
    />
  )
}
