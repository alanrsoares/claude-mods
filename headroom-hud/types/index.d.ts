export type Totals = { requests: number; tokensSaved: number; usdSaved: number }

export type Headroom = Totals & {
  isUp: boolean
  /** False when the proxy answered with a stats body this mod cannot read. */
  isReadable: boolean
  savingsPct: number
  cacheUsd: number
  /** Totals at this session's first successful poll; null until then. */
  base: Totals | null
}

declare module 'claude-code' {
  interface PluginState {
    'headroom-hud': {
      headroom: Headroom | null
      /** The 75% context toast fired and has not re-armed. */
      warned: boolean
      /** ANTHROPIC_BASE_URL answered, but not as headroom; polling stopped. */
      other: boolean
    }
  }
}
