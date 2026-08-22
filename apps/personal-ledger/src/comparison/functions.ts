import { createServerFn } from "@tanstack/react-start"

import { decodeEmptyInput } from "../ledger/contracts"
import { createComparisonView } from "./application.server"
import type { ComparisonServerResult } from "./contracts"

const invalidInput = new Error("invalid_input")

const validateEmpty = (input: unknown): Record<string, never> => {
  try {
    return decodeEmptyInput(input)
  } catch {
    throw invalidInput
  }
}

export const runComparison = createServerFn({ method: "POST" })
  .validator(validateEmpty)
  .handler(async (): Promise<ComparisonServerResult> => {
    try {
      return { ok: true, data: await createComparisonView() }
    } catch {
      return { ok: false, error: { code: "internal_error" } }
    }
  })
