import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  LedgerApplicationError,
  createPersonalLedgerApplication,
  type PersonalLedgerApplication,
} from "./ledger/application.server.ts"
import {
  dashboardRange,
  decodeConfirmationInput,
  decodeDashboardInput,
  decodeEmptyInput,
  decodeRequestExpenseInput,
} from "./ledger/contracts.ts"

describe("personal ledger application", () => {
  let application: PersonalLedgerApplication | undefined

  afterEach(async () => {
    await application?.dispose()
    application = undefined
  })

  it("composes the deterministic dashboard and readable journal through the gateway", async () => {
    application = await createPersonalLedgerApplication()

    const dashboard = await application.getDashboard(dashboardRange)
    const julyEvents = await application.queryEvents({
      from: dashboardRange.from,
      to: dashboardRange.to,
    })
    const event = await application.getEvent("evt_003")
    const proposals = await application.queryProposals()
    const attempts = await application.getAttempts()

    assert.equal(dashboard.accounts.length, 10)
    assert.equal(dashboard.eventCount, 4)
    assert.equal(dashboard.expenseTotalMinor, 6_249)
    assert.equal(dashboard.trialBalanceMinor, 0)
    assert.deepEqual(
      julyEvents.map((item) => item.id),
      ["evt_003", "evt_004", "evt_005", "evt_006"],
    )
    assert.equal(event.postings.length, 2)
    assert.equal(event.provenance.sourceKind, "fixture")
    assert.equal(proposals.length, 1)
    assert.equal(proposals[0]?.assumptions[0]?.field, "accountId")
    assert.ok(attempts.some((attempt) => attempt.name === "proposals.query"))
    assert.ok(
      attempts.every(
        (attempt) =>
          attempt.authorization === "authorized" &&
          attempt.outcome === "succeeded",
      ),
    )
  })

  it("stages, rejects, confirms, refuses replay, reverses, and resets exactly", async () => {
    application = await createPersonalLedgerApplication()
    const initialEvents = await application.queryEvents({})

    const rejected = await application.requestExpense({
      requestId: "expense-rejected",
      effectiveAt: "2026-07-29T12:00:00.000Z",
      amountMinor: 725,
      expenseAccountId: "acct_groceries",
      fundingAccountId: "acct_checking",
      note: "Rejected market trip",
    })
    assert.equal(rejected.status, "pending")
    assert.equal(
      (await application.queryEvents({})).length,
      initialEvents.length,
    )
    if (rejected.status !== "pending") assert.fail("expected pending request")
    await application.rejectMutation(rejected.confirmation.id)
    assert.equal(
      (await application.queryEvents({})).length,
      initialEvents.length,
    )

    const approved = await application.requestExpense({
      requestId: "expense-approved",
      effectiveAt: "2026-07-30T12:00:00.000Z",
      amountMinor: 1_250,
      expenseAccountId: "acct_groceries",
      fundingAccountId: "acct_checking",
      note: "Approved market trip",
    })
    assert.equal(approved.status, "pending")
    if (approved.status !== "pending") assert.fail("expected pending request")
    assert.equal(
      (await application.queryEvents({})).length,
      initialEvents.length,
    )

    const completed = await application.confirmMutation(
      approved.confirmation.id,
    )
    assert.equal(completed.status, "completed")
    if (completed.status !== "completed")
      assert.fail("expected completed request")
    assert.equal(
      (await application.queryEvents({})).length,
      initialEvents.length + 1,
    )

    await assert.rejects(
      () => application!.confirmMutation(approved.confirmation.id),
      (error: unknown) =>
        error instanceof LedgerApplicationError &&
        error.code === "confirmation_not_found",
    )

    const reversal = await application.requestReversal({
      eventId: completed.event.id,
      requestId: "reversal-approved",
    })
    assert.equal(reversal.status, "pending")
    if (reversal.status !== "pending") assert.fail("expected reversal preview")
    assert.equal(
      (await application.queryEvents({})).length,
      initialEvents.length + 1,
    )

    const reversed = await application.confirmMutation(reversal.confirmation.id)
    assert.equal(reversed.status, "completed")
    if (reversed.status !== "completed") assert.fail("expected reversal event")
    assert.equal(reversed.event.lineage?.reverses, completed.event.id)
    assert.equal(
      (await application.queryEvents({})).length,
      initialEvents.length + 2,
    )

    const attemptsBeforeReset = await application.getAttempts()
    assert.ok(
      attemptsBeforeReset.some(
        (attempt) =>
          attempt.confirmation === "rejected" && attempt.outcome === "rejected",
      ),
    )
    assert.ok(
      attemptsBeforeReset.some(
        (attempt) =>
          attempt.confirmation === "approved" &&
          attempt.outcome === "succeeded",
      ),
    )

    await application.resetLedger()
    assert.deepEqual(await application.getAttempts(), [])
    assert.deepEqual(await application.getPendingConfirmations(), [])
    assert.equal(
      (await application.queryEvents({})).length,
      initialEvents.length,
    )
    const dashboard = await application.getDashboard(dashboardRange)
    assert.equal(dashboard.expenseTotalMinor, 6_249)
    assert.equal(dashboard.trialBalanceMinor, 0)
  })

  it("rejects malformed and authority-shaped browser inputs without retaining details", () => {
    assert.throws(() =>
      decodeDashboardInput({ ...dashboardRange, actorId: "browser-actor" }),
    )
    assert.throws(() => decodeConfirmationInput({ confirmationId: "" }))
    assert.throws(() => decodeEmptyInput({ ledgerId: "ledger_secondary" }))
    assert.throws(() =>
      decodeRequestExpenseInput({
        requestId: "bad-expense",
        effectiveAt: "not-an-instant",
        amountMinor: -1,
        expenseAccountId: "acct_groceries",
        fundingAccountId: "acct_checking",
        note: "Bad input",
      }),
    )
  })
})
