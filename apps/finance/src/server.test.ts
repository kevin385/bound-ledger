import test from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, chmodSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as app from './index.ts';

async function fixture(t: test.TestContext) {
  const stateDirectory = mkdtempSync(join(tmpdir(), 'bound-app-test-'));
  t.after(() => rmSync(stateDirectory, { recursive: true, force: true }));
  assert.equal(typeof app.startFinance, 'function', 'local manual application is missing');
  const running = await app.startFinance({ port: 0, stateDirectory });
  t.after(() => running.close());
  return { ...running, stateDirectory };
}
async function session(url: string) {
  const response = await fetch(url);
  const html = await response.text();
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  const requestKey = html.match(/name="requestKey" value="([^"]+)"/)?.[1];
  assert.ok(csrf, 'CSRF token missing');
  assert.ok(requestKey, 'stable request identity missing');
  return { csrf, requestKey, cookie: response.headers.get('set-cookie')!.split(';')[0]!, html };
}
async function post(url: string, path: string, credentials: Awaited<ReturnType<typeof session>>, fields: Record<string, string>) {
  return fetch(url + path, { method: 'POST', redirect: 'manual',
    headers: { Origin: url, Cookie: credentials.cookie },
    body: new URLSearchParams({ csrf: credentials.csrf, requestKey: credentials.requestKey, ...fields }) });
}
test('manual capture returns a compact persistent receipt with no account or model requirement', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  assert.match(credentials.html, /Record an expense/);
  const response = await post(running.url, '/record', credentials, { description: 'Synthetic lunch', amount: '12.34', currency: 'USD', precision: 'unknown', date: '', account: '', evidence: '' });
  assert.equal(response.status, 303);
  const receipt = await fetch(running.url + response.headers.get('location')!);
  const html = await receipt.text();
  assert.match(html, /Expense saved/);
  assert.match(html, /USD 12.34/);
  assert.match(html, /Account unspecified/);
  assert.match(html, /Undo/);
  assert.match(html, /Edit/);
});

test('supplied descriptions are displayed as text rather than executable HTML', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  const response = await post(running.url, '/record', credentials, { description: '<img src=x onerror=alert(1)> & "synthetic"', amount: '1.00', currency: 'USD', precision: 'unknown', date: '' });
  const html = await (await fetch(running.url + response.headers.get('location')!)).text();
  assert.equal(html.includes('<img src=x'), false);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp;/);
});

test('money display preserves exact minor units near the supported integer limit', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  const response = await post(running.url, '/record', credentials, { description: 'Synthetic limit', amount: '90071992547409.82', currency: 'USD', precision: 'unknown', date: '' });
  const html = await (await fetch(running.url + response.headers.get('location')!)).text();
  assert.match(html, /USD 90071992547409.82/);
});

