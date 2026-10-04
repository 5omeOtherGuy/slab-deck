// The drawings, in the SLAB Harness grammar: the statusline band and hint row above the prompt,
// the deck pane's sections (Pane: DIM titles, label DIM / value INK rows), the popups (Block bands).
import type { Elements, RenderElement } from 'claude-code'

import type { AgentRec, BandMode, CtxSnap, GitSnap, Live, Metrics, Popup, TmuxSnap, ToolRec, TurnRec } from '../types'
import { C, category, clip, columns, dur, gauge, grid, hex, lanes, levelHex, limitLabel, minimap, pad, slab, spark, tokens, took, toolName, until, working, type Canvas } from './ink'

export type T = Elements['terminal']

export type Actions = {
  open: (section?: string) => void
  setSection: (s: string) => void
  pop: (p: Popup) => void
  closePop: () => void
  selectWindow: (index: number) => void
  goPane: (id: string) => void
  peekPane: (id: string) => void
  newWindow: () => void
  split: (dir: 'h' | 'v', target?: string) => void
  claudeWindow: () => void
  zoomSelf: () => void
  refresh: () => void
  refreshCtx: () => void
  gitLog: () => void
  copy: (text: string) => void
}

export type View = {
  T: T
  isTerm: boolean
  width: number
  now: number
  m: Metrics
  live: Live
  turns: TurnRec[]
  tools: ToolRec[]
  agents: AgentRec[]
  git: GitSnap | null
  tmux: TmuxSnap | null
  act: Actions
}

export const SECTIONS = ['overview', 'context', 'tools', 'agents', 'git', 'tmux', 'usage'] as const

export function modelName(id: string): string {
  if (!id) return '—'
  const s = id.replace(/\[.*\]$/, '').replace(/^claude-/, '').replace(/-\d{8}$/, '')
  const [family = '', ...rest] = s.split('-')
  if (!/^[a-z]+$/.test(family) || rest.length === 0) return id
  return family[0]!.toUpperCase() + family.slice(1) + ' ' + rest.join('.')
}

function paint(v: View, key: string, c: Canvas, fallback: string): RenderElement {
  const { Raster, Text } = v.T
  return v.isTerm ? <Raster key={key} columns={c.columns} rows={c.rows} cells={c.cells()} /> : <Text color={C.DIM}>{fallback}</Text>
}

/** The text form of a bar, for surfaces that draw no Raster. */
function bar(pct: number, width: number): string {
  const n = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width)
  return '█'.repeat(n) + '░'.repeat(Math.max(0, width - n))
}

function sessionMs(v: View): number | null {
  return v.m.startedAt > 0 ? v.now - v.m.startedAt : null
}

// ---- above the prompt: the statusline band (BLOCK+) and the hint row (BLOCK)

type Seg = { id: string; w: number; prio: number; node: RenderElement; card?: string }

function seg(v: View, s: Seg, withCard: boolean): RenderElement {
  const { Box, Text } = v.T
  return (
    <Box key={`seg-${s.id}`} flexDirection="row">
      {s.node}
      {withCard && s.card !== undefined && (
        <Box position="absolute" top={1} left={0} display="none" hover={{ display: 'flex' }} backgroundColor={C.CONTROL} paddingX={1}>
          <Text color={C.INK}>{clip(s.card, Math.max(10, v.width - 8))}</Text>
        </Box>
      )}
    </Box>
  )
}

