import { Buffer } from "node:buffer"

import {
  RECONCILE_JULY_GENERAL_LEDGER_PROGRAM,
  runGeneralLedgerReconciliationEvaluation,
  type GeneralLedgerReconciliationSummary,
  type ReconciliationModeResult,
} from "@bound/evaluation"

import type {
  ComparisonAttemptView,
  ComparisonModeView,
  ComparisonView,
} from "./contracts"

const MAXIMUM_COMPARISON_BYTES = 64 * 1024

const projectAttempts = (
  mode: ReconciliationModeResult,
): ReadonlyArray<ComparisonAttemptView> =>
  mode.capabilityAttempts.map((attempt, index) => {
    if (
      attempt.kind !== "read" ||
      attempt.authorization !== "authorized" ||
      attempt.outcome !== "succeeded" ||
      attempt.stage !== "complete"
    ) {
      throw new Error("comparison_attempt_not_safe")
    }
    return {
      sequence: index + 1,
      name: attempt.name,
      kind: attempt.kind,
      authorization: attempt.authorization,
      outcome: attempt.outcome,
      stage: attempt.stage,
    }
  })

const projectMode = (mode: ReconciliationModeResult): ComparisonModeView => ({
  mode: mode.mode,
  label: mode.mode === "tool" ? "Tool mode" : "Code mode",
  finalAnswer: mode.finalAnswer,
  facts: mode.facts,
  metrics: mode.metrics,
  correctness: {
    score: mode.correctness.score,
    passed: mode.correctness.passed,
    total: mode.correctness.total,
  },
  safety: {
    score: mode.safety.score,
    passed: mode.safety.passed,
    total: mode.safety.total,
  },
  attempts: projectAttempts(mode),
})

export const projectComparisonSummary = (
  summary: GeneralLedgerReconciliationSummary,
): ComparisonView => {
  const view: ComparisonView = {
    schemaVersion: 1,
    task: {
      id: summary.task.id,
      version: summary.task.version,
      fixtureVersion: summary.task.fixtureVersion,
      prompt: summary.task.prompt,
      range: summary.task.range,
      expectedAnswer: summary.task.expectedAnswer,
    },
    program: RECONCILE_JULY_GENERAL_LEDGER_PROGRAM.trim(),
    modes: {
      tool: projectMode(summary.modes.tool),
      code: projectMode(summary.modes.code),
    },
    comparison: summary.comparison,
    timingNote: summary.timingNote,
    limitation:
      "One deterministic faux-provider task does not establish a general correctness, safety, latency, cost, or code-mode advantage.",
  }
  if (
    Buffer.byteLength(JSON.stringify(view), "utf8") > MAXIMUM_COMPARISON_BYTES
  ) {
    throw new Error("comparison_view_too_large")
  }
  return view
}

export const createComparisonView = async (): Promise<ComparisonView> =>
  projectComparisonSummary(await runGeneralLedgerReconciliationEvaluation())
