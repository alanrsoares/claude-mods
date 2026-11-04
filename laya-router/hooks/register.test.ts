import { expect, test } from 'claude-code/testing'

const ANSWER = JSON.stringify({ answers: { difficulty: { score: 2.3 }, domain: { choice: 'code' } } })
const OK = { value: { status: 200, ok: true, headers: {}, text: ANSWER } }

test('a rated prompt carries one tier line', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('clock.sleep', () => new Promise(() => {}))
  on('http.fetch', (_, e) => {
    expect(e.url).toBe('http://127.0.0.1:8765/v1/systemone')
    return OK
  })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  const r = await $.prompt.submit({ text: 'design a billing system', wait: false, origin: { kind: 'composer' } })
  expect(r.context).toEqual([expect.stringContaining('suggested tier: opus high')])
})

test('a down server lets the prompt through bare', async ($, on) => {
  on('env.get', () => ({ value: undefined }))
  on('clock.sleep', () => new Promise(() => {}))
  on('http.fetch', () => ({ value: { status: 503, ok: false, headers: {}, text: '' } }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  const r = await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  expect(r.context ?? []).toEqual([])
})

test('a slow server times out and lets the prompt through bare', async ($, on) => {
  on('env.get', (_, e) => ({ value: e.name === 'LAYA_TIMEOUT_MS' ? '50' : undefined }))
  on('clock.sleep', (_, e) => {
    expect(e.ms).toBe(50)
    return { value: undefined }
  })
  on('http.fetch', () => new Promise(() => {}))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  const r = await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  expect(r.context ?? []).toEqual([])
})