export function Band(v: View, mode: BandMode, isWorking: boolean, still: boolean): RenderElement {
  const { Box, Text } = v.T
  const name = modelName(v.m.model)
  const left: Seg[] = [
    {
      id: 'route',
      w: name.length + 2,
      prio: 0,
      node: (
        <Text backgroundColor={C.INK} color={C.GROUND}>
          {` ${name} `}
        </Text>
      ),
      card: `${v.m.model || '—'} · window ${tokens(v.m.ctxWindow)} · effort ${v.m.effort ?? '—'}`,
    },
  ]
  if (v.git) {
    const repo = v.git.root.split('/').pop() ?? ''
    left.push({
      id: 'repo',
      w: 3 + repo.length + 1 + v.git.branch.length,
      prio: 1,
      node: (
        <Text>
          <Text color={C.INK}>{`   ${repo}`}</Text>
          <Text color={C.DIM}>{` ${v.git.branch}`}</Text>
        </Text>
      ),
      card: `${v.git.files.length} changed · ↑${v.git.ahead} ↓${v.git.behind} · ${v.git.commits[0]?.subject ?? 'no commits'}`,
    })
  }
  left.push({
    id: 'effort',
    w: 10 + (v.m.effort ?? '—').length,
    prio: 4,
    node: (
      <Text>
        <Text color={C.DIM}>{'   effort '}</Text>
        <Text color={C.INK}>{v.m.effort ?? '—'}</Text>
      </Text>
    ),
  })

  const right: Seg[] = []
  const pct = v.m.ctxPct === null ? null : Math.round(v.m.ctxPct)
  right.push({
    id: 'ctx',
    w: 4 + 10 + 1 + (pct === null ? 1 : String(pct).length + 1),
    prio: 0,
    node: (
      <Box flexDirection="row">
        <Text color={C.DIM}>ctx </Text>
        {paint(v, 'g-ctx', gauge(10, pct ?? 0), bar(pct ?? 0, 10))}
        <Text color={pct === null ? C.INK : levelHex(pct)}>{pct === null ? ' —' : ` ${pct}%`}</Text>
      </Box>
    ),
    card: `${tokens(v.m.ctxTokens)} of ${tokens(v.m.ctxWindow)} in the window · ${v.m.ctxTokens === null ? '—' : tokens(v.m.ctxWindow - v.m.ctxTokens)} free`,
  })
  v.m.limits.forEach((l, i) => {
    const p = Math.round(l.pct)
    const lab = limitLabel(l.kind)
    right.push({
      id: `lim${i}`,
      w: 3 + lab.length + 1 + 6 + 1 + String(p).length + 1,
      prio: i === 0 ? 2 : 5,
      node: (
        <Box flexDirection="row">
          <Text color={C.DIM}>{`   ${lab} `}</Text>
          {paint(v, `g-lim${i}`, gauge(6, p), bar(p, 6))}
          <Text color={levelHex(p)}>{` ${p}%`}</Text>
        </Box>
      ),
      card: `${lab} window · ${p}% used · resets in ${until(l.resetsAt, v.now)}`,
    })
  })
  const outs = v.turns.map(t => t.outTokens)
  if (outs.length > 1)
    right.push({
      id: 'spark',
      w: 3 + 12,
      prio: 6,
      node: (
        <Box flexDirection="row">
          <Text>{'   '}</Text>
          {paint(v, 'g-spark', spark(outs, 12), '')}
        </Box>
      ),
      card: `output per turn · last ${tokens(outs.at(-1))} · peak ${tokens(Math.max(...outs))}`,
    })
  const clock = dur(sessionMs(v))
  right.push({ id: 'clock', w: 3 + clock.length, prio: 3, node: <Text color={C.INK}>{`   ${clock}`}</Text>, card: `${v.turns.length} turns · ${v.tools.length} tool calls · ${v.agents.length} subagents` })
  if (v.git)
    right.push({
      id: 'diff',
      w: 4 + String(v.git.added).length + 2 + String(v.git.removed).length,
      prio: 1,
      node: (
        <Text>
          <Text color={C.OK}>{`   +${v.git.added}`}</Text>
          <Text color={C.FAIL}>{` −${v.git.removed}`}</Text>
        </Text>
      ),
      card: v.git.files.slice(0, 4).map(f => `${f.path} +${f.add} −${f.del}`).join(' · ') || 'clean',
    })

  // Fit: drop the highest prio across both groups until the band's inner width holds them.
  const inner = v.width - 2
  const widthOf = (list: Seg[]) => list.reduce((n, s) => n + s.w, 0)
  let l = left
  let r = right
  while (widthOf(l) + widthOf(r) + 2 > inner && l.length + r.length > 2) {
    const worst = Math.max(...[...l, ...r].filter(s => s.prio > 0).map(s => s.prio))
    if (!Number.isFinite(worst)) break
    const inR = r.map(s => s.prio).lastIndexOf(worst)
    if (inR >= 0) r = r.filter((_, k) => k !== inR)
    else l = l.filter((_, k) => k !== l.map(s => s.prio).lastIndexOf(worst))
  }
  const cards = mode === 'full'
  const statusline = (
    <Box flexDirection="row" justifyContent="space-between" backgroundColor={C.PLUS} width={v.width} paddingX={1}>
      <Box flexDirection="row">{l.map(s => seg(v, s, cards))}</Box>
      <Box flexDirection="row">{r.map(s => seg(v, s, cards))}</Box>
    </Box>
  )
  if (mode === 'compact') return statusline
  return (
    <Box flexDirection="column" width={v.width}>
      {statusline}
      {isWorking || v.live.turnId !== null ? Working(v, still) : Hints(v)}
    </Box>
  )
}

function Working(v: View, still: boolean): RenderElement {
  const { Box, Text } = v.T
  const elapsed = v.live.startedAt > 0 ? v.now - v.live.startedAt : 0
  const running = v.live.running
  const facts: [string, string][] = [
    ['', dur(elapsed)],
    ['step ', String(v.live.step || '—')],
    ['', tokens(v.live.chars / 4)],
    ['tok/s ', v.live.rate > 0 ? String(Math.round(v.live.rate / 4)) : '—'],
  ]
  return (
    <Box flexDirection="row" backgroundColor={C.BLOCK} width={v.width} paddingX={1}>
      {paint(v, 'work', working(v.now, C.BLOCK, still), '▪▪▪')}
      <Text color={C.DIM}>{'  '}</Text>
      {facts.map(([label, value], k) => (
        <Text key={`wf-${k}`}>
          {k > 0 && <Text color={C.DIM}> · </Text>}
          {label && <Text color={C.DIM}>{label}</Text>}
          <Text color={C.INK}>{value}</Text>
          {k === 2 && <Text color={C.DIM}> tok</Text>}
        </Text>
      ))}
      {running.length > 0 && <Text color={C.LIVE}>{'   ▸ '}</Text>}
      {running.length > 0 && <Text color={C.DIM}>{clip(running.map(toolName).join(' '), Math.max(8, v.width - 64))}</Text>}
    </Box>
  )
}

