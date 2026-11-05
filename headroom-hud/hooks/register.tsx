import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Headroom, Totals } from '../types'
import {
  type Band,
  DOWN,
  MAX_TOPICS,
  UNREADABLE,
  compactInstructions,
  digest,
  fit,
  health,
  modelName,
  parse,
  parseTopics,
  rebase,
} from './lib'

const DEFAULT_PROXY = 'http://127.0.0.1:8787'
const POLL_MS = 15_000
const BASE_TTL_MS = 7 * 24 * 3600_000 // a saved baseline outlives its session by this much
const GUTTER = 4 // the band's `[-]` toggle sits beside the tree

const headroom = atom({ plugin: 'headroom-hud', key: 'headroom' } as const, null)
const warned = atom({ plugin: 'headroom-hud', key: 'warned' } as const, false)
const other = atom({ plugin: 'headroom-hud', key: 'other' } as const, false)

// The main loop's effort as its last request carried it; the session API does not expose it.
// Also kept in the store, so the band shows it again after a reload, before the first request.
let effort: string | number | undefined
let version: string | undefined
// The main loop sent a request since the last poll; while idle, /stats is not fetched.
let isStale = true

const COMPACT_AT = 75
const REARM_BELOW = 50

const warnContext = async ($: EngineInterface) => {
  const { context } = await $.session.usage()
  const pct = context.percent ?? 0
  const hasWarned = await read($, warned)
  if (pct >= COMPACT_AT && !hasWarned) {
    await update($, warned, () => true)
    $.ui.toast(`◧ context ${pct}% — consider /compact`)
  } else if (pct < REARM_BELOW && hasWarned) {
    await update($, warned, () => false)
  }
}

/** Drops the legacy shared key and baselines of sessions older than BASE_TTL_MS. */
const pruneBases = async ($: EngineInterface, now: number) => {
  for (const key of await $.store.keys()) {
    const at = key === 'base' ? 0 : key.startsWith('base:') ? Number(key.slice(5)) : now
    if (now - at > BASE_TTL_MS) await $.store.delete(key)
  }
}

export const register: Register = on => {
  // `/compact` asks which topics to keep; any failure leaves the compaction as it was.
  on('session.compact', { trigger: 'manual' }, async ($, e, next) => {
    if (e.instructions) return next(e)
    try {
      const reply = await $.model.complete({
        model: 'haiku',
        prompt: `List the ${MAX_TOPICS} or fewer main topics of this session as a JSON array of short labels. Reply with the JSON only.\n\n${digest(e.messages)}`,
      })
      const topics = reply.isAnswered ? parseTopics(reply.text) : undefined
      if (!topics) return next(e)
      const answer = await $.ui.ask('Which topics must the compaction keep?', {
        options: topics,
        header: 'Compact',
        multiSelect: true,
      })
      const instructions = compactInstructions(topics, answer)
      return next(instructions ? { ...e, instructions } : e)
    } catch {
      return next(e)
    }
  }).catch((_$, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    const proxy = (await $.env.get('ANTHROPIC_BASE_URL')) ?? DEFAULT_PROXY
    const { startedAt } = await $.session.usage()
    const baseKey = `base:${startedAt}` // per session: concurrent sessions share the store
    await pruneBases($, await $.clock.now())

    // false when the proxy answered but is not headroom; undefined when it did not answer.
    const checkHealth = () =>
      $.http
        .fetch(`${proxy}/health`)
        .then(r => {
          const h = health(r.text)
          version = h.version ?? version
          return h.isHeadroom
        })
        .catch(() => undefined)

    const poll = async () => {
      const prev = await read($, headroom)
      // version changes only when the proxy restarts: ask again only after it was down
      if (version === undefined || !prev?.isUp) {
        if ((await checkHealth()) === false) {
          timer.cancel()
          await update($, other, () => true)
          $.ui.invalidate('ui.render')
          return
        }
      }
      if (isStale || !prev?.isUp) {
        isStale = false
        const fresh = await $.http
          .fetch(`${proxy}/stats`)
          .then(r => (r.ok ? (parse(r.text) ?? UNREADABLE) : null))
          .catch((): Headroom | null => null)
        const saved = (await $.store.get(baseKey)) as Totals | undefined
        await update($, headroom, p => {
          if (!fresh) return p ? { ...p, isUp: false, isReadable: true } : DOWN
          if (!fresh.isReadable) return { ...fresh, base: p?.base ?? null }
          const { tokensSaved, usdSaved, requests } = fresh
          const base = p?.base ?? saved ?? { tokensSaved, usdSaved, requests }
          return { ...fresh, base: rebase(base, fresh) }
        })
        const value = await read($, headroom)
        if (value?.base && value.base.requests !== saved?.requests) await $.store.set(baseKey, value.base)
      }
      await warnContext($)
      $.ui.invalidate('ui.render')
    }
    // One poll at a time; a failed poll waits for the next tick.
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        await poll()
      } catch {
        // the band keeps its last value
      } finally {
        busy = false
      }
    }
    const timer = $.clock.every(POLL_MS, () => void tick())
    void tick()

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) isStale = true
    if (e.agentId === undefined && e.effort !== effort) {
      effort = e.effort
      await $.store.set('effort', effort ?? null)
      $.ui.invalidate('ui.render')
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await warnContext($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { context, cost } = await $.session.usage()
    const isOther = await read($, other)
    const data: Band = {
      model: modelName(await $.session.model()),
      level: effort ?? ((await $.store.get('effort')) as string | number | null) ?? undefined,
      version,
      context,
      cost: cost?.usd,
      stats: isOther ? 'other' : await read($, headroom),
    }
    const room = (e.viewport?.columns ?? Infinity) - GUTTER
    const segs = fit(data, room)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text wrap="truncate-end">
          {segs.map((g, i) => (
            <Text key={`${i}`} color={g.color} dimColor={g.dim}>
              {g.text}
            </Text>
          ))}
        </Text>
      </Box>
    )
  })
}
