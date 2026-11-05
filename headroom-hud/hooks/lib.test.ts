import { expect, test } from 'claude-code/testing'

import { compactInstructions, fit, health, modelName, parse, parseTopics, rebase, sinceStart, tokens, width } from './lib'
import type { Band } from './lib'

const STATS = JSON.stringify({
  summary: {
    api_requests: 7,
    compression: { total_tokens_removed: 1200 },
    cost: { total_saved_usd: 0.5, savings_pct: 12.4, provider_cache_discount_usd: 1.25 },
  },
})

test('tokens rolls 999.5k over to M', async () => {
  expect(tokens(999_500)).toBe('1.0M')
  expect(tokens(1_499)).toBe('1k')
  expect(tokens(42)).toBe('42')
})

test('modelName keeps the minor version', async () => {
  expect(modelName('claude-opus-5-5[1m]')).toBe('opus 5.5')
  expect(modelName('claude-sonnet-4-20250514')).toBe('sonnet 4')
  expect(modelName('sonnet')).toBe('sonnet')
})

test('parse reads stats and rejects a changed shape', async () => {
  expect(parse(STATS)?.tokensSaved).toBe(1200)
  expect(parse(STATS.replace('api_requests', 'requests'))).toBeNull()
  expect(parse('not json')).toBeNull()
})

test('rebase counts from zero after a proxy restart', async () => {
  const base = { requests: 10, tokensSaved: 5000, usdSaved: 1 }
  expect(rebase(base, { requests: 11, tokensSaved: 6000, usdSaved: 2 })).toBe(base)
  expect(rebase(base, { requests: 2, tokensSaved: 100, usdSaved: 0.1 }).requests).toBe(0)
})

test('sinceStart is zero at the baseline', async () => {
  const h = { ...parse(STATS)!, base: { requests: 7, tokensSaved: 1200, usdSaved: 0.5 } }
  expect(sinceStart(h)).toEqual({ tokens: 0, usd: 0, requests: 0 })
})

test('compactInstructions keeps typed Other text beside picked topics', async () => {
  const out = compactInstructions(['auth', 'ui', 'db'], 'auth, remember the schema')
  expect(out).toContain('Keep in full detail: auth.')
  expect(out).toContain('Reduce to one line each, or drop: ui; db.')
  expect(out).toContain('Also: remember the schema.')
})

test('parseTopics takes 2-4 string labels only', async () => {
  expect(parseTopics('```json\n["a","b, c"]\n```')).toEqual(['a', 'b  c'])
  expect(parseTopics('["a"]')).toBeUndefined()
  expect(parseTopics('["a","b",1]')).toBeUndefined()
})

const BAND: Band = {
  model: 'opus 5.5',
  level: 'high',
  version: '0.41.0',
  context: { percent: 40, tokens: 80_000, window: 200_000 },
  cost: 1.2,
  stats: { ...parse(STATS)!, base: { requests: 2, tokensSaved: 200, usdSaved: 0.1 } },
}

test('fit picks a tier that fits, down to the leanest', async () => {
  expect(width(fit(BAND, 500))).toBeGreaterThan(width(fit(BAND, 60)))
  for (const room of [120, 80, 60, 40]) {
    const w = width(fit(BAND, room))
    expect(w <= room || w === width(fit(BAND, 0))).toBe(true)
  }
})

test('health tells headroom from another proxy', async () => {
  expect(health('{"service":"headroom-proxy","version":"0.42.0"}')).toEqual({ isHeadroom: true, version: '0.42.0' })
  expect(health('{"version":"0.30.0"}').isHeadroom).toBe(true)
  expect(health('{"service":"litellm","version":"1.0"}').isHeadroom).toBe(false)
  expect(health('<html>').isHeadroom).toBe(false)
})

test('a proxy that is not headroom leaves the band', async () => {
  expect(fit({ ...BAND, stats: 'other' }, 500).some(g => g.text.includes('◈'))).toBe(false)
})