function Hints(v: View): RenderElement {
  const { Box, Text, Button } = v.T
  const wins = v.tmux?.windows ?? []
  const selfWin = wins.find(w => w.panes.some(p => p.id === v.tmux?.self))
  const room = Math.max(0, v.width - 42)
  // Names stay legible (8+ cells): when the windows do not all fit, this session's window is kept
  // and the rest fill in order, the remainder counted FAINT.
  const maxN = Math.max(1, Math.floor(room / 13))
  const shown = wins.length <= maxN ? wins : [...wins.filter(w => w !== selfWin).slice(0, maxN - 1), ...(selfWin ? [selfWin] : [])].sort((a, b) => a.index - b.index)
  const nameW = Math.max(8, Math.min(18, Math.floor(room / Math.max(1, shown.length)) - 5))
  const hidden = wins.length - shown.length
  return (
    <Box flexDirection="row" justifyContent="space-between" backgroundColor={C.BLOCK} width={v.width} paddingX={1}>
      <Box flexDirection="row">
        {wins.length === 0 && <Text color={C.FAINT}>not in tmux · /deck opens the control center</Text>}
        {shown.map(w => (
          <Box key={`win-${w.index}`} flexDirection="row" marginRight={2}>
            <Button key={`w${w.index}`} plain hotkey={w.index <= 9 ? String(w.index) : undefined} label={clip(w.name, nameW)} dimColor={w !== selfWin} onPress={() => v.act.selectWindow(w.index)} />
          </Box>
        ))}
        {hidden > 0 && <Text color={C.FAINT}>{`+${hidden}`}</Text>}
      </Box>
      <Box flexDirection="row" gap={2}>
        <Button key="b-deck" plain hotkey="d" label="deck" dimColor onPress={() => v.act.open()} />
        {v.tmux && <Button key="b-new" plain hotkey="n" label="window" dimColor onPress={() => v.act.newWindow()} />}
        {v.tmux && <Button key="b-split" plain hotkey="s" label="split" dimColor onPress={() => v.act.split('h')} />}
        <Button key="b-help" plain hotkey="h" label="keys" dimColor onPress={() => v.act.pop({ kind: 'help' })} />
      </Box>
    </Box>
  )
}

// ---- the deck pane

type Extra = { ctx: CtxSnap | null; peek: string | null; peekLines: string[] }

export function Deck(v0: View, current: string, extra: Extra): RenderElement {
  const v = { ...v0, width: Math.max(20, v0.width - 4) }
  const { Box, Button } = v.T
  const body =
    current === 'context' ? Context(v, extra.ctx)
    : current === 'tools' ? Tools(v)
    : current === 'agents' ? Agents(v)
    : current === 'git' ? Git(v)
    : current === 'tmux' ? Tmux(v, extra.peek, extra.peekLines)
    : current === 'usage' ? Usage(v)
    : Overview(v)
  return (
    <Box flexDirection="column" width={v0.width} backgroundColor={C.BLOCK} paddingX={2}>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {SECTIONS.map((s, i) => (
          <Button key={`t-${s}`} plain hotkey={String(i + 1)} label={s} dimColor={s !== current} onPress={() => v.act.setSection(s)} />
        ))}
      </Box>
      {body}
    </Box>
  )
}

/** A pane section title: DIM, its facts FAINT at the right. */
function Section(v: View, title: string, right?: string): RenderElement {
  const { Box, Text } = v.T
  return (
    <Box flexDirection="row" justifyContent="space-between" width={v.width} marginTop={1}>
      <Text color={C.DIM}>{title}</Text>
      {right !== undefined && <Text color={C.FAINT}>{right}</Text>}
    </Box>
  )
}

/** A pane row: label DIM left, value right in its tone. */
function Row(v: View, key: string, label: string, value: string, tone: string = C.INK): RenderElement {
  const { Box, Text } = v.T
  return (
    <Box key={key} flexDirection="row" justifyContent="space-between" width={v.width}>
      <Text color={C.DIM}>{label}</Text>
      <Text color={tone}>{value}</Text>
    </Box>
  )
}

