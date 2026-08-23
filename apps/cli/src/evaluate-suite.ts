import { runGeneralLedgerSuiteEvaluation } from "@bound/evaluation"

runGeneralLedgerSuiteEvaluation()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2))
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
