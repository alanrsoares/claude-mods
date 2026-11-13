import { expect, test } from 'claude-code/testing'

import type { LayaLogEntry } from '../types'
import { agentDefaults, DEFAULT_TIMEOUT_MS, line, parse, report, route, tier, tierName, timeoutMs } from './lib'

const ANSWER = JSON.stringify({
  answers: { difficulty: { score: 2.15 }, domain: { choice: 'code' }, is_sensitive: { noul: 0.2 } },
})
const r = (difficulty: number, sensitive = false) => ({ difficulty, domain: 'code', sensitive })
const SONNET = { model: 'sonnet', effort: 'high' } as const

test('tier follows the cutoffs', async () => {
  expect(tierName(tier(r(1.99)))).toBe('sonnet high')
  expect(tierName(tier(r(2.0)))).toBe('opus medium')
  expect(tierName(tier(r(2.2)))).toBe('opus high')
})

test('a sensitive prompt goes one tier up, capped at the top', async () => {
  expect(tierName(tier(r(1.5, true)))).toBe('opus medium')
  expect(tierName(tier(r(2.0, true)))).toBe('opus high')
  expect(tierName(tier(r(2.5, true)))).toBe('opus high')
})

test('parse reads the answers and rejects a changed shape', async () => {
  expect(parse(ANSWER)).toEqual(r(2.15))
  expect(parse(ANSWER.replace('0.2', '0.7'))).toEqual(r(2.15, true))
  expect(parse(ANSWER.replace(',"is_sensitive":{"noul":0.2}', ''))).toEqual(r(2.15))
  expect(parse(ANSWER.replace('score', 'value'))).toBeNull()
  expect(parse('not json')).toBeNull()
})

test('line names the tier', async () => {
  expect(line(r(2.15))).toContain('domain code → opus medium')
  expect(line(r(1.2, true))).toContain('domain code, sensitive → opus medium')
})

test('timeoutMs falls back on a bad value', async () => {
  expect(timeoutMs('900')).toBe(900)
  expect(timeoutMs(undefined)).toBe(DEFAULT_TIMEOUT_MS)
  expect(timeoutMs('-1')).toBe(DEFAULT_TIMEOUT_MS)
  expect(timeoutMs('abc')).toBe(DEFAULT_TIMEOUT_MS)
})

test('agentDefaults fills generic agents that name no model', async () => {
  expect(agentDefaults({}, SONNET)).toEqual(SONNET)
  expect(agentDefaults({ subagent_type: 'general-purpose' }, SONNET)).toEqual(SONNET)
  expect(agentDefaults({ model: 'haiku' }, SONNET)).toBeNull()
  expect(agentDefaults({ subagent_type: 'Explore' }, SONNET)).toBeNull()
  expect(agentDefaults({ subagent_type: 'fork' }, SONNET)).toBeNull()
})

test('route only moves an opus session down, and only while short', async () => {
  expect(route('claude-opus-5-5', SONNET, 10, 40)).toBe('sonnet')
  expect(route('claude-opus-5-5', SONNET, 41, 40)).toBeNull()
  expect(route('claude-opus-5-5', { model: 'opus', effort: 'high' }, 10, 40)).toBeNull()
  expect(route('claude-sonnet-5-5', SONNET, 10, 40)).toBeNull()
})

test('report counts tiers and spreads difficulty', async () => {
  expect(report([])).toBe('laya: no rated turns logged yet.')
  const log: LayaLogEntry[] = [1.2, 1.6, 2.3].map((d, i) => ({
    ...r(d, i === 0),
    at: Date.UTC(2026, 10, 13),
    tier: tierName(tier(r(d, i === 0))),
    model: 'opus',
    routed: false,
  }))
  const out = report(log)
  expect(out).toContain('3 rated turns since 2026-11-13')
  expect(out).toContain('tier: opus medium 1 · sonnet high 1 · opus high 1')
  expect(out).toContain('max 2.30')
  expect(out).toContain('sensitive 1 · routed 0')
})
