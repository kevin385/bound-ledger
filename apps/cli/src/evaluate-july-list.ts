import { runJulyListEvaluation } from "./evaluation/july-list-v1.ts"

runJulyListEvaluation()
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2))
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
