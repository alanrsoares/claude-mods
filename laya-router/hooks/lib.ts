import type { LayaLogEntry, LayaOutcome, LayaRating } from '../types'

export const DEFAULT_URL = 'http://127.0.0.1:8765'
export const DEFAULT_TIMEOUT_MS = 2500
export const LOG_MAX = 500

export const QUESTIONS = {
  difficulty: {
    type: 'score',
    instructions: 'How hard is `request` for a language model?',
    criteria: [
      'trivial: a lookup or one-liner',
      'easy: short answer, no reasoning',
      'moderate: several steps',
      'hard: long multi-step reasoning or specialist knowledge',
    ],
  },
  domain: {
    type: 'choice',
    instructions: 'What domain does `request` belong to?',
    criteria: {
      code: 'software engineering, programming, refactoring, architecture, debugging',
      math_or_logic: 'mathematics, logic puzzles, proofs, complex calculation',
      writing: 'creative writing, essays, emails, blog posts, copywriting',
      factual_lookup: 'facts, definitions, trivia, history',
      data_analysis: 'statistics, SQL, data manipulation, metrics',
      chitchat: 'casual conversation, greetings, small talk',
    },
  },
  is_sensitive: { type: 'noul', instructions: 'Does `request` involve money, legal, medical or safety consequences?' },
} as const

export type Tier = { model: 'sonnet' | 'opus'; effort: 'medium' | 'high' }

const TIERS: readonly Tier[] = [
  { model: 'sonnet', effort: 'high' },
  { model: 'opus', effort: 'medium' },
  { model: 'opus', effort: 'high' },
]

// The score is compressed: 16 hand-labelled prompts gave trivial/easy ~1.07, moderate ~1.65, hard ~1.89, max 2.13.
// A sensitive prompt goes one tier up.
const tierIndex = ({ difficulty, sensitive }: LayaRating): number =>
  Math.min((difficulty >= 1.9 ? 2 : difficulty >= 1.5 ? 1 : 0) + (sensitive ? 1 : 0), TIERS.length - 1)

export const tier = (r: LayaRating): Tier => TIERS[tierIndex(r)]!

export const tierName = ({ model, effort }: Tier): string => `${model} ${effort}`

export const parse = (text: string): LayaRating | null => {
  try {
    const a = JSON.parse(text)?.answers
    const difficulty: unknown = a?.difficulty?.score
    const domain: unknown = a?.domain?.choice
    const noul: unknown = a?.is_sensitive?.noul
    // An unknown sensitivity is no rating: reading it as false would keep a sensitive prompt a tier low.
    return typeof difficulty === 'number' && typeof domain === 'string' && typeof noul === 'number'
      ? { difficulty, domain, sensitive: noul >= 0.5 }
      : null
  } catch {
    return null
  }
}

const BAR_CELLS = 6
// The difficulty criteria are 4 steps, so the score runs 0 to 3.
const BAR_MAX = 3
const TIER_BADGES = ['◔', '◑', '●'] as const

/** `▰▰▰▱▱▱`: difficulty on a 0–3 scale. */
export const bar = (difficulty: number): string => {
  const n = Math.max(0, Math.min(BAR_CELLS, Math.round((difficulty / BAR_MAX) * BAR_CELLS)))
  return '▰'.repeat(n) + '▱'.repeat(BAR_CELLS - n)
}

// Below this a rating costs the prompt too little to be worth a place on the line; `/laya` has the spread.
export const SLOW_MS = 300

export type StatusMarks = { routed?: string | null; effort?: string | null; holdout?: boolean }

/** The status line: `laya ▰▰▰▱▱▱ 1.44 · code · ◔ sonnet high`, then ⚠ sensitive, ↘ routed, ↓ effort, ◌ holdout, ⏱ slow rating. */
export const status = (
  r: LayaRating & { latencyMs?: number },
  { routed, effort, holdout }: StatusMarks = {},
): string =>
  [
    `laya ${bar(r.difficulty)} ${r.difficulty.toFixed(2)}`,
    r.domain,
    `${TIER_BADGES[tierIndex(r)]} ${tierName(tier(r))}`,
    r.sensitive && '⚠ sensitive',
    routed && `↘ ${routed}`,
    effort && `↓ ${effort}`,
    holdout && '◌ holdout',
    r.latencyMs !== undefined && r.latencyMs >= SLOW_MS && `⏱ ${r.latencyMs < 1000 ? `${r.latencyMs}ms` : `${(r.latencyMs / 1000).toFixed(1)}s`}`,
  ]
    .filter(Boolean)
    .join(' · ')

export const timeoutMs = (raw: string | undefined): number => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS
}

/** The share of rated prompts held out, from the `holdout` option: 0 when unset or out of range. */
export const holdout = (raw: unknown): number => (typeof raw === 'number' && raw >= 0 && raw <= 1 ? raw : 0)

// Types with no model frontmatter of their own. Any other type may pin a model on purpose.
const GENERIC_AGENTS: ReadonlySet<string | undefined> = new Set([undefined, 'general-purpose', 'claude'])

type AgentChoice = { subagent_type?: string; model?: string }

