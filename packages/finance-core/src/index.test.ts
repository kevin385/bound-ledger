import test from 'node:test';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as core from './index.ts';

const expense = { description: 'Synthetic lunch', amount: '12.34', currency: 'USD' };
function fixture(t: test.TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'bound-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'ledger.sqlite');
}
test('a recorded expense survives closing and reopening actual SQLite', t => {
  assert.equal(typeof core.Ledger, 'function', 'persistent expense operation is missing');
  const path = fixture(t);
  let ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  const receipt = ledger.recordExpense('request-1', expense);
  ledger.close();
  ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  assert.deepEqual(ledger.getExpense(receipt.event.id), receipt.event);
  assert.equal(receipt.event.minorUnits, 1234);
  assert.equal(receipt.event.account, null);
  assert.equal(receipt.event.owner, 'owner');
  assert.deepEqual(receipt.event.effectiveDate, { precision: 'unknown' });
});

test('retry after the domain commit / response gap returns the same persisted receipt', t => {
  const path = fixture(t);
  let ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  const committed = ledger.recordExpense('gap', expense);
  // Caller loses the result before its own result store commits, then restarts.
  ledger.close();
  ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  assert.deepEqual(ledger.recordExpense('gap', { currency: 'USD', amount: '12.34', description: 'Synthetic lunch' }), committed);
});

test('a request key cannot be reused with a changed payload', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  ledger.recordExpense('same', expense);
  assert.throws(() => ledger.recordExpense('same', { ...expense, amount: '13.00' }), /request key conflict/i);
});

test('money rejects unsupported precision and integer overflow instead of rounding', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  for (const amount of ['1.001', '90071992547409.92', '0', '-1', '1e3', 'NaN', ' 1', '1.', 'Infinity']) {
    assert.throws(() => ledger.recordExpense(amount, { ...expense, amount }), /amount/i, amount);
  }
  assert.equal(ledger.recordExpense('max', { ...expense, amount: '90071992547409.91' }).event.minorUnits, Number.MAX_SAFE_INTEGER);
});

test('explicit currencies use their own precision and never assume an unsupported currency', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  assert.equal(ledger.recordExpense('yen', { ...expense, currency: 'JPY', amount: '123' }).event.minorUnits, 123);
  assert.equal(ledger.recordExpense('euro', { ...expense, currency: 'EUR' }).event.minorUnits, 1234);
  assert.equal(ledger.recordExpense('pound', { ...expense, currency: 'GBP' }).event.minorUnits, 1234);
  assert.throws(() => ledger.recordExpense('bad-yen', { ...expense, currency: 'JPY', amount: '1.1' }), /precision/i);
  for (const currency of ['XYZ', 'usd', 'BTC', '']) assert.throws(() => ledger.recordExpense('bad-'+currency, { ...expense, currency }), /currency/i);
});

test('effective dates preserve supplied day or month precision and reject invented or invalid dates', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  for (const value of [{ precision: 'day', value: '2024-02-29' }, { precision: 'month', value: '2026-10' }] as const) {
    assert.deepEqual(ledger.recordExpense(value.value, { ...expense, effectiveDate: value }).event.effectiveDate, value);
  }
  for (const effectiveDate of [{ precision: 'day', value: '2025-02-29' }, { precision: 'day', value: '2026-02-31' },
    { precision: 'month', value: '2026-13' }, { precision: 'month', value: '2026-10-01' },
    { precision: 'unknown', value: '2026-10' }, { precision: 'year', value: '2026' }]) {
    assert.throws(() => ledger.recordExpense(JSON.stringify(effectiveDate), { ...expense, effectiveDate } as never), /date/i);
  }
});

