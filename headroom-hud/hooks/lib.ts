import type { SessionMessage } from 'claude-code'

import type { Headroom, Totals } from '../types'

export const tokens = (n: number) => {
  const k = Math.round(n / 1e3)
  return n >= 1e6 || k >= 1e3 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${k}k` : `${n}`
}

export const usd = (n: number) => `$${n.toFixed(n >= 100 ? 0 : 2)}`

export const bar = (pct: number, cells: number) => {
  const filled = Math.min(cells, Math.round((pct / 100) * cells))
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

/** `claude-opus-5-5[1m]` → `opus 5.5`; ids of any other shape lose only the prefix, suffix and date. */
export const modelName = (id: string) => {
  const bare = id.replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '')
  const [, family, major, minor] = /^(\D+?)-(\d+)(?:-(\d+))?$/.exec(bare) ?? []
  return family ? `${family} ${major}${minor ? `.${minor}` : ''}` : bare
}

export const heat = (pct: number) => (pct >= 85 ? 'red' : pct >= 60 ? 'yellow' : 'green')

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
  /** 'other': ANTHROPIC_BASE_URL is not a headroom proxy, so the band leaves the proxy out. */
  stats: Headroom | null | 'other'
  /** A spinner frame while the main turn runs. */
  spin?: string
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
const halves = ({ model, level, version, context, cost, stats, spin }: Band, t: Tier): [Seg[], Seg[]] => {
  const pct = context.percent
  const tail = [t.tokens && `${tokens(context.tokens ?? 0)}/${tokens(context.window)}`, cost && usd(cost)]
    .filter(Boolean)
    .join(' · ')
  const gauge = t.cells ? (p: number) => `${bar(p, t.cells)}  ` : () => ''

  return [
    [
      { text: `󰧑 ${level === undefined ? model : `${model} ${level}`} │ ◧ `, dim: true },
      pct === undefined
        ? { text: `${gauge(0)}–`, dim: true }
        : { text: `${gauge(pct)}${pct}%`, color: heat(pct) },
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
export const rows = ({ model, level, version, context, cost, stats, spin }: Band): Seg[][] => {
  const tail = [`${tokens(context.tokens ?? 0)}/${tokens(context.window)}`, cost && usd(cost)].filter(Boolean).join(' · ')
  const lines: Seg[][] = [
    [{ text: `◧ ${tail}`, dim: true }],
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
