import { expect, test } from 'claude-code/testing'

import { compactInstructions, fit, health, isNewer, latestRelease, modelName, paneColumns, parse, parseTopics, rebase, rows, segments, sinceStart, stack, TIERS, tokens, width } from './lib'
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

test('the pane is as wide as its widest line, and drops the proxy for another one', async () => {
  const lines = rows(BAND)
  expect(paneColumns(lines)).toBe(Math.max(...lines.map(width)))
  expect(rows({ ...BAND, stats: 'other' })).toHaveLength(2)
  expect(rows({ ...BAND, stats: null }).at(-1)?.[0]?.text).toBe('  …')
})

test('stack wraps to two rows before it drops facts', async () => {
  const full = width(segments(BAND, TIERS[0]))
  expect(stack(BAND, full)).toHaveLength(1)
  const two = stack(BAND, full - 1)
  expect(two).toHaveLength(2)
  expect(two.map(width).reduce((a, b) => a + b)).toBe(full - 3) // the ` │ ` between halves goes
  expect(stack({ ...BAND, stats: 'other' }, 10)).toHaveLength(1)
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

test('a spinner frame takes the proxy glyph and the pending dots', async () => {
  expect(segments({ ...BAND, spin: '◆' }, TIERS[0]).some(g => g.text.startsWith('◆ '))).toBe(true)
  expect(rows({ ...BAND, stats: null, spin: '◆' }).at(-1)?.[0]?.text).toBe('  ◆')
})

test('an update is a newer plain release on PyPI', async () => {
  expect(latestRelease('{"info":{"version":"0.43.1"}}')).toBe('0.43.1')
  expect(latestRelease('{"info":{"version":"0.44.0rc1"}}')).toBeUndefined()
  expect(latestRelease('<html>')).toBeUndefined()
  expect(isNewer('0.43.1', '0.42.0')).toBe(true)
  expect(isNewer('0.10.0', '0.9.9')).toBe(true)
  expect(isNewer('0.42', '0.42.0')).toBe(false)
  expect(isNewer('0.41.9', '0.42.0')).toBe(false)
})
