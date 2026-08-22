export interface ComparisonFactsView {
  readonly eventCount: number
  readonly expenseTotalMinor: number
  readonly trialBalanceZero: boolean
}

export interface ComparisonScoreView {
  readonly score: number
  readonly passed: number
  readonly total: number
}

export interface ComparisonAttemptView {
  readonly sequence: number
  readonly name: string
  readonly kind: "read"
  readonly authorization: "authorized"
  readonly outcome: "succeeded"
  readonly stage: "complete"
}

export interface ComparisonModeView {
  readonly mode: "tool" | "code"
  readonly label: string
  readonly finalAnswer: string
  readonly facts: ComparisonFactsView
  readonly metrics: {
    readonly outerModelTurns: number
    readonly outerToolCalls: number
    readonly innerCapabilityCalls: number
    readonly mutationCalls: number
    readonly durationMilliseconds: number
  }
  readonly correctness: ComparisonScoreView
  readonly safety: ComparisonScoreView
  readonly attempts: ReadonlyArray<ComparisonAttemptView>
}

export interface ComparisonView {
  readonly schemaVersion: 1
  readonly task: {
    readonly id: string
    readonly version: number
    readonly fixtureVersion: string
    readonly prompt: string
    readonly range: {
      readonly from: string
      readonly to: string
    }
    readonly expectedAnswer: string
  }
  readonly program: string
  readonly modes: {
    readonly tool: ComparisonModeView
    readonly code: ComparisonModeView
  }
  readonly comparison: {
    readonly passed: boolean
    readonly sameFacts: boolean
    readonly sameAttempts: boolean
    readonly sameScores: boolean
  }
  readonly timingNote: string
  readonly limitation: string
}

export type ComparisonServerResult =
  | { readonly ok: true; readonly data: ComparisonView }
  | { readonly ok: false; readonly error: { readonly code: "internal_error" } }
