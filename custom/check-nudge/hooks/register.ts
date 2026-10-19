import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const WEB = /(^|\/)apps\/web\//
const SHIP = /\b(git\s+commit|gh\s+pr\s+create)\b/
const CHECK = /\bbun run check\b/

const commandOf = (e: { input: unknown }) => {
  const command = (e.input as { command?: unknown } | null)?.command
  return typeof command === 'string' ? command : ''
}

const edited = atom({ plugin: 'check-nudge', key: 'edited' } as const, false)
const ran = atom({ plugin: 'check-nudge', key: 'ran' } as const, false)

export const register: Register = on => {
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    if (WEB.test(e.file_path)) await update($, edited, () => true)
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (WEB.test(e.file_path)) await update($, edited, () => true)
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (CHECK.test(e.command)) await update($, ran, () => true)
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const stale = SHIP.test(commandOf(e)) && (await read($, edited)) && !(await read($, ran))
    return stale ? { decision: 'ask', reason: 'apps/web edited this turn; bun run check not run yet.' } : next(e)
  }).catch(() => ({ decision: 'ask', reason: 'check-nudge failed. Confirm this command.' }))

  on('turn.complete', async ($, e, next) => {
    const isStale =
      e.reason === 'answer' &&
      e.agentId === undefined &&
      (await read($, edited)) &&
      !(await read($, ran))
    await update($, edited, () => false)
    await update($, ran, () => false)

    const done = await next(e)
    return isStale
      ? { ...done, text: `${done.text}\n\n⚠ apps/web edited this turn; bun run check not run.` }
      : done
  })
}
