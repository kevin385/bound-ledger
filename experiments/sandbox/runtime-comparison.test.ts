import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

type Candidate = "isolated-vm" | "quickjs-wasm";
type Probe =
  | "safe-value"
  | "global-surface"
  | "constructor-escape"
  | "indirect-eval"
  | "dynamic-import"
  | "infinite-loop"
  | "large-allocation"
  | "output-flood"
  | "oversized-program"
  | "non-serializable";

type Outcome = {
  candidate: Candidate;
  probe: Probe;
  status: "ok" | "denied" | "limited" | "rejected" | "error";
  value?: string;
  detail?: string;
};

const runner = fileURLToPath(new URL("./probe-runner.ts", import.meta.url));
const candidates: Candidate[] = ["quickjs-wasm", "isolated-vm"];

function run(candidate: Candidate, probe: Probe): Outcome {
  const child = spawnSync(
    process.execPath,
    ["--no-node-snapshot", runner, candidate, probe],
    {
      encoding: "utf8",
      timeout: 4_000,
      maxBuffer: 256 * 1024,
      env: { PATH: process.env.PATH },
    },
  );

  assert.equal(child.signal, null, `${candidate}/${probe} killed by ${child.signal}`);
  assert.equal(child.status, 0, `${candidate}/${probe}: ${child.stderr}`);
  assert.ok(child.stdout.length < 2_048, `${candidate}/${probe} flooded host stdout`);
  return JSON.parse(child.stdout) as Outcome;
}

for (const candidate of candidates) {
  test(`${candidate}: evaluates deterministic serializable values`, () => {
    const outcome = run(candidate, "safe-value");
    assert.equal(outcome.status, "ok", outcome.detail);
    assert.deepEqual(JSON.parse(outcome.value ?? "null"), { answer: 42 });
  });

  test(`${candidate}: exposes none of the denied host globals`, () => {
    const outcome = run(candidate, "global-surface");
    assert.equal(outcome.status, "ok", outcome.detail);
    assert.deepEqual(JSON.parse(outcome.value ?? "null"), []);
  });

  for (const probe of ["constructor-escape", "indirect-eval"] as const) {
    test(`${candidate}: contains ${probe}`, () => {
      const outcome = run(candidate, probe);
      assert.equal(outcome.status, "ok", outcome.detail);
      assert.equal(outcome.value, "undefined");
    });
  }

  test(`${candidate}: denies host module loading`, () => {
    const outcome = run(candidate, "dynamic-import");
    assert.equal(outcome.status, "denied", outcome.detail);
    assert.match(outcome.detail ?? "", /module|import|load|resolve|not supported/i);
  });

  for (const probe of ["infinite-loop", "large-allocation"] as const) {
    test(`${candidate}: limits ${probe}`, () => {
      const outcome = run(candidate, probe);
      assert.equal(outcome.status, "limited", outcome.detail);
      assert.match(
        outcome.detail ?? "",
        /interrupt|memory|limit|dispose|terminate|allocation|timed out/i,
      );
    });
  }

  for (const probe of ["output-flood", "oversized-program", "non-serializable"] as const) {
    test(`${candidate}: rejects ${probe}`, () => {
      const outcome = run(candidate, probe);
      assert.equal(outcome.status, "rejected", outcome.detail);
      assert.match(outcome.detail ?? "", /64 KiB|serialized string/i);
    });
  }
}
