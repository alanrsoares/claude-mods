import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { checksFirst, rules } from './rules'

const dirty = atom({ plugin: 'verify-gate', key: 'dirty' } as const, null)
const fresh = atom({ plugin: 'verify-gate', key: 'fresh' } as const, false)

const commandOf = (input: unknown): string => {
  const command = (input as { command?: unknown } | null)?.command
  return typeof command === 'string' ? command : ''
}

export const register: Register = (on, options) => {
  const r = rules(options)

  // Count an edit only once it lands: a denied or failed edit changed nothing.
  on('tool.call', async ($, e, next) => {
    const out = await next(e)
    if (out.deny !== undefined || out.isError) return out
    const path = e.tool === 'Edit' || e.tool === 'Write' ? e.file_path : e.tool === 'NotebookEdit' ? e.notebook_path : null
    if (path !== null && r.watch.test(path)) {
      await update($, dirty, () => path)
      await update($, fresh, () => true)
    } else if (e.tool === 'Bash' && r.check.test(e.command)) await update($, dirty, () => null)
    return out
  }).catch((_$, e, next) => next(e))

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const command = commandOf(e.input)
    if (!r.ship.test(command) || checksFirst(command, r)) return next(e)
    const path = await read($, dirty)
    return path === null
      ? next(e)
      : { decision: 'ask', reason: `${path} changed after the last passing check. Run the check first.` }
  }).catch(() => ({ decision: 'ask', reason: 'verify-gate failed. Confirm this command.' }))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || !(await read($, fresh))) return done
    await update($, fresh, () => false)
    const path = await read($, dirty)
    return path === null ? done : { ...done, text: `${done.text}\n\n⚠ Code changed (${path}) and no check passed since.` }
  }).catch((_$, e, next) => next(e))
}
