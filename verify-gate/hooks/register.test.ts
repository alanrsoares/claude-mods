import { expect, test } from 'claude-code/testing'

type On = (...a: any[]) => unknown
const turn = { answer: 'x', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const
const OK = { result: {} as never }
const FAIL = { isError: true, result: 'exit 1', text: 'exit 1' } as never

// Stand in for the engine: every tool succeeds unless `fails` matches its command.
const engine = (on: On, fails?: RegExp) => {
  on('turn.complete', () => ({ text: 'done' }))
  on('tool.call', (_: unknown, e: { command?: string }) => (fails && e.command && fails.test(e.command) ? FAIL : OK))
  on('tool.check', () => ({ decision: 'allow' }))
}
const edit = (path: string) => ({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' }) as const
const ship = async ($: any, command = 'git commit -m x') =>
  (await $.tool.check({ tool: 'Bash', input: { command } })).decision

test('asks before commit after an edit, allows after a passing check', async ($, on) => {
  engine(on)
  await $.tool.call(edit('/r/src/a.ts'))
  expect(await ship($)).toBe('ask')
  await $.tool.call({ tool: 'Bash', command: 'bun run check' })
  expect(await ship($)).toBe('allow')
})

test('the gate holds across turns', async ($, on) => {
  engine(on)
  await $.tool.call(edit('/r/src/a.ts'))
  await $.turn.complete(turn)
  expect(await ship($)).toBe('ask')
})

test('a subagent finishing keeps the gate', async ($, on) => {
  engine(on)
  await $.tool.call(edit('/r/src/a.ts'))
  await $.turn.complete({ ...turn, agentId: 'a1' })
  expect(await ship($)).toBe('ask')
})

test('an edit after the check closes the gate again', async ($, on) => {
  engine(on)
  await $.tool.call(edit('/r/src/a.ts'))
  await $.tool.call({ tool: 'Bash', command: 'bun run check' })
  await $.tool.call(edit('/r/src/b.ts'))
  expect(await ship($)).toBe('ask')
})

test('a failing check does not verify', async ($, on) => {
  engine(on, /check/)
  await $.tool.call(edit('/r/src/a.ts'))
  await $.tool.call({ tool: 'Bash', command: 'bun run check' })
  expect(await ship($)).toBe('ask')
})

test('notebook edits count when watched', { options: { watch: '\\.ipynb$' } }, async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'NotebookEdit', notebook_path: '/r/n.ipynb', new_source: 'x' })
  expect(await ship($)).toBe('ask')
})

test('unwatched files and plain commands pass', async ($, on) => {
  engine(on)
  await $.tool.call({ tool: 'Write', file_path: '/r/docs/a.md', content: 'x' })
  expect(await ship($)).toBe('allow')
  await $.tool.call(edit('/r/src/a.ts'))
  expect(await ship($, 'git status')).toBe('allow')
})

test('check && commit in one command passes; check; commit asks', async ($, on) => {
  engine(on)
  await $.tool.call(edit('/r/src/a.ts'))
  expect(await ship($, 'bun run check && git commit -m x')).toBe('allow')
  expect(await ship($, 'bun run check; git commit -m x')).toBe('ask')
  expect(await ship($, 'git commit -m x && bun run check')).toBe('ask')
})

test('warns once at the end of a turn that left code unverified', async ($, on) => {
  engine(on)
  await $.tool.call(edit('/r/src/a.ts'))
  expect((await $.turn.complete(turn)).text).toContain('no check passed since')
  expect((await $.turn.complete(turn)).text).toBe('done')
})

test('options narrow the watch and name the check', { options: { watch: '(^|/)apps/web/', check: '\\bfanout check\\b' } }, async ($, on) => {
  engine(on)
  await $.tool.call(edit('/r/apps/api/a.ts'))
  expect(await ship($)).toBe('allow')
  await $.tool.call(edit('/r/apps/web/a.ts'))
  await $.tool.call({ tool: 'Bash', command: 'bun run check' })
  expect(await ship($)).toBe('ask')
  await $.tool.call({ tool: 'Bash', command: 'fanout check --bail' })
  expect(await ship($)).toBe('allow')
})
