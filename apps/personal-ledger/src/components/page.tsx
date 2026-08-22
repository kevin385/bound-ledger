import type { ReactNode } from "react"

import { Card } from "@astryxdesign/core/Card"
import { Grid } from "@astryxdesign/core/Grid"
import { Heading } from "@astryxdesign/core/Heading"
import { Layout, LayoutContent } from "@astryxdesign/core/Layout"
import { StatusDot } from "@astryxdesign/core/StatusDot"
import { Text } from "@astryxdesign/core/Text"
import { VStack } from "@astryxdesign/core/VStack"

export const formatMoney = (amountMinor: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100)

export function Page({ children }: { readonly children: ReactNode }) {
  return (
    <Layout height="auto">
      <LayoutContent padding={6}>
        <VStack gap={6}>{children}</VStack>
      </LayoutContent>
    </Layout>
  )
}

export function PageHeader({
  title,
  description,
  eyebrow,
}: {
  readonly title: string
  readonly description: string
  readonly eyebrow?: string
}) {
  return (
    <VStack gap={1}>
      {eyebrow === undefined ? null : (
        <Text type="label" color="secondary">
          {eyebrow}
        </Text>
      )}
      <Heading level={1}>{title}</Heading>
      <Text as="p" type="large" color="secondary">
        {description}
      </Text>
    </VStack>
  )
}

export function MetricGrid({
  metrics,
}: {
  readonly metrics: ReadonlyArray<{
    readonly label: string
    readonly value: string
    readonly detail: string
    readonly status?: "success" | "warning" | "error" | "neutral"
  }>
}) {
  return (
    <Grid columns={{ minWidth: 220, repeat: "fit", max: 4 }} gap={4}>
      {metrics.map((metric) => (
        <Card key={metric.label} padding={4}>
          <VStack gap={2}>
            <Text type="label" color="secondary">
              {metric.label}
            </Text>
            <Heading level={2} type="display-3">
              {metric.value}
            </Heading>
            {metric.status === undefined ? (
              <Text type="supporting">{metric.detail}</Text>
            ) : (
              <Grid
                columns={{ minWidth: 16, repeat: "fit" }}
                gap={2}
                align="center"
              >
                <StatusDot variant={metric.status} label={metric.detail} />
                <Text type="supporting">{metric.detail}</Text>
              </Grid>
            )}
          </VStack>
        </Card>
      ))}
    </Grid>
  )
}
