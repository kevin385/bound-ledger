import { readFile } from "node:fs/promises"

export type ModelEndpointKind = "native" | "openai_compatible" | "local"

export interface ModelConfigurationV1 {
  readonly id: string
  readonly provider: string
  readonly model: string
  readonly endpointKind: ModelEndpointKind
  readonly supportsTools: boolean
  readonly supportsCodeMode: boolean
  readonly baseUrlEnvironmentVariable?: string
  readonly apiKeyEnvironmentVariable?: string
}

export interface ModelConfigurationMatrixV1 {
  readonly schemaVersion: 1
  readonly configurations: ReadonlyArray<ModelConfigurationV1>
}

export interface ResolvedModelConfigurationV1 {
  readonly configuration: ModelConfigurationV1
  readonly baseUrl?: string
  readonly apiKey?: string
}

export const LIVE_EVALUATION_OPT_IN = "BOUND_LEDGER_LIVE_EVAL"

export const ALLOWED_MODEL_ENVIRONMENT_VARIABLES = Object.freeze([
  "ANTHROPIC_API_KEY",
  "BOUND_LEDGER_MODEL_API_KEY",
  "BOUND_LEDGER_MODEL_BASE_URL",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
] as const)

const allowedEnvironmentVariables = new Set<string>(
  ALLOWED_MODEL_ENVIRONMENT_VARIABLES,
)
const endpointKinds = new Set<ModelEndpointKind>([
  "native",
  "openai_compatible",
  "local",
])
const matrixKeys = new Set(["schemaVersion", "configurations"])
const configurationKeys = new Set([
  "id",
  "provider",
  "model",
  "endpointKind",
  "supportsTools",
  "supportsCodeMode",
  "baseUrlEnvironmentVariable",
  "apiKeyEnvironmentVariable",
])
const safeLabel = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/
const safeEnvironmentVariable = /^[A-Z][A-Z0-9_]{0,127}$/

export type ModelConfigurationErrorCode =
  | "malformed_configuration"
  | "unsupported_environment_variable"
  | "live_evaluation_not_enabled"
  | "missing_environment_data"
  | "endpoint_policy_rejected"

export class ModelConfigurationError extends Error {
  override readonly name = "ModelConfigurationError"
  readonly code: ModelConfigurationErrorCode

  constructor(code: ModelConfigurationErrorCode) {
    super(code)
    this.code = code
  }
}

const fail = (code: ModelConfigurationErrorCode): never => {
  throw new ModelConfigurationError(code)
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("malformed_configuration")
  }
  return value as Record<string, unknown>
}

const hasOnlyKeys = (value: Record<string, unknown>, keys: Set<string>) =>
  Object.keys(value).every((key) => keys.has(key))

const requiredLabel = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !safeLabel.test(value) ||
    value.includes("://")
  ) {
    return fail("malformed_configuration")
  }
  return value
}

const requiredBoolean = (value: unknown): boolean => {
  if (typeof value !== "boolean") return fail("malformed_configuration")
  return value
}

const optionalEnvironmentVariable = (value: unknown): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !safeEnvironmentVariable.test(value)) {
    return fail("malformed_configuration")
  }
  if (!allowedEnvironmentVariables.has(value)) {
    return fail("unsupported_environment_variable")
  }
  return value
}

