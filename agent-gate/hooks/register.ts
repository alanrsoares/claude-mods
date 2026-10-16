import type { Register } from 'claude-code'

const reason = 'Subagents need explicit permission every time: say what each would do first.'

export const register: Register = on => {
  on('tool.check', { tool: 'Agent' }, () => ({ decision: 'ask', reason })).catch(() => ({
    decision: 'ask',
    reason,
  }))
}