test('domain rejects malformed, oversized and authority-bearing inputs before saving', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  for (const input of [null, [], { ...expense, description: '' }, { ...expense, description: 'x'.repeat(501) },
    { ...expense, amount: 12.34 }, { ...expense, owner: 'someone' }, { ...expense, account: 42 },
    { ...expense, evidence: 'x'.repeat(2001) }, { ...expense, currency: {} }]) {
    assert.throws(() => ledger.recordExpense('invalid', input as never), /invalid|amount|currency/i);
  }
  for (const key of ['', 'x'.repeat(129), 'line\nbreak']) assert.throws(() => ledger.recordExpense(key, expense), /request key/i);
});

test('history and spending keep identical separate requests and currencies distinct with balances unknown', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  ledger.recordExpense('one', expense);
  ledger.recordExpense('two', expense);
  ledger.recordExpense('eur', { ...expense, currency: 'EUR' });
  assert.equal(typeof ledger.listExpenses, 'function', 'persistent history is missing');
  assert.equal(ledger.listExpenses().length, 3);
  assert.deepEqual(ledger.summary(), { spending: [{ currency: 'EUR', minorUnits: 1234 }, { currency: 'USD', minorUnits: 2468 }], positionBalance: null });
});

test('a projection-overflowing expense rolls back its effect and receipt atomically', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  ledger.recordExpense('max', { ...expense, amount: '90071992547409.91' });
  assert.throws(() => ledger.recordExpense('overflow', { ...expense, amount: '0.01' }), /overflow/i);
  assert.equal(ledger.listExpenses().length, 1);
  assert.equal(ledger.recordExpense('overflow', { ...expense, currency: 'EUR', amount: '0.01' }).event.minorUnits, 1);
});

test('correction appends an atomic revision and stable receipt while preserving the original', t => {
  const path = fixture(t);
  let ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  const original = ledger.recordExpense('original', expense);
  assert.equal(typeof ledger.correctExpense, 'function', 'correction operation is missing');
  const input = { id: original.event.id, expectedRevision: 1, expense: { ...expense, amount: '15.20', evidence: 'Synthetic receipt A' } };
  const correction = ledger.correctExpense('correction', input);
  assert.equal(correction.event.revision, 2);
  assert.equal(correction.event.minorUnits, 1520);
  assert.deepEqual(correction.before, original.event);
  ledger.close();
  ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  assert.deepEqual(ledger.getReceipt(original.id), original);
  assert.deepEqual(ledger.correctExpense('correction', input), correction);
  assert.deepEqual(ledger.revisions(original.event.id), [original.event, correction.event]);
  assert.deepEqual(ledger.summary().spending, [{ currency: 'USD', minorUnits: 1520 }]);
});

test('a stale or malformed correction cannot overwrite a later edit or reuse another operation key', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  const original = ledger.recordExpense('original', expense);
  const input = { id: original.event.id, expectedRevision: 1, expense: { ...expense, amount: '19.00' } };
  const latest = ledger.correctExpense('latest', input);
  assert.throws(() => ledger.correctExpense('stale', input), /revision/i);
  for (const expectedRevision of [null, undefined, 0, '2', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => ledger.correctExpense('malformed', { ...input, expectedRevision }), /revision/i);
  }
  assert.throws(() => ledger.correctExpense('original', { ...input, expectedRevision: 2 }), /request key conflict/i);
  assert.deepEqual(ledger.getExpense(original.event.id), latest.event);
});

test('undoing a correction restores its prior facts as a new revision without erasing history', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  const original = ledger.recordExpense('original', expense);
  const corrected = ledger.correctExpense('correct', { id: original.event.id, expectedRevision: 1, expense: { ...expense, amount: '20.00' } });
  assert.equal(typeof ledger.undo, 'function', 'undo operation is missing');
  const input = { receiptId: corrected.id, expectedRevision: 2 };
  const undone = ledger.undo('undo', input);
  assert.equal(undone.event.minorUnits, 1234);
  assert.equal(undone.event.revision, 3);
  assert.deepEqual(undone.before, corrected.event);
  assert.deepEqual(ledger.undo('undo', input), undone);
  assert.equal(ledger.revisions(original.event.id).length, 3);
});