test('loopback HTTP refuses DNS-rebinding hosts and cross-origin requests', async t => {
  const running = await fixture(t);
  assert.equal(running.address.address, '127.0.0.1');
  const credentials = await session(running.url);
  const foreignHostStatus = await new Promise<number>(resolve => {
    request(running.url, { headers: { Host: 'evil.example' } }, response => {
      response.resume(); resolve(response.statusCode!);
    }).end();
  });
  assert.equal(foreignHostStatus, 403);
  const foreignRead = await fetch(running.url, { headers: { Origin: 'https://evil.example' } });
  assert.equal(foreignRead.status, 403);
  for (const Origin of ['https://evil.example', 'null', running.url + '.evil']) {
    const response = await fetch(running.url + '/record', { method: 'POST', headers: { Origin, Cookie: credentials.cookie },
      body: new URLSearchParams({ csrf: credentials.csrf, requestKey: credentials.requestKey, description: 'Synthetic attacker', amount: '1.00', currency: 'USD', precision: 'unknown', date: '' }), redirect: 'manual' });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('every state change requires the same-origin session and CSRF token', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  assert.match((await fetch(running.url)).headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
  for (const path of ['/record', '/correct', '/undo']) {
    for (const [cookie, csrf] of [['', credentials.csrf], [credentials.cookie, ''], [credentials.cookie, 'bad-token']]) {
      const response = await fetch(running.url + path, { method: 'POST', redirect: 'manual', headers: { Origin: running.url, Cookie: cookie! },
        body: new URLSearchParams({ csrf: csrf!, requestKey: credentials.requestKey, description: 'Synthetic attacker', amount: '1.00', currency: 'USD', precision: 'unknown', date: '' }) });
      assert.equal(response.status, 403, path);
    }
  }
});

test('HTTP bounds body sizes, validates form media type and refuses duplicate fields', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  const headers = { Origin: running.url, Cookie: credentials.cookie };
  const oversized = await fetch(running.url + '/record', { method: 'POST', headers, body: new URLSearchParams({ csrf: credentials.csrf, requestKey: credentials.requestKey, description: 'x'.repeat(17000), amount: '1.00', currency: 'USD', precision: 'unknown', date: '' }) });
  assert.equal(oversized.status, 413);
  const json = await fetch(running.url + '/record', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(json.status, 415);
  const body = new URLSearchParams({ csrf: credentials.csrf, requestKey: credentials.requestKey, description: 'Synthetic', amount: '1.00', currency: 'USD', precision: 'unknown', date: '' });
  body.append('amount', '99.00');
  const duplicate = await fetch(running.url + '/record', { method: 'POST', headers, body });
  assert.equal(duplicate.status, 400);
});

test('local domain files are created privately rather than relying on ambient umask', async t => {
  const running = await fixture(t);
  assert.equal(statSync(running.stateDirectory).mode & 0o777, 0o700);
  assert.equal(statSync(join(running.stateDirectory, 'ledger.sqlite')).mode & 0o777, 0o600);
});

test('the application refuses insecure existing directories and symlinked databases without repairing them', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'bound-app-unsafe-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  chmodSync(dir, 0o755);
  await assert.rejects(app.startFinance({ port: 0, stateDirectory: dir }), /private/i);
  assert.equal(statSync(dir).mode & 0o777, 0o755);
  chmodSync(dir, 0o700);
  const external = join(dir, 'synthetic-target');
  writeFileSync(external, 'DO NOT ALTER', { mode: 0o600 });
  symlinkSync(external, join(dir, 'ledger.sqlite'));
  await assert.rejects(app.startFinance({ port: 0, stateDirectory: dir }), /private/i);
  assert.equal(readFileSync(external, 'utf8'), 'DO NOT ALTER');
});

test('pages prohibit scripts, embedding and caching and only allow same-origin styles/forms', async t => {
  const running = await fixture(t);
  const response = await fetch(running.url);
  assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.match(response.headers.get('content-security-policy') ?? '', /form-action 'self'/);
  assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'same-origin');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('reopening the application shows persistent history, detail and separate-currency spending', async t => {
  const first = await fixture(t);
  const credentials = await session(first.url);
  const saved = await post(first.url, '/record', credentials, { description: 'Synthetic lunch', amount: '12.34', currency: 'USD', precision: 'month', date: '2026-10' });
  const receiptHtml = await (await fetch(first.url + saved.headers.get('location')!)).text();
  const id = receiptHtml.match(/href="\/edit\?id=([^"]+)"/)?.[1];
  assert.ok(id);
  await first.close();
  const reopened = await app.startFinance({ port: 0, stateDirectory: first.stateDirectory });
  t.after(() => reopened.close());
  const history = await fetch(reopened.url + '/history');
  assert.equal(history.status, 200);
  assert.match(await history.text(), /Synthetic lunch/);
  const spending = await fetch(reopened.url + '/spending');
  assert.equal(spending.status, 200);
  assert.match(await spending.text(), /USD 12.34/);
  const detail = await fetch(reopened.url + '/expense?id=' + id);
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /2026-10 \(month\)/);
});

test('editing through the manual form changes spending and returns a correction receipt', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  const saved = await post(running.url, '/record', credentials, { description: 'Synthetic lunch', amount: '12.34', currency: 'USD', precision: 'unknown', date: '' });
  const html = await (await fetch(running.url + saved.headers.get('location')!)).text();
  const id = html.match(/href="\/edit\?id=([^"]+)"/)![1]!;
  const edit = await fetch(running.url + '/edit?id=' + id);
  assert.equal(edit.status, 200);
  const formHtml = await edit.text();
  assert.match(formHtml, /value="12.34"/);
  const requestKey = formHtml.match(/name="requestKey" value="([^"]+)"/)![1]!;
  const updated = await post(running.url, '/correct', { ...credentials, requestKey }, { id, expectedRevision: '1', description: 'Synthetic lunch revised', amount: '15.00', currency: 'USD', precision: 'unknown', date: '' });
  assert.equal(updated.status, 303);
  const receipt = await (await fetch(running.url + updated.headers.get('location')!)).text();
  assert.match(receipt, /Expense updated/);
  assert.match(receipt, /USD 15.00/);
  assert.match(await (await fetch(running.url + '/spending')).text(), /USD 15.00/);
});

