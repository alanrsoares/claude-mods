import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LayaLogEntry, LayaPrompt } from '../types'
import {
  agentDefaults,
  DEFAULT_URL,
  holdout,
  LOG_MAX,
  lowerEffort,
  parse,
  perMessageEffort,
  QUESTIONS,
  report,
  resolvesAliases,
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
  const share = holdout(options.holdout)
  const isLoweringEffort = options.lowerEffort === true

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'laya', description: 'Show how laya rated your prompts and which models ran' })
    return next(e)
  })

  on('command.run', { command: 'laya' }, async $ => ({
    text: report(
      ((await $.store.get('log')) as LayaLogEntry[] | undefined) ?? [],
      ((await $.store.get('misses')) as number | undefined) ?? 0,
    ),
  }))

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || !e.text.trim()) return next(e)
    const url = (await $.env.get('LAYA_URL')) ?? DEFAULT_URL
    const ms = timeoutMs(await $.env.get('LAYA_TIMEOUT_MS'))
    const started = Date.now()
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
    const rated = res?.ok ? parse(res.text) : null
    if (!rated) {
      // An unrated prompt must not inherit the previous prompt's tier.
      await update($, last, () => null)
      if (e.turnId === undefined) await update($, pending, () => null)
      try {
        await $.store.set('misses', (((await $.store.get('misses')) as number | undefined) ?? 0) + 1)
      } catch {}
      return next(e)
    }
    const rating: LayaPrompt = { ...rated, applied: Math.random() >= share, latencyMs: Date.now() - started }
    await update($, last, () => rating)
    // A prompt delivered into a running turn starts no turn of its own.
    if (e.turnId === undefined) await update($, pending, () => rating)
    $.ui.status(status(rating, { holdout: !rating.applied }))
    return next(e)
  }).catch((_$, e, next) => next(e))

  // A main turn started by a prompt takes that prompt's rating; a continuation takes none.
  on('turn.start', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined) return out
    const rating = e.text.trim() ? await read($, pending) : null
    await update($, pending, () => null)
    await update($, turn, () => (rating ? { turnId: e.turnId, rating, steps: 0, agentFills: 0 } : null))
    return out
  }).catch((_$, e, next) => next(e))

  // Route and effort are chosen at the turn's first request and kept for its tool steps: one turn, one model.
  // They are applied only once saved, so no later failure can split a turn across models.
  on('turn.step', async function* ($, e, next) {
    let model: string | null = null
    let effort: 'low' | 'medium' | null = null
    try {
      const t = e.agentId === undefined ? await read($, turn) : null
      if (t && t.turnId === e.turnId) {
        if (t.route !== undefined) {
          model = t.route
          effort = t.effort ?? null
        } else {
          const { applied } = t.rating
          const canRoute =
            isRouting && applied && (await $.session.version().then(v => resolvesAliases(v.version), () => false))
          const chosen = canRoute ? route(e.model, tier(t.rating), e.messageCount, maxMessages) : null
          // Without per-message effort a new level rewrites the whole conversation's cache.
          const canLower =
            isLoweringEffort && applied && perMessageEffort(await $.env.get('CLAUDE_CODE_MODEL_CAPABILITIES'))
          const lowered = canLower ? lowerEffort(t.rating, e.effort) : null
          await update($, turn, now =>
            now?.turnId === t.turnId ? { ...now, route: chosen, effort: lowered, model: chosen ?? e.model } : now,
          )
          model = chosen
          effort = lowered
          if (model || effort) $.ui.status(status(t.rating, { routed: model, effort }))
        }
        try {
          await update($, turn, now => (now?.turnId === t.turnId ? { ...now, steps: now.steps + 1 } : now))
        } catch {}
      }
    } catch {}
    return yield* next({ ...e, ...(model && { model }), ...(effort && { effort }) })
  })

  // A rated main turn is logged once, at its end, with what it cost.
  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined) return out
    try {
      const t = await read($, turn)
      if (t?.turnId !== e.turnId || t.model === undefined) return out
      await update($, turn, () => null)
      const entry: LayaLogEntry = {
        ...t.rating,
        at: Date.now(),
        tier: tierName(tier(t.rating)),
        model: t.model,
        routed: t.route != null,
        steps: t.steps,
        outputTokens: e.usage?.output_tokens ?? 0,
        durationMs: e.durationMs,
        aborted: e.isAborted,
        agentFills: t.agentFills,
        ...(t.effort && { effort: t.effort }),
      }
      // shortcut: read-modify-write; two sessions logging at once can drop one entry.
      const log = ((await $.store.get('log')) as LayaLogEntry[] | undefined) ?? []
      await $.store.set('log', [...log, entry].slice(-LOG_MAX))
    } catch {}
    return out
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.tool !== 'Agent') return next(e)
    const rating = await read($, last)
    const fill = rating?.applied ? agentDefaults(e, tier(rating)) : null
    if (fill)
      try {
        await update($, turn, now => (now ? { ...now, agentFills: now.agentFills + 1 } : now))
      } catch {}
    return next(fill ? { ...e, model: fill.model, effort: e.effort ?? fill.effort } : e)
  }).catch((_$, e, next) => next(e))
}