test('undoing a record voids it durably and excludes it from spending without deleting it', t => {
  const path = fixture(t);
  let ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  const original = ledger.recordExpense('original', expense);
  const undone = ledger.undo('undo', { receiptId: original.id, expectedRevision: 1 });
  assert.equal(undone.event.status, 'void');
  assert.deepEqual(ledger.summary().spending, []);
  ledger.close();
  ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  assert.deepEqual(ledger.getReceipt(undone.id), undone);
  assert.equal(ledger.listExpenses()[0]?.status, 'void');
  assert.throws(() => ledger.correctExpense('edit-void', { id: original.event.id, expectedRevision: 2, expense }), /void/i);
});

test('undo can only compensate the latest record or correction and never overwrite subsequent edits', t => {
  const ledger = new core.Ledger(fixture(t), { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  const original = ledger.recordExpense('original', expense);
  const corrected = ledger.correctExpense('correct', { id: original.event.id, expectedRevision: 1, expense: { ...expense, amount: '20.00' } });
  assert.throws(() => ledger.undo('old', { receiptId: original.id, expectedRevision: 2 }), /latest|revision/i);
  assert.throws(() => ledger.undo('stale', { receiptId: corrected.id, expectedRevision: 1 }), /revision/i);
  const undone = ledger.undo('undo', { receiptId: corrected.id, expectedRevision: 2 });
  assert.throws(() => ledger.undo('undo-again', { receiptId: corrected.id, expectedRevision: 3 }), /latest|revision/i);
  assert.throws(() => ledger.undo('redo', { receiptId: undone.id, expectedRevision: 3 }), /undo/i);
  assert.deepEqual(ledger.getExpense(original.event.id), undone.event);
});

test('unsupported schema versions are rejected without silently resetting the database', t => {
  const path = fixture(t);
  const db = new DatabaseSync(path);
  db.exec("PRAGMA user_version = 99; CREATE TABLE sentinel (value TEXT); INSERT INTO sentinel VALUES ('keep');");
  db.close();
  assert.throws(() => new core.Ledger(path, { workspace: 'local', owner: 'owner' }), /schema/i);
  const verify = new DatabaseSync(path);
  assert.equal(verify.prepare('SELECT value FROM sentinel').get()?.value, 'keep');
  assert.equal(verify.prepare('PRAGMA user_version').get()?.user_version, 99);
  verify.close();
});

test('workspace authority is validated and persisted ownership cannot be reassigned on reopen', t => {
  const path = fixture(t);
  const ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  ledger.recordExpense('one', expense);
  ledger.close();
  assert.throws(() => new core.Ledger(path, { workspace: 'local', owner: 'different' }), /owner/i);
  assert.throws(() => new core.Ledger(path, { workspace: '', owner: 'owner' }), /workspace/i);
  const other = new core.Ledger(path, { workspace: 'other', owner: 'other-owner' });
  t.after(() => other.close());
  assert.deepEqual(other.listExpenses(), []);
  assert.equal(other.recordExpense('one', expense).event.owner, 'other-owner');
});

test('contending duplicate processes wait for the SQLite lock and return one receipt', { timeout: 15000 }, async t => {
  const path = fixture(t);
  const ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  const children = [0, 1].map(() => fork(new URL('./duplicate-worker.ts', import.meta.url), [path], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }));
  t.after(() => children.forEach(child => child.kill()));
  await Promise.all(children.map(child => once(child, 'message')));
  const blocker = new DatabaseSync(path, { timeout: 5000 });
  t.after(() => blocker.close());
  blocker.exec('BEGIN IMMEDIATE');
  const outputs = children.map(child => new Promise<Record<string, unknown>>(resolve => child.on('message', value => {
    if (value !== 'attempt') resolve(value as Record<string, unknown>);
  })));
  const attempts = children.map(child => once(child, 'message'));
  children.forEach(child => child.send('go'));
  await Promise.all(attempts);
  // Both writers are dispatched behind a held SQLite lock; no scheduling sleeps.
  // The fixture COMMIT also waits for transient shared locks, like production.
  blocker.exec('COMMIT');
  const [a, b] = await Promise.all(outputs);
  assert.equal(a?.error, undefined);
  assert.equal(b?.error, undefined);
  assert.deepEqual(a?.receipt, b?.receipt);
  assert.equal(ledger.listExpenses().length, 1);
  assert.equal(ledger.revisions(ledger.listExpenses()[0]!.id).length, 1);
});

test('SIGKILL in the committed-domain / undelivered-result gap is recovered by receipt retry', { timeout: 10000 }, async t => {
  const path = fixture(t);
  const child = fork(new URL('./gap-worker.ts', import.meta.url), [path], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => child.kill());
  const [boundary] = await once(child, 'message');
  assert.equal(boundary, 'committed');
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  const [, signal] = await exited;
  assert.equal(signal, 'SIGKILL');
  const ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  t.after(() => ledger.close());
  const receipt = ledger.recordExpense('crash-gap', expense);
  assert.equal(ledger.listExpenses().length, 1);
  assert.deepEqual(ledger.getReceipt(receipt.id), receipt);
  assert.deepEqual(ledger.revisions(receipt.event.id), [receipt.event]);
});

test('a SQLite fault inserting a receipt rolls back record, correction and undo with every revision', t => {
  const path = fixture(t);
  const ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  const fault = new DatabaseSync(path);
  t.after(() => { fault.close(); ledger.close(); });
  const enable = () => fault.exec("CREATE TRIGGER receipt_fault BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'synthetic fault'); END;");
  const disable = () => fault.exec('DROP TRIGGER receipt_fault');
  const counts = () => ['expenses', 'receipts', 'revisions'].map(table => fault.prepare('SELECT COUNT(*) AS count FROM ' + table).get()?.count);
  enable();
  assert.throws(() => ledger.recordExpense('one', expense), /synthetic fault/);
  assert.deepEqual(counts(), [0, 0, 0]);
  disable();
  const original = ledger.recordExpense('one', expense);
  const correction = { id: original.event.id, expectedRevision: 1, expense: { ...expense, amount: '20.00' } };
  enable();
  assert.throws(() => ledger.correctExpense('two', correction), /synthetic fault/);
  assert.deepEqual(ledger.getExpense(original.event.id), original.event);
  assert.deepEqual(counts(), [1, 1, 1]);
  disable();
  const edited = ledger.correctExpense('two', correction);
  const undo = { receiptId: edited.id, expectedRevision: 2 };
  enable();
  assert.throws(() => ledger.undo('three', undo), /synthetic fault/);
  assert.deepEqual(ledger.getExpense(original.event.id), edited.event);
  assert.deepEqual(counts(), [1, 2, 2]);
  disable();
  assert.equal(ledger.undo('three', undo).event.minorUnits, 1234);
  assert.deepEqual(counts(), [1, 3, 3]);
});

test('recording time is stored in the immutable receipt without inventing an effective date', t => {
  const path = fixture(t);
  const ledger = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  const receipt = ledger.recordExpense('timed', expense);
  assert.equal(typeof receipt.recordedAt, 'string', 'recording timestamp is missing');
  assert.match(receipt.recordedAt, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/);
  assert.deepEqual(receipt.event.effectiveDate, { precision: 'unknown' });
  ledger.close();
  const reopened = new core.Ledger(path, { workspace: 'local', owner: 'owner' });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.getReceipt(receipt.id), receipt);
});

test('an empty foreign application database is rejected without rewriting its identity', t => {
  const path = fixture(t);
  const foreign = new DatabaseSync(path);
  foreign.exec('PRAGMA application_id = 123456;'); foreign.close();
  assert.throws(() => new core.Ledger(path, { workspace: 'local', owner: 'owner' }), /schema|identity/i);
  const verify = new DatabaseSync(path);
  assert.equal(verify.prepare('PRAGMA application_id').get()?.application_id, 123456);
  assert.equal(verify.prepare('PRAGMA user_version').get()?.user_version, 0);
  verify.close();
});
