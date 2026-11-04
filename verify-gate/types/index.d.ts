/** The last watched path edited since the last passing check, or null when verified. */
export type VerifyGateDirty = string | null
/** True when a watched edit happened since the last end-of-turn warning. */
export type VerifyGateFresh = boolean

declare module 'claude-code' {
  interface PluginState {
    'verify-gate': { dirty: VerifyGateDirty; fresh: VerifyGateFresh }
  }
}
