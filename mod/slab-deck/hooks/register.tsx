// slab-deck: the Claude Code control center in the SLAB Harness design language.
//   band   AbovePrompt: the statusline (route chip, repo branch, effort | ctx and limit gauges, output
//          sparkline, clock, +/−) with hover cards; a hint row with the ▪▪▪ working indicator (blitted)
//          and the turn's facts, or tmux window links and actions
//   deck   Pane `deck`: overview, context (the /context grid), tools (timeline), agents, git, tmux, usage
//   popups Pane `deck-pop` as a dialog: tool call, turn, tmux pane peek, keys
//   also   /deck, /deck-band, the prompt hint tail, threshold toasts, the plain status line when the band is off
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { AgentRec, BandMode, CtxSnap, GitSnap, Live, Metrics, Popup, TmuxSnap, ToolRec, TurnRec } from '../types'
import { GIT_LOG, GIT_NUMSTAT, GIT_STATUS, PANE_FORMAT, lastLines, parseGit, parseTmux } from './data'
import { C, dur, working } from './ink'
import { Band, Deck, Pop, SECTIONS, statusText, type Actions, type T, type View } from './views'

const EMPTY_METRICS: Metrics = {
  model: '',
  effort: null,
  ctxPct: null,
  ctxTokens: null,
  ctxWindow: 0,
  limits: [],
  startedAt: 0,
}

const IDLE: Live = { turnId: null, startedAt: 0, step: 0, chars: 0, rate: 0, running: [] }

const stMetrics = atom({ plugin: 'slab-deck', key: 'metrics' } as const, EMPTY_METRICS)
const stTurns = atom({ plugin: 'slab-deck', key: 'turns' } as const, [])
const stLive = atom({ plugin: 'slab-deck', key: 'live' } as const, IDLE)
const stTools = atom({ plugin: 'slab-deck', key: 'tools' } as const, [])
const stAgents = atom({ plugin: 'slab-deck', key: 'agents' } as const, [])
const stGit = atom({ plugin: 'slab-deck', key: 'git' } as const, null)
const stTmuxSnap = atom({ plugin: 'slab-deck', key: 'tmux' } as const, null)
const stCtx = atom({ plugin: 'slab-deck', key: 'ctx' } as const, null)
const stSection = atom({ plugin: 'slab-deck', key: 'section' } as const, 'overview')
const stBand = atom({ plugin: 'slab-deck', key: 'band' } as const, 'full' as BandMode)
const stPopup = atom({ plugin: 'slab-deck', key: 'popup' } as const, null)
const stPeek = atom({ plugin: 'slab-deck', key: 'peek' } as const, null)
const stPeekLines = atom({ plugin: 'slab-deck', key: 'peekLines' } as const, [])

const DECK = 'deck'
const POP = 'deck-pop'
const KEEP_TOOLS = 300
const KEEP_TURNS = 120

function summarize(e: Record<string, unknown>): string {
  const pick = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : undefined)
  const first = Object.entries(e).find(([k, v]) => typeof v === 'string' && k !== 'tool' && k !== 'tool_use_id' && k !== 'agentId')
  const s = pick('command') ?? pick('file_path') ?? pick('notebook_path') ?? pick('pattern') ?? pick('url') ?? pick('query') ?? pick('description') ?? pick('skill') ?? (first?.[1] as string | undefined) ?? ''
  return s.replace(/\s+/g, ' ').trim()
}

function detailOf(e: Record<string, unknown>): string {
  const { tool: _t, tool_use_id: _i, agentId: _a, ...args } = e
  const text = JSON.stringify(args, null, 2)
  return text.length > 4000 ? text.slice(0, 4000) + '\n…' : text
}

// Module values: a reload starts these over; everything drawn lives in $.state.
let bandId: string | null = null
let scan: { cancel: () => void } | null = null
let tick: { cancel: () => void } | null = null
let still = false
let turn: TurnRec | null = null
let liveWrite = 0
let chars = 0
let streamFrom = 0
const running = new Map<string, string>()
const above = new Set<string>()
const last = new Map<string, string>()

