import { test, expect } from '@playwright/test';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ javaScriptEnabled: false });
test.beforeEach(async ({ browser }, info) => {
  const path = info.outputPath('runtime.json');
  writeFileSync(path, JSON.stringify({ node: process.version, executable: process.execPath,
    chromium: browser.version(), javaScriptEnabled: false }));
  await info.attach('runtime.json', { path, contentType: 'application/json' });
});
async function launch(directory: string, port = 0) {
  const child = fork(new URL('./host.ts', import.meta.url), [directory, String(port)], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [message] = await once(child, 'message');
  const host = message as { url: string; runtime: string };
  expect(host.runtime).toBe(process.version);
  const url = host.url;
  return { url, stop: async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exit = once(child, 'exit'); child.send('stop'); await exit;
  } };
}

for (const committed of [false, true]) test(`script-free stale record preserves identity (${committed ? 'committed response gap' : 'not yet saved'})`, async ({ page, context }, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-browser-recovery-'));
  let app = await launch(directory);
  try {
    await page.goto(app.url);
    const input = { description: '<synthetic>\t & "retry"\u007f', amount: '1.0', currency: 'EUR', precision: 'month', date: '2026-10', account: 'Synthetic\t cash\u007f', evidence: '\nSynthetic\t <source> & exact note\u007f\nSecond synthetic line' };
    await page.getByLabel('Description', { exact: true }).fill(input.description);
    await page.getByLabel('Amount', { exact: true }).fill(input.amount);
    await page.locator('[name=currency]').selectOption(input.currency);
    await page.getByLabel('Date precision').selectOption(input.precision);
    await page.getByLabel('Effective date', { exact: true }).fill(input.date);
    await page.getByText('Optional context', { exact: true }).click();
    await page.getByLabel('Funding account label').fill(input.account);
    await page.getByLabel('Evidence / source note').fill(input.evidence);
    const requestKey = await page.locator('[name=requestKey]').inputValue();
    const csrf = await page.locator('[name=csrf]').inputValue();
    let originalReceipt: string | undefined;
    if (committed) {
      // Commit the exact DOM form without delivering its response to that page.
      const result = await context.request.post(app.url + '/record', { headers: { Origin: app.url }, form: { ...input, evidence: input.evidence.replace(/\n/g, '\r\n'), requestKey, csrf }, maxRedirects: 0 });
      expect(result.status()).toBe(303);
      originalReceipt = result.headers().location;
    }
    const port = Number(new URL(app.url).port);
    await app.stop(); app = await launch(directory, port);
    const denied = page.waitForResponse(response => response.url() === app.url + '/record' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save expense', exact: true }).click();
    const refused = await denied;
    expect(refused.status()).toBe(403);
    const wire = Object.fromEntries(new URLSearchParams(refused.request().postData()!));
    expect(wire).toEqual({ ...input, evidence: input.evidence.replace(/\n/g, '\r\n'), csrf, requestKey });
    await expect(page.locator('form[action="/record"]')).toHaveCount(1);
    await expect(page.locator('[name=requestKey]')).toHaveValue(requestKey);
    expect(await page.locator('[name=csrf]').inputValue()).not.toBe(csrf);
    for (const [name, value] of Object.entries(input)) await expect(page.locator(`[name=${name}]`)).toHaveValue(value);
    await expect(page.locator('img, script')).toHaveCount(0);
    const before = await context.request.get(app.url + '/history');
    expect(((await before.text()).match(/class="history-row/g) ?? []).length).toBe(committed ? 1 : 0);
    await page.screenshot({ path: info.outputPath('stale-record-preserved.png'), fullPage: true });
    const retried = page.waitForRequest(request => request.url() === app.url + '/record' && request.method() === 'POST');
    await page.getByRole('button', { name: 'Save expense', exact: true }).click();
    const retryWire = Object.fromEntries(new URLSearchParams((await retried).postData()!));
    expect({ ...retryWire, csrf }).toEqual(wire);
    await expect(page.getByRole('heading', { name: 'Expense saved', exact: true })).toBeVisible();
    if (originalReceipt) expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(originalReceipt);
    await page.screenshot({ path: info.outputPath('explicit-retry-receipt.png'), fullPage: true });
    await app.stop(); app = await launch(directory, port);
    const history = await context.request.get(app.url + '/history');
    expect(((await history.text()).match(/class="history-row/g) ?? []).length).toBe(1);
    await page.goto(app.url + '/spending');
    await expect(page.getByText('EUR 1.00', { exact: true })).toBeVisible();
  } finally { await app.stop(); rmSync(directory, { recursive: true, force: true }); }
});

test('script-free expired correction returns the committed receipt despite a newer revision', async ({ page, context }, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-browser-stale-correction-'));
  let app = await launch(directory);
  try {
    await page.goto(app.url);
    await page.locator('[name=description]').fill('Synthetic original');
    await page.locator('[name=amount]').fill('2.00');
    await page.getByRole('button', { name: 'Save expense', exact: true }).click();
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.locator('[name=description]').fill('Synthetic\t intended correction\u007f');
    await page.locator('[name=amount]').fill('3.0');
    await page.getByText('Optional context', { exact: true }).click();
    await page.locator('[name=account]').fill('Synthetic\t cash\u007f');
    await page.locator('[name=evidence]').fill('\nSynthetic\t note\u007f\nSecond line');
    const input = { description: 'Synthetic\t intended correction\u007f', amount: '3.0', currency: 'USD', precision: 'unknown', date: '', account: 'Synthetic\t cash\u007f', evidence: '\nSynthetic\t note\u007f\nSecond line' };
    const requestKey = await page.locator('[name=requestKey]').inputValue();
    const id = await page.locator('[name=id]').inputValue();
    const csrf = await page.locator('[name=csrf]').inputValue();
    const payload = { ...input, evidence: input.evidence.replace(/\n/g, '\r\n'), requestKey, id, expectedRevision: '1', csrf };
    const committed = await context.request.post(app.url + '/correct', { headers: { Origin: app.url }, form: payload, maxRedirects: 0 });
    expect(committed.status()).toBe(303);
    const originalReceipt = committed.headers().location;
    const newer = await context.request.post(app.url + '/correct', { headers: { Origin: app.url }, form: { ...payload, requestKey: 'synthetic-newer-correction', expectedRevision: '2', amount: '4.00' }, maxRedirects: 0 });
    expect(newer.status()).toBe(303);
    const port = Number(new URL(app.url).port);
    await app.stop(); app = await launch(directory, port);
    const rejected = page.waitForResponse(response => response.url() === app.url + '/correct' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const refused = await rejected;
    expect(refused.status()).toBe(403);
    expect(Object.fromEntries(new URLSearchParams(refused.request().postData()!))).toEqual(payload);
    await expect(page.locator('form[action="/correct"]')).toHaveCount(1);
    await expect(page.locator('[name=requestKey]')).toHaveValue(requestKey);
    await expect(page.locator('[name=id]')).toHaveValue(id);
    await expect(page.locator('[name=expectedRevision]')).toHaveValue('1');
    for (const [name, value] of Object.entries(input)) await expect(page.locator(`[name=${name}]`)).toHaveValue(value);
    await page.screenshot({ path: info.outputPath('stale-correction-preserved.png'), fullPage: true });
    const retried = page.waitForRequest(request => request.url() === app.url + '/correct' && request.method() === 'POST');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const retryWire = Object.fromEntries(new URLSearchParams((await retried).postData()!));
    expect({ ...retryWire, csrf }).toEqual(payload);
    await expect(page.getByRole('heading', { name: 'Expense updated', exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(originalReceipt);
    await expect(page.getByText('USD 3.00', { exact: true })).toBeVisible();
    await expect(page.getByText('Historical receipt. The record has a newer revision.')).toBeVisible();
    await page.screenshot({ path: info.outputPath('historical-correction-receipt.png'), fullPage: true });
    await page.goto(app.url + '/expense?id=' + id);
    await expect(page.getByText('USD 4.00', { exact: true })).toBeVisible();
    await page.locator('details summary').click();
    await expect(page.locator('details ol li')).toHaveCount(3);
  } finally { await app.stop(); rmSync(directory, { recursive: true, force: true }); }
});

for (const committed of [false, true]) test(`script-free expired undo preserves its target (${committed ? 'committed response gap' : 'not yet applied'})`, async ({ page, context }, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-browser-stale-undo-'));
  let app = await launch(directory);
  try {
    await page.goto(app.url);
    await page.locator('[name=description]').fill('Synthetic undo target');
    await page.locator('[name=amount]').fill('2.00');
    await page.getByRole('button', { name: 'Save expense', exact: true }).click();
    const payload: Record<string, string> = {};
    for (const name of ['csrf', 'requestKey', 'receiptId', 'expectedRevision']) payload[name] = await page.locator(`[name=${name}]`).inputValue();
    let originalReceipt: string | undefined;
    if (committed) {
      const result = await context.request.post(app.url + '/undo', { headers: { Origin: app.url }, form: payload, maxRedirects: 0 });
      expect(result.status()).toBe(303); originalReceipt = result.headers().location;
    }
    const port = Number(new URL(app.url).port);
    await app.stop(); app = await launch(directory, port);
    const rejected = page.waitForResponse(response => response.url() === app.url + '/undo' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    expect((await rejected).status()).toBe(403);
    await expect(page.locator('form[action="/undo"]')).toHaveCount(1);
    for (const name of ['requestKey', 'receiptId', 'expectedRevision']) await expect(page.locator(`[name=${name}]`)).toHaveValue(payload[name]!);
    const before = await context.request.get(app.url + '/spending');
    expect(await before.text()).toContain(committed ? 'No active expenses yet' : 'USD 2.00');
    await page.screenshot({ path: info.outputPath('stale-undo-preserved.png'), fullPage: true });
    await page.getByRole('button', { name: 'Retry Undo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Change undone', exact: true })).toBeVisible();
    await expect(page.getByText(/Revision 2 · Receipt/)).toBeVisible();
    if (originalReceipt) expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(originalReceipt);
    await app.stop(); app = await launch(directory, port);
    await page.goto(app.url + '/history');
    await expect(page.locator('.history-row.void')).toHaveCount(1);
  } finally { await app.stop(); rmSync(directory, { recursive: true, force: true }); }
});

test('script-free record precision recovery preserves native text and request identity', async ({ page }, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-browser-record-validation-'));
  const app = await launch(directory);
  try {
    await page.goto(app.url);
    const input = { description: 'Synthetic\t description\u007f', amount: '1.001', currency: 'USD', precision: 'unknown', date: '', account: 'Synthetic\t cash\u007f', evidence: '\nSynthetic\t source\u007f\nSecond line' };
    await page.locator('[name=description]').fill(input.description);
    await page.locator('[name=amount]').fill(input.amount);
    await page.getByText('Optional context', { exact: true }).click();
    await page.locator('[name=account]').fill(input.account);
    await page.locator('[name=evidence]').fill(input.evidence);
    const requestKey = await page.locator('[name=requestKey]').inputValue();
    const csrf = await page.locator('[name=csrf]').inputValue();
    const rejected = page.waitForResponse(response => response.url() === app.url + '/record' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save expense', exact: true }).click();
    const refused = await rejected;
    expect(refused.status()).toBe(400);
    const wire = Object.fromEntries(new URLSearchParams(refused.request().postData()!));
    expect(wire).toEqual({ ...input, evidence: input.evidence.replace(/\n/g, '\r\n'), requestKey, csrf });
    await expect(page.locator('form[action="/record"]')).toHaveCount(1);
    await expect(page.locator('[name=requestKey]')).toHaveValue(requestKey);
    for (const [name, value] of Object.entries(input)) await expect(page.locator(`[name=${name}]`)).toHaveValue(value);
    await expect(page.getByRole('alert')).toContainText('Amount precision');
    await page.screenshot({ path: info.outputPath('record-precision-preserved.png'), fullPage: true });
    await page.locator('[name=amount]').fill('1.00');
    const retried = page.waitForRequest(request => request.url() === app.url + '/record' && request.method() === 'POST');
    await page.getByRole('button', { name: 'Save expense', exact: true }).click();
    expect(Object.fromEntries(new URLSearchParams((await retried).postData()!))).toEqual({ ...wire, amount: '1.00' });
    await expect(page.getByRole('heading', { name: 'Expense saved', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    for (const name of ['description', 'account', 'evidence']) await expect(page.locator(`[name=${name}]`)).toHaveValue(input[name as keyof typeof input]);
    await page.screenshot({ path: info.outputPath('record-native-text-reopened.png'), fullPage: true });
  } finally { await app.stop(); rmSync(directory, { recursive: true, force: true }); }
});

test('script-free correction precision recovery keeps editable inputs, key, target and revision', async ({ page }, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-browser-correction-'));
  const app = await launch(directory);
  try {
    await page.goto(app.url);
    await page.getByLabel('Description', { exact: true }).fill('Synthetic original');
    await page.getByLabel('Amount', { exact: true }).fill('2.00');
    await page.getByRole('button', { name: 'Save expense', exact: true }).click();
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    const requestKey = await page.locator('[name=requestKey]').inputValue();
    const id = await page.locator('[name=id]').inputValue();
    const input = { description: '<synthetic correction>\t & "exact"\u007f', amount: '1.001', currency: 'GBP', precision: 'month', date: '2026-09', account: 'Synthetic\t pocket\u007f', evidence: '\nSynthetic\t <evidence> & note\u007f\nSecond line' };
    for (const name of ['description', 'amount', 'date']) await page.locator(`[name=${name}]`).fill(input[name as keyof typeof input]);
    await page.locator('[name=currency]').selectOption(input.currency);
    await page.locator('[name=precision]').selectOption(input.precision);
    await page.getByText('Optional context', { exact: true }).click();
    await page.locator('[name=account]').fill(input.account);
    await page.locator('[name=evidence]').fill(input.evidence);
    const rejected = page.waitForResponse(response => response.url() === app.url + '/correct' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    const refused = await rejected;
    expect(refused.status()).toBe(400);
    const wire = Object.fromEntries(new URLSearchParams(refused.request().postData()!));
    expect(wire).toEqual({ ...input, evidence: input.evidence.replace(/\n/g, '\r\n'), requestKey, id, expectedRevision: '1', csrf: wire.csrf });
    await expect(page.getByRole('alert')).toContainText('Amount precision');
    await expect(page.locator('form[action="/correct"]')).toHaveCount(1);
    await expect(page.locator('[name=requestKey]')).toHaveValue(requestKey);
    await expect(page.locator('[name=id]')).toHaveValue(id);
    await expect(page.locator('[name=expectedRevision]')).toHaveValue('1');
    for (const [name, value] of Object.entries(input)) await expect(page.locator(`[name=${name}]`)).toHaveValue(value);
    await expect(page.locator('img, script')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Cancel', exact: true })).toHaveAttribute('href', '/expense?id=' + id);
    await page.screenshot({ path: info.outputPath('correction-precision-preserved.png'), fullPage: true });
    await page.locator('[name=amount]').fill('1.00');
    const retried = page.waitForRequest(request => request.url() === app.url + '/correct' && request.method() === 'POST');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    expect(Object.fromEntries(new URLSearchParams((await retried).postData()!))).toEqual({ ...wire, amount: '1.00' });
    await expect(page.getByRole('heading', { name: 'Expense updated', exact: true })).toBeVisible();
    await expect(page.getByText('GBP 1.00', { exact: true })).toBeVisible();
    await expect(page.getByText(/Revision 2 · Receipt/)).toBeVisible();
    await page.screenshot({ path: info.outputPath('corrected-retry-receipt.png'), fullPage: true });
  } finally { await app.stop(); rmSync(directory, { recursive: true, force: true }); }
});
