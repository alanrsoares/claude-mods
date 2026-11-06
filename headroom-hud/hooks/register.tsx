import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Headroom, Totals } from '../types'
import {
  type Band,
  type Seg,
  DOWN,
  MAX_TOPICS,
  UNREADABLE,
  compactInstructions,
  digest,
  health,
  modelName,
  parse,
  parseTopics,
  rebase,
  paneColumns,
  rows,
  stack,
} from './lib'

const DEFAULT_PROXY = 'http://127.0.0.1:8787'
const POLL_MS = 15_000
const BASE_TTL_MS = 7 * 24 * 3600_000 // a saved baseline outlives its session by this much

const headroom = atom({ plugin: 'headroom-hud', key: 'headroom' } as const, null)
const warned = atom({ plugin: 'headroom-hud', key: 'warned' } as const, false)
const other = atom({ plugin: 'headroom-hud', key: 'other' } as const, false)
const nudge = atom({ plugin: 'headroom-hud', key: 'nudge' } as const, false)
const queued = atom({ plugin: 'headroom-hud', key: 'queued' } as const, null)
const dismissed = atom({ plugin: 'headroom-hud', key: 'dismissed' } as const, false)

const TOOL_ID = 'mcp__headroom-hud__compact'
const PANE = 'hud'
const GAUGE_LINE = 1 // `rows`' context bar
const COMPACT = '\uf066' // nf-fa-compress
const PAD = 1 // cells between the dock's borders and the text, each side

// The main loop's effort as its last request carried it; the session API does not expose it.
// Also kept in the store, so the band shows it again after a reload, before the first request.
let effort: string | number | undefined
let version: string | undefined
// The main loop sent a request since the last poll; while idle, /stats is not fetched.
let isStale = true
// The dock width last asked for; the pane asks again when its widest line changes.
let asked: number | undefined

const COMPACT_AT = 75
const REARM_BELOW = 50

const warnContext = async ($: EngineInterface) => {
  const { context } = await $.session.usage()
  const pct = context.percent ?? 0
  const hasWarned = await read($, warned)
  if (pct >= COMPACT_AT && !hasWarned) {
    await update($, warned, () => true)
    await update($, nudge, () => true)
    $.ui.toast(`◧ context ${pct}% — consider /compact`)
  } else if (pct < REARM_BELOW && hasWarned) {
    await update($, warned, () => false)
  }
}

/** Drops the legacy shared key and baselines of sessions older than BASE_TTL_MS. */
const pruneBases = async ($: EngineInterface, now: number) => {
  for (const key of await $.store.keys()) {
    const at = key === 'base' ? 0 : key.startsWith('base:') ? Number(key.slice(5)) : now
    if (now - at > BASE_TTL_MS) await $.store.delete(key)
  }
}

const band = async ($: EngineInterface): Promise<Band> => {
  const { context, cost } = await $.session.usage()
  const isOther = await read($, other)
  return {
    model: modelName(await $.session.model()),
    level: effort ?? ((await $.store.get('effort')) as string | number | null) ?? undefined,
    version,
    context,
    cost: cost?.usd,
    stats: isOther ? 'other' : await read($, headroom),
  }
}

/** Compacts with what the model asked to keep, once no agent runs and the person agrees. */
const runQueued = async ($: EngineInterface) => {
  const keep = await read($, queued)
  if (keep === null) return
  const agents = await $.agent.list()
  if (agents.some(a => a.status === 'running' || a.status === 'pending')) return // retried at the next turn end
  await update($, queued, () => null)
  const answer = await $.ui.ask(`Compact now, keeping: ${keep}?`, { options: ['Compact', 'Not now'], header: 'Compact' })
  if (answer === 'Compact') await $.session.compact({ instructions: keep })
}

/** Cells the compact button takes after a row: the gap, then the icon. */
const BUTTON_CELLS = 2

