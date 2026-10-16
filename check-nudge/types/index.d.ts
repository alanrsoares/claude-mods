export type CheckNudgeFlag = boolean

declare module 'claude-code' {
  interface PluginState {
    'check-nudge': { edited: CheckNudgeFlag; ran: CheckNudgeFlag }
  }
}
