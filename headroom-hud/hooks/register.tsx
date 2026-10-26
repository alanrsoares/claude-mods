import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMessage } from 'claude-code'

import type { Headroom, Totals } from '../types'

const DEFAULT_PROXY = 'http://127.0.0.1:8787'
const POLL_MS = 15_000
const GUTTER = 4 // the band's `[-]` toggle sits beside the tree

const headroom = atom({ plugin: 'headroom-hud', key: 'headroom' } as const, null)

const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`

const usd = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`

const bar = (pct: number, cells: number) => {
  const filled = Math.min(cells, Math.round((pct / 100) * cells))
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

const modelName = (id: string) =>
  id.replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '').replace(/(-\d+)+$/, '')

// The main loop's effort as its last request carried it; the session API does not expose it.
// Also kept in the store, so the band shows it again after a reload, before the first request.
let effort: string | number | undefined
let version: string | undefined

const heat = (pct: number) => (pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green')

const DOWN: Headroom = {
  isUp: false,
  requests: 0,
  tokensSaved: 0,
  usdSaved: 0,
  savingsPct: 0,
  cacheUsd: 0,
  base: null,
}

const parse = (text: string): Headroom => {
  const s = JSON.parse(text).summary
  return {
    isUp: true,
    requests: s.api_requests,
    tokensSaved: s.compression.total_tokens_removed,
    usdSaved: s.cost.total_saved_usd,
    savingsPct: s.cost.savings_pct,
    cacheUsd: s.cost.provider_cache_discount_usd,
    base: null,
  }
}

const sinceStart = (h: Headroom) => ({
  tokens: h.tokensSaved - (h.base?.tokensSaved ?? h.tokensSaved),
  usd: h.usdSaved - (h.base?.usdSaved ?? h.usdSaved),
  requests: h.requests - (h.base?.requests ?? h.requests),
})

type Band = {
  model: string
  level: string | number | undefined
  context: { percent?: number; tokens?: number; window: number }
  cost: number | undefined
  stats: Headroom | null
}

type Seg = { text: string; color?: string; dim?: true }

/** What a tier shows, richest first; `fit` takes the first that fits the width. */
const TIERS = [
  { cells: 10, tokens: true, version: true, saved: true, requests: true, totals: true },
  { cells: 10, tokens: true, version: true, saved: true, requests: true, totals: false },
  { cells: 10, tokens: true, version: false, saved: true, requests: false, totals: false },
  { cells: 6, tokens: false, version: false, saved: true, requests: false, totals: false },
  { cells: 0, tokens: false, version: false, saved: false, requests: false, totals: false },
] as const

type Tier = (typeof TIERS)[number]

const segments = ({ model, level, context, cost, stats }: Band, t: Tier): Seg[] => {
  const pct = context.percent
  const tail = [t.tokens && `${tokens(context.tokens ?? 0)}/${tokens(context.window)}`, cost && usd(cost)]
    .filter(Boolean)
    .join(' · ')
  const gauge = t.cells ? (p: number) => `${bar(p, t.cells)}  ` : () => ''
  const since = stats && sinceStart(stats)

  const proxy = (): Seg[] => {
    if (stats === null || since === null) return [{ text: '…', dim: true }]
    if (stats.requests === 0 && !stats.isUp) return [{ text: '○ proxy down', color: 'red' }]
    const color = stats.isUp ? undefined : 'yellow'
    const dot = stats.isUp ? '●' : '○'
    if (!t.saved) return [{ text: dot, color }]
    return [
      { text: `${dot} ↓${tokens(since.tokens)} ${usd(since.usd)}`, color },
      ...(t.requests || t.totals
        ? [
            {
              text: [
                t.requests && ` · ${since.requests}req`,
                t.totals &&
                  ` │ Σ ↓${tokens(stats.tokensSaved)} ${usd(stats.usdSaved)} (${Math.round(stats.savingsPct)}%) ⛁ ${usd(stats.cacheUsd)}`,
              ]
                .filter(Boolean)
                .join(''),
              dim: true as const,
            },
          ]
        : []),
    ]
  }

  return [
    { text: `◆ ${level === undefined ? model : `${model} ${level}`} │ ◧ `, dim: true },
    pct === undefined
      ? { text: `${gauge(0)}–`, dim: true }
      : { text: `${gauge(pct)}${pct}%`, color: heat(pct) },
    { text: tail && ` ${tail}`, dim: true },
    { text: ` │ ◈ ${t.version && version !== undefined ? `headroom@${version} ` : ''}`, dim: true },
    ...proxy(),
  ]
}

const width = (segs: readonly Seg[]) => segs.reduce((n, g) => n + [...g.text].length, 0)

/** The richest tier within `room` columns; the leanest when none fits (Text truncates it). */
const fit = (band: Band, room: number) => {
  const all = TIERS.map(t => segments(band, t))
  return all.find(s => width(s) <= room) ?? all.at(-1) ?? []
}

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

const MAX_TOPICS = 4 // the ask dialog takes 2-4 options
const DIGEST_CHARS = 24_000

const digest = (messages: readonly SessionMessage[]) =>
  messages
    .filter(m => m.text)
    .map(m => `${m.role}: ${m.text.slice(0, 400)}`)
    .join('\n')
    .slice(-DIGEST_CHARS)

/** The model's reply as 2-4 labels, or undefined when it is not that. */
const parseTopics = (text: string) => {
  const json: unknown = JSON.parse(text.replace(/^```(?:json)?|```$/gm, '').trim())
  if (!Array.isArray(json) || json.length < 2 || json.length > MAX_TOPICS) return undefined
  const labels = json.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
  return labels.length === json.length ? labels.map(t => t.replaceAll(',', ' ').trim()) : undefined
}

const compactInstructions = (topics: string[], answer: string) => {
  const picked = answer.split(',').map(s => s.trim())
  const kept = topics.filter(t => picked.includes(t))
  const dropped = topics.filter(t => !kept.includes(t))
  const other = kept.length ? '' : answer.trim() // free text typed under "Other"
  return [
    kept.length && `Keep in full detail: ${kept.join('; ')}.`,
    dropped.length && `Reduce to one line each, or drop: ${dropped.join('; ')}.`,
    other,
  ]
    .filter(Boolean)
    .join(' ')
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
      const fresh: Headroom | null = await $.http
        .fetch(`${proxy}/stats`)
        .then(r => (r.ok ? parse(r.text) : null))
        .catch(() => null)
      version = await $.http
        .fetch(`${proxy}/health`)
        .then(r => (r.ok ? (JSON.parse(r.text).version as string | undefined) : version))
        .catch(() => version)
      const { startedAt } = await $.session.usage()
      const saved = (await $.store.get('base')) as { startedAt: number; base: Totals } | undefined
      const savedBase = saved?.startedAt === startedAt ? saved.base : null
      await update($, headroom, prev => {
        if (!fresh) return prev ? { ...prev, isUp: false } : DOWN
        const { tokensSaved, usdSaved, requests } = fresh
        return { ...fresh, base: prev?.base ?? savedBase ?? { tokensSaved, usdSaved, requests } }
      })
      const value = await read($, headroom)
      if (value?.base && !savedBase) await $.store.set('base', { startedAt, base: value.base })
      await warnContext($)
      $.ui.invalidate('ui.render')
    }
    void poll()
    $.clock.every(POLL_MS, () => void poll())

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
