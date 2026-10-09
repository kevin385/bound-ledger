import { test, expect } from '@playwright/test';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function launch(directory: string) {
  const child = fork(new URL('./host.ts', import.meta.url), [directory], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const [message] = await once(child, 'message');
  const url = (message as { url: string }).url;
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:[0-9]+$/);
  return { url, kill: () => child.kill(), stop: async () => {
    const exit = once(child, 'exit'); child.send('stop'); await exit;
  } };
}
test('expense → receipt → process reopen → spending → edit → undo', async ({ page, context }, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-browser-'));
  let app = await launch(directory);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  try {
    await page.goto(app.url);
    await expect(page.getByRole('heading', { name: 'Record an expense' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('new-expense.png'), fullPage: true });
    await page.getByLabel('Description', { exact: true }).fill('Synthetic garden lunch');
    await page.getByLabel('Amount', { exact: true }).fill('12.34');
    await page.getByLabel('Date precision').selectOption('month');
    await page.getByLabel('Effective date', { exact: true }).fill('2026-10');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByRole('heading', { name: 'Expense saved' })).toBeVisible();
    await expect(page.getByText('USD 12.34', { exact: true })).toBeVisible();
    await expect(page.getByText('Account unspecified', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('receipt.png'), fullPage: true });
    await app.stop(); // Actual process exit, not page refresh or in-memory reuse.
    app = await launch(directory);
    await page.goto(app.url + '/history');
    await page.getByRole('link', { name: 'Synthetic garden lunch', exact: true }).click();
    await expect(page.getByText('2026-10 (month)', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Spending', exact: true }).click();
    await expect(page.getByText('USD 12.34', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('reopened-spending.png'), fullPage: true });
    await page.getByRole('link', { name: 'History', exact: true }).click();
    await page.getByRole('link', { name: 'Synthetic garden lunch', exact: true }).click();
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('12.34');
    await page.getByLabel('Amount', { exact: true }).fill('15.20');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: 'Expense updated' })).toBeVisible();
    await page.screenshot({ path: info.outputPath('corrected.png'), fullPage: true });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Change undone' })).toBeVisible();
    await expect(page.getByText('USD 12.34', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('undone.png'), fullPage: true });
    await page.getByRole('link', { name: 'Spending', exact: true }).click();
    await expect(page.getByText('USD 12.34', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { app.kill(); rmSync(directory, { recursive: true, force: true }); }
});

test('mobile form preserves precision errors and malicious text stays inert', async ({ page }, info) => {
  const directory = mkdtempSync(join(tmpdir(), 'bound-browser-mobile-'));
  const app = await launch(directory);
  const errors: string[] = []; const dialogs: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(app.url);
    await page.getByLabel('Description', { exact: true }).fill('<img src=x onerror=alert(1)> Synthetic');
    await page.getByLabel('Amount', { exact: true }).fill('1.001');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByRole('alert')).toContainText('Amount precision');
    await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('1.001');
    await page.getByLabel('Amount', { exact: true }).fill('1.00');
    await page.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)> Synthetic', exact: true })).toBeVisible();
    await expect(page.locator('img, script')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('mobile-safe-text.png'), fullPage: true });
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByRole('link', { name: 'Spending', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No active expenses yet' })).toBeVisible();
    expect(dialogs).toEqual([]); expect(errors).toEqual([]);
  } finally { app.kill(); rmSync(directory, { recursive: true, force: true }); }
});
