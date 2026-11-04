import type { Register } from 'claude-code'

import { DEFAULT_URL, line, parse, QUESTIONS, timeoutMs } from './lib'

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || !e.text.trim()) return next(e)
    const url = (await $.env.get('LAYA_URL')) ?? DEFAULT_URL
    const ms = timeoutMs(await $.env.get('LAYA_TIMEOUT_MS'))
    // $.http.fetch takes no timeout and $ calls do not count against the hook budget.
    const res = await Promise.race([
      $.http
        .fetch(`${url}/v1/systemone`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ state: { request: e.text }, questions: QUESTIONS }),
        })
        .catch(() => null),
      $.clock.sleep(ms, { signal: next.signal }).then(
        () => null,
        () => null,
      ),
    ])
    const rating = res?.ok ? parse(res.text) : null
    return next(rating ? { ...e, context: [...(e.context ?? []), line(rating)] } : e)
  }).catch((_$, e, next) => next(e))
}
