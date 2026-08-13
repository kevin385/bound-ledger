import { Data } from "effect"

export type CodeModeLimit =
  | "capability_calls"
  | "memory"
  | "mutation_calls"
  | "program_size"
  | "recursion"
  | "result_size"
  | "stack"
  | "wall_clock"

export type CodeModeLimitSetting =
  | "capabilityCalls"
  | "memoryBytes"
  | "mutationCalls"
  | "programBytes"
  | "recursionDepth"
  | "resultBytes"
  | "stackBytes"
  | "runtimeMilliseconds"
  | "wallClockMilliseconds"

export class CodeModeAbortedError extends Data.TaggedError(
  "CodeModeAbortedError",
)<{ readonly message: string }> {}

export class CodeModeConfigurationError extends Data.TaggedError(
  "CodeModeConfigurationError",
)<{
  readonly setting: CodeModeLimitSetting
  readonly value: unknown
  readonly message: string
}> {}

export class CodeModeLimitError extends Data.TaggedError(
  "CodeModeLimitError",
)<{
  readonly limit: CodeModeLimit
  readonly maximum: number
  readonly message: string
}> {}

export class CodeModeProgramError extends Data.TaggedError(
  "CodeModeProgramError",
)<{ readonly message: string }> {}

export class CodeModeProtocolError extends Data.TaggedError(
  "CodeModeProtocolError",
)<{ readonly message: string }> {}

export type CodeModeError =
  | CodeModeAbortedError
  | CodeModeConfigurationError
  | CodeModeLimitError
  | CodeModeProgramError
  | CodeModeProtocolError
