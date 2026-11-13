import { expect, test } from 'claude-code/testing'

import type { LayaLogEntry } from '../types'
import {
  agentDefaults,
  bar,
  DEFAULT_TIMEOUT_MS,
  holdout,
  lowerEffort,
  parse,
  pearson,
  perMessageEffort,
  report,
  resolvesAliases,
  route,
  status,
  tier,
  tierName,
  timeoutMs,
} from './lib'

const ANSWER = JSON.stringify({
  answers: { difficulty: { score: 2.15 }, domain: { choice: 'code' }, is_sensitive: { noul: 0.2 } },
})
const r = (difficulty: number, sensitive = false) => ({ difficulty, domain: 'code', sensitive })
const SONNET = { model: 'sonnet', effort: 'high' } as const

test('tier follows the cutoffs', async () => {
  expect(tierName(tier(r(1.49)))).toBe('sonnet high')
  expect(tierName(tier(r(1.5)))).toBe('opus medium')
  expect(tierName(tier(r(1.9)))).toBe('opus high')
})

test('a sensitive prompt goes one tier up, capped at the top', async () => {
  expect(tierName(tier(r(1.2, true)))).toBe('opus medium')
  expect(tierName(tier(r(1.5, true)))).toBe('opus high')
  expect(tierName(tier(r(2.5, true)))).toBe('opus high')
})

test('parse reads the answers and rejects a changed shape', async () => {
  expect(parse(ANSWER)).toEqual(r(2.15))
  expect(parse(ANSWER.replace('0.2', '0.7'))).toEqual(r(2.15, true))
  expect(parse(ANSWER.replace(',"is_sensitive":{"noul":0.2}', ''))).toBeNull()
  expect(parse(ANSWER.replace('score', 'value'))).toBeNull()
  expect(parse('not json')).toBeNull()
})

test('lowerEffort only lowers, and only easy turns', async () => {
  expect(lowerEffort(r(0.8), 'high')).toBe('low')
  expect(lowerEffort({ ...r(1.4), domain: 'chitchat' }, 'high')).toBe('low')
  expect(lowerEffort(r(1.4), 'high')).toBe('medium')
  expect(lowerEffort(r(1.4), 'xhigh')).toBe('medium')
  expect(lowerEffort({ ...r(1.9), domain: 'chitchat' }, 'high')).toBeNull()
  expect(lowerEffort(r(1.6), 'high')).toBeNull()
  expect(lowerEffort(r(1.4), 'medium')).toBeNull()
  expect(lowerEffort(r(0.8), 'low')).toBeNull()
  expect(lowerEffort(r(0.8), undefined)).toBeNull()
  expect(lowerEffort(r(0.8), 3)).toBeNull()
})

test('perMessageEffort reads the capability list', async () => {
  expect(perMessageEffort('per_turn_effort')).toBe(true)
  expect(perMessageEffort('foo,per_turn_effort')).toBe(true)
  expect(perMessageEffort('per_turn_effort_x')).toBe(false)
  expect(perMessageEffort(undefined)).toBe(false)
})

test('resolvesAliases needs 2.1.309 or later', async () => {
  expect(resolvesAliases('2.1.308')).toBe(false)
  expect(resolvesAliases('2.1.309')).toBe(true)
  expect(resolvesAliases('2.1.323-dev.20261101.t101500.sha1a2b3c4')).toBe(true)
  expect(resolvesAliases('2.2.0')).toBe(true)
  expect(resolvesAliases('3.0.0')).toBe(true)
  expect(resolvesAliases('1.9.999')).toBe(false)
  expect(resolvesAliases('garbage')).toBe(false)
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
  expect(out).toContain('tier: opus medium 2 · opus high 1')
  expect(out).toContain('max 2.30')
  expect(out).toContain('sensitive 1 · routed 0 · effort lowered 0')
})

test('holdout takes a share in 0..1, else 0', async () => {
  expect(holdout(0.5)).toBe(0.5)
  expect(holdout(1)).toBe(1)
  expect(holdout(undefined)).toBe(0)
  expect(holdout(1.5)).toBe(0)
  expect(holdout('0.5')).toBe(0)
})

test('pearson needs 3 points and spread', async () => {
  expect(pearson([1, 2, 3], [2, 4, 6])?.toFixed(6)).toBe("1.000000")
  expect(pearson([1, 2, 3], [6, 4, 2])?.toFixed(6)).toBe("-1.000000")
  expect(pearson([1, 2], [1, 2])).toBeNull()
  expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
})

test('report compares applied and holdout turns, leaving aborts out of the fit', async () => {
  const at = Date.UTC(2026, 10, 13)
  const e = (difficulty: number, outputTokens: number, applied: boolean, aborted = false): LayaLogEntry => ({
    ...r(difficulty),
    at,
    tier: tierName(tier(r(difficulty))),
    model: 'opus',
    routed: false,
    applied,
    latencyMs: 300,
    steps: 2,
    outputTokens,
    durationMs: 4000,
    aborted,
    agentFills: 1,
  })
  const out = report([e(1, 100, true), e(2, 200, false), e(3, 300, true), e(1.5, 5, true, true)], 4)
  expect(out).toContain('fit 3: difficulty ~ out tokens r 1.00 · ~ steps r —')
  expect(out).toContain('applied 3: out tokens 200 · steps 2 · 4 s · aborted 1 · agent fills 3')
  expect(out).toContain('holdout 1: out tokens 200')
  expect(out).toContain('laya latency: p50 300 ms · p90 300 ms · misses 4')
  expect(report([{ ...r(1), at, tier: 'sonnet high', model: 'opus', routed: false }])).not.toContain('fit')
})

test('status draws the bar, the tier badge and the marks', async () => {
  expect(bar(0)).toBe('▱▱▱▱▱▱')
  expect(bar(1.44)).toBe('▰▰▰▱▱▱')
  expect(bar(9)).toBe('▰▰▰▰▰▰')
  expect(status(r(1.44))).toBe('laya ▰▰▰▱▱▱ 1.44 · code · ◔ sonnet high')
  expect(status(r(2.3))).toBe('laya ▰▰▰▰▰▱ 2.30 · code · ● opus high')
  expect(status(r(1.2, true), { routed: 'sonnet', effort: 'medium', holdout: true })).toBe(
    'laya ▰▰▱▱▱▱ 1.20 · code · ◑ opus medium · ⚠ sensitive · ↘ sonnet · ↓ medium · ◌ holdout',
  )
  expect(status({ ...r(1.44), latencyMs: 299 })).toBe('laya ▰▰▰▱▱▱ 1.44 · code · ◔ sonnet high')
  expect(status({ ...r(1.44), latencyMs: 1131 })).toBe('laya ▰▰▰▱▱▱ 1.44 · code · ◔ sonnet high · ⏱ 1.1s')
  expect(status({ ...r(1.44), latencyMs: 300 })).toBe('laya ▰▰▰▱▱▱ 1.44 · code · ◔ sonnet high · ⏱ 300ms')
  expect(status({ ...r(1.44), latencyMs: 999 })).toBe('laya ▰▰▰▱▱▱ 1.44 · code · ◔ sonnet high · ⏱ 999ms')
  expect(status({ ...r(1.44), latencyMs: 1000 })).toBe('laya ▰▰▰▱▱▱ 1.44 · code · ◔ sonnet high · ⏱ 1.0s')
})