const decodeConfiguration = (value: unknown): ModelConfigurationV1 => {
  const record = asRecord(value)
  if (!hasOnlyKeys(record, configurationKeys)) {
    return fail("malformed_configuration")
  }

  const endpointKind = record.endpointKind
  if (
    typeof endpointKind !== "string" ||
    !endpointKinds.has(endpointKind as ModelEndpointKind)
  ) {
    return fail("malformed_configuration")
  }

  const supportsTools = requiredBoolean(record.supportsTools)
  const supportsCodeMode = requiredBoolean(record.supportsCodeMode)
  const baseUrlEnvironmentVariable = optionalEnvironmentVariable(
    record.baseUrlEnvironmentVariable,
  )
  const apiKeyEnvironmentVariable = optionalEnvironmentVariable(
    record.apiKeyEnvironmentVariable,
  )

  if (supportsCodeMode && !supportsTools) {
    return fail("malformed_configuration")
  }
  if (endpointKind === "native" && baseUrlEnvironmentVariable !== undefined) {
    return fail("malformed_configuration")
  }
  if (endpointKind !== "native" && baseUrlEnvironmentVariable === undefined) {
    return fail("malformed_configuration")
  }
  if (endpointKind !== "local" && apiKeyEnvironmentVariable === undefined) {
    return fail("malformed_configuration")
  }

  return Object.freeze({
    id: requiredLabel(record.id),
    provider: requiredLabel(record.provider),
    model: requiredLabel(record.model),
    endpointKind: endpointKind as ModelEndpointKind,
    supportsTools,
    supportsCodeMode,
    ...(baseUrlEnvironmentVariable === undefined
      ? {}
      : { baseUrlEnvironmentVariable }),
    ...(apiKeyEnvironmentVariable === undefined
      ? {}
      : { apiKeyEnvironmentVariable }),
  })
}

export const decodeModelConfigurationMatrixV1 = (
  value: unknown,
): ModelConfigurationMatrixV1 => {
  const record = asRecord(value)
  if (
    !hasOnlyKeys(record, matrixKeys) ||
    record.schemaVersion !== 1 ||
    !Array.isArray(record.configurations) ||
    record.configurations.length === 0
  ) {
    return fail("malformed_configuration")
  }
  const configurations = record.configurations.map(decodeConfiguration)
  if (new Set(configurations.map(({ id }) => id)).size !== configurations.length) {
    return fail("malformed_configuration")
  }
  return Object.freeze({
    schemaVersion: 1,
    configurations: Object.freeze(configurations),
  })
}

export const readModelConfigurationMatrixV1 = async (
  path: string,
): Promise<ModelConfigurationMatrixV1> => {
  try {
    return decodeModelConfigurationMatrixV1(
      JSON.parse(await readFile(path, "utf8")) as unknown,
    )
  } catch (error) {
    if (error instanceof ModelConfigurationError) throw error
    return fail("malformed_configuration")
  }
}

export const assertLiveEvaluationOptIn = (
  environment: Readonly<Record<string, string | undefined>>,
): void => {
  if (environment[LIVE_EVALUATION_OPT_IN] !== "1") {
    return fail("live_evaluation_not_enabled")
  }
}

const resolveEnvironmentVariable = (
  name: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  if (name === undefined) return undefined
  if (!allowedEnvironmentVariables.has(name)) {
    return fail("unsupported_environment_variable")
  }
  const value = environment[name]
  if (value === undefined || value.length === 0) {
    return fail("missing_environment_data")
  }
  return value
}

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1"

const validateEndpoint = (
  endpointKind: ModelEndpointKind,
  rawUrl: string | undefined,
): string | undefined => {
  if (endpointKind === "native") return undefined
  if (rawUrl === undefined) return fail("missing_environment_data")
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return fail("endpoint_policy_rejected")
  }
  if (url.username !== "" || url.password !== "") {
    return fail("endpoint_policy_rejected")
  }
  if (endpointKind === "openai_compatible") {
    if (url.protocol !== "https:") return fail("endpoint_policy_rejected")
  } else if (
    !isLoopbackHost(url.hostname) ||
    (url.protocol !== "http:" && url.protocol !== "https:")
  ) {
    return fail("endpoint_policy_rejected")
  }
  return url.toString().replace(/\/$/, "")
}

export const resolveModelConfigurationV1 = (
  configuration: ModelConfigurationV1,
  environment: Readonly<Record<string, string | undefined>>,
): ResolvedModelConfigurationV1 => {
  const baseUrl = validateEndpoint(
    configuration.endpointKind,
    resolveEnvironmentVariable(
      configuration.baseUrlEnvironmentVariable,
      environment,
    ),
  )
  const apiKey = resolveEnvironmentVariable(
    configuration.apiKeyEnvironmentVariable,
    environment,
  )
  return Object.freeze({
    configuration,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(apiKey === undefined ? {} : { apiKey }),
  })
}
