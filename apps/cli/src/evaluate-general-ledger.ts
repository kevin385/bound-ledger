import { runGeneralLedgerReconciliationEvaluation } from "./evaluation/general-ledger-reconciliation-v1.ts"

runGeneralLedgerReconciliationEvaluation()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2))
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
