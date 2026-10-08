import { createServer } from 'node:http';
import { styles } from './styles.ts';
import { page, form, dateLabel, money, escape, context, receiptView, retryView } from './views.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, lstatSync, openSync, closeSync, constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ledger, LedgerError } from '@bound/finance-core';
import type { Receipt } from '@bound/finance-core';

export interface FinanceOptions { port?: number; stateDirectory?: string }
const defaultDirectory = fileURLToPath(new URL('../.local', import.meta.url));
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
async function fields(req: IncomingMessage): Promise<Record<string, string>> {
  if (!/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Use a form request');
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^[0-9]+$/.test(length) || Number(length) > 16384)) throw new HttpError(413, 'Request too large');
  let size = 0;
  const buffers: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk); size += buffer.length;
    if (size > 16384) throw new HttpError(413, 'Request too large');
    buffers.push(buffer);
  }
  const params = new URLSearchParams(Buffer.concat(buffers).toString('utf8'));
  const data: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of params) {
    if (Object.hasOwn(data, key)) throw new HttpError(400, 'Duplicate form field');
    data[key] = value;
  }
  return data;
}
function validExpectedRevision(value: string | undefined): boolean {
  return /^[0-9]{1,16}$/.test(value ?? '') && Number.isSafeInteger(Number(value)) && Number(value) >= 1;
}
function nativeForm(path: string, data: Record<string, string>): boolean {
  if (!['/record', '/correct', '/undo'].includes(path)) return false;
  // Text inputs preserve TAB/DEL but strip CR/LF. Native textarea submission
  // uses CRLF; accepting bare CR/LF here would change a committed retry payload.
  if (/[\r\n]/.test((data.evidence ?? '').replace(/\r\n/g, ''))) return false;
  const limits: Record<string, number> = path === '/undo' ? {} : { description: 500, amount: 32, currency: 3, precision: 7, date: 10, account: 200, evidence: 2000 };
  const identity = path === '/correct' ? ['id', 'expectedRevision'] : path === '/undo' ? ['receiptId', 'expectedRevision'] : [];
  if (path !== '/record' && (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(data[path === '/undo' ? 'receiptId' : 'id'] ?? '')
    || !validExpectedRevision(data.expectedRevision))) return false;
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(data.requestKey ?? '')
    && Object.keys(data).every(key => ['csrf', 'requestKey', ...identity, ...Object.keys(limits)].includes(key))
    && (path === '/undo' || (['description', 'amount', 'currency', 'precision', 'date'].every(key => Object.hasOwn(data, key))
      && Object.entries(limits).every(([key, limit]) => (data[key]?.length ?? 0) <= limit
        && !(key === 'evidence' ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/ : /[\u0000-\u0008\u000a-\u001f]/).test(data[key] ?? ''))
      && ['USD', 'EUR', 'GBP', 'JPY'].includes(data.currency ?? '')
      && ['unknown', 'day', 'month'].includes(data.precision ?? '')));
}
function expenseInput(data: Record<string, string>): unknown {
  return { description: data.description, amount: data.amount, currency: data.currency,
    account: data.account || null, evidence: data.evidence || null,
    effectiveDate: data.precision === 'unknown' ? (data.date ? { precision: 'unknown', value: data.date } : { precision: 'unknown' }) : { precision: data.precision, value: data.date } };
}
function send(res: ServerResponse, status: number, body: string, type = 'text/html; charset=utf-8'): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
}
function privateDatabase(directory: string): string {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const dir = lstatSync(directory);
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) !== 0 || dir.uid !== process.getuid?.()) throw new Error('Runtime directory must be private and owned by the local user');
  const path = join(directory, 'ledger.sqlite');
  if (!existsSync(path)) {
    const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    closeSync(fd);
  }
  const file = lstatSync(path);
  if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || (file.mode & 0o077) !== 0 || file.uid !== process.getuid?.()) throw new Error('Domain database must be private and owned by the local user');
  return path;
}
export async function startFinance(options: FinanceOptions = {}) {
  const directory = options.stateDirectory ?? defaultDirectory;
  const ledger = new Ledger(privateDatabase(directory), { workspace: 'local', owner: 'local-owner' });
  const csrf = randomBytes(32).toString('hex');
  const session = randomBytes(32).toString('hex');
  let url = '';
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 10000,
    keepAliveTimeout: 1000, connectionsCheckingInterval: 1000 }, (req, res) => { void (async () => {
    try {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('Cache-Control', 'no-store');
      const target = new URL(req.url ?? '/', url);
      if (req.headers.host !== new URL(url).host || target.origin !== url || (req.headers.origin !== undefined && req.headers.origin !== url)
        || (req.method === 'POST' && req.headers.origin !== url)) {
        return send(res, 403, page('Forbidden', '<h1>Request refused</h1><p>Use the local workspace address.</p>'));
      }

      if (req.method === 'GET') {
        res.setHeader('Set-Cookie', `bound_session=${session}; HttpOnly; SameSite=Strict; Path=/`);
        if (target.pathname === '/style.css') return send(res, 200, styles, 'text/css; charset=utf-8');
        if (target.pathname === '/') return send(res, 200, page('New expense', form(csrf)));
        if (target.pathname === '/history') {
          const rawOffset = target.searchParams.get('offset') ?? '0';
          if (!/^(0|[1-9][0-9]{0,6})$/.test(rawOffset)) throw new HttpError(400, 'Invalid history window');
          const offset = Number(rawOffset);
          const events = ledger.listExpenses(25, offset);
          const items = events.map(event => `<li class="history-row ${event.status}"><div><a href="/expense?id=${event.id}">${escape(event.description)}</a><p class="hint">${escape(dateLabel(event))} · Revision ${event.revision} · ${event.status === 'void' ? 'Voided — excluded from spending' : 'Expense'}</p></div><strong>${money(event)}</strong></li>`).join('');
          return send(res, 200, page('History', `<p class="eyebrow">PERSISTENT RECORDS</p><h1>History</h1><p class="lede">Your recorded facts, including corrections and undone entries.</p><section class="card">${events.length ? `<ul class="history">${items}</ul>` : '<h2>No records in this window</h2><p>Your first saved expense will appear here.</p><a href="/">Record an expense</a>'}<div class="actions">${offset > 0 ? `<a href="/history?offset=${Math.max(0, offset - 25)}">Newer records</a>` : ''}${events.length === 25 ? `<a href="/history?offset=${offset + 25}">Older records</a>` : ''}</div></section>`));
        }
        if (target.pathname === '/spending') {
          const summary = ledger.summary();
          return send(res, 200, page('Spending', `<p class="eyebrow">A VIEW OF KNOWN COSTS</p><h1>Spending</h1><p class="lede">All recorded active expenses, by native currency.</p><div class="totals">${summary.spending.map(total => `<section class="card"><h2>${total.currency}</h2><p class="amount">${money(total)}</p><p class="hint">Recorded expenses · all effective dates</p></section>`).join('') || '<section class="card"><h2>No active expenses yet</h2><a href="/">Record an expense</a></section>'}</div><p class="notice">Currencies are not combined. No exchange rates or balances are inferred. This is recorded spending, not a complete bank statement.</p>`));
        }
        if (target.pathname === '/edit') {
          const event = ledger.getExpense(target.searchParams.get('id') ?? '');
          if (event?.status === 'active') return send(res, 200, page('Edit expense', form(csrf, event)));
        }
        if (target.pathname === '/expense') {
          const event = ledger.getExpense(target.searchParams.get('id') ?? '');
          if (event) return send(res, 200, page('Expense detail', `<p class="eyebrow">EXPENSE DETAIL · REVISION ${event.revision}</p><h1>${escape(event.description)}</h1><section class="card"><p class="amount">${money(event)}</p><p>${event.status === 'void' ? 'Voided — excluded from spending' : 'Active expense'}</p>${context(event)}<div class="actions"><a href="/receipt?id=${event.receiptId}">View latest receipt</a>${event.status === 'active' ? `<a class="button" href="/edit?id=${event.id}">Edit</a>` : ''}</div><details><summary>Revision history</summary><ol>${ledger.revisions(event.id).map(revision => `<li><a href="/receipt?id=${revision.receiptId}">Revision ${revision.revision}</a> · ${money(revision)} · ${revision.status}</li>`).join('')}</ol></details></section>`));
        }
        if (target.pathname === '/receipt') {
          const receipt = ledger.getReceipt(target.searchParams.get('id') ?? '');
          if (receipt) return send(res, 200, page('Receipt', receiptView(receipt, csrf, ledger.getExpense(receipt.event.id))));
        }
      }
      if (req.method === 'POST') {
        const data = await fields(req);
        const operation = target.pathname === '/undo' ? 'undo' : target.pathname === '/correct' ? 'correct' : 'record';
        const cookies = req.headers.cookie?.split(';').map(value => value.trim()) ?? [];
        if (!cookies.includes('bound_session=' + session) || data.csrf !== csrf) {
          if (nativeForm(target.pathname, data)) {
            // Same-origin review only: failing credentials never invoke a domain write.
            res.setHeader('Set-Cookie', `bound_session=${session}; HttpOnly; SameSite=Strict; Path=/`);
            return send(res, 403, page('Review and retry', retryView(csrf, operation, data,
              'Local session expired or invalid. This request was not applied. Review and explicitly retry with the preserved request identity. If an earlier attempt committed, unchanged retry returns its original receipt.')));
          }
          return send(res, 403, page('Forbidden', '<h1>Request refused</h1><p>Refresh this page to start a new local session.</p>'));
        }
        if (!['/record', '/correct', '/undo'].includes(target.pathname)) return send(res, 404, page('Not found', '<h1>Not found</h1>'));

        // The write boundary and recovery accept exactly the same native wire shape.
        // Semantic errors (e.g. monetary precision) remain editable domain failures.
        if (!nativeForm(target.pathname, data)) throw new HttpError(400, 'Unsupported or malformed native form');
        let receipt: Receipt;
        try {
        receipt = target.pathname === '/undo' ? ledger.undo(data.requestKey ?? '', { receiptId: data.receiptId, expectedRevision: Number(data.expectedRevision) })
          : target.pathname === '/record' ? ledger.recordExpense(data.requestKey ?? '', expenseInput(data))
          : ledger.correctExpense(data.requestKey ?? '', { id: data.id, expectedRevision: Number(data.expectedRevision), expense: expenseInput(data) });
        } catch (error) {
          if (nativeForm(target.pathname, data)) {
            const knownFailure = error instanceof LedgerError;
            const message = knownFailure ? error.message : 'Response unavailable; this operation may have committed. Review and explicitly retry unchanged to recover its original receipt. Do not start a new entry.';
            return send(res, knownFailure ? 400 : 500, page(knownFailure ? 'Not saved' : 'Outcome uncertain', retryView(csrf, operation, data, message)));
          }
          throw error;
        }
        res.writeHead(303, { Location: '/receipt?id=' + receipt.id }); return res.end();
      }
      send(res, 404, page('Not found', '<h1>Not found</h1><a href="/">Return to your workspace</a>'));
    } catch (error) {
      if (error instanceof HttpError) {
        res.setHeader('Connection', 'close'); req.resume();
        send(res, error.status, page('Request refused', `<h1>Request refused</h1><p role="alert">${escape(error.message)}</p>`));
      } else if (error instanceof LedgerError) send(res, 400, page('Not saved', `<h1>Not saved</h1><p role="alert">${escape(error.message)}</p><a href="/">Return to entry</a>`));
      else send(res, 500, page('Unavailable', '<h1>Workspace unavailable</h1><p>The response is unavailable; a write may have committed. Reopen the workspace and retry the original request, not a new entry.</p>'));
    }
  })(); });
  let address;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject); server.listen(options.port ?? 4318, '127.0.0.1', resolve);
    });
    address = server.address();
    if (!address || typeof address === 'string') throw new Error('Loopback server unavailable');
    url = `http://127.0.0.1:${address.port}`;
  } catch (error) {
    // Disposal must not replace the original startup failure.
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    try { ledger.close(); } catch { /* Keep the original error. */ }
    throw error;
  }
  let shutdown: Promise<void> | undefined;
  return { url, address, close: () => {
    shutdown ??= new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      .finally(() => ledger.close());
    return shutdown;
  } };
}
