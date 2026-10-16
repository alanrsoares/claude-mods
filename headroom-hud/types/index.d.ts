export type Totals = { requests: number; tokensSaved: number; usdSaved: number }

export type Headroom = Totals & {
  isUp: boolean
  savingsPct: number
  cacheUsd: number
  /** Totals at this session's first successful poll; null until then. */
  base: Totals | null
}

declare module 'claude-code' {
  interface PluginState {
    'headroom': { headroom: Headroom | null }
  }
}
