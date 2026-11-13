import type { LayaLogEntry, LayaRating } from '../types'

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

// Cutoffs are guesses on a loose score: one-liners ~1.3, architecture ~2.2. `/laya` shows the logged spread.
// A sensitive prompt goes one tier up.
export const tier = ({ difficulty, sensitive }: LayaRating): Tier =>
  TIERS[Math.min((difficulty >= 2.2 ? 2 : difficulty >= 2.0 ? 1 : 0) + (sensitive ? 1 : 0), TIERS.length - 1)]!

export const tierName = ({ model, effort }: Tier): string => `${model} ${effort}`

export const parse = (text: string): LayaRating | null => {
  try {
    const a = JSON.parse(text)?.answers
    const difficulty: unknown = a?.difficulty?.score
    const domain: unknown = a?.domain?.choice
    const noul: unknown = a?.is_sensitive?.noul
    return typeof difficulty === 'number' && typeof domain === 'string'
      ? { difficulty, domain, sensitive: typeof noul === 'number' && noul >= 0.5 }
      : null
  } catch {
    return null
  }
}

const summary = (r: LayaRating): string =>
  `difficulty ${r.difficulty.toFixed(2)}, domain ${r.domain}${r.sensitive ? ', sensitive' : ''} → ${tierName(tier(r))}`

export const line = (r: LayaRating): string =>
  `laya: ${summary(r)} (advisory; an Agent call that names no model gets this tier)`

export const status = (r: LayaRating, routed?: string): string =>
  `laya ${summary(r)}${routed ? ` · routed ${routed}` : ''}`

export const timeoutMs = (raw: string | undefined): number => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS
}

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

export const report = (log: readonly LayaLogEntry[]): string => {
  if (log.length === 0) return 'laya: no rated turns logged yet.'
  const d = log.map(e => e.difficulty).sort((a, b) => a - b)
  const q = (p: number) => quantile(d, p).toFixed(2)
  return [
    `laya: ${log.length} rated turns since ${new Date(log[0]!.at).toISOString().slice(0, 10)}`,
    `tier: ${counts(log, e => e.tier)}`,
    `model used: ${counts(log, e => e.model)}`,
    `domain: ${counts(log, e => e.domain)}`,
    `difficulty: p10 ${q(0.1)} · p50 ${q(0.5)} · p90 ${q(0.9)} · max ${d.at(-1)!.toFixed(2)}`,
    `sensitive ${log.filter(e => e.sensitive).length} · routed ${log.filter(e => e.routed).length}`,
  ].join('\n')
}
