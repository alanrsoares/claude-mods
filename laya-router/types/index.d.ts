/** One prompt as laya rated it. */
export type LayaRating = { difficulty: number; domain: string; sensitive: boolean }

/** The main-loop turn a rating belongs to. `route` is unset until the turn's first model request. */
export type LayaTurn = { turnId: string; rating: LayaRating; route?: string | null }

/** One rated turn, kept in `$.store` under `log` for `/laya`. */
export type LayaLogEntry = LayaRating & { at: number; tier: string; model: string; routed: boolean }

declare module 'claude-code' {
  interface PluginState {
    'laya-router': {
      /** The last prompt's rating, for Agent calls. */
      last: LayaRating | null
      /** A rating no turn has taken yet. */
      pending: LayaRating | null
      /** The running main turn and its rating. */
      turn: LayaTurn | null
    }
  }
}