/** The tier to fill in on an Agent call, or null to leave it as written. */
export const agentDefaults = (call: AgentChoice, t: Tier): Tier | null =>
  call.model !== undefined || !GENERIC_AGENTS.has(call.subagent_type) ? null : t

/**
 * The model to send a main-loop turn to instead of the session's, or null.
 * Down only (opus → sonnet), and only while the conversation is short: a switch
 * writes the other model's prompt cache for the whole conversation.
 */
export const route = (sessionModel: string, t: Tier, messageCount: number, maxMessages: number): string | null =>
  /opus/i.test(sessionModel) && t.model === 'sonnet' && messageCount <= maxMessages ? 'sonnet' : null

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Effort = (typeof EFFORTS)[number]

/**
 * The effort to send a main-loop turn at instead of the session's, or null. Down only:
 * trivial or easy chat goes to `low`, an easy request to `medium`, anything harder keeps its level.
 */
export const lowerEffort = ({ difficulty, domain }: LayaRating, current: unknown): 'low' | 'medium' | null => {
  const target: 'low' | 'medium' | null =
    difficulty < 1.0 || (difficulty < 1.5 && domain === 'chitchat') ? 'low' : difficulty < 1.5 ? 'medium' : null
  const at = EFFORTS.indexOf(current as Effort)
  return target && at > EFFORTS.indexOf(target) ? target : null
}

/** Whether the session's model takes effort per message, so a lower level rewrites no prompt cache. */
export const perMessageEffort = (capabilities: string | undefined): boolean =>
  /\bper_turn_effort\b/.test(capabilities ?? '')

/** Whether the host resolves a model alias sent from `turn.step`: before 2.1.309 every such request fails. */
export const resolvesAliases = (version: string): boolean => {
  const [a, b, c] = version.split(/[.-]/, 3).map(Number) as [number, number, number]
  return a !== 2 ? a > 2 : b !== 1 ? b > 1 : c >= 309
}

const quantile = (sorted: readonly number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!

const counts = (log: readonly LayaLogEntry[], key: (e: LayaLogEntry) => string): string => {
  const n = new Map<string, number>()
  for (const e of log) n.set(key(e), (n.get(key(e)) ?? 0) + 1)
  return [...n]
    .sort(([, a], [, b]) => b - a)
    .map(([k, c]) => `${k} ${c}`)
    .join(' · ')
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length

/** Pearson's r, or null with fewer than 3 points or no spread. */
export const pearson = (xs: readonly number[], ys: readonly number[]): number | null => {
  if (xs.length < 3) return null
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  xs.forEach((x, i) => {
    const dx = x - mx
    const dy = ys[i]! - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  })
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

type Done = LayaLogEntry & LayaOutcome

const r2 = (r: number | null): string => (r === null ? '—' : r.toFixed(2))

const arm = (name: string, all: readonly Done[]): string => {
  const ok = all.filter(e => !e.aborted)
  const avg = (f: (e: Done) => number) => (ok.length ? Math.round(mean(ok.map(f))) : 0)
  return `${name} ${all.length}: out tokens ${avg(e => e.outputTokens)} · steps ${avg(e => e.steps)} · ${avg(e => e.durationMs / 1000)} s · aborted ${all.length - ok.length} · agent fills ${all.reduce((n, e) => n + e.agentFills, 0)}`
}

// Aborted turns are left out of the fit: an interrupt cuts their cost short, whatever the rating.
const outcomes = (log: readonly LayaLogEntry[], misses: number): string[] => {
  const done = log.filter((e): e is Done => e.steps !== undefined)
  if (done.length === 0) return []
  const fit = done.filter(e => !e.aborted)
  const d = fit.map(e => e.difficulty)
  const ms = done.map(e => e.latencyMs).sort((a, b) => a - b)
  return [
    `fit ${fit.length}: difficulty ~ out tokens r ${r2(pearson(d, fit.map(e => e.outputTokens)))} · ~ steps r ${r2(pearson(d, fit.map(e => e.steps)))}`,
    arm('applied', done.filter(e => e.applied)),
    arm('holdout', done.filter(e => !e.applied)),
    `laya latency: p50 ${quantile(ms, 0.5)} ms · p90 ${quantile(ms, 0.9)} ms · misses ${misses}`,
  ]
}

export const report = (log: readonly LayaLogEntry[], misses = 0): string => {
  if (log.length === 0) return `laya: no rated turns logged yet.${misses ? ` misses ${misses}` : ''}`
  const d = log.map(e => e.difficulty).sort((a, b) => a - b)
  const q = (p: number) => quantile(d, p).toFixed(2)
  return [
    `laya: ${log.length} rated turns since ${new Date(log[0]!.at).toISOString().slice(0, 10)}`,
    `tier: ${counts(log, e => e.tier)}`,
    `model used: ${counts(log, e => e.model)}`,
    `domain: ${counts(log, e => e.domain)}`,
    `difficulty: p10 ${q(0.1)} · p50 ${q(0.5)} · p90 ${q(0.9)} · max ${d.at(-1)!.toFixed(2)}`,
    `sensitive ${log.filter(e => e.sensitive).length} · routed ${log.filter(e => e.routed).length} · effort lowered ${log.filter(e => e.effort).length}`,
    ...outcomes(log, misses),
  ].join('\n')
}
