import { Ledger } from './index.ts';
const path = process.argv[2];
if (!path) throw new Error('Synthetic database required');
const ledger = new Ledger(path, { workspace: 'local', owner: 'owner' });
ledger.recordExpense('crash-gap', { description: 'Synthetic lunch', amount: '12.34', currency: 'USD' });
// The domain committed. Deliberately never deliver the receipt to the caller.
process.send?.('committed');
process.on('message', () => {}); // Parent kills us at this exact boundary.
