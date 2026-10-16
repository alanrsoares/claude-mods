import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Headroom, Totals } from '../types'

const DEFAULT_PROXY = 'http://127.0.0.1:8787'
const POLL_MS = 15_000
const BAR_CELLS = 10

const headroom = atom({ plugin: 'headroom-hud', key: 'headroom' } as const, null)

const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`

const usd = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`

const bar = (pct: number) => {
  const filled = Math.min(BAR_CELLS, Math.round((pct / 100) * BAR_CELLS))
  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled)
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
      const { value } = await $.state.get(headroom)
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
    const stats = await read($, headroom)
    const model = modelName(await $.session.model())
    const level = effort ?? ((await $.store.get('effort')) as string | number | null) ?? undefined
    const { Box, Text } = $.ui.resolve(e)

    const pct = context.percent
    return (
      <Box>
        <Text dimColor>◆ {level === undefined ? model : `${model} ${level}`} │ ◧ </Text>
        {pct === undefined ? (
          <Text dimColor>{bar(0)}{'  '}–</Text>
        ) : (
          <Text color={heat(pct)}>
            {bar(pct)}{'  '}{pct}%
          </Text>
        )}
        <Text dimColor>
          {' '}
          {tokens(context.tokens ?? 0)}/{tokens(context.window)}
          {cost ? ` · ${usd(cost.usd)}` : ''}
        </Text>
        <Text dimColor> │ ◈ {version === undefined ? '' : `headroom@${version} `}</Text>
        {stats === null ? (
          <Text dimColor>…</Text>
        ) : stats.requests === 0 && !stats.isUp ? (
          <Text color="red">○ proxy down</Text>
        ) : (
          <Text color={stats.isUp ? undefined : 'yellow'}>
            {stats.isUp ? '●' : '○'} ↓{tokens(sinceStart(stats).tokens)} {usd(sinceStart(stats).usd)}
            <Text dimColor>
              {' '}
              · {sinceStart(stats).requests}req │ Σ ↓{tokens(stats.tokensSaved)} {usd(stats.usdSaved)} ({Math.round(stats.savingsPct)}%) ⛁ {usd(stats.cacheUsd)}
            </Text>
          </Text>
        )}
      </Box>
    )
  })
}

