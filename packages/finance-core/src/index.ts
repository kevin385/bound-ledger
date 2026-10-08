import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export class LedgerError extends Error {}
export interface Authority { workspace: string; owner: string }
export type EffectiveDate = { precision: 'unknown' } | { precision: 'month' | 'day'; value: string };
export interface ExpenseInput {
  description: string; amount: string; currency: string;
  account?: string | null; evidence?: string | null; effectiveDate?: EffectiveDate;
}
export interface Expense {
  id: string; owner: string; description: string; minorUnits: number; currency: string;
  account: string | null; evidence: string | null; effectiveDate: EffectiveDate;
  revision: number; status: 'active' | 'void'; receiptId: string;
}
export interface Receipt {
  id: string; workspace: string; operation: 'record' | 'correct' | 'undo';
  requestKey: string; recordedAt: string; event: Expense; before: Expense | null;
}
export const currencyDigits = { USD: 2, EUR: 2, GBP: 2, JPY: 0 } as const;
export type Currency = keyof typeof currencyDigits;
function minorUnits(amount: string, digits: number): number {
  if (typeof amount !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(amount)) throw new LedgerError('Invalid amount');
  const [whole = '', fraction = ''] = amount.split('.');
  if (fraction.length > digits || whole.length > 16) throw new LedgerError('Amount precision or overflow');
  const value = BigInt(whole) * (10n ** BigInt(digits)) + BigInt(fraction.padEnd(digits, '0') || '0');
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new LedgerError('Amount out of range');
  return Number(value);
}
function effectiveDate(value: unknown): EffectiveDate {
  if (value === undefined) return { precision: 'unknown' };
  const date = object(value, ['precision', 'value'], 'date');
  if (date.precision === 'unknown' && date.value === undefined) return { precision: 'unknown' };
  if (typeof date.value !== 'string' || !/^[0-9]{4}-(0[1-9]|1[0-2])/.test(date.value) || date.value.startsWith('0000')) throw new LedgerError('Invalid date');
  if (date.precision === 'month' && date.value.length === 7) return { precision: 'month', value: date.value };
  if (date.precision === 'day' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date.value)) {
    const parsed = new Date(date.value + 'T00:00:00Z');
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date.value) return { precision: 'day', value: date.value };
  }
  throw new LedgerError('Unsupported or invalid date precision');
}
function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new LedgerError('Invalid ' + label);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new LedgerError('Invalid ' + label);
  return value;
}
function optionalText(value: unknown, label: string, max: number): string | null {
  return value === undefined || value === null ? null : text(value, label, max);
}
function expenseFields(value: unknown): Omit<Expense, 'id' | 'owner' | 'revision' | 'status' | 'receiptId'> {
  const input = object(value, ['description', 'amount', 'currency', 'account', 'evidence', 'effectiveDate'], 'expense input');
  if (typeof input.currency !== 'string' || !Object.hasOwn(currencyDigits, input.currency)) throw new LedgerError('Unsupported currency');
  return { description: text(input.description, 'description', 500),
    minorUnits: minorUnits(input.amount as string, currencyDigits[input.currency as Currency]), currency: input.currency,
    account: optionalText(input.account, 'account', 200), evidence: optionalText(input.evidence, 'evidence', 2000),
    effectiveDate: effectiveDate(input.effectiveDate) };
}
export class Ledger {
  #db: DatabaseSync;
  #authority: Authority;
  constructor(path: string, authority: Authority) {
    this.#authority = { workspace: text(authority.workspace, 'workspace', 128), owner: text(authority.owner, 'owner', 128) };
    this.#db = new DatabaseSync(path, { timeout: 5000 });
    try {
    this.#db.exec('PRAGMA synchronous = FULL; BEGIN IMMEDIATE');
    const version = this.#db.prepare('PRAGMA user_version').get()?.user_version;
    if (version !== 0 && version !== 1) throw new LedgerError('Unsupported schema version');
    if (version === 0) {
    if (this.#db.prepare('PRAGMA application_id').get()?.application_id !== 0) throw new LedgerError('Unsupported schema identity');
    if (this.#db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get()) throw new LedgerError('Unsupported unversioned schema');
    this.#db.exec(`CREATE TABLE expenses (
      workspace TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (workspace, id)) STRICT;
      CREATE TABLE IF NOT EXISTS receipts (
        workspace TEXT NOT NULL, request_key TEXT NOT NULL, id TEXT NOT NULL,
        operation TEXT NOT NULL, payload TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (workspace, request_key), UNIQUE (workspace, id)) STRICT;
      CREATE TABLE IF NOT EXISTS revisions (
        workspace TEXT NOT NULL, event_id TEXT NOT NULL, revision INTEGER NOT NULL,
        receipt_id TEXT NOT NULL, data TEXT NOT NULL,
        PRIMARY KEY (workspace, event_id, revision),
        FOREIGN KEY (workspace, receipt_id) REFERENCES receipts(workspace, id)) STRICT;
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, owner TEXT NOT NULL) STRICT;
      PRAGMA user_version = 1;
      PRAGMA application_id = 1112296519;`);
    }
    if (this.#db.prepare('PRAGMA application_id').get()?.application_id !== 1112296519) throw new LedgerError('Unsupported schema identity');
    const savedOwner = this.#db.prepare('SELECT owner FROM workspaces WHERE id = ?').get(this.#authority.workspace);
    if (savedOwner && savedOwner.owner !== this.#authority.owner) throw new LedgerError('Workspace owner conflict');
    this.#db.prepare('INSERT OR IGNORE INTO workspaces VALUES (?, ?)').run(this.#authority.workspace, this.#authority.owner);
    this.#db.exec('COMMIT');
    } catch (error) {
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK');
      this.#db.close();
      throw error;
    }
  }
  close(): void { this.#db.close(); }
  recordExpense(requestKey: string, input: unknown): Receipt {
    const fields = expenseFields(input);
    const payload = JSON.stringify(fields);
    return this.#write('record', requestKey, payload, () => {
    const id = randomUUID();
    const receiptId = randomUUID();
    const event: Expense = { id, owner: this.#authority.owner, ...fields,
      revision: 1, status: 'active', receiptId };
    this.#db.prepare('INSERT INTO expenses VALUES (?, ?, ?)').run(this.#authority.workspace, id, JSON.stringify(event));
    return { id: receiptId, workspace: this.#authority.workspace, operation: 'record', requestKey, event, before: null };
    });
  }
  #expectRevision(event: Expense, value: unknown): void {
    if (!Number.isSafeInteger(value) || value !== event.revision) throw new LedgerError('Expected revision conflict');
    if (event.status !== 'active') throw new LedgerError('Expense is void');
  }
  correctExpense(requestKey: string, value: unknown): Receipt {
    const input = object(value, ['id', 'expectedRevision', 'expense'], 'correction');
    const id = text(input.id, 'event id', 128);
    const fields = expenseFields(input.expense);
    const payload = JSON.stringify({ id, expectedRevision: input.expectedRevision, expense: fields });
    return this.#write('correct', requestKey, payload, () => {
      const before = this.getExpense(id);
      if (!before) throw new LedgerError('Expense not found');
      this.#expectRevision(before, input.expectedRevision);
      const receiptId = randomUUID();
      const event: Expense = { ...before, ...fields, revision: before.revision + 1, receiptId };
      this.#db.prepare('UPDATE expenses SET data = ? WHERE workspace = ? AND id = ?')
        .run(JSON.stringify(event), this.#authority.workspace, id);
      return { id: receiptId, workspace: this.#authority.workspace, operation: 'correct', requestKey, event, before };
    });
  }
  undo(requestKey: string, value: unknown): Receipt {
    const input = object(value, ['receiptId', 'expectedRevision'], 'undo');
    const targetId = text(input.receiptId, 'receipt id', 128);
    const payload = JSON.stringify({ receiptId: targetId, expectedRevision: input.expectedRevision });
    return this.#write('undo', requestKey, payload, () => {
      const target = this.getReceipt(targetId);
      if (!target) throw new LedgerError('Receipt not found');
      if (target.operation === 'undo') throw new LedgerError('Undo cannot be undone');
      const before = this.getExpense(target.event.id);
      if (!before) throw new LedgerError('Expense not found');
      this.#expectRevision(before, input.expectedRevision);
      if (before.receiptId !== target.id || before.revision !== target.event.revision) throw new LedgerError('Undo requires the latest revision');
      const receiptId = randomUUID();
      const event: Expense = { ...(target.before ?? before), status: target.operation === 'record' ? 'void' : 'active', revision: before.revision + 1, receiptId };
      this.#db.prepare('UPDATE expenses SET data = ? WHERE workspace = ? AND id = ?')
        .run(JSON.stringify(event), this.#authority.workspace, event.id);
      return { id: receiptId, workspace: this.#authority.workspace, operation: 'undo', requestKey, event, before };
    });
  }
  getReceipt(id: string): Receipt | null {
    const row = this.#db.prepare('SELECT data FROM receipts WHERE workspace = ? AND id = ?').get(this.#authority.workspace, id);
    return row ? JSON.parse(String(row.data)) as Receipt : null;
  }
  revisions(id: string): Expense[] {
    return this.#db.prepare('SELECT data FROM revisions WHERE workspace = ? AND event_id = ? ORDER BY revision')
      .all(this.#authority.workspace, id).map(row => JSON.parse(String(row.data)) as Expense);
  }
  #write(operation: Receipt['operation'], key: string, payload: string, effect: () => Omit<Receipt, 'recordedAt'>): Receipt {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(key)) throw new LedgerError('Invalid request key');
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const old = this.#db.prepare('SELECT data, operation, payload FROM receipts WHERE workspace = ? AND request_key = ?')
        .get(this.#authority.workspace, key);
      if (old) {
        if (old.operation !== operation || old.payload !== payload) throw new LedgerError('Request key conflict');
        this.#db.exec('COMMIT');
        return JSON.parse(String(old.data)) as Receipt;
      }
      const receipt: Receipt = { ...effect(), recordedAt: new Date().toISOString() };
      this.summary(); // Reject unsafe aggregate arithmetic inside the same transaction.
      this.#db.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?, ?, ?)')
        .run(this.#authority.workspace, key, receipt.id, operation, payload, JSON.stringify(receipt));
      this.#db.prepare('INSERT INTO revisions VALUES (?, ?, ?, ?, ?)')
        .run(this.#authority.workspace, receipt.event.id, receipt.event.revision, receipt.id, JSON.stringify(receipt.event));
      this.#db.exec('COMMIT');
      return receipt;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }
  listExpenses(limit = 100, offset = 0): Expense[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) throw new LedgerError('Invalid history window');
    return this.#db.prepare('SELECT data FROM expenses WHERE workspace = ? ORDER BY rowid DESC LIMIT ? OFFSET ?')
      .all(this.#authority.workspace, limit, offset).map(row => JSON.parse(String(row.data)) as Expense);
  }
  summary(): { spending: { currency: string; minorUnits: number }[]; positionBalance: null } {
    const sums = new Map<string, bigint>();
    for (const row of this.#db.prepare('SELECT data FROM expenses WHERE workspace = ?').iterate(this.#authority.workspace)) {
      const event = JSON.parse(String(row.data)) as Expense;
      if (event.status === 'active') sums.set(event.currency, (sums.get(event.currency) ?? 0n) + BigInt(event.minorUnits));
    }
    return { spending: [...sums.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, units]) => {
      if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new LedgerError('Spending amount overflow');
      return { currency, minorUnits: Number(units) };
    }), positionBalance: null };
  }
  getExpense(id: string): Expense | null {
    const row = this.#db.prepare('SELECT data FROM expenses WHERE workspace = ? AND id = ?').get(this.#authority.workspace, id);
    return row ? JSON.parse(String(row.data)) as Expense : null;
  }
}
