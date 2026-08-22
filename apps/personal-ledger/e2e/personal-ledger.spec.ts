import { expect, test } from "@playwright/test"

test("human ledger workflow stays capability-governed", async ({ page }) => {
  await page.goto("/review")
  await page.getByRole("button", { name: "Reset fixture ledger" }).click()
  await expect(page.getByText("Ledger reset", { exact: true })).toBeVisible()

  await page.getByRole("link", { name: "Dashboard" }).click()
  await expect(page.getByRole("heading", { name: "$62.49" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "4", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "10", exact: true }),
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "$0.00" })).toBeVisible()

  await page.getByRole("link", { name: "Event journal" }).click()
  await expect(page.getByText("4 posted events", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "evt_003" }).click()
  await expect(
    page.getByText("fixture · seed-checking-expense-july"),
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Postings" })).toBeVisible()

  await page.getByRole("link", { name: "Review", exact: true }).click()
  await expect(page.getByText("Unposted", { exact: true })).toBeVisible()
  await expect(page.getByText("Merchant looks like a grocer")).toBeVisible()

  await page
    .getByRole("button", { name: "Request expense confirmation" })
    .click()
  await expect(page.getByText("1 pending", { exact: true })).toBeVisible()
  await expect(page.getByText("No event has been appended.")).toBeVisible()
  await page.getByRole("button", { name: "Reject confirmation_001" }).click()
  await expect(
    page.getByText("Request rejected", { exact: true }),
  ).toBeVisible()
  await expect(page.getByText("0 pending", { exact: true })).toBeVisible()

  await page
    .getByRole("textbox", { name: "Client request ID Required" })
    .fill("expense-july-confirmed")
  await page
    .getByRole("button", { name: "Request expense confirmation" })
    .click()
  await page.getByRole("button", { name: "Confirm confirmation_002" }).click()
  await expect(
    page.getByText("Mutation completed", { exact: true }),
  ).toBeVisible()

  await page.getByRole("link", { name: "Event journal" }).click()
  await expect(page.getByText("5 posted events", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "evt_011" }).click()
  await expect(page.getByText("manual · expense-july-confirmed")).toBeVisible()
  await page.getByRole("button", { name: "Request reversal" }).click()
  await expect(
    page.getByText("Confirmation required", { exact: true }),
  ).toBeVisible()
  await page.getByRole("link", { name: "Open review queue" }).click()
  await page.getByRole("button", { name: "Confirm confirmation_003" }).click()
  await expect(
    page.getByText("Mutation completed", { exact: true }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Reset fixture ledger" }).click()
  await expect(page.getByText("Ledger reset", { exact: true })).toBeVisible()
  await expect(page.getByText("0 pending", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Dashboard" }).click()
  await expect(page.getByRole("heading", { name: "$62.49" })).toBeVisible()
})

test("narrow layout exposes mobile navigation and readable content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/")

  await expect(
    page.getByRole("heading", { name: "Your ledger, reconciled" }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Open navigation" }).click()
  await expect(
    page.getByRole("link", { name: "Review", exact: true }),
  ).toBeVisible()
})
