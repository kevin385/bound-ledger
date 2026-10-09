import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '@bound/finance-core';
import { startFinance } from './index.ts';

const expense = { description: 'Synthetic original', amount: '2.00', currency: 'USD', precision: 'unknown', date: '', account: '', evidence: '' };
async function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'bound-recovery-'));
  const app = await startFinance({ port: 0, stateDirectory: directory });
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const response = await fetch(app.url);
  const html = await response.text();
  const csrf = hidden(html, 'csrf');
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  return { ...app, directory, csrf, cookie };
}
function hidden(html: string, name: string): string {
  const value = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`))?.[1];
  assert.notEqual(value, undefined, `${name} missing from recovery`);
  return value!;
}
function post(app: Awaited<ReturnType<typeof fixture>>, path: string, data: Record<string, string>, credentials = { csrf: app.csrf, cookie: app.cookie }) {
  return fetch(app.url + path, { method: 'POST', redirect: 'manual', headers: { Origin: app.url, Cookie: credentials.cookie }, body: new URLSearchParams({ csrf: credentials.csrf, ...data }) });
}
async function saved(app: Awaited<ReturnType<typeof fixture>>) {
  const response = await post(app, '/record', { ...expense, requestKey: 'synthetic-initial' });
  assert.equal(response.status, 303);
  const location = response.headers.get('location')!;
  const receiptId = new URL(location, app.url).searchParams.get('id')!;
  const html = await (await fetch(app.url + location)).text();
  const id = html.match(/href="\/edit\?id=([^"]+)"/)![1]!;
  return { id, receiptId };
}

test('correction identity fields sent to record never become a new expense', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  const response = await post(app, '/record', { ...expense, requestKey: 'synthetic-misrouted-correction', id: target.id, expectedRevision: '1' });
  assert.equal(response.status, 400);
  assert.doesNotMatch(await response.text(), /<form/);
  const history = await (await fetch(app.url + '/history')).text();
  assert.equal((history.match(/class="history-row/g) ?? []).length, 1);
});

for (const operation of ['record', 'correct', 'undo'] as const) test(`a post-commit ${operation} response error retains the exact identity for explicit receipt recovery`, async t => {
  const app = await fixture(t);
  const target = operation === 'record' ? undefined : await saved(app);
  const input = operation === 'undo' ? { receiptId: target!.receiptId, expectedRevision: '1' }
    : { ...expense, description: '<synthetic response gap> & "exact"', amount: '1.0', precision: 'month', date: '2026-09', account: 'Synthetic cash', evidence: 'Synthetic <source> & note', ...(target ? { id: target.id, expectedRevision: '1' } : {}) };
  const data: Record<string, string> = { ...input, requestKey: 'synthetic-response-gap-' + operation };
  const method = operation === 'record' ? 'recordExpense' : operation === 'correct' ? 'correctExpense' : 'undo';
  const original = Ledger.prototype[method];
  let originalReceipt = '';
  t.mock.method(Ledger.prototype, method, function(this: Ledger, ...args: Parameters<typeof original>) {
    const result = original.apply(this, args);
    originalReceipt = '/receipt?id=' + result.id;
    throw new Error('synthetic failure after real commit');
  });
  const response = await post(app, '/' + operation, data);
  assert.equal(response.status, 500);
  const html = await response.text();
  assert.doesNotMatch(html, /<h[12]>Not saved<\/h[12]>/, 'an uncertain committed outcome must not be labelled not saved');
  assert.match(html, new RegExp(`action="/${operation}"`));
  for (const name of ['requestKey', ...(operation === 'correct' ? ['id', 'expectedRevision'] : operation === 'undo' ? ['receiptId', 'expectedRevision'] : [])]) assert.equal(hidden(html, name), data[name]);
  if (operation !== 'undo') {
    assert.equal(hidden(html, 'amount'), '1.0');
    assert.equal(hidden(html, 'date'), '2026-09');
    assert.match(html, /&lt;synthetic response gap&gt; &amp; &quot;exact&quot;/);
    assert.match(html, /Synthetic &lt;source&gt; &amp; note/);
  }
  assert.doesNotMatch(html, /synthetic failure after real commit/);
  t.mock.restoreAll();
  const retried = await post(app, '/' + operation, data);
  assert.equal(retried.status, 303);
  assert.equal(retried.headers.get('location'), originalReceipt);
  const history = await (await fetch(app.url + '/history')).text();
  assert.equal((history.match(/class="history-row/g) ?? []).length, 1);
});

test('forged or missing credentials return non-mutating same-origin review for every operation', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  const before = await (await fetch(app.url + '/expense?id=' + target.id)).text();
  for (const operation of ['record', 'correct', 'undo']) {
    const data: Record<string, string> = { requestKey: 'synthetic-denied-' + operation,
      ...(operation === 'undo' ? { receiptId: target.receiptId, expectedRevision: '1' }
        : { ...expense, description: '<img src=x onerror=alert(1)>', ...(operation === 'correct' ? { id: target.id, expectedRevision: '1' } : {}) }) };
    for (const credentials of [{ csrf: 'forged', cookie: app.cookie }, { csrf: app.csrf, cookie: 'bound_session=forged' }, { csrf: '', cookie: '' }]) {
      const response = await post(app, '/' + operation, data, credentials);
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.match(response.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
      const html = await response.text();
      assert.equal(hidden(html, 'requestKey'), data.requestKey);
      assert.equal(hidden(html, 'csrf'), app.csrf);
      assert.match(html, new RegExp(`action="/${operation}"`));
      assert.doesNotMatch(html, /<img|<script/);
      assert.equal(await (await fetch(app.url + '/expense?id=' + target.id)).text(), before);
      assert.equal(((await (await fetch(app.url + '/history')).text()).match(/class="history-row/g) ?? []).length, 1);
    }
  }
});

test('missing, null or foreign Origin never receives recovery credentials or mutates facts', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  const before = await (await fetch(app.url + '/expense?id=' + target.id)).text();
  for (const path of ['/record', '/correct', '/undo']) {
    const data = path === '/undo' ? { receiptId: target.receiptId, expectedRevision: '1' } : { ...expense, ...(path === '/correct' ? { id: target.id, expectedRevision: '1' } : {}) };
    for (const origin of [undefined, 'null', 'https://evil.example', app.url + '.evil']) {
      const headers: Record<string, string> = { Cookie: app.cookie };
      if (origin !== undefined) headers.Origin = origin;
      const response = await fetch(app.url + path, { method: 'POST', redirect: 'manual', headers,
        body: new URLSearchParams({ ...data, csrf: app.csrf, requestKey: 'synthetic-origin-denied' }) });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.doesNotMatch(await response.text(), /<form|name="csrf"/);
    }
  }
  assert.equal(await (await fetch(app.url + '/expense?id=' + target.id)).text(), before);
  assert.equal(((await (await fetch(app.url + '/history')).text()).match(/class="history-row/g) ?? []).length, 1);
});

test('malformed or unsupported stale form fields cannot become a fresh recording form', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  const invalid = { csrf: 'expired', cookie: 'bound_session=expired' };
  const cases: [string, Record<string, string>][] = [
    ['/record', { ...expense, requestKey: '' }],
    ['/record', { ...expense, requestKey: 'invalid/key' }],
    ['/record', { ...expense, requestKey: 'unknown-field', owner: 'forged' }],
    ['/record', { ...expense, requestKey: 'long-field', evidence: 'x'.repeat(2001) }],
    ['/correct', { ...expense, requestKey: 'missing-target', expectedRevision: '1' }],
    ['/correct', { ...expense, requestKey: 'bad-target', id: '<synthetic>', expectedRevision: '1' }],
    ['/correct', { ...expense, requestKey: 'bad-revision', id: target.id, expectedRevision: '2.5' }],
    ['/undo', { requestKey: 'bad-undo', receiptId: target.receiptId, expectedRevision: '' }],
    ['/undo', { requestKey: 'unknown-undo', receiptId: target.receiptId, expectedRevision: '1', amount: '1.00' }],
    ['/unknown', { ...expense, requestKey: 'unknown-operation' }],
  ];
  for (const [path, data] of cases) {
    const response = await post(app, path, data, invalid);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.doesNotMatch(await response.text(), /<form/);
  }
  const headers = { Origin: app.url, Cookie: invalid.cookie };
  const duplicate = new URLSearchParams({ ...expense, requestKey: 'duplicate', csrf: invalid.csrf });
  duplicate.append('requestKey', 'different');
  assert.equal((await fetch(app.url + '/record', { method: 'POST', headers, body: duplicate })).status, 400);
  assert.equal((await fetch(app.url + '/record', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' })).status, 415);
  assert.equal((await fetch(app.url + '/record', { method: 'POST', headers, body: new URLSearchParams({ ...expense, requestKey: 'oversized', evidence: 'x'.repeat(17000) }) })).status, 413);
  const history = await (await fetch(app.url + '/history')).text();
  assert.equal((history.match(/class="history-row/g) ?? []).length, 1);
});

test('correction validation recovery keeps the original revision even after a competing correction', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  assert.equal((await post(app, '/correct', { ...expense, amount: '3.00', requestKey: 'synthetic-competing', id: target.id, expectedRevision: '1' })).status, 303);
  const before = await (await fetch(app.url + '/expense?id=' + target.id)).text();
  const original = { ...expense, amount: '1.001', requestKey: 'synthetic-stale-edit', id: target.id, expectedRevision: '1' };
  const response = await post(app, '/correct', original);
  assert.equal(response.status, 400);
  const html = await response.text();
  assert.equal(hidden(html, 'requestKey'), original.requestKey);
  assert.equal(hidden(html, 'id'), target.id);
  assert.equal(hidden(html, 'expectedRevision'), '1');
  assert.equal(hidden(html, 'amount'), '1.001');
  const retry = await post(app, '/correct', { ...original, amount: '1.00' });
  assert.equal(retry.status, 400);
  const retryHtml = await retry.text();
  assert.match(retryHtml, /action="\/correct"/);
  assert.equal(hidden(retryHtml, 'expectedRevision'), '1');
  assert.equal(await (await fetch(app.url + '/expense?id=' + target.id)).text(), before);
  const unknown = await post(app, '/correct', { ...original, amount: '1.00', id: '00000000-0000-0000-0000-000000000000' });
  assert.equal(unknown.status, 400);
  assert.match(await unknown.text(), /action="\/correct"/);
  const undo = await post(app, '/undo', { requestKey: 'synthetic-stale-undo', receiptId: target.receiptId, expectedRevision: '1' });
  assert.equal(undo.status, 400);
  const undoHtml = await undo.text();
  assert.match(undoHtml, /action="\/undo"/);
  assert.equal(hidden(undoHtml, 'receiptId'), target.receiptId);
  assert.equal(hidden(undoHtml, 'expectedRevision'), '1');
  assert.equal(await (await fetch(app.url + '/expense?id=' + target.id)).text(), before);
});

test('malformed control characters never receive a browser-altered retry form', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  for (const path of ['/record', '/correct']) {
    for (const bad of [{ description: 'Synthetic\0description' }, { evidence: 'Synthetic\0evidence' }]) {
      const data = { ...expense, ...bad, requestKey: 'synthetic-control-refused', ...(path === '/correct' ? { id: target.id, expectedRevision: '1' } : {}) };
      for (const valid of [false, true]) {
        const response = await post(app, path, data, valid ? { csrf: app.csrf, cookie: app.cookie } : { csrf: 'expired', cookie: 'expired' });
        assert.equal(response.status, valid ? 400 : 403);
        assert.doesNotMatch(await response.text(), /<form/, 'HTML must not transform malformed input into a different retry');
      }
    }
  }
  assert.equal(((await (await fetch(app.url + '/history')).text()).match(/class="history-row/g) ?? []).length, 1);
});

test('non-native textarea newline sequences are refused rather than silently rewritten on retry', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  const record = t.mock.method(Ledger.prototype, 'recordExpense');
  const correct = t.mock.method(Ledger.prototype, 'correctExpense');
  for (const operation of ['record', 'correct']) {
    for (const evidence of ['Synthetic\nsource', 'Synthetic\rsource', '\nSynthetic source', '\rSynthetic source', 'Synthetic\r\nsource\nline', 'Synthetic\r\r\nsource']) {
      const data = { ...expense, evidence, requestKey: 'synthetic-non-native-evidence', ...(operation === 'correct' ? { id: target.id, expectedRevision: '1' } : {}) };
      for (const valid of [true, false]) {
        const response = await post(app, '/' + operation, data, valid ? { csrf: app.csrf, cookie: app.cookie } : { csrf: 'expired', cookie: 'expired' });
        assert.equal(response.status, valid ? 400 : 403, JSON.stringify(evidence));
        assert.doesNotMatch(await response.text(), /<form/);
      }
    }
  }
  assert.equal(record.mock.callCount(), 0);
  assert.equal(correct.mock.callCount(), 0);
  assert.equal(((await (await fetch(app.url + '/history')).text()).match(/class="history-row/g) ?? []).length, 1);
});

test('authenticated writes use the same bounded native form shape as stale recovery', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  const before = await (await fetch(app.url + '/expense?id=' + target.id)).text();
  const record = t.mock.method(Ledger.prototype, 'recordExpense');
  const correct = t.mock.method(Ledger.prototype, 'correctExpense');
  for (const operation of ['record', 'correct']) {
    const badFields = [
      ...['\n', '\r', '\r\n'].flatMap(control => [{ description: 'Synthetic' + control + 'text' }, { account: 'Synthetic' + control + 'text' }]),
      ...['\0', '\u0008', '\u000b', '\u000c', '\u001f'].flatMap(control => ['description', 'account', 'evidence'].map(field => ({ [field]: 'Synthetic' + control + 'text' }))),
      { description: 'x'.repeat(501) }, { amount: '1'.repeat(33) }, { date: 'x'.repeat(11) }, { evidence: 'x'.repeat(2001) },
      { currency: 'CAD' }, { precision: 'year' }, { requestKey: 'invalid/key' }, { owner: 'forged' },
    ];
    for (const bad of badFields) {
      const data = { ...expense, requestKey: 'synthetic-unsupported-wire', ...(operation === 'correct' ? { id: target.id, expectedRevision: '1' } : {}), ...bad };
      for (const valid of [true, false]) {
        const response = await post(app, '/' + operation, data, valid ? { csrf: app.csrf, cookie: app.cookie } : { csrf: 'expired', cookie: 'expired' });
        assert.equal(response.status, valid ? 400 : 403, JSON.stringify(bad));
        assert.doesNotMatch(await response.text(), /<form/, 'unsupported native payload must never be transformed into a retry');
      }
    }
  }
  assert.equal(record.mock.callCount(), 0);
  assert.equal(correct.mock.callCount(), 0);
  assert.equal(await (await fetch(app.url + '/expense?id=' + target.id)).text(), before);
  assert.equal(((await (await fetch(app.url + '/history')).text()).match(/class="history-row/g) ?? []).length, 1);
});

test('correction and undo reject non-decimal revisions before domain calls, just like recovery', async t => {
  const app = await fixture(t);
  const target = await saved(app);
  const before = await (await fetch(app.url + '/expense?id=' + target.id)).text();
  const correct = t.mock.method(Ledger.prototype, 'correctExpense');
  const undo = t.mock.method(Ledger.prototype, 'undo');
  for (const operation of ['correct', 'undo']) {
    for (const expectedRevision of ['0x1', '0b1', '0o1', '1e0', '1.0', '+1', ' 1', '1 ', '', '0', '-1', '9007199254740992', '00000000000000001']) {
      const data = { requestKey: 'synthetic-revision-' + operation,
        ...(operation === 'correct' ? { ...expense, id: target.id } : { receiptId: target.receiptId }), expectedRevision };
      for (const valid of [true, false]) {
        const response = await post(app, '/' + operation, data, valid ? { csrf: app.csrf, cookie: app.cookie } : { csrf: 'expired', cookie: 'expired' });
        assert.equal(response.status, valid ? 400 : 403, `${operation}: ${JSON.stringify(expectedRevision)}`);
        assert.doesNotMatch(await response.text(), /<form/);
      }
    }
  }
  assert.equal(correct.mock.callCount(), 0);
  assert.equal(undo.mock.callCount(), 0);
  assert.equal(await (await fetch(app.url + '/expense?id=' + target.id)).text(), before);
});

test('recovery cannot change a committed payload under its preserved request key', async t => {
  const app = await fixture(t);
  await saved(app);
  const data = { ...expense, requestKey: 'synthetic-initial', amount: '9.00' };
  const denied = await post(app, '/record', data, { csrf: 'expired', cookie: 'expired' });
  assert.equal(denied.status, 403);
  const html = await denied.text();
  assert.equal(hidden(html, 'requestKey'), data.requestKey);
  assert.equal(hidden(html, 'amount'), '9.00');
  const retry = await post(app, '/record', data);
  assert.equal(retry.status, 400);
  assert.equal(hidden(await retry.text(), 'requestKey'), data.requestKey);
  assert.match(await (await fetch(app.url + '/spending')).text(), /USD 2.00/);
  assert.equal(((await (await fetch(app.url + '/history')).text()).match(/class="history-row/g) ?? []).length, 1);
});
