import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodemodeSandbox } from '@earendil-works/pi-codemode';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, defineDoc, defineExtension, defineTask, Harness } from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';

// Synthetic application state; no provider, credentials, or financial data.
const rows = [{ id: 'row-1', amountMinor: -25000 }, { id: 'row-2', amountMinor: 10000 }];
const context = BACKGROUND_CONTEXT;
const Run = defineDoc({
  kind: 'bound.spike.run', version: 1, scope: 'conversation',
  history: 'latest', fork: 'initial', initial: () => ({ proposals: [] }),
});
const Reconcile = defineTask({
  name: 'bound.spike.reconcile', version: 1,
  initial: () => ({ phase: 'analyze' }),
  phases: {
    analyze: async (task, runtime, taskContext) => {
      const sandbox = new CodemodeSandbox({ timeoutMs: 2000, memoryLimitBytes: 16 * 1024 * 1024,
        tools: [{ name: 'rows.query', execute: () => rows }] });
      let result;
      try {
        result = await sandbox.execute('const rows = await tools.rows_query({}); return { count: rows.length, netMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0) };');
      } finally { await sandbox.close(); }
      assert.equal(result.ok, true);
      await runtime.commit(async (tx) => {
        const run = await tx.doc(Run, runtime.conversationId);
        run.proposals.push({ id: task.id, status: 'pending_review', ...result.value });
        return { status: 'running', checkpoint: { phase: 'finish' } };
      }, taskContext);
      if (process.argv[2] === 'crash') {
        process.send({ committed: true });
        // Parent kills this process after the committed checkpoint, without close().
        await new Promise(() => {});
      }
    },
    finish: async (_task, runtime, taskContext) => {
      await runtime.commit(() => ({ status: 'terminal', outcome: {
        status: 'completed', result: { status: 'awaiting_review' },
      } }), taskContext);
    },
  },
  abort: async (_task, runtime, taskContext) => {
    await runtime.commit(() => ({ status: 'terminal', outcome: { status: 'aborted' } }), taskContext);
  },
});

async function worker(mode, directory) {
  const registry = createRegistry();
  registry.install(defineExtension({ name: 'bound.spike', tasks: [Reconcile] }));
  const harness = await Harness.open(await openNodeSqliteStorage(join(directory, 'session.sqlite')),
    { models: createModels(), registry }, context);
  try {
    const root = await harness.root(context);
    let taskId;
    if (mode === 'crash') {
      taskId = await root.commit(async (tx) => {
        await tx.doc(Run, root.id);
        return tx.createTask(Reconcile, {}, { ownership: { kind: 'conversation' } });
      }, context);
      await writeFile(join(directory, 'task.json'), JSON.stringify({ taskId }));
    } else {
      ({ taskId } = JSON.parse(await readFile(join(directory, 'task.json'), 'utf8')));
    }
    const task = await harness.waitForTask(taskId, context);
    const state = await harness.snapshot(Run, root.id, context);
    assert.equal(task.state.outcome.status, 'completed');
    assert.equal(state.proposals.length, 1);
    assert.equal(state.proposals[0].netMinor, -15000);
    assert.equal(state.proposals[0].status, 'pending_review');
    console.log(JSON.stringify({ recovered: true, proposals: state.proposals.length,
      outcome: task.state.outcome.result }));
  } finally { await harness.close(context); }
}

async function child(mode, directory) {
  return new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, [fileURLToPath(import.meta.url), mode, directory],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let stdout = '', stderr = '', killedAfterCommit = false;
    const watchdog = setTimeout(() => { processChild.kill('SIGKILL'); reject(new Error('Child timed out')); }, 15000);
    processChild.stdout.on('data', chunk => { stdout += chunk; });
    processChild.stderr.on('data', chunk => { stderr += chunk; });
    processChild.on('message', message => {
      if (message.committed) { killedAfterCommit = true; processChild.kill('SIGKILL'); }
    });
    processChild.on('error', error => { clearTimeout(watchdog); reject(error); });
    processChild.on('close', (code, signal) => {
      clearTimeout(watchdog);
      if (mode === 'crash' && killedAfterCommit && signal === 'SIGKILL') resolve({ killedAfterCommit });
      else if (mode === 'resume' && code === 0) resolve(JSON.parse(stdout.trim()));
      else reject(new Error(`Child failed: ${code}/${signal}: ${stderr}`));
    });
  });
}

async function main() {
  let drafts = 0;
  const attempts = [];
  const sandbox = new CodemodeSandbox({ timeoutMs: 2000, memoryLimitBytes: 16 * 1024 * 1024,
    tools: [{ name: 'draft.create', inputSchema: { type: 'object', properties: { amountMinor: { type: 'integer' } } },
      execute: (args) => {
        attempts.push(args);
        if (!Number.isSafeInteger(args?.amountMinor)) throw new Error('invalid_amount');
        return { id: `draft-${++drafts}` };
      } }] });
  try {
    const scope = await sandbox.execute('return { fetch: typeof fetch, process: typeof process, require: typeof require, posting: "events.post" in tools };');
    assert.deepEqual(scope.value, { fetch: 'undefined', process: 'undefined', require: 'undefined', posting: false });
    const invalid = await sandbox.execute('await tools.draft_create({ amountMinor: "bad" });');
    assert.equal(invalid.ok, false);
    assert.equal(drafts, 0);
    const failure = await sandbox.execute('await tools.draft_create({ amountMinor: 25000 }); store("draft", "draft-1"); throw new Error("later_failure");');
    assert.equal(failure.ok, false);
    assert.equal(drafts, 1); // Host effects survive script failure.
    assert.equal('storeWrites' in failure, false);
    const timeout = await sandbox.execute('while (true) {}', { timeoutMs: 100 });
    assert.equal(timeout.ok, false);
    assert.equal(timeout.error.kind, 'timeout');
    assert.equal(attempts.length, 2);
  } finally { await sandbox.close(); }
  const directory = await mkdtemp(join(tmpdir(), 'bound-pi-recovery-'));
  try {
    const killed = await child('crash', directory);
    const recovered = await child('resume', directory);
    console.log(JSON.stringify({ versions: '1.0.2',
      checks: ['guest_scope', 'host_validation', 'host_effect_survives_script_failure', 'failed_store_not_committed', 'loop_timeout', 'sqlite_sigkill_recovery'],
      ...killed, ...recovered }, null, 2));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (['crash', 'resume'].includes(process.argv[2])) await worker(process.argv[2], process.argv[3]);
else await main();
