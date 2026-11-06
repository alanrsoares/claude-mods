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
  interface McpToolInputs {
    'mcp__headroom-hud__compact': { keep: string }
  }

  interface PluginState {
    'headroom-hud': {
      headroom: Headroom | null
      /** The 75% context toast fired and has not re-armed. */
      warned: boolean
      /** Context crossed 75% and the model has yet to hear it. */
      nudge: boolean
      /** What the model asked a compaction to keep; it runs once the turn ends. */
      queued: string | null
      /** The person closed the side pane; it stays closed until `/hud` opens it. */
      dismissed: boolean
      /** ANTHROPIC_BASE_URL answered, but not as headroom; polling stopped. */
      other: boolean
    }
  }
}
