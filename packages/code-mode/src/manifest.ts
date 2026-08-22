import type {
  CapabilityAgentAccess,
  CapabilityKind,
  CapabilityMetadata,
} from "@bound/capability"

import { CodeModeConfigurationError } from "./errors.ts"

export type CodeModeDiscoveryDetail = "summary" | "declaration"

export interface CodeModeManifestEntry {
  readonly name: string
  readonly kind: CapabilityKind
  readonly agentAccess: CapabilityAgentAccess
  readonly sdkPath: readonly [namespace: string, method: string]
  readonly call: string
  readonly declaration: string
}

export interface InstalledCodeModeCapability extends CodeModeManifestEntry {
  readonly description: string
}

export interface CodeModeDiscoveryInput {
  readonly query?: string
  readonly detail?: CodeModeDiscoveryDetail
}

export interface CodeModeCapabilitySummary {
  readonly name: string
  readonly description: string
  readonly kind: CapabilityKind
  readonly agentAccess: CapabilityAgentAccess
  readonly sdkPath: string
  readonly call: string
  readonly declaration?: string
}

const entry = (value: CodeModeManifestEntry): CodeModeManifestEntry =>
  Object.freeze({
    ...value,
    sdkPath: Object.freeze([...value.sdkPath]) as readonly [string, string],
  })

export const GENERAL_LEDGER_CODE_MODE_MANIFEST = Object.freeze([
  entry({
    name: "accounts.list",
    kind: "read",
    agentAccess: "direct",
    sdkPath: ["accounts", "list"],
    call: "yield* app.accounts.list({})",
    declaration: "accounts.list(input: {}): LedgerAccount[]",
  }),
  entry({
    name: "events.get",
    kind: "read",
    agentAccess: "direct",
    sdkPath: ["events", "get"],
    call: "yield* app.events.get({ eventId })",
    declaration: "events.get(input: { eventId: string }): FinancialEvent",
  }),
  entry({
    name: "events.query",
    kind: "read",
    agentAccess: "direct",
    sdkPath: ["events", "query"],
    call: "yield* app.events.query({ from?, to? })",
    declaration:
      "events.query(input: { from?: ISODateTime; to?: ISODateTime }): FinancialEvent[]",
  }),
  entry({
    name: "reports.balance",
    kind: "read",
    agentAccess: "direct",
    sdkPath: ["reports", "balance"],
    call: "yield* app.reports.balance({ at })",
    declaration:
      "reports.balance(input: { at: ISODateTime }): AccountBalance[]",
  }),
  entry({
    name: "reports.activity",
    kind: "read",
    agentAccess: "direct",
    sdkPath: ["reports", "activity"],
    call: "yield* app.reports.activity({ from, to })",
    declaration:
      "reports.activity(input: { from: ISODateTime; to: ISODateTime }): ActivityReport",
  }),
  entry({
    name: "reports.trial_balance",
    kind: "read",
    agentAccess: "direct",
    sdkPath: ["reports", "trialBalance"],
    call: "yield* app.reports.trialBalance({ at })",
    declaration:
      "reports.trialBalance(input: { at: ISODateTime }): TrialBalance",
  }),
  entry({
    name: "events.post",
    kind: "mutation",
    agentAccess: "confirmation_required",
    sdkPath: ["events", "post"],
    call: "yield* app.events.post(input)",
    declaration:
      "events.post(input: PostEventInput): ConfirmationRequired<FinancialEvent>",
  }),
  entry({
    name: "events.reverse",
    kind: "mutation",
    agentAccess: "confirmation_required",
    sdkPath: ["events", "reverse"],
    call: "yield* app.events.reverse(input)",
    declaration:
      "events.reverse(input: ReverseEventInput): ConfirmationRequired<FinancialEvent>",
  }),
] as const satisfies ReadonlyArray<CodeModeManifestEntry>)

const SAFE_SEGMENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"])

const configurationError = (
  message: string,
  value: unknown,
): CodeModeConfigurationError =>
  new CodeModeConfigurationError({
    setting: "manifest",
    value,
    message,
  })

export const resolveCodeModeManifest = (
  capabilities: ReadonlyArray<CapabilityMetadata>,
  manifest: ReadonlyArray<CodeModeManifestEntry> = GENERAL_LEDGER_CODE_MODE_MANIFEST,
): ReadonlyArray<InstalledCodeModeCapability> => {
  const names = new Set<string>()
  const paths = new Set<string>()
  const metadata = new Map(
    capabilities.map((capability) => [capability.name, capability]),
  )
  const installed: Array<InstalledCodeModeCapability> = []

  for (const candidate of manifest) {
    if (names.has(candidate.name)) {
      throw configurationError(
        `duplicate code-mode capability ${candidate.name}`,
        candidate.name,
      )
    }
    names.add(candidate.name)

    if (
      candidate.sdkPath.length !== 2 ||
      candidate.sdkPath.some(
        (segment) =>
          !SAFE_SEGMENT.test(segment) || FORBIDDEN_SEGMENTS.has(segment),
      )
    ) {
      throw configurationError(
        `invalid code-mode SDK path for ${candidate.name}`,
        candidate.sdkPath,
      )
    }

    const path = candidate.sdkPath.join(".")
    if (paths.has(path)) {
      throw configurationError(`duplicate code-mode SDK path ${path}`, path)
    }
    paths.add(path)

    const capability = metadata.get(candidate.name)
    if (capability === undefined) continue
    if (
      capability.kind !== candidate.kind ||
      capability.agentAccess !== candidate.agentAccess
    ) {
      throw configurationError(
        `gateway metadata does not match code-mode manifest for ${candidate.name}`,
        capability,
      )
    }

    installed.push(
      Object.freeze({
        ...candidate,
        description: capability.description,
      }),
    )
  }

  return Object.freeze(installed)
}

export const discoverCodeModeCapabilities = (
  capabilities: ReadonlyArray<InstalledCodeModeCapability>,
  input: CodeModeDiscoveryInput = {},
): ReadonlyArray<CodeModeCapabilitySummary> => {
  const query = input.query?.trim().toLowerCase()
  const detail = input.detail ?? "summary"

  return Object.freeze(
    capabilities
      .filter((capability) => {
        if (query === undefined || query.length === 0) return true
        return `${capability.name} ${capability.description} ${capability.sdkPath.join(".")}`
          .toLowerCase()
          .includes(query)
      })
      .map((capability) =>
        Object.freeze({
          name: capability.name,
          description: capability.description,
          kind: capability.kind,
          agentAccess: capability.agentAccess,
          sdkPath: `app.${capability.sdkPath.join(".")}`,
          call: capability.call,
          ...(detail === "declaration"
            ? { declaration: capability.declaration }
            : {}),
        }),
      ),
  )
}

export const buildGuestSdkSource = (
  capabilities: ReadonlyArray<InstalledCodeModeCapability>,
): string => {
  const namespaces = new Map<string, Array<InstalledCodeModeCapability>>()

  for (const capability of capabilities) {
    const [namespace] = capability.sdkPath
    const entries = namespaces.get(namespace) ?? []
    entries.push(capability)
    namespaces.set(namespace, entries)
  }

  const namespaceSource = [...namespaces.entries()]
    .map(([namespace, entries]) => {
      const methods = entries
        .map((capability) => {
          const method = capability.sdkPath[1]
          return `${JSON.stringify(method)}: function* (input) { return yield* __call(${JSON.stringify(capability.name)}, input); }`
        })
        .join(",")
      return `${JSON.stringify(namespace)}: __freeze({${methods}})`
    })
    .join(",")

  return `__freeze({${namespaceSource}})`
}
