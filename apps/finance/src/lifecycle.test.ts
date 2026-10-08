import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { mkdtempSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFinance } from './index.ts';

function databaseHandles(directory: string): number {
  return readdirSync('/proc/self/fd').filter(fd => {
    try { return readlinkSync('/proc/self/fd/' + fd) === join(directory, 'ledger.sqlite'); }
    catch { return false; }
  }).length;
}

test('repeated failed binds close every SQLite handle and preserve EADDRINUSE', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-bind-'));
  const held = createServer();
  await new Promise<void>(resolve => held.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise<void>(resolve => held.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });
  const address = held.address();
  assert.ok(address && typeof address !== 'string');
  const before = databaseHandles(directory);
  for (let attempt = 0; attempt < 4; attempt++) {
    await assert.rejects(startFinance({ port: address.port, stateDirectory: directory }), { code: 'EADDRINUSE' });
  }
  assert.equal(databaseHandles(directory), before, 'failed startup retained SQLite descriptors');
});

test('concurrent close callers wait for the in-flight form commit and SQLite disposal', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-close-'));
  const app = await startFinance({ port: 0, stateDirectory: directory });
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const response = await fetch(app.url);
  const html = await response.text();
  const body = new URLSearchParams({
    csrf: html.match(/name="csrf" value="([^"]+)"/)![1]!, requestKey: 'in-flight-close',
    description: 'Synthetic in-flight fact', amount: '1.00', currency: 'USD', precision: 'unknown', date: '',
  }).toString();
  const socket = createConnection(app.address.port, '127.0.0.1');
  await once(socket, 'connect');
  let wire = '';
  socket.on('data', chunk => { wire += chunk.toString(); });
  const disconnected = once(socket, 'close');
  socket.write(`POST /record HTTP/1.1\r\nHost: ${new URL(app.url).host}\r\nOrigin: ${app.url}\r\nCookie: ${response.headers.get('set-cookie')!.split(';')[0]}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body.slice(0, 1)}`);
  // Let the real server accept the request while its body is incomplete.
  await setImmediate(); await setImmediate();
  let firstDone = false; let secondDone = false;
  const first = app.close().then(() => { firstDone = true; });
  const second = app.close().then(() => { secondDone = true; });
  try {
    await setImmediate();
    assert.equal(firstDone, false);
    assert.equal(databaseHandles(directory), 1);
    assert.equal(secondDone, false, 'second close resolved with HTTP and SQLite still open');
  } finally {
    socket.end(body.slice(1));
    await Promise.all([first, second, disconnected]);
  }
  assert.match(wire, /HTTP\/1.1 303/);
  assert.equal(databaseHandles(directory), 0);
  await app.close();
  const reopened = await startFinance({ port: 0, stateDirectory: directory });
  try {
    const history = await (await fetch(reopened.url + '/history')).text();
    assert.match(history, /Synthetic in-flight fact/);
    assert.equal((history.match(/class="history-row/g) ?? []).length, 1);
  } finally { await reopened.close(); }
});

test('shutdown errors still dispose SQLite and all callers receive the same failure', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-close-error-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const app = await startFinance({ port: 0, stateDirectory: directory });
  const original = Server.prototype.close;
  const failure = new Error('synthetic shutdown failure');
  // Fault only the completion callback after the real listener has drained.
  t.mock.method(Server.prototype, 'close', function(this: Server, callback?: (error?: Error) => void) {
    return original.call(this, () => callback?.(failure));
  });
  const first = app.close();
  const second = app.close();
  assert.equal(first, second);
  const results = await Promise.allSettled([first, second]);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.equal(result.reason, failure);
  }
  assert.equal(databaseHandles(directory), 0, 'shutdown error leaked SQLite');
  await assert.rejects(app.close(), error => error === failure);
});
