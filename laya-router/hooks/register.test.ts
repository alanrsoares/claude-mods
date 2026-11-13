import { expect, test } from 'claude-code/testing'

const answer = (score: number, noul = 0.1) =>
  JSON.stringify({ answers: { difficulty: { score }, domain: { choice: 'code' }, is_sensitive: { noul } } })
const ok = (text: string) => ({ value: { status: 200, ok: true, headers: {}, text } })
const SUBMIT = { wait: false, origin: { kind: 'composer' } } as const

type On = (...a: any[]) => unknown
type Hook = (...a: any[]) => unknown
// Stand in for laya-serve and the engine beneath the mod; the kit takes one hook per event, so a test overrides by name.
const engine = (on: On, over: Record<string, Hook> = {}) => {
  const store = new Map<string, unknown>()
  const sent: string[] = []
  const hooks: Record<string, Hook> = {
    'turn.start': (_: unknown, e: { turnId: string }) => ({ turnId: e.turnId }),
    'turn.step': async function* (_: unknown, e: { turnId: string; index: number; model: string }) {
      sent.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as never, usage: null }
    },
    'env.get': () => ({ value: undefined }),
    'clock.sleep': () => new Promise(() => {}),
    'http.fetch': () => ok(answer(2.3)),
    'store.get': (_: unknown, e: { key: string }) => ({ value: store.get(e.key) }),
    'store.set': (_: unknown, e: { key: string; value: unknown }) => (store.set(e.key, e.value), { value: undefined }),
    'ui.status': () => ({ value: undefined }),
    'session.version': () => ({ value: { version: '2.1.323' } }),
    'prompt.submit': (_: unknown, e: { text: string; context?: string[] }) => ({ text: e.text, context: e.context }),
    ...over,
  }
  for (const [name, hook] of Object.entries(hooks)) on(name, hook)
  return { store, sent }
}

test('a rated prompt carries one tier line', async ($, on) => {
  engine(on, {
    'http.fetch': (_: unknown, e: { url: string }) => {
      expect(e.url).toBe('http://127.0.0.1:8765/v1/systemone')
      return ok(answer(2.3))
    },
  })
  const r = await $.prompt.submit({ text: 'design a billing system', ...SUBMIT })
  expect(r.context).toEqual([expect.stringContaining('domain code → opus high')])
})

test('a down server lets the prompt through bare', async ($, on) => {
  engine(on, { 'http.fetch': () => ({ value: { status: 503, ok: false, headers: {}, text: '' } }) })
  const r = await $.prompt.submit({ text: 'hi', ...SUBMIT })
  expect(r.context ?? []).toEqual([])
})

test('a slow server times out and lets the prompt through bare', async ($, on) => {
  engine(on, {
    'env.get': (_: unknown, e: { name: string }) => ({ value: e.name === 'LAYA_TIMEOUT_MS' ? '50' : undefined }),
    'clock.sleep': (_: unknown, e: { ms: number }) => {
      expect(e.ms).toBe(50)
      return { value: undefined }
    },
    'http.fetch': () => new Promise(() => {}),
  })
  const r = await $.prompt.submit({ text: 'hi', ...SUBMIT })
  expect(r.context ?? []).toEqual([])
})

// Run a main turn: its start, then `steps` model requests on `model`.
const runTurn = async ($: any, opts: { turnId?: string; text: string; model: string; steps: number; messages?: number }) => {
  const turnId = opts.turnId ?? 't1'
  await $.turn.start({ text: opts.text, turnId })
  for (let index = 0; index < opts.steps; index++)
    for await (const _ of $.turn.step({ turnId, index, model: opts.model, messageCount: opts.messages ?? 2 }));
}
const OPUS = 'claude-opus-5-5'

const EASY = { 'http.fetch': () => ok(answer(1.2)) }
const PROMPT = 'rename x to y'

