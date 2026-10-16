import type { Register } from 'claude-code'

import { lint, summary } from './lint'

const RULES = `Write in ASD-STE100 Simplified Technical English.
- Use one word for one meaning. Use short, common words.
- Use active voice and simple tenses. Do not use -ing forms as verbs.
- Keep articles (a, an, the). Do not drop them.
- Write at most 20 words in an instruction and 25 in a description.
- Write at most 6 sentences in a paragraph. Put one idea in each sentence.
- Do not apply these rules to code, commands, paths, identifiers or quoted text.`

const SUBAGENT_NOTE = 'Write your answer in ASD-STE100 Simplified Technical English: short active sentences, no dropped articles, code exempt.'

const isOn = async ($: { store: { get: (k: string) => Promise<unknown> } }) =>
  (await $.store.get('isOn')) !== false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ste',
      description: 'STE100 mode: /ste on, /ste off, or /ste to show.',
    })
    return next(e)
  })

  on('command.run', { command: 'ste' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') await $.store.set('isOn', arg === 'on')
    return { text: `STE100 ${(await isOn($)) ? 'on' : 'off'}.` }
  })

  on('prompt.compose', async ($, e, next) => {
    const done = await next(e)
    if (!(await isOn($))) return done
    return {
      sections: [...done.sections, { id: 'ste100:rules', text: RULES, scope: 'session' }],
    }
  })

  on('agent.spawn', async ($, e, next) =>
    (await isOn($)) ? next({ ...e, prompt: `${SUBAGENT_NOTE}\n\n${e.prompt}` }) : next(e),
  )

  on('turn.complete', async ($, e, next) => {
    if (e.reason === 'answer' && e.agentId === undefined && (await isOn($))) {
      $.ui.status(summary(lint(e.answer)))
    }
    return next(e)
  })
}
