import assert from "node:assert/strict"
import test from "node:test"

import {
  ModelConfigurationError,
  assertLiveEvaluationOptIn,
  decodeModelConfigurationMatrixV1,
  resolveModelConfigurationV1,
} from "./model-configuration.ts"

const matrix = (configuration: Record<string, unknown>) => ({
  schemaVersion: 1,
  configurations: [configuration],
})

const native = {
  id: "native-openai",
  provider: "openai",
  model: "gpt-5-mini",
  endpointKind: "native",
  supportsTools: true,
  supportsCodeMode: true,
  apiKeyEnvironmentVariable: "OPENAI_API_KEY",
}

const compatible = {
  id: "hosted-compatible",
  provider: "hosted",
  model: "safe-model",
  endpointKind: "openai_compatible",
  supportsTools: true,
  supportsCodeMode: false,
  baseUrlEnvironmentVariable: "BOUND_LEDGER_MODEL_BASE_URL",
  apiKeyEnvironmentVariable: "BOUND_LEDGER_MODEL_API_KEY",
}

const local = {
  id: "loopback-local",
  provider: "local",
  model: "local-model",
  endpointKind: "local",
  supportsTools: true,
  supportsCodeMode: true,
  baseUrlEnvironmentVariable: "BOUND_LEDGER_MODEL_BASE_URL",
}

const codeOf = (action: () => unknown) => {
  assert.throws(action, (error) => {
    assert.ok(error instanceof ModelConfigurationError)
    return true
  })
}

test("decodes closed native, OpenAI-compatible, and local configurations", () => {
  const decoded = decodeModelConfigurationMatrixV1({
    schemaVersion: 1,
    configurations: [native, compatible, local],
  })
  assert.deepEqual(
    decoded.configurations.map(({ endpointKind }) => endpointKind),
    ["native", "openai_compatible", "local"],
  )
  assert.ok(Object.isFrozen(decoded.configurations[0]))
})

test("rejects unknown keys, values, duplicates, and inconsistent flags", () => {
  codeOf(() =>
    decodeModelConfigurationMatrixV1(
      matrix({ ...native, apiKey: "must-never-be-configured" }),
    ),
  )
  codeOf(() =>
    decodeModelConfigurationMatrixV1(
      matrix({ ...native, endpointKind: "mystery" }),
    ),
  )
  codeOf(() =>
    decodeModelConfigurationMatrixV1(
      matrix({ ...native, supportsTools: false, supportsCodeMode: true }),
    ),
  )
  codeOf(() =>
    decodeModelConfigurationMatrixV1(
      matrix({ ...native, baseUrlEnvironmentVariable: "BOUND_LEDGER_MODEL_BASE_URL" }),
    ),
  )
  codeOf(() =>
    decodeModelConfigurationMatrixV1({
      schemaVersion: 1,
      configurations: [native, native],
    }),
  )
})

test("resolves only allowlisted environment names", () => {
  codeOf(() =>
    decodeModelConfigurationMatrixV1(
      matrix({ ...native, apiKeyEnvironmentVariable: "UNREVIEWED_SECRET" }),
    ),
  )
  const decoded = decodeModelConfigurationMatrixV1(matrix(native))
  codeOf(() => resolveModelConfigurationV1(decoded.configurations[0]!, {}))
})

test("requires explicit opt-in", () => {
  codeOf(() => assertLiveEvaluationOptIn({}))
  codeOf(() => assertLiveEvaluationOptIn({ BOUND_LEDGER_LIVE_EVAL: "true" }))
  assert.doesNotThrow(() =>
    assertLiveEvaluationOptIn({ BOUND_LEDGER_LIVE_EVAL: "1" }),
  )
})

test("accepts HTTPS remote and loopback local endpoints", () => {
  const remote = decodeModelConfigurationMatrixV1(matrix(compatible))
    .configurations[0]!
  const localConfiguration = decodeModelConfigurationMatrixV1(matrix(local))
    .configurations[0]!
  assert.equal(
    resolveModelConfigurationV1(remote, {
      BOUND_LEDGER_MODEL_BASE_URL: "https://models.example.test/v1",
      BOUND_LEDGER_MODEL_API_KEY: "remote-key",
    }).baseUrl,
    "https://models.example.test/v1",
  )
  assert.equal(
    resolveModelConfigurationV1(localConfiguration, {
      BOUND_LEDGER_MODEL_BASE_URL: "http://127.0.0.1:11434/v1",
    }).baseUrl,
    "http://127.0.0.1:11434/v1",
  )
  assert.equal(
    resolveModelConfigurationV1(localConfiguration, {
      BOUND_LEDGER_MODEL_BASE_URL: "http://[::1]:8080/v1",
    }).baseUrl,
    "http://[::1]:8080/v1",
  )
})

test("rejects remote HTTP, non-loopback local, URL credentials, and malformed URLs", () => {
  const remote = decodeModelConfigurationMatrixV1(matrix(compatible))
    .configurations[0]!
  const localConfiguration = decodeModelConfigurationMatrixV1(matrix(local))
    .configurations[0]!
  for (const baseUrl of [
    "http://models.example.test/v1",
    "https://user:pass@models.example.test/v1",
    "not-a-url",
  ]) {
    codeOf(() =>
      resolveModelConfigurationV1(remote, {
        BOUND_LEDGER_MODEL_BASE_URL: baseUrl,
        BOUND_LEDGER_MODEL_API_KEY: "remote-key",
      }),
    )
  }
  codeOf(() =>
    resolveModelConfigurationV1(localConfiguration, {
      BOUND_LEDGER_MODEL_BASE_URL: "http://192.168.1.5:11434/v1",
    }),
  )
})

test("configuration errors contain only fixed sanitized codes", () => {
  const decoded = decodeModelConfigurationMatrixV1(matrix(compatible))
    .configurations[0]!
  const secret = "top-secret-eval-key"
  const endpoint = "http://private.example.test/v1"
  assert.throws(
    () =>
      resolveModelConfigurationV1(decoded, {
        BOUND_LEDGER_MODEL_BASE_URL: endpoint,
        BOUND_LEDGER_MODEL_API_KEY: secret,
      }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, "endpoint_policy_rejected")
      assert.ok(!error.message.includes(secret))
      assert.ok(!error.message.includes(endpoint))
      return true
    },
  )
})
