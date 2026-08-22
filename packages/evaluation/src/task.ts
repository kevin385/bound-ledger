export const GENERAL_LEDGER_RECONCILIATION_TASK_V1 = Object.freeze({
  id: "general-ledger-reconciliation",
  version: 1,
  fixtureVersion: "sample-kernel-v1",
  prompt:
    "Reconcile July 2026. Report the posted event count, expense total in minor units, and whether the trial balance is zero at the start of August.",
  range: Object.freeze({
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-01T00:00:00.000Z",
  }),
  expectedFacts: Object.freeze({
    eventCount: 4,
    expenseTotalMinor: 6_249,
    trialBalanceZero: true,
  }),
  expectedAnswer:
    "July 2026 reconciled: 4 posted events, 6249 expense minor units, trial balance zero: yes.",
  deterministicConfiguration: Object.freeze({
    provider: "@earendil-works/pi-ai faux provider",
    tokenChunkSize: 12,
    sampleSizePerMode: 1,
  }),
})

export type GeneralLedgerReconciliationTask =
  typeof GENERAL_LEDGER_RECONCILIATION_TASK_V1
