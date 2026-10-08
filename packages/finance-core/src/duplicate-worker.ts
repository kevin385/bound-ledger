// Synthetic process used by the actual-SQLite contention test, never production.
import { Ledger } from './index.ts';
const path = process.argv[2];
if (!path) throw new Error('Test database required');
const ledger = new Ledger(path, { workspace: 'local', owner: 'owner' });
process.send?.('ready');
process.once('message', () => {
  process.send?.('attempt');
  try {
    const receipt = ledger.recordExpense('concurrent', { description: 'Synthetic lunch', amount: '12.34', currency: 'USD' });
    process.send?.({ receipt });
  } catch (error) { process.send?.({ error: String(error) }); }
  finally { ledger.close(); process.disconnect?.(); }
});
