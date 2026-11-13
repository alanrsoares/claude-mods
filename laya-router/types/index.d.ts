/** One prompt as laya rated it. */
export type LayaRating = { difficulty: number; domain: string; sensitive: boolean }

/** A rated prompt: `applied` is false for a holdout prompt, which gets no Agent fill, route or lower effort. */
export type LayaPrompt = LayaRating & { applied: boolean; latencyMs: number }

/** The main-loop turn a rating belongs to. `route`, `effort` and `model` are unset until the turn's first model request. */
export type LayaTurn = {
  turnId: string
  rating: LayaPrompt
  route?: string | null
  effort?: 'low' | 'medium' | null
  model?: string
  steps: number
  agentFills: number
}

/** What a rated turn did, to check the rating against. Entries logged before 0.3 lack it. */
export type LayaOutcome = {
  applied: boolean
  latencyMs: number
  steps: number
  outputTokens: number
  durationMs: number
  aborted: boolean
  agentFills: number
  /** The lowered effort the turn ran at; absent when it kept the session's. */
  effort?: string
}

/** One rated turn, kept in `$.store` under `log` for `/laya`. */
export type LayaLogEntry = LayaRating & { at: number; tier: string; model: string; routed: boolean } & Partial<LayaOutcome>

declare module 'claude-code' {
  interface PluginState {
    'laya-router': {
      /** The last prompt's rating, for Agent calls. */
      last: LayaPrompt | null
      /** A rating no turn has taken yet. */
      pending: LayaPrompt | null
      /** The running main turn and its rating. */
      turn: LayaTurn | null
    }
  }
}
