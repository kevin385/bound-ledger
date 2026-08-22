import { runGeneralLedgerReconciliationEvaluation } from "./evaluation/general-ledger-reconciliation-v1.ts"

runGeneralLedgerReconciliationEvaluation()
  .then((summary) => {
    console.log(
      JSON.stringify(
        {
          task: summary.task.id,
          prompt: summary.task.prompt,
          toolMode: summary.modes.tool,
          codeMode: summary.modes.code,
          comparison: summary.comparison,
          conclusion: summary.conclusion,
        },
        null,
        2,
      ),
    )
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
