import { createServerFn } from "@tanstack/react-start"

import {
  LedgerApplicationError,
  getPersonalLedgerApplication,
} from "./application.server"
import {
  decodeConfirmationInput,
  decodeDashboardInput,
  decodeEmptyInput,
  decodeGetEventInput,
  decodeQueryEventsInput,
  decodeRequestExpenseInput,
  decodeRequestReversalInput,
  type ApplicationErrorCode,
  type ServerResult,
} from "./contracts"

const invalidInput = new Error("invalid_input")

const stableValidator =
  <A>(decode: (input: unknown) => A) =>
  (input: unknown): A => {
    try {
      return decode(input)
    } catch {
      throw invalidInput
    }
  }

const safe = async <A>(
  operation: () => Promise<A>,
): Promise<ServerResult<A>> => {
  try {
    return { ok: true, data: await operation() }
  } catch (error) {
    const code: ApplicationErrorCode =
      error instanceof LedgerApplicationError ? error.code : "internal_error"
    return { ok: false, error: { code } }
  }
}

export const getDashboard = createServerFn({ method: "GET" })
  .validator(stableValidator(decodeDashboardInput))
  .handler(async ({ data }) => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.getDashboard(data))
  })

export const queryEvents = createServerFn({ method: "GET" })
  .validator(stableValidator(decodeQueryEventsInput))
  .handler(async ({ data }) => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.queryEvents(data))
  })

export const getEvent = createServerFn({ method: "GET" })
  .validator(stableValidator(decodeGetEventInput))
  .handler(async ({ data }) => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.getEvent(data.eventId))
  })

export const queryProposals = createServerFn({ method: "GET" })
  .validator(stableValidator(decodeEmptyInput))
  .handler(async () => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.queryProposals())
  })

export const getPendingConfirmations = createServerFn({ method: "GET" })
  .validator(stableValidator(decodeEmptyInput))
  .handler(async () => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.getPendingConfirmations())
  })

export const getAttempts = createServerFn({ method: "GET" })
  .validator(stableValidator(decodeEmptyInput))
  .handler(async () => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.getAttempts())
  })

export const requestExpense = createServerFn({ method: "POST" })
  .validator(stableValidator(decodeRequestExpenseInput))
  .handler(async ({ data }) => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.requestExpense(data))
  })

export const requestReversal = createServerFn({ method: "POST" })
  .validator(stableValidator(decodeRequestReversalInput))
  .handler(async ({ data }) => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.requestReversal(data))
  })

export const confirmMutation = createServerFn({ method: "POST" })
  .validator(stableValidator(decodeConfirmationInput))
  .handler(async ({ data }) => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.confirmMutation(data.confirmationId))
  })

export const rejectMutation = createServerFn({ method: "POST" })
  .validator(stableValidator(decodeConfirmationInput))
  .handler(async ({ data }) => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.rejectMutation(data.confirmationId))
  })

export const resetLedger = createServerFn({ method: "POST" })
  .validator(stableValidator(decodeEmptyInput))
  .handler(async () => {
    const application = await getPersonalLedgerApplication()
    return safe(() => application.resetLedger())
  })
