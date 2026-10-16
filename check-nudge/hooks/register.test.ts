import { expect, test } from 'claude-code/testing'

const finish = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('turn.complete', () => ({ text: 'done' }))
  on('tool.call', () => ({ result: {} as never }))
}

const turn = { answer: 'x', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const

test('warns when apps/web was edited and check never ran', async ($, on) => {
  finish(on)
  await $.tool.call({ tool: 'Edit', file_path: '/r/apps/web/src/a.ts', old_string: 'a', new_string: 'b' })
  const out = await $.turn.complete(turn)
  expect(out.text).toContain('bun run check not run')
})

test('stays quiet once check ran', async ($, on) => {
  finish(on)
  await $.tool.call({ tool: 'Edit', file_path: '/r/apps/web/src/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'bun run check' })
  const out = await $.turn.complete(turn)
  expect(out.text).toBe('done')
})

test('stays quiet when nothing under apps/web changed', async ($, on) => {
  finish(on)
  await $.tool.call({ tool: 'Write', file_path: '/r/docs/a.md', content: 'x' })
  const out = await $.turn.complete(turn)
  expect(out.text).toBe('done')
})
