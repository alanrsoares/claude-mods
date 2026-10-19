import type { Register } from 'claude-code'

import { redirectFor, stripCd } from './rules'

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = stripCd(e.command, await $.session.cwd())
    return next(command === e.command ? e : { ...e, command })
  })

  on('tool.check', { tool: 'Bash' }, (_$, e, next) => {
    const command = (e.input as { command?: unknown } | null)?.command
    const reason = typeof command === 'string' ? redirectFor(command) : undefined
    return reason ? { decision: 'ask', reason } : next(e)
  })
}
