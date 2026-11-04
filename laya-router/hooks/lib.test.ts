import { expect, test } from 'claude-code/testing'

import { DEFAULT_TIMEOUT_MS, line, parse, tier, timeoutMs } from './lib'

const ANSWER = JSON.stringify({ answers: { difficulty: { score: 2.15 }, domain: { choice: 'code' } } })

test('tier follows the cutoffs', async () => {
  expect(tier(1.99)).toBe('sonnet high')
  expect(tier(2.0)).toBe('opus medium')
  expect(tier(2.2)).toBe('opus high')
})

test('parse reads the answers and rejects a changed shape', async () => {
  expect(parse(ANSWER)).toEqual({ difficulty: 2.15, domain: 'code' })
  expect(parse(ANSWER.replace('score', 'value'))).toBeNull()
  expect(parse('not json')).toBeNull()
})

test('line names the tier', async () => {
  expect(line({ difficulty: 2.15, domain: 'code' })).toContain('domain code → suggested tier: opus medium')
})

test('timeoutMs falls back on a bad value', async () => {
  expect(timeoutMs('900')).toBe(900)
  expect(timeoutMs(undefined)).toBe(DEFAULT_TIMEOUT_MS)
  expect(timeoutMs('-1')).toBe(DEFAULT_TIMEOUT_MS)
  expect(timeoutMs('abc')).toBe(DEFAULT_TIMEOUT_MS)
})
