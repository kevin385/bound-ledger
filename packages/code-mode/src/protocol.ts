export interface RuntimeLimits {
  readonly memoryBytes: number
  readonly resultBytes: number
  readonly stackBytes: number
  readonly runtimeMilliseconds: number
}

export type ParentMessage =
  | {
      readonly type: "start"
      readonly program: string
      readonly limits: RuntimeLimits
    }
  | {
      readonly type: "response"
      readonly id: number
      readonly response:
        | { readonly ok: true; readonly value: unknown }
        | {
            readonly ok: false
            readonly error: { readonly tag: string; readonly message: string }
          }
    }

export type WorkerMessage =
  | {
      readonly type: "request"
      readonly id: number
      readonly serialized: string
    }
  | { readonly type: "result"; readonly serialized: string }
  | {
      readonly type: "error"
      readonly kind: "limit" | "program" | "protocol"
      readonly limit?: "memory" | "result_size" | "stack" | "wall_clock"
      readonly message: string
    }

export interface CapabilityRequest {
  readonly type: "capability_request"
  readonly name: string
  readonly input: unknown
}

export const byteLength = (value: string): number =>
  Buffer.byteLength(value, "utf8")

export const isWorkerMessage = (value: unknown): value is WorkerMessage => {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false
  }

  const record = value as Record<string, unknown>
  if (record.type === "request") {
    return typeof record.id === "number" && typeof record.serialized === "string"
  }
  if (record.type === "result") return typeof record.serialized === "string"
  if (record.type !== "error") return false
  return (
    (record.kind === "limit" ||
      record.kind === "program" ||
      record.kind === "protocol") &&
    typeof record.message === "string" &&
    (record.limit === undefined ||
      record.limit === "memory" ||
      record.limit === "result_size" ||
      record.limit === "stack" ||
      record.limit === "wall_clock")
  )
}

export const parseCapabilityRequest = (
  serialized: string,
): CapabilityRequest | undefined => {
  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    return undefined
  }

  if (
    typeof value !== "object" ||
    value === null ||
    (value as { readonly type?: unknown }).type !== "capability_request" ||
    typeof (value as { readonly name?: unknown }).name !== "string" ||
    !("input" in value)
  ) {
    return undefined
  }

  return value as CapabilityRequest
}
