import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LayaLogEntry } from '../types'
import {
  agentDefaults,
  DEFAULT_URL,
  line,
  LOG_MAX,
  parse,
  QUESTIONS,
  report,
  route,
  status,
  tier,
  tierName,
  timeoutMs,
} from './lib'

const last = atom({ plugin: 'laya-router', key: 'last' } as const, null)
const pending = atom({ plugin: 'laya-router', key: 'pending' } as const, null)
const turn = atom({ plugin: 'laya-router', key: 'turn' } as const, null)

export const register: Register = (on, options) => {
  const isRouting = options.route === true
  const maxMessages = typeof options.routeMaxMessages === 'number' ? options.routeMaxMessages : 40

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'laya', description: 'Show how laya rated your prompts and which models ran' })
    return next(e)
  })

  on('command.run', { command: 'laya' }, async $ => ({
    text: report(((await $.store.get('log')) as LayaLogEntry[] | undefined) ?? []),
  }))

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || !e.text.trim()) return next(e)
    const url = (await $.env.get('LAYA_URL')) ?? DEFAULT_URL
    const ms = timeoutMs(await $.env.get('LAYA_TIMEOUT_MS'))
    // $.http.fetch takes no timeout and $ calls do not count against the hook budget.
    const res = await Promise.race([
      $.http
        .fetch(`${url}/v1/systemone`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ state: { request: e.text }, questions: QUESTIONS }),
        })
        .catch(() => null),
      $.clock.sleep(ms, { signal: next.signal }).then(
        () => null,
        () => null,
      ),
    ])
    const rating = res?.ok ? parse(res.text) : null
    if (!rating) return next(e)
    await update($, last, () => rating)
    // A prompt delivered into a running turn starts no turn of its own.
    if (e.turnId === undefined) await update($, pending, () => rating)
    $.ui.status(status(rating))
    return next({ ...e, context: [...(e.context ?? []), line(rating)] })
  }).catch((_$, e, next) => next(e))

  // A main turn started by a prompt takes that prompt's rating; a continuation takes none.
  on('turn.start', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined) return out
    const rating = e.text.trim() ? await read($, pending) : null
    await update($, pending, () => null)
    await update($, turn, () => (rating ? { turnId: e.turnId, rating } : null))
    return out
  }).catch((_$, e, next) => next(e))

  // The route is chosen at the turn's first request and kept for its tool steps: one turn, one model.
  on('turn.step', async function* ($, e, next) {
    let model: string | null = null
    try {
      const t = e.agentId === undefined ? await read($, turn) : null
      if (t && t.turnId === e.turnId) {
        if (t.route === undefined) {
          const suggested = tier(t.rating)
          model = isRouting ? route(e.model, suggested, e.messageCount, maxMessages) : null
          await update($, turn, now => (now?.turnId === t.turnId ? { ...now, route: model } : now))
          if (model) $.ui.status(status(t.rating, model))
          const entry: LayaLogEntry = {
            ...t.rating,
            at: Date.now(),
            tier: tierName(suggested),
            model: model ?? e.model,
            routed: model !== null,
          }
          // shortcut: read-modify-write; two sessions logging at once can drop one entry.
          const log = ((await $.store.get('log')) as LayaLogEntry[] | undefined) ?? []
          await $.store.set('log', [...log, entry].slice(-LOG_MAX))
        } else model = t.route
      }
    } catch {
      model = null
    }
    return yield* next(model ? { ...e, model } : e)
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.tool !== 'Agent') return next(e)
    const rating = await read($, last)
    const fill = rating ? agentDefaults(e, tier(rating)) : null
    return next(fill ? { ...e, model: fill.model, effort: e.effort ?? fill.effort } : e)
  }).catch((_$, e, next) => next(e))
}
