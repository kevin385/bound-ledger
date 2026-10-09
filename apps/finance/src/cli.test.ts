import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
test('the manual CLI is runnable and refuses unrecognised runtime/path options', () => {
  const main = new URL('./main.ts', import.meta.url);
  assert.ok(existsSync(main), 'manual CLI is missing');
  const result = spawnSync(process.execPath, [main.pathname, '--arbitrary-path', '/should-not-exist'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage/);
  assert.equal(result.stdout, '');
});
