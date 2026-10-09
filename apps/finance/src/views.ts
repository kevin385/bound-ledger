import { randomUUID } from 'node:crypto';
import type { Expense, Receipt } from '@bound/finance-core';

export function escape(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
export function page(title: string, body: string): string {
  return `<!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} · Bound Ledger</title>
    <link rel="stylesheet" href="/style.css">
    </head>
    <body>
    <a class="skip" href="#main">Skip to content</a>
    <header>
    <a class="brand" href="/">Bound Ledger<span class="badge">LOCAL / PRE-ALPHA</span>
    </a>
    <nav aria-label="Main">
    <a href="/">New expense</a>
    <a href="/history">History</a>
    <a href="/spending">Spending</a>
    </nav>
    </header>
    <main id="main">${body}</main>
    <footer>Synthetic data only · No model connected · No money movement</footer>
    </body>
    </html>`;
}
export function money(event: Pick<Expense, 'minorUnits' | 'currency'>): string {
  const units = BigInt(event.minorUnits);
  return event.currency + ' ' + (event.currency === 'JPY' ? units.toString() : `${units / 100n}.${(units % 100n).toString().padStart(2, '0')}`);
}
export function form(csrf: string, event?: Expense, data?: Record<string, string>, error?: string, operation: 'record' | 'correct' = event ? 'correct' : 'record'): string {
  const correcting = operation === 'correct';
  const id = data?.id ?? event?.id ?? '';
  const expectedRevision = data?.expectedRevision ?? String(event?.revision ?? '');
  const values = data ?? (event ? { description: event.description, amount: money(event).split(' ')[1]!, currency: event.currency,
    precision: event.effectiveDate.precision, date: event.effectiveDate.precision === 'unknown' ? '' : event.effectiveDate.value,
    account: event.account ?? '', evidence: event.evidence ?? '' } : {});
  const value = (key: string) => escape(values[key] ?? '');
  const selected = (key: string, option: string, fallback: string) => (values[key] ?? fallback) === option ? ' selected' : '';
  // HTML consumes the first newline after <textarea>; the template supplies it
  // so a leading newline in the submitted evidence remains part of the value.
  return `<p class="eyebrow">${correcting ? 'CORRECT A RECORDED FACT' : 'YOUR FINANCIAL WORKSPACE'}</p>
    <h1>${correcting ? 'Edit expense' : 'Record an expense'}</h1>
    <p class="lede">${correcting ? 'Keep the original in history. Save a new revision.' : 'Keep a fact. See its effect. Change it when you need to.'}</p>${error ? `<div class="error" role="alert">
    <h2>Review before retry</h2>
    <p>${escape(error)}</p>
    </div>` : ''}<section class="card">
    <form method="post" action="/${operation}">
    <input type="hidden" name="csrf" value="${csrf}">
    <input type="hidden" name="requestKey" value="${escape(data?.requestKey ?? randomUUID())}">${correcting ? `<input type="hidden" name="id" value="${escape(id)}">
    <input type="hidden" name="expectedRevision" value="${escape(expectedRevision)}">` : ''}<label>Description<input name="description" required maxlength="500" value="${value('description')}" placeholder="What was this for?">
    </label>
    <div class="grid">
    <label>Amount<input name="amount" required inputmode="decimal" maxlength="32" value="${value('amount')}" placeholder="12.34" aria-describedby="amount-hint">
    </label>
    <label>Currency<select name="currency">${['USD', 'EUR', 'GBP', 'JPY'].map(currency => `<option${selected('currency', currency, 'USD')}>${currency}</option>`).join('')}</select>
    </label>
    </div>
    <p id="amount-hint" class="hint">Positive amount. Up to 2 decimals for USD / EUR / GBP; whole units for JPY. No rounding.</p>
    <div class="grid">
    <label>Date precision<select name="precision">${[['unknown', 'Unknown'], ['day', 'Exact day'], ['month', 'Month only']].map(([precision, label]) => `<option value="${precision}"${selected('precision', precision!, 'unknown')}>${label}</option>`).join('')}</select>
    </label>
    <label>Effective date<input name="date" maxlength="10" value="${value('date')}" placeholder="YYYY-MM-DD or YYYY-MM" aria-describedby="date-hint">
    </label>
    </div>
    <p id="date-hint" class="hint">Leave the date blank when unknown. Month-only dates remain month-only.</p>
    <details${values.account || values.evidence ? ' open' : ''}>
    <summary>Optional context</summary>
    <label>Funding account label<input name="account" maxlength="200" value="${value('account')}" placeholder="Unspecified">
    </label>
    <p class="hint">A label does not establish an account balance or ownership.</p>
    <label>Evidence / source note<textarea name="evidence" maxlength="2000" rows="3">
${value('evidence')}</textarea>
    </label>
    </details>
    <div class="actions">
    <button class="primary" type="submit">${correcting ? 'Save changes' : 'Save expense'}</button>${correcting ? `<a href="/expense?id=${encodeURIComponent(id)}">Cancel</a>` : ''}</div>
    <p class="hint">Saves immediately to this device. Edit and Undo remain available.</p>
    </form>
    </section>`;
}
export function retryView(csrf: string, operation: 'record' | 'correct' | 'undo', data: Record<string, string>, message: string): string {
  if (operation !== 'undo') return form(csrf, undefined, data, message, operation);
  return `<h1>Review Undo</h1><p role="alert">${escape(message)}</p><section class="card">
    <p>Retry the original compensating change. History is kept; no payment is reversed.</p>
    <p>Target receipt: ${escape(data.receiptId!)} · Original expected revision: ${escape(data.expectedRevision!)}</p>
    <form method="post" action="/undo">
    <input type="hidden" name="csrf" value="${csrf}">
    ${['requestKey', 'receiptId', 'expectedRevision'].map(key => `<input type="hidden" name="${key}" value="${escape(data[key]!)}">`).join('')}
    <button type="submit">Retry Undo</button>
    <a href="/receipt?id=${encodeURIComponent(data.receiptId!)}">Review target receipt</a>
    </form></section>`;
}
export function receiptView(receipt: Receipt, csrf: string, current: Expense | null): string {
  const event = receipt.event;
  const latest = current?.receiptId === receipt.id;
  const title = receipt.operation === 'correct' ? 'Expense updated' : receipt.operation === 'undo' ? 'Change undone' : 'Expense saved';
  const canUndo = latest && event.status === 'active' && receipt.operation !== 'undo';
  return `<p class="eyebrow">SAVED TO THIS WORKSPACE</p>
    <h1>${title}</h1>
    <section class="card receipt">
    <p class="amount">${money(event)}</p>
    <h2>${escape(event.description)}</h2>
    <p class="hint">${escape(dateLabel(event))} · ${event.status === 'void' ? 'Voided — excluded from spending' : 'Active expense'}</p>
    <p>${event.account === null ? 'Account unspecified' : escape(event.account)}</p>
    <p class="hint">Balance unknown · Local owner</p>
    <p class="hint">Revision ${event.revision} · Receipt ${receipt.id}</p>
    <details>
    <summary>Receipt metadata</summary>
    <p class="hint">Recorded at ${escape(receipt.recordedAt)} (UTC). Recording time is not the effective date.</p>
    </details>${!latest ? '<p class="notice">Historical receipt. The record has a newer revision.</p>' : ''}<div class="actions">${current?.status === 'active' ? `<a class="button" href="/edit?id=${event.id}">Edit</a>` : ''}${canUndo ? `<form method="post" action="/undo">
    <input type="hidden" name="csrf" value="${csrf}">
    <input type="hidden" name="requestKey" value="${randomUUID()}">
    <input type="hidden" name="receiptId" value="${receipt.id}">
    <input type="hidden" name="expectedRevision" value="${event.revision}">
    <button type="submit">Undo</button>
    </form>` : ''}<a href="/expense?id=${event.id}">Record detail</a>
    <a href="/">Record another expense</a>
    </div>${canUndo ? `<p class="hint">${receipt.operation === 'correct' ? 'Undo restores the previous facts as a new revision.' : 'Undo voids this expense and removes it from spending.'} History is kept. Only the latest change can be undone; this does not reverse a payment.</p>` : ''}</section>`;
}
export function dateLabel(event: Expense): string {
  return event.effectiveDate.precision === 'unknown' ? 'Date unknown' : `${event.effectiveDate.value} (${event.effectiveDate.precision})`;
}
export function context(event: Expense): string {
  return `<dl>
    <div>
    <dt>Effective date</dt>
    <dd>${escape(dateLabel(event))}</dd>
    </div>
    <div>
    <dt>Owner</dt>
    <dd>Local owner</dd>
    </div>
    <div>
    <dt>Funding account</dt>
    <dd>${event.account === null ? 'Account unspecified' : escape(event.account)}</dd>
    </div>
    <div>
    <dt>Evidence</dt>
    <dd>${event.evidence === null ? 'Not supplied' : escape(event.evidence)}</dd>
    </div>
    </dl>
    <p class="notice">Balance unknown. An expense or an account label does not establish a position.</p>`;
}