/** The band as the strip: one row, or two before it drops facts; the first row ends in the compact button. */
const strip = (
  { Box, Button, Text }: Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Button' | 'Text'>,
  lines: Seg[][],
  onCompact: () => void,
) => (
  <Box flexDirection="column">
    {lines.map((segs, i) => (
      <Box key={`${i}`} flexDirection="row" gap={1}>
        <Text wrap="truncate-end">
          {segs.map((g, j) => (
            <Text key={`${j}`} color={g.color} dimColor={g.dim}>
              {g.text}
            </Text>
          ))}
        </Text>
        {i === 0 && <Button key="compact" plain dimColor label={COMPACT} onPress={onCompact} />}
      </Box>
    ))}
  </Box>
)

export const register: Register = on => {
  // `/compact` asks which topics to keep; any failure leaves the compaction as it was.
  // On `command.run`: a builtin plugin's `session.compact` hook continues past the user tier.
  on('command.run', { command: 'compact' }, async ($, e, next) => {
    if (e.args.trim()) return next(e)
    try {
      const reply = await $.model.complete({
        model: 'haiku',
        prompt: `List the ${MAX_TOPICS} or fewer main topics of this session as a JSON array of short labels. Reply with the JSON only.\n\n${digest(await $.session.messages())}`,
      })
      const topics = reply.isAnswered ? parseTopics(reply.text) : undefined
      if (!topics) return next(e)
      const answer = await $.ui.ask('Which topics must the compaction keep?', {
        options: topics,
        header: 'Compact',
        multiSelect: true,
      })
      const args = compactInstructions(topics, answer)
      return next(args ? { ...e, args } : e)
    } catch {
      return next(e)
    }
  }).catch((_$, e, next) => next(e))

  // The model knows when work is at a seam; the band knows the context fill.
  on('tool.call', { tool: TOOL_ID }, async ($, e) => {
    if (e.agentId !== undefined) return { deny: 'Only the main conversation can ask for a compaction.' }
    const keep = typeof e.keep === 'string' ? e.keep.trim() : ''
    if (!keep) return { deny: '`keep` must say what the summary keeps.' }
    await update($, queued, () => keep)
    return { result: 'Queued. When this turn ends, the user is asked to compact. Finish your answer.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || !(await read($, nudge))) return next(e)
    await update($, nudge, () => false)
    const { context } = await $.session.usage()
    const line = `Context is ${context.percent ?? '?'}% full. At the next seam (task done, nothing half-edited), call ${TOOL_ID} with what the summary must keep.`
    return next({ ...e, context: [...(e.context ?? []), line] })
  }).catch((_$, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    const proxy = (await $.env.get('ANTHROPIC_BASE_URL')) ?? DEFAULT_PROXY
    const { startedAt } = await $.session.usage()
    const baseKey = `base:${startedAt}` // per session: concurrent sessions share the store
    await pruneBases($, await $.clock.now())
    await $.command.register({ name: 'hud', description: 'Show or hide the headroom side pane.' }).catch(() => {})
    // the band works without the tool: a failed register leaves only the toast
    await $.tool
      .register({
      name: 'compact',
      description:
        'Queue a compaction of this conversation. Call it only at a seam (a task is done and nothing is half-edited), when context is high or the next request is unrelated. The user confirms after your turn ends.',
      inputSchema: {
        type: 'object',
        properties: { keep: { type: 'string', description: 'What the summary must keep in full: open tasks, decisions, paths.' } },
        required: ['keep'],
      },
      isDeferred: true,
      })
      .catch(() => {})

    // false when the proxy answered but is not headroom; undefined when it did not answer.
    const checkHealth = () =>
      $.http
        .fetch(`${proxy}/health`)
        .then(r => {
          const h = health(r.text)
          version = h.version ?? version
          return h.isHeadroom
        })
        .catch(() => undefined)

    const poll = async () => {
      const prev = await read($, headroom)
      // version changes only when the proxy restarts: ask again only after it was down
      if (version === undefined || !prev?.isUp) {
        if ((await checkHealth()) === false) {
          timer.cancel()
          await update($, other, () => true)
          $.ui.invalidate('ui.render')
          return
        }
      }
      if (isStale || !prev?.isUp) {
        isStale = false
        const fresh = await $.http
          .fetch(`${proxy}/stats`)
          .then(r => (r.ok ? (parse(r.text) ?? UNREADABLE) : null))
          .catch((): Headroom | null => null)
        const saved = (await $.store.get(baseKey)) as Totals | undefined
        await update($, headroom, p => {
          if (!fresh) return p ? { ...p, isUp: false, isReadable: true } : DOWN
          if (!fresh.isReadable) return { ...fresh, base: p?.base ?? null }
          const { tokensSaved, usdSaved, requests } = fresh
          const base = p?.base ?? saved ?? { tokensSaved, usdSaved, requests }
          return { ...fresh, base: rebase(base, fresh) }
        })
        const value = await read($, headroom)
        if (value?.base && value.base.requests !== saved?.requests) await $.store.set(baseKey, value.base)
      }
      await warnContext($)
      $.ui.invalidate('ui.render')
    }
    // One poll at a time; a failed poll waits for the next tick.
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        await poll()
      } catch {
        // the band keeps its last value
      } finally {
        busy = false
      }
    }
    const timer = $.clock.every(POLL_MS, () => void tick())
    void tick()

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) isStale = true
    if (e.agentId === undefined && e.effort !== effort) {
      effort = e.effort
      await $.store.set('effort', effort ?? null)
      $.ui.invalidate('ui.render')
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await warnContext($)
    $.ui.invalidate('ui.render')
    const done = await next(e)
    // compact rejects while a turn runs: wait until this one has ended
    if (e.agentId === undefined && e.reason === 'answer') $.clock.after(0, () => void runQueued($).catch(() => {}))
    return done
  })

  // `/hud` toggles the side pane; asked, it is placed at any width.
  on('command.run', { command: 'hud' }, async $ => {
    const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })
      await update($, dismissed, () => true)
    } else {
      await update($, dismissed, () => false)
      await $.ui.open({ id: PANE, title: 'Headroom' })
    }
    $.ui.invalidate('ui.render')
    return { text: isOpen ? 'headroom pane closed' : 'headroom pane open' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await update($, dismissed, () => true)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // inline above the prompt the pane has the width, not the height: draw the strip
    const compact = () => void $.command.run({ command: 'compact' }).catch(() => {})
    if (e.props.placement === 'inline')
      return strip($.ui.resolve(e), stack(await band($), e.props.bodyColumns - BUTTON_CELLS), compact)
    const lines = rows(await band($))
    // the gauge line carries the compact button
    const need = paneColumns([...lines, [...lines[GAUGE_LINE]!, { text: ` ${COMPACT}` }]]) + 2 * PAD
    // an open of an open id resizes the dock; a width the person dragged to still wins
    if (e.props.placement === 'dock' && need !== asked) {
      asked = need
      void $.ui.open({ id: PANE, title: 'Headroom', columns: need }).catch(() => {})
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const line = (segs: Seg[], i: number) => (
      <Text key={`${i}`} wrap="truncate-end">
        {segs.map((g, j) => (
          <Text key={`${j}`} color={g.color} dimColor={g.dim}>
            {g.text}
          </Text>
        ))}
      </Text>
    )
    return (
      <Box flexDirection="column" paddingX={PAD}>
        {lines.map((segs, i) =>
          i === GAUGE_LINE ? (
            <Box key={`${i}`} flexDirection="row" gap={1}>
              {line(segs, i)}
              {/* runs `/compact` through its hooks, so the topic picker asks first */}
              <Button key="compact" plain dimColor label={COMPACT} onPress={compact} />
            </Box>
          ) : (
            line(segs, i)
          ),
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const pane = (await $.ui.panes()).find(p => p.id === PANE)
    // Unasked, the engine places the pane only from 144 columns, so it docks only with room to spare.
    if (!pane && e.viewport?.isFullscreen === true && !(await read($, dismissed))) {
      void $.ui
        .open({ id: PANE, title: 'Headroom' })
        .then(() => $.ui.invalidate('ui.render'))
        .catch(() => {})
    }
    if (pane?.isPlaced && pane.isShown) return next(e)

    // runs `/compact` through its hooks, so the topic picker asks first
    const compact = () => void $.command.run({ command: 'compact' }).catch(() => {})
    return strip($.ui.resolve(e), stack(await band($), e.props.bodyColumns - BUTTON_CELLS), compact)
  })
}