async function run($: EngineInterface, argv: string[], cwd?: string): Promise<string | null> {
  try {
    const r = await $.process.run(argv, { cwd, timeoutMs: 4000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

async function readGit($: EngineInterface, cwd: string): Promise<GitSnap | null> {
  const root = (await run($, ['git', 'rev-parse', '--show-toplevel'], cwd))?.trim()
  if (!root) return null
  const [status, numstat, log] = await Promise.all([run($, GIT_STATUS, root), run($, GIT_NUMSTAT, root), run($, GIT_LOG, root)])
  return parseGit(root, status, numstat, log)
}

async function readTmux($: EngineInterface): Promise<TmuxSnap | null> {
  if ((await $.env.get('TMUX')) === undefined) return null
  const self = (await $.env.get('TMUX_PANE')) ?? null
  const session = (await run($, ['tmux', 'display-message', '-p', ...(self ? ['-t', self] : []), '#S']))?.trim()
  if (!session) return null
  const out = await run($, ['tmux', 'list-panes', '-s', '-t', session, '-F', PANE_FORMAT])
  return out === null ? null : parseTmux(out, session, self)
}

async function capturePane($: EngineInterface, id: string, lines: number): Promise<string[]> {
  return lastLines(await run($, ['tmux', 'capture-pane', '-p', '-J', '-t', id, '-S', `-${lines * 3}`]), lines)
}

/** tmux actions: each acts on this session's own pane or opens new ones; none closes another's. */
async function tmux($: EngineInterface, argv: string[]): Promise<boolean> {
  return (await run($, ['tmux', ...argv])) !== null
}

/** True when `value` differs from what was last written under `key`: skips redraws for equal snapshots. */
function changed(key: string, value: unknown): boolean {
  const json = JSON.stringify(value)
  if (last.get(key) === json) return false
  last.set(key, json)
  return true
}

async function refreshTmux($: EngineInterface): Promise<void> {
  const snap = await readTmux($)
  if (changed('tmux', snap)) await update($, stTmuxSnap, () => snap)
}

async function refreshGit($: EngineInterface): Promise<void> {
  const snap = await readGit($, await $.session.cwd())
  if (changed('git', snap)) await update($, stGit, () => snap)
}

async function refreshCtx($: EngineInterface): Promise<void> {
  const usage = await $.session.usage({ breakdown: 'summary', columns: 60 })
  const b = usage.context.breakdown
  if (!b) return
  const snap: CtxSnap = {
    categories: b.categories.map(c => ({ name: c.name, tokens: c.tokens, color: c.color })),
    grid: b.gridRows.map(row => row.map(sq => ({ color: sq.color, fill: sq.isFilled ? Math.max(0.15, sq.squareFullness) : 0, name: sq.categoryName }))),
    total: b.totalTokens,
    max: b.maxTokens,
    threshold: b.autoCompactThreshold ?? null,
    memory: b.memoryFiles.map(f => ({ path: f.path, tokens: f.tokens })),
    takenAt: await $.clock.now(),
  }
  await update($, stCtx, () => snap)
}

async function refreshAgents($: EngineInterface): Promise<void> {
  const list = await read($, stAgents)
  if (!list.some(a => a.status === 'running')) return
  const infos = await $.agent.list()
  const now = await $.clock.now()
  const next = list.map(a => {
    if (a.status !== 'running') return a
    const info = infos.find(i => i.description === a.description)
    if (!info) return a
    if (info.status === 'completed' || info.status === 'idle') return { ...a, status: 'done' as const, durationMs: now - a.startedAt }
    if (info.status === 'failed' || info.status === 'killed') return { ...a, status: 'failed' as const, durationMs: now - a.startedAt }
    return a
  })
  if (changed('agents', next)) await update($, stAgents, () => next)
}

async function setLive($: EngineInterface, force: boolean): Promise<void> {
  const now = await $.clock.now()
  if (!force && now - liveWrite < 250) return
  liveWrite = now
  const secs = Math.max(0.5, (now - streamFrom) / 1000)
  await update($, stLive, l => ({ ...l, chars, rate: streamFrom > 0 ? chars / secs : 0, running: [...running.values()] }))
}

function startScan($: EngineInterface): void {
  scan?.cancel()
  scan = $.clock.every(70, () => {
    if (bandId === null || still) return
    const id = bandId
    void $.clock.now().then(now => $.ui.blit({ requestId: id, key: 'work', cells: working(now, C.BLOCK).cells(), columns: 3, rows: 1 })).catch(() => undefined)
  })
  tick?.cancel()
  tick = $.clock.every(1000, () => $.ui.invalidate('ui.render'))
}

function stopScan(): void {
  scan?.cancel()
  scan = null
  tick?.cancel()
  tick = null
}

async function syncStatus($: EngineInterface): Promise<void> {
  const mode = await read($, stBand)
  $.ui.status(mode === 'off' ? statusText(await read($, stMetrics), await $.clock.now()) || undefined : undefined)
}

async function peekPane($: EngineInterface, id: string): Promise<void> {
  await update($, stPeek, () => id)
  await update($, stPeekLines, () => [] as string[])
  const lines = await capturePane($, id, 14)
  await update($, stPeekLines, () => lines)
}

/** Shows a section, fetching what it draws from: the context count, the peek of this pane. */
async function showSection($: EngineInterface, s: string): Promise<void> {
  await update($, stSection, () => s)
  if (s === 'context') {
    const snap = await read($, stCtx)
    if (snap === null || (await $.clock.now()) - snap.takenAt > 60000) await refreshCtx($).catch(() => $.ui.toast('context: the window could not be counted'))
  }
  if (s === 'tmux') {
    const t = await read($, stTmuxSnap)
    const target = (await read($, stPeek)) ?? t?.self ?? null
    if (target !== null) await peekPane($, target)
  }
}

function actions($: EngineInterface, surface: RenderSurface): Actions {
  const self = async () => (await read($, stTmuxSnap))?.self ?? undefined
  const sessionTarget = async () => `${(await read($, stTmuxSnap))?.session ?? ''}:`
  const after = async (ok: boolean, what: string) => {
    if (!ok) $.ui.toast(`tmux: ${what} failed`)
    await refreshTmux($)
  }
  const a: Actions = {
    open: s => {
      void (async () => {
        if (s) await showSection($, s)
        await $.ui.open({ id: DECK, title: 'deck' })
      })()
    },
    setSection: s => void showSection($, s),
    pop: p => {
      void (async () => {
        let shown: Popup = p
        if (p.kind === 'pane') shown = { ...p, lines: await capturePane($, p.id, 40) }
        await update($, stPopup, () => shown)
        const title = p.kind === 'help' ? 'keys' : p.kind === 'tool' ? 'tool call' : p.kind === 'turn' ? 'turn' : `pane ${p.id}`
        await $.ui.open({ id: POP, title, focus: true, closeOnEscape: true, holdToasts: true })
      })()
    },
    closePop: () => void $.ui.close({ id: POP }),
    selectWindow: index => {
      void (async () => after(await tmux($, ['select-window', '-t', `${await sessionTarget()}${index}`]), 'select window'))()
    },
    goPane: id => {
      void (async () => after((await tmux($, ['select-window', '-t', id])) && (await tmux($, ['select-pane', '-t', id])), 'go to pane'))()
    },
    peekPane: id => void peekPane($, id),
    newWindow: () => {
      void (async () => after(await tmux($, ['new-window', '-t', await sessionTarget(), '-c', await $.session.cwd()]), 'new window'))()
    },
    split: (dir, target) => {
      void (async () => {
        const snap = await read($, stTmuxSnap)
        const t = target ?? (await self())
        const path = snap?.windows.flatMap(w => w.panes).find(p => p.id === t)?.path ?? (await $.session.cwd())
        await after(await tmux($, ['split-window', dir === 'h' ? '-h' : '-v', '-c', path, ...(t ? ['-t', t] : [])]), 'split')
      })()
    },
    claudeWindow: () => {
      void (async () => after(await tmux($, ['new-window', '-t', await sessionTarget(), '-c', await $.session.cwd(), '-n', 'claude', 'claude']), 'claude window'))()
    },
    zoomSelf: () => {
      void (async () => {
        const s = await self()
        await after(await tmux($, ['resize-pane', '-Z', ...(s ? ['-t', s] : [])]), 'zoom')
      })()
    },
    refresh: () => void Promise.all([refreshGit($), refreshTmux($), refreshAgents($)]),
    refreshCtx: () => void refreshCtx($).catch(() => $.ui.toast('context: the breakdown could not be counted')),
    gitLog: () => {
      void (async () => {
        const root = (await read($, stGit))?.root ?? (await $.session.cwd())
        await after(await tmux($, ['new-window', '-t', await sessionTarget(), '-c', root, '-n', 'git-graph', 'git log --graph --oneline --decorate --all --color=always | less -R']), 'git graph')
      })()
    },
    copy: text => {
      void $.ui.copy({ text, surface }).then(r => $.ui.toast(r.isCopied ? 'copied' : `copy failed: ${r.reason}`))
    },
  }
  return a
}

async function view($: EngineInterface, e: { surface: RenderSurface }, width: number): Promise<View> {
  const [m, live, turns, tools, agents, git, tm] = await Promise.all([
    read($, stMetrics),
    read($, stLive),
    read($, stTurns),
    read($, stTools),
    read($, stAgents),
    read($, stGit),
    read($, stTmuxSnap),
  ])
  return {
    T: $.ui.resolve(e as never) as unknown as T,
    isTerm: e.surface === 'terminal',
    width: Math.max(20, width),
    now: await $.clock.now(),
    m,
    live,
    turns,
    tools,
    agents,
    git,
    tmux: tm,
    act: actions($, e.surface),
  }
}

export const register: Register = on => {
  // ---- lifecycle

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'deck', description: 'Open the slab-deck control center', argumentHint: SECTIONS.join('|') })
    await $.command.register({ name: 'deck-band', description: 'Set the deck band above the prompt', argumentHint: 'full|compact|off' })
    const usage = await $.session.usage()
    const model = await $.session.model()
    await update($, stMetrics, m => ({
      ...m,
      model,
      startedAt: usage.startedAt,
      ctxPct: usage.context.percent ?? m.ctxPct,
      ctxTokens: usage.context.tokens ?? m.ctxTokens,
      ctxWindow: usage.context.window,
      limits: usage.rateLimits.map(l => ({ kind: l.kind, pct: l.percentUsed, resetsAt: l.resetsAt ?? null })),
    }))
    still = (await $.env.get('P1_REDUCED_MOTION')) === '1' || (await $.env.get('SLAB_REDUCED_MOTION')) === '1'
    await Promise.all([refreshTmux($), refreshGit($)])
    $.clock.every(3000, () => void refreshTmux($))
    $.clock.every(8000, () => void refreshGit($))
    $.clock.every(5000, () => void refreshAgents($))
    $.clock.every(30000, () => $.ui.invalidate('ui.render'))
    await syncStatus($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const pct = e.context.percent ?? null
    await update($, stMetrics, m => ({
      ...m,
      ctxPct: pct,
      ctxTokens: e.context.tokens ?? null,
      ctxWindow: e.context.window,
      limits: e.rateLimits.map(l => ({ kind: l.kind, pct: l.percentUsed, resetsAt: l.resetsAt ?? null })),
    }))
    const watch: [string, number | null, string][] = [['ctx', pct, 'compact soon'], ...e.rateLimits.map(l => [l.kind, l.percentUsed, `resets ${l.resetsAt ? 'later' : 'soon'}`] as [string, number, string])]
    for (const [k, v, hint] of watch) {
      if (v === null) continue
      if (v >= 80 && !above.has(k)) {
        above.add(k)
        $.ui.toast(`▲ ${k === 'ctx' ? 'ctx' : k.replace('_hour', 'h').replace('_day', 'd').replace('five', '5').replace('seven', '7')} ${Math.round(v)}% · ${hint}`, { timeoutMs: 6000 })
      } else if (v < 70) above.delete(k)
    }
    await syncStatus($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    turn = { id: e.turnId, startedAt: now, durationMs: null, steps: 0, tools: 0, inTokens: 0, outTokens: 0, cacheRead: 0, cacheWrite: 0, isAborted: false }
    chars = 0
    streamFrom = 0
    running.clear()
    await update($, stLive, () => ({ turnId: e.turnId, startedAt: now, step: 0, chars: 0, rate: 0, running: [] }))
    startScan($)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const effort = e.effort === undefined ? null : String(e.effort)
    await update($, stMetrics, m => (m.effort === effort && m.model === e.model ? m : { ...m, effort, model: e.model }))
    await update($, stLive, l => ({ ...l, step: e.index + 1 }))
    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'text' || chunk.kind === 'thinking') {
        if (streamFrom === 0) streamFrom = await $.clock.now()
        chars += chunk.text.length
        await setLive($, false)
      }
      yield chunk
    }
    const result = await stream.result
    if (turn !== null) {
      turn.steps += 1
      const u = result.usage
      if (u) {
        turn.inTokens += u.input_tokens
        turn.outTokens += u.output_tokens
        turn.cacheRead += u.cache_read_input_tokens
        turn.cacheWrite += u.cache_creation_input_tokens
      }
    }
    await setLive($, true)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const args = e as unknown as Record<string, unknown>
    const rec: ToolRec = { id: e.tool_use_id, tool: String(e.tool), summary: summarize(args), startedAt: now, durationMs: null, isError: false, agentId: e.agentId ?? null, detail: detailOf(args) }
    await update($, stTools, list => [...list, rec].slice(-KEEP_TOOLS))
    if (e.agentId === undefined) {
      running.set(e.tool_use_id, String(e.tool))
      if (turn !== null) turn.tools += 1
      await setLive($, true)
    }
    const ran = await next(e)
    const end = await $.clock.now()
    const isError = ran.deny !== undefined || ran.isError === true
    await update($, stTools, list => list.map(t => (t.id === rec.id ? { ...t, durationMs: end - now, isError } : t)))
    if (running.delete(e.tool_use_id)) await setLive($, true)
    const tool = String(e.tool)
    if (tool === 'Agent' || tool === 'Task')
      await update($, stAgents, list => list.map(a => (a.id === e.tool_use_id && a.status === 'running' && !a.isBackground ? { ...a, status: isError ? 'failed' : 'done', durationMs: end - a.startedAt } : a)))
    if (['Bash', 'Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(tool)) void refreshGit($)
    return ran
  })

  on('agent.spawn', async ($, e, next) => {
    const rec: AgentRec = { id: e.tool_use_id, description: e.description, type: e.subagentType, model: e.model ?? null, isBackground: e.background, startedAt: await $.clock.now(), durationMs: null, status: 'running' }
    await update($, stAgents, list => [...list, rec].slice(-60))
    const ran = await next(e)
    if (ran.deny !== undefined) await update($, stAgents, list => list.map(a => (a.id === rec.id ? { ...a, status: 'failed', durationMs: 0 } : a)))
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const now = await $.clock.now()
    if (turn !== null) {
      const done: TurnRec = { ...turn, durationMs: e.durationMs, isAborted: e.isAborted || e.reason === 'aborted' }
      await update($, stTurns, list => [...list, done].slice(-KEEP_TURNS))
      if (e.durationMs > 180000) $.ui.toast(`turn took ${dur(e.durationMs)} · ${done.steps} steps · ${done.tools} tools`)
      turn = null
    }
    running.clear()
    stopScan()
    await update($, stLive, () => ({ ...IDLE, startedAt: now }))
    void refreshGit($)
    return next(e)
  })

  // ---- commands

  on('command.run', { command: 'deck' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg && !(SECTIONS as readonly string[]).includes(arg)) return { text: `slab-deck: no section "${arg}"; one of ${SECTIONS.join(', ')}` }
    const section = arg || (await read($, stSection))
    const opened = await $.ui.open({ id: DECK, title: 'deck' })
    await showSection($, section)
    return { text: opened.isPlaced ? `deck · ${section}` : 'deck · widen the terminal to place it' }
  })

  on('command.run', { command: 'deck-band' }, async ($, e) => {
    const arg = e.args.trim() as BandMode
    if (!['full', 'compact', 'off'].includes(arg)) return { text: `deck band is ${await read($, stBand)}; /deck-band full|compact|off` }
    await update($, stBand, () => arg)
    await syncStatus($)
    return { text: `deck band: ${arg}` }
  })

  // ---- drawing

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.view.agentId !== undefined) return next(e)
    const mode = await read($, stBand)
    if (mode === 'off') return next(e)
    bandId = e.requestId
    const v = await view($, e, e.props.bodyColumns)
    return Band(v, mode, e.props.isWorking, still)
  })

  on('ui.render', { component: 'Pane', requestId: DECK }, async ($, e) => {
    const v = await view($, e, e.props.bodyColumns)
    const [current, ctxSnap, peek, peekLines] = await Promise.all([read($, stSection), read($, stCtx), read($, stPeek), read($, stPeekLines)])
    return Deck(v, current, { ctx: ctxSnap, peek, peekLines })
  })

  on('ui.render', { component: 'Pane', requestId: POP }, async ($, e) => {
    const v = await view($, e, e.props.bodyColumns)
    const p = await read($, stPopup)
    const { Text } = v.T
    return p === null ? <Text>Nothing to show.</Text> : Pop(v, p)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.props.isWorking || e.props.isDraft || (await read($, stBand)) === 'off') return next(e)
    return next({ ...e, props: { ...e.props, tail: '· ctrl+x tab: deck keys · /deck' } })
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === POP) await update($, stPopup, () => null)
    return next(e)
  })
}
