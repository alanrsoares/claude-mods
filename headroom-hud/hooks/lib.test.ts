import { expect, test } from 'claude-code/testing'

import {
  CACHE_TTL_MS,
  cacheRemaining,
  compactInstructions,
  duration,
  effectiveContext,
  exhale,
  fit,
  gauge,
  health,
  isNewer,
  latestRelease,
  modelName,
  NO_SPEND,
  paneColumns,
  parse,
  parseConfig,
  parseTopics,
  rateLimitSegs,
  rebase,
  record,
  rows,
  segments,
  SWEEP_MS,
  sinceStart,
  spark,
  stack,
  TIERS,
  tokens,
  topCategories,
  turnsLeft,
  width,
} from './lib'
import type { Band, Seg } from './lib'

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

test('modelName keeps the minor version and strips provider/ARN wrappers', async () => {
  expect(modelName('claude-opus-5-5[1m]')).toBe('opus 5.5')
  expect(modelName('claude-sonnet-4-20250514')).toBe('sonnet 4')
  expect(modelName('sonnet')).toBe('sonnet')
  expect(modelName('anthropic.claude-sonnet-4-20250514-v1:0')).toBe('sonnet 4')
  expect(modelName('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('sonnet 4.5')
  expect(modelName('global.anthropic.claude-opus-4-6-v1[1m]')).toBe('opus 4.6')
  expect(modelName('arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('sonnet 4.5')
  expect(modelName('arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-opus-4-6-v1[1m]')).toBe('opus 4.6')
  expect(modelName('arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/0a1b2c3d4e5f')).toBe('0a1b2c3d4e5f')
  expect(modelName('arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-3-5-sonnet-20241022-v2:0')).toBe('sonnet 3.5')
  expect(modelName('claude-sonnet-4-5@20250929')).toBe('sonnet 4.5')
  expect(modelName('claude-3-5-sonnet-v2@20241022')).toBe('sonnet 3.5')
  expect(modelName('anthropic/claude-sonnet-4.5')).toBe('sonnet 4.5')
  expect(modelName('anthropic/claude-3.7-sonnet:thinking')).toBe('sonnet 3.7')
  expect(modelName('openrouter/anthropic/claude-opus-4.6:beta')).toBe('opus 4.6')
  expect(modelName('bedrock/invoke/us.anthropic.claude-sonnet-4-6')).toBe('sonnet 4.6')
  expect(modelName('vertex_ai/claude-sonnet-4-6')).toBe('sonnet 4.6')
  expect(modelName('google/gemini-2.5-pro:free')).toBe('gemini-2.5-pro')
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

test('each turn is a step of the session total, and /clear starts over', async () => {
  const s = [1, 1.5, 1.5, 3].reduce(record, { prev: 1, turns: [] } as typeof NO_SPEND)
  expect(s.turns).toEqual([0, 0.5, 0, 1.5]) // a turn that cost nothing shows as zero, not as the turn before
  expect(record(s, 0.2)).toEqual({ prev: 0.2, turns: [] })
  expect(spark([0.5, 1.5, 0.1])).toBe('▃█▁')
  expect(duration(125 * 60_000)).toBe('2h05')
  expect(duration(45_000)).toBe('45s')
})

test('the pane shows the session time and the cost of recent turns', async () => {
  const lines = rows({ ...BAND, elapsed: 25 * 60_000, turns: [0.1, 0.3, 0.2] }).map(l => l[0]?.text)
  expect(lines).toContain('  ⏱ 25m')
  expect(lines).toContain('  ▃█▆ $0.20/turn')
  expect(rows({ ...BAND, turns: [0.1] }).some(l => l[0]?.text.includes('/turn'))).toBe(false)
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

test('the gauge comet sweeps out and back with a fading tail, one width', async () => {
  const at = (ms: number) => gauge(40, 5, { color: 'green' }, ms)
  const text = (segs: Seg[]) => segs.map(g => g.text).join('')
  expect(text(gauge(40, 5, { color: 'green' }))).toBe('▰▰▱▱▱')
  // out, 3/4 of the way: head at cell 3, tail fading left over cells 2 and 1
  expect(at(SWEEP_MS * 0.75)).toEqual([{ text: '▰', color: 'green' }, { text: '▰', color: 'claude', dim: true }, { text: '▰▰', color: 'claude' }, { text: '▱', color: 'green' }])
  // back, 1/4 of the way: head at cell 3, tail to its right
  expect(at(SWEEP_MS * 1.25).slice(-1)).toEqual([{ text: '▰▰', color: 'claude' }])
  expect(at(2 * SWEEP_MS)).toEqual(at(0))
  for (let ms = 0; ms < 4 * SWEEP_MS; ms += 50) expect(width(at(ms))).toBe(5)
})

test('a sweep takes as long on a wide gauge as on a narrow one', async () => {
  // the cell index of the first comet cell
  const headAt = (cells: number) => {
    const segs = gauge(0, cells, {}, SWEEP_MS)
    return width(segs.slice(0, segs.findIndex(g => g.color === 'claude')))
  }
  // one sweep in, the head is on the last cell at any width
  expect(headAt(30)).toBe(29)
  expect(headAt(10)).toBe(9)
})

test('the breath is dim at rest, bright at its peak', async () => {
  expect(exhale(0)).toBe(true)
  expect(exhale(1200)).toBe(false)
  expect(exhale(2400)).toBe(true)
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

test('effectiveContext caps window from settings/breakdown and lowers nudgeAt for threshold overrides', async () => {
  const capped = effectiveContext({ percent: 16, tokens: 160_000, window: 1_000_000 }, { window: 200_000 }, 75)
  expect(capped.context.window).toBe(200_000)
  expect(capped.context.percent).toBe(80)
  expect(capped.nudgeAt).toBe(75)

  const overridden = effectiveContext(
    { percent: 55, tokens: 110_000, window: 200_000 },
    { window: 200_000, threshold: 120_000 },
    75,
  )
  expect(overridden.nudgeAt).toBe(55)
})

test('record tracks token growth, resets on compaction, and estimates turnsLeft', async () => {
  let s = record({ prev: 0, turns: [], prevTokens: 50_000, growth: [] }, 0.2, 60_000)
  s = record(s, 0.5, 80_000)
  expect(s.growth).toEqual([10_000, 20_000])
  expect(turnsLeft(80_000, 170_000, s.growth)).toBe(6)
  // compaction drops tokens and resets growth
  s = record(s, 0.7, 30_000)
  expect(s.growth).toEqual([])
  expect(turnsLeft(30_000, 170_000, s.growth)).toBeUndefined()
})

test('topCategories keeps top used non-deferred categories with short names', async () => {
  const cats = topCategories([
    { name: 'Free space', tokens: 100_000, color: 'inactive', isDeferred: false, kind: 'free' },
    { name: 'MCP tools', tokens: 18_000, color: 'cyan', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 62_000, color: 'green', isDeferred: false, kind: 'used' },
    { name: 'Deferred tools', tokens: 40_000, color: 'dim', isDeferred: true, kind: 'deferred' },
    { name: 'Memory files', tokens: 4_000, color: 'yellow', isDeferred: false, kind: 'used' },
    { name: 'System tools', tokens: 12_000, color: 'blue', isDeferred: false, kind: 'used' },
  ])
  expect(cats).toEqual([
    { name: 'msg', tokens: 62_000 },
    { name: 'mcp', tokens: 18_000 },
    { name: 'tools', tokens: 12_000 },
  ])
})

test('pane renders rate limits, running agents, categories, turns-left, and cache warmth', async () => {
  const now = 1_000_000
  const resetsAt = new Date(now + 72 * 60_000).toISOString()
  expect(rateLimitSegs({ kind: 'five_hour', percentUsed: 86, resetsAt }, now)).toEqual([
    { text: '  5h ', dim: true },
    { text: '86%', color: 'red' },
    { text: ' · 1h12', dim: true },
  ])
  expect(cacheRemaining(now - 60_000, now)).toBe(CACHE_TTL_MS - 60_000)
  expect(cacheRemaining(now - CACHE_TTL_MS - 1_000, now)).toBe(0)

  const lines = rows({
    ...BAND,
    turnsLeft: 5,
    categories: [
      { name: 'msg', tokens: 62_000 },
      { name: 'mcp', tokens: 18_000 },
    ],
    agents: 2,
    cacheMs: 220_000,
    rateLimits: [{ kind: 'five_hour', percentUsed: 42, resetsAt }],
    now,
  }).map(l => l.map(g => g.text).join(''))
  expect(lines[0]).toContain('~5t')
  expect(lines).toContain('  msg 62k · mcp 18k')
  expect(lines).toContain('  ⛁ warm 3m')
  expect(lines).toContain('  ⚡ 2 agents')
  expect(lines).toContain('  5h 42% · 1h12')
  expect(segments({ ...BAND, agents: 2 }, TIERS[0]).map(g => g.text).join('')).toContain('⚡2')
})

test('parseConfig defaults omitted keys to true and respects boolean overrides', async () => {
  expect(parseConfig()).toMatchObject({ autoDock: true, showCost: true, showProxy: true })
  const cfg = parseConfig({ showCost: false, autoDock: false, showProxy: 'nope' })
  expect(cfg.showCost).toBe(false)
  expect(cfg.autoDock).toBe(false)
  expect(cfg.showProxy).toBe(true)
})
