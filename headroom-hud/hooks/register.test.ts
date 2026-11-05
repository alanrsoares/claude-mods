import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// the test runtime has timers; the mod's typings leave them out
declare const setTimeout: (fn: () => void, ms: number) => unknown

const res = (text: string) => ({ value: { status: 200, ok: true, headers: {}, text } })
const STATS = JSON.stringify({
  summary: {
    api_requests: 7,
    compression: { total_tokens_removed: 1200 },
    cost: { total_saved_usd: 0.5, savings_pct: 12.4, provider_cache_discount_usd: 1.25 },
  },
})

const start = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], health: string) => {
  const urls: string[] = []
  const keys: string[] = []
  const state: Record<string, unknown> = {}
  on('state.set', ($, e, next) => {
    state[e.key] = e.value
    return next(e)
  })
  on('env.get', () => ({ value: 'http://proxy' }))
  on('session.usage', () => ({ value: { startedAt: 1, context: { percent: 10, window: 200_000 }, rateLimits: [] } }))
  on('session.start', (_, e) => e)
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => new Promise(() => {}))
  on('store.keys', () => ({ value: ['base', `base:${Date.now() - 1e3}`, 'effort'] }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.delete', (_, e) => {
    keys.push(e.key)
    return { value: undefined }
  })
  on('http.fetch', (_, e) => {
    urls.push(e.url)
    return res(e.url.endsWith('/health') ? health : STATS)
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await new Promise<void>(r => setTimeout(r, 50))
  return { urls, keys, state }
}

test('a proxy that is not headroom stops the polling', async ($, on) => {
  const { urls, state } = await start($, on, '{"detail":"Not Found"}')
  expect(urls).toEqual(['http://proxy/health'])
  expect(state.other).toBe(true)
})

test('headroom is polled once, and the legacy shared baseline is dropped', async ($, on) => {
  const { urls, keys, state } = await start($, on, '{"service":"headroom-proxy","version":"0.42.0"}')
  expect(urls).toEqual(['http://proxy/health', 'http://proxy/stats'])
  expect(keys).toEqual(['base'])
  expect((state.headroom as { requests: number }).requests).toBe(7)
})
