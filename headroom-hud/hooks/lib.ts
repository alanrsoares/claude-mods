import type { SessionMessage } from 'claude-code'

import type { Headroom, Spend, Totals } from '../types'

export const tokens = (n: number) => {
  const k = Math.round(n / 1e3)
  return n >= 1e6 || k >= 1e3 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${k}k` : `${n}`
}

export const usd = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`

/** `45s`, `25m`, `2h05`. */
export const duration = (ms: number) => {
  const s = Math.floor(ms / 1e3)
  const m = Math.floor(s / 60)
  return s < 60 ? `${s}s` : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

export const NO_SPEND: Spend = { prev: 0, turns: [] }
const TURNS = 16

/** The session total at a turn's end as one more turn; a total below the last one means `/clear`, so start over. */
export const record = (s: Spend, total: number): Spend => {
  if (total < s.prev) return { prev: total, turns: [] }
  return { prev: total, turns: [...s.turns, total - s.prev].slice(-TURNS) }
}

/** One block a value, each as tall as its share of the largest. */
export const spark = (xs: readonly number[]) => {
  const max = Math.max(...xs)
  return xs.map(x => '▁▂▃▄▅▆▇█'[max > 0 ? Math.min(7, Math.floor((x / max) * 8)) : 0]).join('')
}

export const bar = (pct: number, cells: number) => {
  const filled = Math.min(cells, Math.round((pct / 100) * cells))
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

/** One sweep's length, in ms, at any width: a wide pane and a narrow strip move in step. */
export const SWEEP_MS = 1600

/** The bar as segments; with `ms` into a turn, a comet sweeps it out and back. */
export const gauge = (pct: number, cells: number, style: Omit<Seg, 'text'>, ms?: number): Seg[] => {
  const base = [...bar(pct, cells)]
  if (ms === undefined || cells < 2) return [{ text: base.join(''), ...style }]
  const p = (ms % (2 * SWEEP_MS)) / SWEEP_MS // 0..2: out, then back
  const isOut = p < 1
  const head = Math.round((isOut ? p : 2 - p) * (cells - 1))
  const back = isOut ? -1 : 1 // toward the cells it just left
  // theme keys, not raw colors: they stay legible on light and dark themes
  const TAIL: readonly Omit<Seg, 'text'>[] = [{ color: 'claude' }, { color: 'claude' }, { color: 'claude', dim: true }]
  const cell = (c: string, i: number): Seg => {
    const d = (i - head) * back
    return d >= 0 && d < TAIL.length ? { text: '▰', ...TAIL[d] } : { text: c, ...style }
  }
  // adjacent cells of one style merge into one segment
  return base.map(cell).reduce<Seg[]>((out, g) => {
    const last = out.at(-1)
    if (last && last.color === g.color && last.dim === g.dim) last.text += g.text
    else out.push({ ...g })
    return out
  }, [])
}

/** `claude-opus-5-5[1m]` or a Bedrock/OpenRouter/LiteLLM id → `opus 5.5`; other ids lose only prefixes, suffixes and dates. */
export const modelName = (id: string) => {
  const bare = id
    .replace(/\[.*\]$/, '')
    .replace(/^.*\//, '')
    .replace(/^(?:[\w-]+\.)*anthropic\./, '')
    .replace(/^claude-/, '')
    .replace(/(?:[-@]\d{8}|-v\d+(?::\w+)*|:[a-z]+)+$/, '')
  const [, family, major, minor] = /^(\D+?)-(\d+)(?:[-.](\d+))?$/.exec(bare) ?? []
  if (family) return `${family} ${major}${minor ? `.${minor}` : ''}`
  const [, maj, min, legacy] = /^(\d+)(?:[-.](\d+))?-(opus|sonnet|haiku)$/.exec(bare) ?? []
  return legacy ? `${legacy} ${maj}${min ? `.${min}` : ''}` : bare
}

export const heat = (pct: number) => (pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green')

const BREATH_MS = 2400
/** True on the dim half of a slow breath: `(1 - cos)/2` below one half. */
export const exhale = (ms: number) => (1 - Math.cos((2 * Math.PI * ms) / BREATH_MS)) / 2 < 0.5

export const DOWN: Headroom = {
  isUp: false,
  isReadable: true,
  requests: 0,
  tokensSaved: 0,
  usdSaved: 0,
  savingsPct: 0,
  cacheUsd: 0,
  base: null,
}

/** The proxy answered, but not with the stats shape this mod knows. */
export const UNREADABLE: Headroom = { ...DOWN, isUp: true, isReadable: false }

const at = (value: unknown, ...path: string[]) =>
  path.reduce<unknown>(
    (o, k) => (typeof o === 'object' && o !== null ? (o as Record<string, unknown>)[k] : undefined),
    value,
  )

/** The proxy's `/stats` body as totals, or null when it lacks a numeric field. */
export const parse = (text: string): Headroom | null => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const n = [
    at(json, 'summary', 'api_requests'),
    at(json, 'summary', 'compression', 'total_tokens_removed'),
    at(json, 'summary', 'cost', 'total_saved_usd'),
    at(json, 'summary', 'cost', 'savings_pct'),
    at(json, 'summary', 'cost', 'provider_cache_discount_usd'),
  ]
  if (!n.every((v): v is number => typeof v === 'number' && Number.isFinite(v))) return null
  const [requests, tokensSaved, usdSaved, savingsPct, cacheUsd] = n as number[]
  return {
    ...DOWN,
    isUp: true,
    requests: requests!,
    tokensSaved: tokensSaved!,
    usdSaved: usdSaved!,
    savingsPct: savingsPct!,
    cacheUsd: cacheUsd!,
  }
}

/** The proxy's `/health` body: whether it is headroom, and its version. */
export const health = (text: string) => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { isHeadroom: false, version: undefined }
  }
  const service = at(json, 'service')
  const version = at(json, 'version')
  return {
    // headroom before `service` existed still answers with its version
    isHeadroom: typeof service === 'string' ? service.startsWith('headroom') : typeof version === 'string',
    version: typeof version === 'string' ? version : undefined,
  }
}

/** PyPI's latest `headroom-ai` release, or undefined when the body is not a plain release version. */
export const latestRelease = (text: string) => {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return undefined
  }
  const v = at(json, 'info', 'version')
  return typeof v === 'string' && /^\d+(\.\d+)*$/.test(v) ? v : undefined
}

/** Dotted numeric versions: whether `a` is after `b`. */
export const isNewer = (a: string, b: string) => {
  const [x, y] = [a, b].map(v => v.split('.').map(n => Number.parseInt(n, 10) || 0))
  for (let i = 0; i < Math.max(x!.length, y!.length); i++) {
    const d = (x![i] ?? 0) - (y![i] ?? 0)
    if (d) return d > 0
  }
  return false
}

export const ZERO: Totals = { requests: 0, tokensSaved: 0, usdSaved: 0 }

/** The baseline to count from: the proxy's counters falling means it restarted, so count from zero. */
export const rebase = (base: Totals, fresh: Totals): Totals => (fresh.requests < base.requests ? ZERO : base)

export const sinceStart = (h: Headroom) => ({
  tokens: h.tokensSaved - (h.base?.tokensSaved ?? h.tokensSaved),
  usd: h.usdSaved - (h.base?.usdSaved ?? h.usdSaved),
  requests: h.requests - (h.base?.requests ?? h.requests),
})

export type Band = {
  model: string
  level: string | number | undefined
  version: string | undefined
  context: { percent?: number; tokens?: number; window: number }
  cost: number | undefined
  /** Milliseconds since the session began, wall clock. */
  elapsed?: number
  /** What the last main turns cost each, oldest first. */
  turns?: readonly number[]
  /** 'other': ANTHROPIC_BASE_URL is not a headroom proxy, so the band leaves the proxy out. */
  stats: Headroom | null | 'other'
  /** A spinner frame while the main turn runs. */
  spin?: string
  /** Milliseconds into the main turn while it runs; they drive the gauge's comet. */
  turnMs?: number
  /** Context is high or a compaction waits: true on the dim half of the breath. */
  faint?: boolean
}

export type Seg = { text: string; color?: string; dim?: true }

/** What a tier shows, richest first; `fit` takes the first that fits the width. */
export const TIERS = [
  { cells: 10, tokens: true, version: true, saved: true, requests: true, totals: true },
  { cells: 10, tokens: true, version: true, saved: true, requests: true, totals: false },
  { cells: 10, tokens: true, version: false, saved: true, requests: false, totals: false },
  { cells: 6, tokens: false, version: false, saved: true, requests: false, totals: false },
  { cells: 0, tokens: false, version: false, saved: false, requests: false, totals: false },
] as const

type Tier = (typeof TIERS)[number]

const proxySegs = (stats: Headroom | null, t: Tier, spin?: string): Seg[] => {
  if (stats === null) return [{ text: spin ?? '…', dim: true }]
  if (!stats.isReadable) return [{ text: '● stats?', color: 'yellow' }]
  if (stats.requests === 0 && !stats.isUp) return [{ text: '○ proxy down', color: 'red' }]
  const color = stats.isUp ? undefined : 'yellow'
  const dot = stats.isUp ? '●' : '○'
  if (!t.saved) return [{ text: dot, color }]
  const since = sinceStart(stats)
  const detail = [
    t.requests && ` · ${since.requests}req`,
    t.totals &&
      ` │ Σ ↓${tokens(stats.tokensSaved)} ${usd(stats.usdSaved)} (${Math.round(stats.savingsPct)}%) ⛁ ${usd(stats.cacheUsd)}`,
  ]
    .filter(Boolean)
    .join('')
  return [
    // Δ: all proxy traffic since this session started, other sessions' too
    { text: `${dot} Δ↓${tokens(since.tokens)} ${usd(since.usd)}`, color },
    ...(detail ? [{ text: detail, dim: true as const }] : []),
  ]
}

/** The band's two halves: the model and context, then the proxy (empty for another proxy). */
const halves = ({ model, level, version, context, cost, stats, spin, turnMs }: Band, t: Tier): [Seg[], Seg[]] => {
  const pct = context.percent
  const tail = [t.tokens && `${tokens(context.tokens ?? 0)}/${tokens(context.window)}`, cost && usd(cost)]
    .filter(Boolean)
    .join(' · ')
  const style: Omit<Seg, 'text'> = pct === undefined ? { dim: true } : { color: heat(pct) }
  const bars = t.cells ? [...gauge(pct ?? 0, t.cells, style, turnMs), { text: '  ', ...style }] : []

  return [
    [
      { text: `󰧑 ${level === undefined ? model : `${model} ${level}`} │ ◧ `, dim: true },
      ...bars,
      { text: pct === undefined ? '–' : `${pct}%`, ...style },
      { text: tail && ` ${tail}`, dim: true },
    ],
    stats === 'other'
      ? []
      : [
          { text: `${spin ?? '◈'} ${t.version && version !== undefined ? `headroom@${version} ` : ''}`, dim: true as const },
          ...proxySegs(stats, t, spin),
        ],
  ]
}

export const segments = (band: Band, t: Tier): Seg[] => {
  const [head, proxy] = halves(band, t)
  return proxy.length ? [...head, { text: ' │ ', dim: true }, ...proxy] : head
}

// Code points, not terminal cells: every glyph used (the Nerd Font brain too) is one cell wide outside
// CJK-ambiguous locales, and `Text wrap="truncate-end"` catches an overflow elsewhere.
export const width = (segs: readonly Seg[]) => segs.reduce((n, g) => n + [...g.text].length, 0)

/** The richest tier within `room` columns; the leanest when none fits (Text truncates it). */
export const fit = (band: Band, room: number) => {
  const all = TIERS.map(t => segments(band, t))
  return all.find(s => width(s) <= room) ?? all.at(-1) ?? []
}

/** The band in one row, or in two (model and context, then the proxy) before a leaner tier drops facts. */
export const stack = (band: Band, room: number): Seg[][] => {
  for (const t of TIERS) {
    const one = segments(band, t)
    if (width(one) <= room) return [one]
    const two = halves(band, t).filter(h => h.length)
    if (two.every(h => width(h) <= room)) return two
  }
  return [fit(band, room)]
}

/** The band as lines for the side pane, one fact per line; the pane's header draws the context percent and bar. */
export const rows = ({ model, level, version, context, cost, elapsed, turns = [], stats, spin }: Band): Seg[][] => {
  const tail = [`${tokens(context.tokens ?? 0)}/${tokens(context.window)}`, cost && usd(cost)].filter(Boolean).join(' · ')
  // the cost of each recent turn: a climb is context growing or a cold cache, a drop is a compaction
  const trend = turns.length < 2 ? [] : [[{ text: `  ${spark(turns)} ${usd(turns.at(-1)!)}/turn`, dim: true as const }]]
  const lines: Seg[][] = [
    [{ text: `◧ ${tail}`, dim: true }],
    ...(elapsed === undefined ? [] : [[{ text: `  ⏱ ${duration(elapsed)}`, dim: true as const }]]),
    ...trend,
    [{ text: `󰧑 ${level === undefined ? model : `${model} ${level}`}`, dim: true }],
  ]
  if (stats === 'other') return lines
  lines.push([{ text: `◈ headroom${version === undefined ? '' : `@${version}`}`, dim: true }])
  if (stats === null) return [...lines, [{ text: `  ${spin ?? '…'}`, dim: true }]]
  if (!stats.isReadable) return [...lines, [{ text: '  ● stats?', color: 'yellow' }]]
  if (stats.requests === 0 && !stats.isUp) return [...lines, [{ text: '  ○ proxy down', color: 'red' }]]
  const since = sinceStart(stats)
  return [
    ...lines,
    [{ text: `  ${stats.isUp ? '●' : '○'} Δ↓${tokens(since.tokens)} ${usd(since.usd)}`, color: stats.isUp ? undefined : 'yellow' }],
    [{ text: `    ${since.requests} requests`, dim: true }],
    [{ text: `  Σ ↓${tokens(stats.tokensSaved)} ${usd(stats.usdSaved)} (${Math.round(stats.savingsPct)}%)`, dim: true }],
    [{ text: `  ⛁ ${usd(stats.cacheUsd)} cache`, dim: true }],
  ]
}

/** The narrowest dock that shows every line whole; the engine floors it at 24. */
export const paneColumns = (lines: readonly Seg[][]) => Math.max(...lines.map(width))

export const MAX_TOPICS = 4 // the ask dialog takes 2-4 options
const DIGEST_CHARS = 24_000

export const digest = (messages: readonly SessionMessage[]) =>
  messages
    .filter(m => m.text)
    .map(m => `${m.role}: ${m.text.slice(0, 400)}`)
    .join('\n')
    .slice(-DIGEST_CHARS)

/** The model's reply as 2-4 labels, or undefined when it is not that. */
export const parseTopics = (text: string) => {
  const json: unknown = JSON.parse(text.replace(/^```(?:json)?|```$/gm, '').trim())
  if (!Array.isArray(json) || json.length < 2 || json.length > MAX_TOPICS) return undefined
  const labels = json.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
  return labels.length === json.length ? labels.map(t => t.replaceAll(',', ' ').trim()) : undefined
}

/** `answer` is the picked labels joined by commas, plus any text typed under "Other". */
export const compactInstructions = (topics: string[], answer: string) => {
  const picked = answer.split(',').map(s => s.trim()).filter(Boolean)
  const kept = topics.filter(t => picked.includes(t))
  const dropped = topics.filter(t => !kept.includes(t))
  const other = picked.filter(p => !topics.includes(p)).join(', ')
  return [
    kept.length && `Keep in full detail: ${kept.join('; ')}.`,
    dropped.length && `Reduce to one line each, or drop: ${dropped.join('; ')}.`,
    other && `Also: ${other}.`,
  ]
    .filter(Boolean)
    .join(' ')
}
