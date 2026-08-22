import { describe, expect, it } from "vitest"

import { generalLedgerCapabilities } from "@bound/capability"

import {
  buildGuestSdkSource,
  discoverCodeModeCapabilities,
  GENERAL_LEDGER_CODE_MODE_MANIFEST,
  resolveCodeModeManifest,
  type CodeModeManifestEntry,
} from "./manifest.ts"

const metadata = generalLedgerCapabilities.map((capability) => ({
  name: capability.name,
  description: capability.description,
  kind: capability.kind,
  agentAccess: capability.agentAccess,
}))

describe("general-ledger code-mode manifest", () => {
  it("installs the exact eight-operation catalog", () => {
    const installed = resolveCodeModeManifest(metadata)

    expect(installed.map((capability) => capability.name)).toEqual([
      "accounts.list",
      "events.get",
      "events.query",
      "reports.balance",
      "reports.activity",
      "reports.trial_balance",
      "events.post",
      "events.reverse",
    ])
    expect(installed.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(installed)).toBe(true)
  })

  it("filters unavailable capabilities and returns progressive detail", () => {
    const installed = resolveCodeModeManifest([
      metadata.find((capability) => capability.name === "events.query")!,
      metadata.find((capability) => capability.name === "events.post")!,
    ])

    expect(
      discoverCodeModeCapabilities(installed, { query: "events" }),
    ).toEqual([
      {
        name: "events.query",
        description:
          "Query readable posted events in an optional half-open effective-time range",
        kind: "read",
        agentAccess: "direct",
        sdkPath: "app.events.query",
        call: "yield* app.events.query({ from?, to? })",
      },
      {
        name: "events.post",
        description: "Post one approved balanced financial event",
        kind: "mutation",
        agentAccess: "confirmation_required",
        sdkPath: "app.events.post",
        call: "yield* app.events.post(input)",
      },
    ])
    expect(
      discoverCodeModeCapabilities(installed, {
        query: "balanced",
        detail: "declaration",
      }),
    ).toEqual([
      expect.objectContaining({
        name: "events.post",
        declaration:
          "events.post(input: PostEventInput): ConfirmationRequired<FinancialEvent>",
      }),
    ])
  })

  it("builds one proxy with no legacy transaction namespace", () => {
    const source = buildGuestSdkSource(resolveCodeModeManifest(metadata))

    expect(source).toContain('"events"')
    expect(source).toContain('"trialBalance"')
    expect(source).toContain('"reports.trial_balance"')
    expect(source).not.toContain("transactions")
    expect(source).not.toContain("confirm")
    expect(source).not.toContain("reject")
  })

  it("rejects duplicate names, duplicate paths, invalid paths, and kind drift", () => {
    const first = GENERAL_LEDGER_CODE_MODE_MANIFEST[0]
    const duplicateName = [
      first,
      { ...first, sdkPath: ["accounts", "other"] as const },
    ]
    const duplicatePath = [
      first,
      { ...GENERAL_LEDGER_CODE_MODE_MANIFEST[1], sdkPath: first.sdkPath },
    ]
    const invalidPath = [
      { ...first, sdkPath: ["__proto__", "list"] },
    ] satisfies ReadonlyArray<CodeModeManifestEntry>
    const driftedMetadata = metadata.map((capability) =>
      capability.name === first.name
        ? { ...capability, kind: "mutation" as const }
        : capability,
    )

    expect(() => resolveCodeModeManifest(metadata, duplicateName)).toThrow(
      /duplicate code-mode capability/,
    )
    expect(() => resolveCodeModeManifest(metadata, duplicatePath)).toThrow(
      /duplicate code-mode SDK path/,
    )
    expect(() => resolveCodeModeManifest(metadata, invalidPath)).toThrow(
      /invalid code-mode SDK path/,
    )
    expect(() => resolveCodeModeManifest(driftedMetadata)).toThrow(
      /gateway metadata does not match/,
    )
  })
})