function Overview(v: View): RenderElement {
  const { Box, Text, Button } = v.T
  const W = v.width
  const pct = Math.round(v.m.ctxPct ?? 0)
  const outs = v.turns.map(t => t.outTokens)
  const running = v.agents.filter(a => a.status === 'running').length
  return (
    <Box flexDirection="column">
      {Section(v, 'session')}
      {Row(v, 'ov-model', 'route', modelName(v.m.model))}
      {Row(v, 'ov-effort', 'effort', v.m.effort ?? '—')}
      {Row(v, 'ov-up', 'up', dur(sessionMs(v)))}
      {Row(v, 'ov-turns', 'turns', String(v.turns.length))}
      {Row(v, 'ov-tools', 'tool calls', String(v.tools.length))}
      {Row(v, 'ov-agents', 'subagents', running > 0 ? `▪ ${running} running` : String(v.agents.length), running > 0 ? C.LIVE : C.INK)}
      {Section(v, 'context window', `${tokens(v.m.ctxTokens)} / ${tokens(v.m.ctxWindow)}`)}
      {paint(v, 'ov-ctx', slab(W, 2, pct, v.m.ctxPct === null ? ' — ' : ` ${pct}% `), `${bar(pct, 30)} ${pct}%`)}
      {v.m.limits.length > 0 && Section(v, 'rate limits', 'resets in')}
      {v.m.limits.map((l, i) => (
        <Box key={`ov-l${i}`} flexDirection="row" width={W}>
          <Text color={C.DIM}>{pad(limitLabel(l.kind), 4)}</Text>
          {paint(v, `ov-lg${i}`, gauge(Math.max(6, W - 16), l.pct), bar(l.pct, 20))}
          <Text color={levelHex(l.pct)}>{` ${pad(`${Math.round(l.pct)}%`, 5)}`}</Text>
          <Text color={C.FAINT}>{until(l.resetsAt, v.now)}</Text>
        </Box>
      ))}
      {Section(v, 'output per turn', outs.length > 0 ? `peak ${tokens(Math.max(...outs))} · last ${tokens(outs.at(-1))}` : '—')}
      {outs.length > 0 ? paint(v, 'ov-cols', columns(outs, W, 4), outs.map(tokens).join(' ')) : <Text color={C.FAINT}>fills as turns complete</Text>}
      {Section(v, 'recent calls', '⏎ details')}
      {v.tools.length === 0 && <Text color={C.FAINT}>—</Text>}
      {v.tools.slice(-6).reverse().map(t => ToolRow(v, t))}
      {Section(v, 'workspace')}
      {Row(v, 'ov-git', 'git', v.git ? `${v.git.branch} · ${v.git.files.length} changed · +${v.git.added} −${v.git.removed}` : '—')}
      {Row(v, 'ov-tmux', 'tmux', v.tmux ? `${v.tmux.session} · ${v.tmux.windows.length} windows · ${v.tmux.self ?? '—'}` : '—')}
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Button key="ov-refresh" plain hotkey="r" label="refresh" dimColor onPress={() => v.act.refresh()} />
        <Button key="ov-help" plain hotkey="k" label="keys" dimColor onPress={() => v.act.pop({ kind: 'help' })} />
      </Box>
    </Box>
  )
}

/** A call in the Block header grammar: ▸ name (10 cols) argument … ✓ outcome. */
function ToolRow(v: View, t: ToolRec): RenderElement {
  const { Box, Text, Button } = v.T
  const isRunning = t.durationMs === null
  const outcome = isRunning ? '▪▪▪' : `${t.isError ? '✗' : '✓'} ${took(t.durationMs)}`
  const name = toolName(t.tool)
  const nm = name.length > 10 ? name.slice(0, 9) + '…' : name.padEnd(10, ' ')
  return (
    <Box key={`tr-${t.id}`} flexDirection="row" justifyContent="space-between" width={v.width}>
      <Box flexDirection="row">
        <Text color={isRunning ? C.LIVE : C.DIM}>▸ </Text>
        <Button key={`tool-${t.id}`} plain dimColor label={`${nm}${clip(t.summary, Math.max(8, v.width - 24))}`} onPress={() => v.act.pop({ kind: 'tool', id: t.id })} />
      </Box>
      <Text>
        <Text color={isRunning ? C.LIVE : t.isError ? C.FAIL : C.OK}>{outcome.slice(0, isRunning ? 3 : 1)}</Text>
        {!isRunning && <Text color={C.DIM}>{outcome.slice(1)}</Text>}
      </Text>
    </Box>
  )
}

