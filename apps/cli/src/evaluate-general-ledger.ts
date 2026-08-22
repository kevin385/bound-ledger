import { runGeneralLedgerReconciliationEvaluation } from "@bound/evaluation"

runGeneralLedgerReconciliationEvaluation()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2))
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
