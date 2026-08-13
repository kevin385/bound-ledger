import {
  CodeModeConfigurationError,
  type CodeModeLimitSetting,
} from "./errors.ts"

export type CodeModeLimits = {
  readonly [Setting in CodeModeLimitSetting]?: number
}

export type ResolvedCodeModeLimits = {
  readonly [Setting in CodeModeLimitSetting]: number
}

export const CODE_MODE_DEFAULT_LIMITS = Object.freeze({
  capabilityCalls: 8,
  memoryBytes: 16 * 1024 * 1024,
  mutationCalls: 1,
  programBytes: 64 * 1024,
  recursionDepth: 1,
  resultBytes: 64 * 1024,
  stackBytes: 512 * 1024,
  runtimeMilliseconds: 1_000,
  wallClockMilliseconds: 2_000,
} as const satisfies ResolvedCodeModeLimits)

const CODE_MODE_LIMIT_SETTINGS = [
  "capabilityCalls",
  "memoryBytes",
  "mutationCalls",
  "programBytes",
  "recursionDepth",
  "resultBytes",
  "stackBytes",
  "runtimeMilliseconds",
  "wallClockMilliseconds",
] as const satisfies ReadonlyArray<CodeModeLimitSetting>

const ZERO_ALLOWED_SETTINGS = new Set<CodeModeLimitSetting>([
  "capabilityCalls",
  "mutationCalls",
  "recursionDepth",
])

// Node clamps larger timer delays, and the sandbox boundary has no useful
// resource-limit semantics above a signed 32-bit quantity.
const MAXIMUM_LIMIT_VALUE = 2_147_483_647

const invalidLimit = (
  setting: CodeModeLimitSetting,
  value: unknown,
  minimum: number,
): CodeModeConfigurationError =>
  new CodeModeConfigurationError({
    setting,
    value,
    message:
      `${setting} must be a safe integer from ${minimum} through ` +
      `${MAXIMUM_LIMIT_VALUE}`,
  })

export const resolveCodeModeLimits = (
  limits: CodeModeLimits | undefined,
): ResolvedCodeModeLimits => {
  const resolved: Record<CodeModeLimitSetting, number> = {
    ...CODE_MODE_DEFAULT_LIMITS,
  }

  for (const setting of CODE_MODE_LIMIT_SETTINGS) {
    const configured = limits?.[setting]
    if (configured === undefined) continue

    const minimum = ZERO_ALLOWED_SETTINGS.has(setting) ? 0 : 1
    if (
      !Number.isSafeInteger(configured) ||
      configured < minimum ||
      configured > MAXIMUM_LIMIT_VALUE
    ) {
      throw invalidLimit(setting, configured, minimum)
    }
    resolved[setting] = configured
  }

  return resolved
}