function Context(v: View, c: CtxSnap | null): RenderElement {
  const { Box, Text, Button } = v.T
  if (c === null)
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          {paint(v, 'cx-wait', working(v.now, C.BLOCK, true), '▪▪▪')}
          <Text color={C.DIM}> counting the window</Text>
        </Box>
        <Button key="cx-load" plain hotkey="r" label="count again" dimColor onPress={() => v.act.refreshCtx()} />
      </Box>
    )
  const cats = [...c.categories].filter(k => k.tokens > 0).sort((a, b) => b.tokens - a.tokens)
  const max = Math.max(1, ...cats.map(k => k.tokens))
  const g = grid(c.grid)
  const thr = c.threshold !== null ? Math.round((c.threshold / Math.max(1, c.max)) * 100) : undefined
  const pct = Math.round((c.total / Math.max(1, c.max)) * 100)
  const legendW = Math.max(20, v.width - g.columns - 3)
  return (
    <Box flexDirection="column">
      {Section(v, 'window', `${tokens(c.total)} / ${tokens(c.max)} · ${dur(v.now - c.takenAt)} ago`)}
      {paint(v, 'cx-gauge', gauge(v.width, pct, thr), `${bar(pct, 30)} ${pct}%`)}
      {thr !== undefined && <Text color={C.FAINT}>▏ autocompact at {thr}%</Text>}
      {Section(v, 'by category')}
      <Box flexDirection="row" gap={3}>
        {paint(v, 'cx-grid', g, '')}
        <Box flexDirection="column" width={legendW}>
          {cats.slice(0, Math.max(1, g.rows)).map(k => (
            <Box key={`cx-${k.name}`} flexDirection="row" justifyContent="space-between" width={legendW}>
              <Text>
                <Text color={hex(category(k.color, k.name))}>█ </Text>
                <Text color={C.DIM}>{clip(k.name, legendW - 18)}</Text>
              </Text>
              <Box flexDirection="row">
                <Text color={C.INK}>{pad(tokens(k.tokens), 7)}</Text>
                {paint(v, `cx-b-${k.name}`, gauge(8, (k.tokens / max) * 100), '')}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      {c.memory.length > 0 && Section(v, 'memory files', String(c.memory.length))}
      {c.memory.slice(0, 8).map(f => (
        <Box key={`mf-${f.path}`} flexDirection="row" justifyContent="space-between" width={v.width}>
          <Text color={C.REF} wrap="truncate-start">
            {clip(f.path, v.width - 9)}
          </Text>
          <Text color={C.DIM}>{tokens(f.tokens)}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Button key="cx-refresh" plain hotkey="r" label="recount" dimColor onPress={() => v.act.refreshCtx()} />
      </Box>
    </Box>
  )
}

function Tools(v: View): RenderElement {
  const { Box, Text } = v.T
  const by = new Map<string, ToolRec[]>()
  for (const t of v.tools) by.set(toolName(t.tool), [...(by.get(toolName(t.tool)) ?? []), t])
  const rows = [...by.entries()].sort((a, b) => b[1].length - a[1].length)
  const max = Math.max(1, ...rows.map(r => r[1].length))
  const to = v.now
  const from = Math.max(v.m.startedAt || to - 600000, to - 30 * 60000)
  const top = rows.slice(0, 8)
  return (
    <Box flexDirection="column">
      {Section(v, 'calls by tool', `${v.tools.length} calls · ${v.tools.filter(t => t.isError).length} failed`)}
      {rows.length === 0 && <Text color={C.FAINT}>—</Text>}
      {rows.slice(0, 10).map(([name, list]) => {
        const total = list.reduce((n, t) => n + (t.durationMs ?? 0), 0)
        const errs = list.filter(t => t.isError).length
        return (
          <Box key={`tb-${name}`} flexDirection="row" width={v.width}>
            <Text color={C.DIM}>{pad(name, 11)}</Text>
            {paint(v, `tb-g-${name}`, gauge(Math.max(6, v.width - 30), (list.length / max) * 100), '')}
            <Text color={C.INK}>{` ${pad(String(list.length), 4)}`}</Text>
            <Text color={C.DIM}>{pad(took(total), 7)}</Text>
            {errs > 0 && <Text color={C.FAIL}>✗</Text>}
            {errs > 0 && <Text color={C.DIM}>{errs}</Text>}
          </Box>
        )
      })}
      {top.length > 0 && Section(v, 'timeline', `last ${dur(to - from)}`)}
      {top.length > 0 && (
        <Box flexDirection="row">
          <Box flexDirection="column">
            {top.map(([name]) => (
              <Text key={`ln-${name}`} color={C.DIM}>
                {pad(name, 11)}
              </Text>
            ))}
          </Box>
          {paint(
            v,
            'tl',
            lanes(
              top.map(([name, list]) => ({ name, events: list.map(t => ({ at: t.startedAt, ms: t.durationMs ?? to - t.startedAt, isError: t.isError })) })),
              from,
              to,
              Math.max(10, v.width - 11),
            ),
            '',
          )}
        </Box>
      )}
      {Section(v, 'recent calls', '⏎ details')}
      {v.tools.slice(-12).reverse().map(t => ToolRow(v, t))}
    </Box>
  )
}

/** Subagents in the Worker grammar: ▪ running, ✓ done, ✗ failed; name INK, route DIM, elapsed right. */
function Agents(v: View): RenderElement {
  const { Box, Text } = v.T
  return (
    <Box flexDirection="column">
      {Section(v, 'subagents', `${v.agents.length} this session`)}
      {v.agents.length === 0 && <Text color={C.FAINT}>—</Text>}
      {[...v.agents].reverse().map(a => {
        const [glyph, tone] = a.status === 'running' ? ['▪', C.LIVE] : a.status === 'failed' ? ['✗', C.FAIL] : ['✓', C.OK]
        return (
          <Box key={`ag-${a.id}`} flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between" width={v.width}>
              <Text>
                <Text color={tone}>{glyph} </Text>
                <Text color={a.status === 'running' ? C.INK : C.DIM}>{pad(a.description, Math.max(12, Math.min(28, v.width - 30)))}</Text>
                <Text color={C.DIM}>{` ${a.type}${a.model ? ` · ${a.model}` : ''}`}</Text>
              </Text>
              <Text color={C.DIM}>{dur(a.durationMs ?? v.now - a.startedAt)}</Text>
            </Box>
            {a.isBackground && (
              <Text>
                <Text color={C.DIM}>{'  ↳ '}</Text>
                <Text color={C.FAINT}>background</Text>
              </Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

function Git(v: View): RenderElement {
  const { Box, Text, Button } = v.T
  const g = v.git
  if (g === null) return <Box marginTop={1}><Text color={C.FAINT}>not in a git repository</Text></Box>
  const files = g.files.slice(0, 14)
  const maxLines = Math.max(1, ...files.map(f => f.add + f.del))
  const barW = 12
  return (
    <Box flexDirection="column">
      {Section(v, g.branch, `↑${g.ahead} ↓${g.behind} · ${g.files.length} changed`)}
      {files.length === 0 && (
        <Text>
          <Text color={C.OK}>✓ </Text>
          <Text color={C.DIM}>clean</Text>
        </Text>
      )}
      {files.map(f => {
        const a = Math.round((f.add / maxLines) * barW)
        const d = Math.round((f.del / maxLines) * barW)
        return (
          <Box key={`gf-${f.path}`} flexDirection="row" justifyContent="space-between" width={v.width}>
            <Text>
              <Text color={C.FAINT}>{pad(f.status, 3)}</Text>
              <Text color={C.REF}>{clip(f.path, Math.max(10, v.width - barW - 18))}</Text>
            </Text>
            <Text>
              <Text color={C.OK}>{`+${f.add}`}</Text>
              <Text color={C.FAIL}>{` −${f.del} `}</Text>
              <Text color="#3a4a3a">{'█'.repeat(a)}</Text>
              <Text color="#4a3535">{'█'.repeat(d)}</Text>
              <Text>{' '.repeat(Math.max(0, barW - a - d))}</Text>
            </Text>
          </Box>
        )
      })}
      {g.files.length > files.length && <Text color={C.FAINT}>{`${g.files.length - files.length} more`}</Text>}
      {Section(v, 'commits', clip(g.root, 40))}
      {g.commits.map(c => (
        <Box key={`gc-${c.hash}`} flexDirection="row" justifyContent="space-between" width={v.width}>
          <Text>
            <Text color={C.FAINT}>{`${c.hash} `}</Text>
            <Text color={C.INK}>{clip(c.subject, Math.max(10, v.width - 22))}</Text>
          </Text>
          <Text color={C.FAINT}>{c.age}</Text>
        </Box>
      ))}
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Button key="g-refresh" plain hotkey="r" label="refresh" dimColor onPress={() => v.act.refresh()} />
        <Button key="g-copy" plain hotkey="c" label="copy branch" dimColor onPress={() => v.act.copy(g.branch)} />
        {v.tmux && <Button key="g-log" plain hotkey="l" label="graph in tmux" dimColor onPress={() => v.act.gitLog()} />}
      </Box>
    </Box>
  )
}

function Tmux(v: View, peek: string | null, peekLines: string[]): RenderElement {
  const { Box, Text, Button, Code } = v.T
  const t = v.tmux
  if (t === null) return <Box marginTop={1}><Text color={C.FAINT}>this session is not inside tmux</Text></Box>
  const sel = peek ?? t.self
  const selWin = t.windows.find(w => w.panes.some(p => p.id === sel)) ?? t.windows[0]
  const selPane = selWin?.panes.find(p => p.id === sel)
  const mapW = Math.min(30, Math.max(14, Math.floor(v.width / 3)))
  return (
    <Box flexDirection="column">
      {Section(v, `session ${t.session}`, `${t.windows.length} windows · you ${t.self ?? '—'}`)}
      {t.windows.map(w => (
        <Box key={`tw-${w.index}`} flexDirection="column">
          <Box flexDirection="row">
            <Text color={C.FAINT}>{pad(String(w.index), 3)}</Text>
            <Button key={`tw-b-${w.index}`} plain label={w.name} dimColor={!w.panes.some(p => p.id === t.self)} onPress={() => v.act.selectWindow(w.index)} />
          </Box>
          {w.panes.map(p => {
            const isSel = p.id === sel
            return (
              <Box key={`tp-${p.id}`} flexDirection="row" justifyContent="space-between" width={v.width}>
                <Box flexDirection="row">
                  <Text color={isSel ? C.ATTN : C.BLOCK}>{isSel ? '  › ' : '    '}</Text>
                  <Button key={`tp-b-${p.id}`} plain dimColor={!isSel} label={`${pad(p.id, 5)}${pad(p.command, 10)}${clip(p.title, Math.max(8, v.width - 26))}`} onPress={() => v.act.peekPane(p.id)} />
                </Box>
                {p.id === t.self && <Text color={C.FAINT}>you</Text>}
              </Box>
            )
          })}
        </Box>
      ))}
      {selPane && selWin && Section(v, `${selPane.id} · ${selPane.command}`, clip(selPane.path, Math.max(10, v.width - 24)))}
      {selPane && selWin && (
        <Box flexDirection="row" gap={2}>
          {paint(v, 'tm-map', minimap(selWin, t.self, sel, mapW, Math.max(4, Math.round(mapW / 3.5))), '')}
          <Box flexDirection="column" flexGrow={1}>
            <Code source={peekLines.length > 0 ? peekLines.join('\n') : '—'} wrap="truncate-end" />
          </Box>
        </Box>
      )}
      <Box flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
        {selPane && selPane.id !== t.self && <Button key="tm-go" plain hotkey="g" label="go there" onPress={() => v.act.goPane(selPane.id)} />}
        {selPane && <Button key="tm-pop" plain hotkey="p" label="pop out" dimColor onPress={() => v.act.pop({ kind: 'pane', id: selPane.id, lines: [] })} />}
        <Button key="tm-new" plain hotkey="n" label="new window" dimColor onPress={() => v.act.newWindow()} />
        <Button key="tm-sh" plain hotkey="v" label="split right" dimColor onPress={() => v.act.split('h')} />
        <Button key="tm-sv" plain hotkey="b" label="split below" dimColor onPress={() => v.act.split('v')} />
        <Button key="tm-cl" plain hotkey="c" label="claude window" dimColor onPress={() => v.act.claudeWindow()} />
        <Button key="tm-z" plain hotkey="z" label="zoom me" dimColor onPress={() => v.act.zoomSelf()} />
        <Button key="tm-r" plain hotkey="r" label="refresh" dimColor onPress={() => v.act.refresh()} />
      </Box>
    </Box>
  )
}

function Usage(v: View): RenderElement {
  const { Box, Text, Button } = v.T
  const sum = (f: (t: TurnRec) => number) => v.turns.reduce((n, t) => n + f(t), 0)
  const inT = sum(t => t.inTokens)
  const out = sum(t => t.outTokens)
  const cr = sum(t => t.cacheRead)
  const cw = sum(t => t.cacheWrite)
  const all = cr + inT + cw
  const hit = all > 0 ? (cr / all) * 100 : null
  const durs = v.turns.map(t => (t.durationMs ?? 0) / 1000)
  return (
    <Box flexDirection="column">
      {Section(v, 'rate limits', v.m.limits.length === 0 ? '— until the first response' : 'resets in')}
      {v.m.limits.map((l, i) => (
        <Box key={`us-l${i}`} flexDirection="column">
          {Row(v, `us-lr${i}`, limitLabel(l.kind), until(l.resetsAt, v.now), C.FAINT)}
          {paint(v, `us-lg${i}`, slab(v.width, 2, l.pct, ` ${Math.round(l.pct)}% `), `${bar(l.pct, 30)} ${Math.round(l.pct)}%`)}
        </Box>
      ))}
      {Section(v, 'tokens', `${v.turns.length} turns`)}
      {Row(v, 'us-in', 'input', tokens(inT))}
      {Row(v, 'us-out', 'output', tokens(out))}
      {Row(v, 'us-cr', 'cache read', tokens(cr))}
      {Row(v, 'us-cw', 'cache write', tokens(cw))}
      {Section(v, 'cache hit', hit === null ? '—' : `${Math.round(hit)}%`)}
      {paint(v, 'us-hit', gauge(v.width, hit === null ? 0 : 100 - hit), bar(hit ?? 0, 20))}
      <Text color={C.FAINT}>the bar is the uncached share · short is good</Text>
      {Section(v, 'turn durations', durs.length > 0 ? `longest ${dur(Math.max(...durs) * 1000)}` : '—')}
      {durs.length > 0 && paint(v, 'us-dur', columns(durs, v.width, 3), '')}
      {v.turns.slice(-8).reverse().map(t => (
        <Box key={`us-t-${t.id}`} flexDirection="row" justifyContent="space-between" width={v.width}>
          <Box flexDirection="row">
            <Text color={t.isAborted ? C.FAIL : C.DIM}>{t.isAborted ? '✗ ' : '▸ '}</Text>
            <Button key={`turn-${t.id}`} plain dimColor label={`${pad(`${t.steps} steps`, 10)}${pad(`${t.tools} calls`, 10)}out ${tokens(t.outTokens)}`} onPress={() => v.act.pop({ kind: 'turn', id: t.id })} />
          </Box>
          <Text color={C.DIM}>{dur(t.durationMs)}</Text>
        </Box>
      ))}
    </Box>
  )
}

// ---- popups: Block bands (header BLOCK+, body BLOCK, meta FAINT)

function Header(v: View, glyph: [string, string], name: string, arg: string, right: RenderElement | null): RenderElement {
  const { Box, Text } = v.T
  const nm = name.length > 10 ? name.slice(0, 9) + '…' : name.padEnd(10, ' ')
  return (
    <Box flexDirection="row" justifyContent="space-between" backgroundColor={C.PLUS} width={v.width} paddingX={2}>
      <Text>
        <Text color={glyph[1]}>{glyph[0]} </Text>
        <Text color={C.DIM}>{nm}</Text>
        <Text color={C.INK}>{clip(arg, Math.max(8, v.width - 30))}</Text>
      </Text>
      {right}
    </Box>
  )
}

export function Pop(v: View, p: Popup): RenderElement {
  const { Box, Text, Button, Code, Markdown } = v.T
  const close = <Button key="pop-x" plain hotkey="x" label="close" role="dismiss" dimColor onPress={() => v.act.closePop()} />
  if (p.kind === 'help')
    return (
      <Box flexDirection="column" width={v.width} backgroundColor={C.BLOCK} paddingX={2}>
        <Markdown
          text={[
            '| where | keys |',
            '| --- | --- |',
            '| band | `^X ⇥` focus · `1`–`9` tmux window · `d` deck · `n` new window · `s` split · `h` keys |',
            '| deck | `1`–`7` section · `r` refresh · `⏎` on a row opens it |',
            '| tmux | `⏎` on a pane peeks · `g` go there · `p` pop out · `n` `v` `b` window / split · `c` claude window · `z` zoom me |',
            '| popup | `esc` or `x` dismiss |',
            '',
            '`/deck [section]` · `/deck-band full|compact|off` · hover a statusline fact for its card',
          ].join('\n')}
        />
        {close}
      </Box>
    )
  if (p.kind === 'tool') {
    const t = v.tools.find(x => x.id === p.id)
    if (!t) return <Box flexDirection="column"><Text color={C.FAINT}>that call is no longer kept</Text>{close}</Box>
    const isRunning = t.durationMs === null
    return (
      <Box flexDirection="column" width={v.width}>
        {Header(
          v,
          ['▸', isRunning ? C.LIVE : C.DIM],
          toolName(t.tool),
          t.summary,
          isRunning ? <Text color={C.LIVE}>▪▪▪</Text> : (
            <Text>
              <Text color={t.isError ? C.FAIL : C.OK}>{t.isError ? '✗' : '✓'}</Text>
              <Text color={C.DIM}>{` ${took(t.durationMs)}${t.agentId ? ` · agent ${t.agentId.slice(0, 8)}` : ''}`}</Text>
            </Text>
          ),
        )}
        <Box backgroundColor={C.BLOCK} paddingX={2} width={v.width}>
          <Code source={t.detail} language="json" />
        </Box>
        <Box flexDirection="row" gap={2} backgroundColor={C.BLOCK} paddingX={2} width={v.width}>
          <Button key="pop-copy" plain hotkey="c" label="copy input" onPress={() => v.act.copy(t.detail)} />
          {close}
        </Box>
      </Box>
    )
  }
  if (p.kind === 'turn') {
    const t = v.turns.find(x => x.id === p.id)
    if (!t) return <Box flexDirection="column"><Text color={C.FAINT}>that turn is no longer kept</Text>{close}</Box>
    const own = v.tools.filter(x => x.startedAt >= t.startedAt && x.startedAt <= t.startedAt + (t.durationMs ?? 0))
    const w = { ...v, width: v.width - 4 }
    return (
      <Box flexDirection="column" width={v.width}>
        {Header(v, t.isAborted ? ['✗', C.FAIL] : ['▸', C.DIM], 'turn', `${t.steps} steps · ${own.length} calls`, <Text color={C.DIM}>{dur(t.durationMs)}</Text>)}
        <Box flexDirection="column" backgroundColor={C.BLOCK} paddingX={2} width={v.width}>
          {Row(w, 'pt-in', 'input', tokens(t.inTokens))}
          {Row(w, 'pt-out', 'output', tokens(t.outTokens))}
          {Row(w, 'pt-cr', 'cache read', tokens(t.cacheRead))}
          {own.slice(-10).map(x => ToolRow(w, x))}
          {close}
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" width={v.width}>
      {Header(v, ['↳', C.REF], 'pane', p.id, <Text color={C.DIM}>{`${p.lines.length} rows`}</Text>)}
      <Box backgroundColor={C.BLOCK} paddingX={2} width={v.width}>
        <Code source={p.lines.length > 0 ? p.lines.join('\n') : '—'} wrap="truncate-end" />
      </Box>
      <Box flexDirection="row" gap={2} backgroundColor={C.BLOCK} paddingX={2} width={v.width}>
        {p.id !== v.tmux?.self && <Button key="pp-go" plain hotkey="g" label="go there" onPress={() => v.act.goPane(p.id)} />}
        <Button key="pp-split" plain hotkey="v" label="split beside it" dimColor onPress={() => v.act.split('h', p.id)} />
        <Button key="pp-r" plain hotkey="r" label="refresh" dimColor onPress={() => v.act.pop({ kind: 'pane', id: p.id, lines: [] })} />
        {close}
      </Box>
    </Box>
  )
}

/** The plain status line, for when the band is off: the statusline's facts as one string. */
export function statusText(m: Metrics, now: number): string {
  const segs: string[] = [modelName(m.model)]
  if (m.effort) segs.push(`effort ${m.effort}`)
  segs.push(`ctx ${m.ctxPct === null ? '—' : `${Math.round(m.ctxPct)}%`}`)
  for (const l of m.limits.slice(0, 2)) segs.push(`${limitLabel(l.kind)} ${Math.round(l.pct)}%`)
  if (m.startedAt > 0) segs.push(dur(now - m.startedAt))
  return segs.join('   ')
}
