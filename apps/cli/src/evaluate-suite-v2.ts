import { runGeneralLedgerCorpusEvaluationV2 } from "@bound/evaluation"

runGeneralLedgerCorpusEvaluationV2()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2))
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
