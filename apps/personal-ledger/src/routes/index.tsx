import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"

import { Heading } from "@astryxdesign/core/Heading"
import { Table, proportional, type TableColumn } from "@astryxdesign/core/Table"
import { Text } from "@astryxdesign/core/Text"
import { VStack } from "@astryxdesign/core/VStack"

import { MetricGrid, Page, PageHeader, formatMoney } from "../components/page"
import { dashboardQuery } from "../ledger/queries"

interface AccountRow extends Record<string, unknown> {
  readonly id: string
  readonly name: string
  readonly class: string
  readonly subtype: string
  readonly balance: string
}

const accountColumns: ReadonlyArray<TableColumn<AccountRow>> = [
  { key: "name", header: "Account", width: proportional(2) },
  { key: "class", header: "Class", width: proportional(1) },
  { key: "subtype", header: "Type", width: proportional(1) },
  {
    key: "balance",
    header: "Balance",
    width: proportional(1),
    align: "end",
    renderCell: (row) => (
      <Text hasTabularNumbers weight="semibold">
        {row.balance}
      </Text>
    ),
  },
]

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: DashboardPage,
})

function DashboardPage() {
  const { data } = useSuspenseQuery(dashboardQuery)
  const rows: ReadonlyArray<AccountRow> = data.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    class: account.class,
    subtype: account.subtype.replaceAll("_", " "),
    balance: formatMoney(account.balanceMinor, account.currency),
  }))

  return (
    <Page>
      <PageHeader
        eyebrow="Overview · July 2026"
        title="Your ledger, reconciled"
        description="A deterministic view of posted activity. Proposals and pending confirmations never affect these totals."
      />
      <MetricGrid
        metrics={[
          {
            label: "July expenses",
            value: formatMoney(data.expenseTotalMinor),
            detail: "Authoritative activity report",
          },
          {
            label: "Posted events",
            value: String(data.eventCount),
            detail: "In the July reporting window",
          },
          {
            label: "Readable accounts",
            value: String(data.accounts.length),
            detail: "Scoped to the active ledger",
          },
          {
            label: "Trial balance",
            value: formatMoney(data.trialBalanceMinor),
            detail:
              data.trialBalanceMinor === 0 ? "Balanced" : "Needs attention",
            status: data.trialBalanceMinor === 0 ? "success" : "error",
          },
        ]}
      />
      <VStack gap={3}>
        <Heading level={2}>Account balances</Heading>
        <Text as="p" color="secondary">
          Debit-positive balances at August 1, 2026, before the boundary
          instant.
        </Text>
        <Table
          data={[...rows]}
          columns={[...accountColumns]}
          idKey="id"
          density="compact"
          dividers="rows"
          isStriped
        />
      </VStack>
    </Page>
  )
}
