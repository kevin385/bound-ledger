import type { Ledger } from '@bound/finance-core';
/** Bootstrap only. No Pi harness, provider, code execution or replay-safety claim. */
export function createOperationFacade(ledger: Ledger) {
  return Object.freeze({
    recordExpense: (key: string, input: unknown) => ledger.recordExpense(key, input),
    correctExpense: (key: string, input: unknown) => ledger.correctExpense(key, input),
    undo: (key: string, input: unknown) => ledger.undo(key, input),
    getExpense: (id: string) => ledger.getExpense(id),
    getReceipt: (id: string) => ledger.getReceipt(id),
    listExpenses: (limit?: number, offset?: number) => ledger.listExpenses(limit, offset),
    revisions: (id: string) => ledger.revisions(id),
    summary: () => ledger.summary(),
  });
}
export type FinanceOperations = ReturnType<typeof createOperationFacade>;
