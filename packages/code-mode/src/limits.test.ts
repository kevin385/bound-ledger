import { describe, expect, it } from "vitest"

import {
  CODE_MODE_DEFAULT_LIMITS,
  resolveCodeModeLimits,
  type CodeModeLimits,
} from "./limits.ts"

const invalidLimits: ReadonlyArray<{
  readonly setting: keyof CodeModeLimits
  readonly value: number
}> = [
  { setting: "capabilityCalls", value: Number.NaN },
  { setting: "memoryBytes", value: Number.POSITIVE_INFINITY },
  { setting: "mutationCalls", value: Number.NEGATIVE_INFINITY },
  { setting: "programBytes", value: -1 },
  { setting: "recursionDepth", value: 1.5 },
  { setting: "resultBytes", value: 0 },
  { setting: "stackBytes", value: 0 },
  { setting: "runtimeMilliseconds", value: 0 },
  { setting: "wallClockMilliseconds", value: 2_147_483_648 },
]

describe("resolveCodeModeLimits", () => {
  it("returns the documented defaults without sharing mutable state", () => {
    const first = resolveCodeModeLimits(undefined)
    const second = resolveCodeModeLimits(undefined)

    expect(first).toEqual(CODE_MODE_DEFAULT_LIMITS)
    expect(second).toEqual(CODE_MODE_DEFAULT_LIMITS)
    expect(first).not.toBe(second)
  })

  it("preserves zero as a valid call, mutation, and recursion budget", () => {
    expect(
      resolveCodeModeLimits({
        capabilityCalls: 0,
        mutationCalls: 0,
        recursionDepth: 0,
      }),
    ).toMatchObject({
      capabilityCalls: 0,
      mutationCalls: 0,
      recursionDepth: 0,
    })
  })

  it.each(invalidLimits)(
    "rejects invalid $setting configuration before execution",
    ({ setting, value }) => {
      expect(() =>
        resolveCodeModeLimits({ [setting]: value }),
      ).toThrowError(
        expect.objectContaining({
          _tag: "CodeModeConfigurationError",
          setting,
          value,
        }),
      )
    },
  )
})
