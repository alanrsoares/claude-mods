import { expect, test } from 'claude-code/testing'

test('an Agent call is put to the decider', async $ => {
  const verdict = await $.tool.check({ tool: 'Agent', input: {} })
  expect(verdict.decision).toBe('ask')
})

test('other tools reach the engine untouched', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))
  const verdict = await $.tool.check({ tool: 'Read', input: { file_path: '/tmp/x' } })
  expect(verdict.decision).toBe('allow')
})