test('manual undo restores a correction while explaining its compensating semantics', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  const saved = await post(running.url, '/record', credentials, { description: 'Synthetic lunch', amount: '12.34', currency: 'USD', precision: 'unknown', date: '' });
  const originalHtml = await (await fetch(running.url + saved.headers.get('location')!)).text();
  const id = originalHtml.match(/href="\/edit\?id=([^"]+)"/)![1]!;
  const corrected = await post(running.url, '/correct', { ...credentials, requestKey: 'ui-correction' }, { id, expectedRevision: '1', description: 'Synthetic lunch', amount: '15.00', currency: 'USD', precision: 'unknown', date: '' });
  const correctionHtml = await (await fetch(running.url + corrected.headers.get('location')!)).text();
  assert.match(correctionHtml, /restores the previous facts/i);
  const receiptId = new URL(corrected.headers.get('location')!, running.url).searchParams.get('id')!;
  const undone = await post(running.url, '/undo', { ...credentials, requestKey: 'ui-undo' }, { receiptId, expectedRevision: '2' });
  assert.equal(undone.status, 303);
  const undoHtml = await (await fetch(running.url + undone.headers.get('location')!)).text();
  assert.match(undoHtml, /Change undone/);
  assert.match(undoHtml, /USD 12.34/);
  assert.equal(undoHtml.includes('action="/undo"'), false);
  assert.match(await (await fetch(running.url + '/spending')).text(), /USD 12.34/);
});

test('precision errors preserve user input for correction and do not save any effect', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  const response = await post(running.url, '/record', credentials, { description: '<synthetic precision>', amount: '1.001', currency: 'USD', precision: 'unknown', date: '' });
  assert.equal(response.status, 400);
  const html = await response.text();
  assert.match(html, /Not saved/);
  assert.match(html, /value="1.001"/);
  assert.match(html, /value="&lt;synthetic precision&gt;"/);
  assert.match(html, new RegExp(`name="requestKey" value="${credentials.requestKey}"`));
  assert.match(await (await fetch(running.url + '/history')).text(), /No records/);
});

test('unsupported form facts and inconsistent unknown dates are rejected rather than silently discarded', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  const input = { description: 'Synthetic date', amount: '1.00', currency: 'USD', precision: 'unknown', date: '2026-10' };
  assert.equal((await post(running.url, '/record', credentials, input)).status, 400);
  assert.equal((await post(running.url, '/record', credentials, { ...input, date: '', balance: '500.00' })).status, 400);
  assert.match(await (await fetch(running.url + '/history')).text(), /No records/);
});

test('the manual interface serves responsive local styles without external resources', async t => {
  const running = await fixture(t);
  const response = await fetch(running.url + '/style.css');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/css/);
  const css = await response.text();
  assert.match(css, /@media/);
  assert.match(css, /:focus-visible/);
  assert.equal(css.includes('https://'), false);
});

test('chunked oversized bodies are rejected at the streaming boundary without saving', async t => {
  const running = await fixture(t);
  const credentials = await session(running.url);
  const status = await new Promise<number>(resolve => {
    const req = request(running.url + '/record', { method: 'POST', headers: {
      Origin: running.url, Cookie: credentials.cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'Transfer-Encoding': 'chunked',
    } }, response => { response.resume(); resolve(response.statusCode!); });
    req.on('error', () => resolve(0));
    req.write('description=' + 'x'.repeat(10000)); req.write('x'.repeat(10000)); req.end();
  });
  assert.equal(status, 413);
  assert.match(await (await fetch(running.url + '/history')).text(), /No records/);
});

test('HTTP headers above the explicit 8 KiB budget are refused by the server', async t => {
  const running = await fixture(t);
  const status = await new Promise<number>(resolve => {
    request(running.url, { headers: { 'X-Synthetic-Oversized': 'x'.repeat(9000) } }, response => {
      response.resume(); resolve(response.statusCode!);
    }).end();
  });
  assert.equal(status, 431);
});
