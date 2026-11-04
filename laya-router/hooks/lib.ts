export const DEFAULT_URL = 'http://127.0.0.1:8765'
export const DEFAULT_TIMEOUT_MS = 2500

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
  needs_tools: { type: 'noul', instructions: 'Does answering `request` require external tools, search or private data?' },
  is_sensitive: { type: 'noul', instructions: 'Does `request` involve money, legal, medical or safety consequences?' },
} as const

export type Rating = { difficulty: number; domain: string }

// Cutoffs are guesses on a loose score: one-liners ~1.3, architecture ~2.2.
export const tier = (d: number): string => (d >= 2.2 ? 'opus high' : d >= 2.0 ? 'opus medium' : 'sonnet high')

export const parse = (text: string): Rating | null => {
  try {
    const a = JSON.parse(text)?.answers
    const difficulty: unknown = a?.difficulty?.score
    const domain: unknown = a?.domain?.choice
    return typeof difficulty === 'number' && typeof domain === 'string' ? { difficulty, domain } : null
  } catch {
    return null
  }
}

export const line = ({ difficulty, domain }: Rating): string =>
  `laya: difficulty ${difficulty}, domain ${domain} → suggested tier: ${tier(difficulty)} (advisory; use it for subagent model and effort choice)`

export const timeoutMs = (raw: string | undefined): number => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS
}