test('routing off: the turn keeps its model and is logged once', async ($, on) => {
  const { store, sent } = engine(on, EASY)
  await $.prompt.submit({ text: PROMPT, ...SUBMIT })
  await runTurn($, { text: PROMPT, model: OPUS, steps: 2 })
  expect(sent).toEqual([OPUS, OPUS])
  expect(store.get('log')).toEqual([expect.objectContaining({ tier: 'sonnet high', model: OPUS, routed: false })])
})

test('routing on: an easy opus turn goes to sonnet for every step', { options: { route: true } }, async ($, on) => {
  const { store, sent } = engine(on, EASY)
  await $.prompt.submit({ text: PROMPT, ...SUBMIT })
  await runTurn($, { text: PROMPT, model: OPUS, steps: 2 })
  expect(sent).toEqual(['sonnet', 'sonnet'])
  expect(store.get('log')).toEqual([expect.objectContaining({ model: 'sonnet', routed: true })])
})

test('routing on: a long conversation stays put', { options: { route: true } }, async ($, on) => {
  const { sent } = engine(on, EASY)
  await $.prompt.submit({ text: PROMPT, ...SUBMIT })
  await runTurn($, { text: PROMPT, model: OPUS, steps: 1, messages: 41 })
  expect(sent).toEqual([OPUS])
})

test('routing on: a continuation turn with no prompt is not routed or logged', { options: { route: true } }, async ($, on) => {
  const { store, sent } = engine(on, EASY)
  await $.prompt.submit({ text: PROMPT, ...SUBMIT })
  await runTurn($, { text: PROMPT, model: OPUS, steps: 1 })
  await runTurn($, { turnId: 't2', text: '', model: OPUS, steps: 1 })
  expect(sent).toEqual(['sonnet', OPUS])
  expect((store.get('log') as unknown[]).length).toBe(1)
})

test('routing on: a host older than 2.1.309 is not routed', { options: { route: true } }, async ($, on) => {
  const { store, sent } = engine(on, { ...EASY, 'session.version': () => ({ value: { version: '2.1.300' } }) })
  await $.prompt.submit({ text: PROMPT, ...SUBMIT })
  await runTurn($, { text: PROMPT, model: OPUS, steps: 2 })
  expect(sent).toEqual([OPUS, OPUS])
  expect(store.get('log')).toEqual([expect.objectContaining({ routed: false })])
})

test('routing on: a failed log write keeps the turn on one model', { options: { route: true } }, async ($, on) => {
  const { sent } = engine(on, {
    ...EASY,
    'store.set': () => {
      throw new Error('disk full')
    },
  })
  await $.prompt.submit({ text: PROMPT, ...SUBMIT })
  await runTurn($, { text: PROMPT, model: OPUS, steps: 2 })
  expect(sent).toEqual(['sonnet', 'sonnet'])
})

test('an unrated prompt clears the tier an Agent call would get', async ($, on) => {
  let calls = 0
  let seen: { model?: string } = {}
  engine(on, {
    'http.fetch': () =>
      ++calls === 1 ? ok(answer(1.5, 0.9)) : { value: { status: 503, ok: false, headers: {}, text: '' } },
    'tool.call': (_: unknown, e: typeof seen) => ((seen = e), { result: {} as never }),
  })
  await $.prompt.submit({ text: 'is this contract clause legal?', ...SUBMIT })
  await $.prompt.submit({ text: 'now something else', ...SUBMIT })
  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' })
  expect(seen.model).toBeUndefined()
})

test('an Agent call that names no model gets the tier', async ($, on) => {
  let seen: { model?: string; effort?: string } = {}
  engine(on, {
    'http.fetch': () => ok(answer(1.5, 0.9)),
    'tool.call': (_: unknown, e: typeof seen) => ((seen = e), { result: {} as never }),
  })
  await $.prompt.submit({ text: 'is this contract clause legal?', ...SUBMIT })

  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p' })
  expect(seen).toMatchObject({ model: 'opus', effort: 'medium' })

  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', model: 'haiku' })
  expect(seen.model).toBe('haiku')
  expect(seen.effort).toBeUndefined()

  await $.tool.call({ tool: 'Agent', description: 'd', prompt: 'p', subagent_type: 'Explore' })
  expect(seen.model).toBeUndefined()
})
