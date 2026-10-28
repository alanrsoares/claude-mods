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
  modelName,
  parse,
  parseTopics,
  rebase,
} from './lib'

const DEFAULT_PROXY = 'http://127.0.0.1:8787'
const POLL_MS = 15_000
const GUTTER = 4 // the band's `[-]` toggle sits beside the tree

const headroom = atom({ plugin: 'headroom-hud', key: 'headroom' } as const, null)

// The main loop's effort as its last request carried it; the session API does not expose it.
// Also kept in the store, so the band shows it again after a reload, before the first request.
let effort: string | number | undefined
let version: string | undefined

const COMPACT_AT = 75
const REARM_BELOW = 50
let hasWarned = false

const warnContext = async ($: EngineInterface) => {
  const { context } = await $.session.usage()
  const pct = context.percent ?? 0
  if (pct >= COMPACT_AT && !hasWarned) {
    hasWarned = true
    $.ui.toast(`◧ context ${pct}% — consider /compact`)
  } else if (pct < REARM_BELOW) {
    hasWarned = false
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
    const poll = async () => {
      const [fresh, found] = await Promise.all([
        $.http
          .fetch(`${proxy}/stats`)
          .then(r => (r.ok ? (parse(r.text) ?? UNREADABLE) : null))
          .catch((): Headroom | null => null),
        $.http
          .fetch(`${proxy}/health`)
          .then(r => {
            const v: unknown = r.ok ? JSON.parse(r.text).version : undefined
            return typeof v === 'string' ? v : undefined
          })
          .catch(() => undefined),
      ])
      version = found ?? version
      const { startedAt } = await $.session.usage()
      const saved = (await $.store.get('base')) as { startedAt: number; base: Totals } | undefined
      const savedBase = saved?.startedAt === startedAt ? saved.base : null
      await update($, headroom, prev => {
        if (!fresh) return prev ? { ...prev, isUp: false, isReadable: true } : DOWN
        if (!fresh.isReadable) return { ...fresh, base: prev?.base ?? null }
        const { tokensSaved, usdSaved, requests } = fresh
        const base = prev?.base ?? savedBase ?? { tokensSaved, usdSaved, requests }
        return { ...fresh, base: rebase(base, fresh) }
      })
      const value = await read($, headroom)
      if (value?.base && value.base.requests !== savedBase?.requests) {
        await $.store.set('base', { startedAt, base: value.base })
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
    void tick()
    $.clock.every(POLL_MS, () => void tick())

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
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
    const data: Band = {
      model: modelName(await $.session.model()),
      level: effort ?? ((await $.store.get('effort')) as string | number | null) ?? undefined,
      version,
      context,
      cost: cost?.usd,
      stats: await read($, headroom),
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
