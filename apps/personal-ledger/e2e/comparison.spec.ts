import { expect, test } from "@playwright/test"

const comparisonRunTimeout = 20_000

test("comparison runs the canonical tool and code evidence on demand", async ({
  page,
}) => {
  await page.goto("/comparison")
  await page.waitForLoadState("networkidle")

  await expect(
    page.getByRole("heading", {
      name: "Tool mode and code mode, side by side",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "No comparison run yet" }),
  ).toBeVisible()
  await expect(page.getByText("Paired comparison passed")).not.toBeVisible()

  await page.getByRole("button", { name: "Run fresh comparison" }).click()

  await expect(page.getByText("Paired comparison passed")).toBeVisible({
    timeout: comparisonRunTimeout,
  })
  await expect(
    page.getByRole("heading", { name: "4", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "6,249 minor units" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Zero", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText("3 outer → 3 inner", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText("1 outer → 3 inner", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole("row", {
      name: "1 events.query authorized read authorized read",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("row", {
      name: "2 reports.activity authorized read authorized read",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("row", {
      name: "3 reports.trial_balance authorized read authorized read",
    }),
  ).toBeVisible()

  await page
    .getByRole("button", { name: "Read-only generated program" })
    .click()
  await expect(page.getByText("const range =", { exact: false })).toBeVisible()
  await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0)
  await expect(page.getByRole("textbox")).toHaveCount(0)
})

test("comparison failure never leaves a false passing state", async ({
  page,
}) => {
  await page.goto("/comparison")
  await page.waitForLoadState("networkidle")
  await page.route("**/_serverFn/**", (route) => route.abort("failed"))

  await page.getByRole("button", { name: "Run fresh comparison" }).click()

  await expect(page.getByText("Comparison could not run")).toBeVisible()
  await expect(page.getByText("Paired comparison passed")).not.toBeVisible()
  await expect(page.getByText("Failed", { exact: true })).toBeVisible()
})

test("comparison remains readable at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/comparison")
  await page.waitForLoadState("networkidle")

  await expect(
    page.getByRole("heading", {
      name: "Tool mode and code mode, side by side",
    }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Run fresh comparison" }).click()
  await expect(page.getByText("Paired comparison passed")).toBeVisible({
    timeout: comparisonRunTimeout,
  })
  await expect(
    page.getByRole("heading", { name: "Tool mode", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Code mode", exact: true }),
  ).toBeVisible()
})
