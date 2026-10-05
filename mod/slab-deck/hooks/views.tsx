// The drawings, in the SLAB Harness grammar: the statusline band and hint row above the prompt,
// the deck pane's sections (Pane: DIM titles, label DIM / value INK rows), the popups (Block bands).
import type { Elements, RenderElement } from 'claude-code'

import type { AgentRec, CtxSnap, GitSnap, Live, Metrics, Popup, ProvAccount, ProvPoolEntry, ProvSnap, ProvWindow, TmuxSnap, ToolRec, TurnRec } from '../types'
import { C, category, clip, columns, dur, gauge, grid, hex, lanes, levelHex, limitLabel, minimap, pad, resetIn, slab, tokens, took, toolName, until, working, type Canvas } from './ink'

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
  refreshProviders: () => void
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

export const SECTIONS = ['overview', 'context', 'tools', 'agents', 'git', 'tmux', 'usage', 'providers'] as const

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

// ---- above the prompt: the hint row (BLOCK). The statusline itself is Claude Code's own slot,
// drawn by statusline-slab.sh (mods have no render site there); this mod hands it the sparkline.

export function Band(v: View, isWorking: boolean, still: boolean): RenderElement {
  return isWorking ? Working(v, still) : Hints(v)
}

function Working(v: View, still: boolean): RenderElement {
  const { Box, Text } = v.T
  const elapsed = v.live.startedAt > 0 ? v.now - v.live.startedAt : 0
  const running = v.live.running
  // value INK then its unit DIM: `1m04 · 3 step · 1.2k tok · 84 tok/s`
  const facts: [string, string][] = [
    [dur(elapsed), ''],
    [String(v.live.step || '—'), ' step'],
    [v.live.tokens > 0 ? tokens(v.live.tokens) : '—', ' tok'],
    [v.live.rate > 0 ? String(Math.round(v.live.rate / 4)) : '—', ' tok/s'],
  ]
  return (
    <Box flexDirection="row" backgroundColor={C.BLOCK} width={v.width} paddingX={1}>
      {paint(v, 'work', working(v.now, C.BLOCK, still), '▪▪▪')}
      <Text color={C.DIM}>{'  '}</Text>
      {facts.map(([value, unit], k) => (
        <Text key={`wf-${k}`}>
          {k > 0 && <Text color={C.DIM}> · </Text>}
          <Text color={C.INK}>{value}</Text>
          {unit && <Text color={C.DIM}>{unit}</Text>}
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

type Extra = { ctx: CtxSnap | null; peek: string | null; peekLines: string[]; rows: number; intro: boolean; providers: ProvSnap | null; providersCommand: string }

export function Deck(v0: View, current: string, extra: Extra): RenderElement {
  const v = { ...v0, width: Math.max(20, v0.width - 4) }
  const { Box, Button, Text } = v.T
  const body =
    current === 'context' ? Context(v, extra.ctx)
    : current === 'tools' ? Tools(v)
    : current === 'agents' ? Agents(v)
    : current === 'git' ? Git(v)
    : current === 'tmux' ? Tmux(v, extra.peek, extra.peekLines)
    : current === 'usage' ? Usage(v)
    : current === 'providers' ? Providers(v, extra.providers, extra.providersCommand)
    : Overview(v, extra.intro)
  return (
    <Box flexDirection="column" width={v0.width} minHeight={extra.rows} backgroundColor={C.BLOCK} paddingX={2}>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {SECTIONS.map((s, i) =>
          s === current ? (
            <Text key={`t-${s}`} backgroundColor={C.PLUS} color={C.INK} bold>
              {` ${i + 1} ${s} `}
            </Text>
          ) : (
            <Button key={`t-${s}`} plain hotkey={String(i + 1)} label={s} dimColor onPress={() => v.act.setSection(s)} />
          ),
        )}
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

/** `intro`: the gauges are drawn empty, for the opening sweep to fill them (register.tsx glide). */
function Overview(v: View, intro: boolean): RenderElement {
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
      {paint(v, 'ov-ctx', slab(W, 2, intro ? 0 : pct, v.m.ctxPct === null ? ' — ' : ` ${intro ? 0 : pct}% `), `${bar(pct, 30)} ${pct}%`)}
      {v.m.limits.length > 0 && Section(v, 'rate limits', 'resets in')}
      {v.m.limits.map((l, i) => (
        <Box key={`ov-l${i}`} flexDirection="row" width={W}>
          <Text color={C.DIM}>{pad(limitLabel(l.kind), 4)}</Text>
          {paint(v, `ov-lg${i}`, gauge(Math.max(6, W - 16), intro ? 0 : l.pct), bar(l.pct, 20))}
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
                {paint(v, `cx-b-${k.name}`, gauge(8, (k.tokens / max) * 100, undefined, true), '')}
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
            {paint(v, `tb-g-${name}`, gauge(Math.max(6, v.width - 30), (list.length / max) * 100, undefined, true), '')}
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
      {paint(v, 'us-hit', gauge(v.width, hit === null ? 0 : 100 - hit, undefined, true), bar(hit ?? 0, 20))}
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

// ---- providers: every subscription / provider account, then every model route and its pool

const STATE_TONE: Record<ProvPoolEntry['state'], string> = { ready: C.OK, skipped: C.ATTN, cold: C.FAIL, unmetered: C.FAINT, unread: C.FAIL }

/** A window's reset: `resets Thu 08 Oct 18:59 · in 3d02h` when wide, `in 3d02h` when not; its status first. */
function windowTail(w: ProvWindow, now: number, isWide: boolean): string {
  const left = resetIn(w.resetsAt, now)
  const when = w.resetsAt === null ? 'no reset' : left === 'passed' ? 'reset passed' : isWide ? `resets ${w.resetsLocal ?? '—'} · in ${left}` : `in ${left}`
  return w.status ? (isWide ? `${w.status} · ${when}` : w.status) : when
}

function ProvAccountRows(v: View, a: ProvAccount): RenderElement {
  const { Box, Text } = v.T
  const W = v.width
  const isWide = W >= 110
  const tailW = isWide ? 36 : 12
  const gw = Math.max(6, W - 24 - 6 - 10 - tailW)
  const status =
    a.state === 'stale' ? [`stale ${dur((a.ageS ?? 0) * 1000)}${a.note ? ` · ${a.note}` : ''}`, C.ATTN]
    : a.state === 'error' ? [`✗ ${a.note ?? 'no reading'}`, C.FAIL]
    : a.state === 'none' ? [a.note ?? 'no usage endpoint', C.FAINT]
    : [a.ageS !== null ? `cached ${dur(a.ageS * 1000)}` : '', C.FAINT]
  return (
    <Box key={`pa-${a.label}`} flexDirection="column" marginTop={1}>
      <Box flexDirection="row" justifyContent="space-between" width={W}>
        <Text>
          <Text color={C.INK}>{a.label}</Text>
          <Text color={C.FAINT}>{`  ${clip(a.source, Math.max(0, W - a.label.length - 3 - Math.min(W, (status[0] ?? '').length, Math.floor(W * 0.55))))}`}</Text>
        </Text>
        <Text color={status[1]}>{clip(status[0] ?? '', Math.floor(W * 0.55))}</Text>
      </Box>
      {a.windows.map((w, i) =>
        w.pct === null && w.value !== null ? (
          Row(v, `pa-${a.label}-v${i}`, `  ${w.name}`, `${Number.isInteger(w.value) ? w.value : w.value.toFixed(2)} ${w.unit ?? ''}`.trim())
        ) : w.pct !== null ? (
          <Box key={`pa-${a.label}-w${i}`} flexDirection="row" width={W}>
            <Text color={C.DIM}>{pad(`  ${clip(w.name, 21)}`, 24)}</Text>
            {paint(v, `pa-${a.label}-g${i}`, gauge(gw, w.pct), bar(w.pct, Math.min(gw, 20)))}
            <Text color={levelHex(w.pct)}>{` ${pad(`${Math.round(w.pct)}%`, 5)}`}</Text>
            <Text color={C.INK}>{pad(`${Math.max(0, Math.round(100 - w.pct))}% left`, 10)}</Text>
            <Text color={w.status ? C.FAIL : C.FAINT}>{clip(windowTail(w, v.now, isWide), tailW)}</Text>
          </Box>
        ) : null,
      )}
      {a.facts.map(([k, val], i) => Row(v, `pa-${a.label}-f${i}`, `  ${k}`, val))}
    </Box>
  )
}

function ProvPoolRow(v: View, model: string, p: ProvPoolEntry, isNext: boolean): RenderElement {
  const { Box, Text } = v.T
  const use =
    p.usedPct !== null ? `${Math.max(0, Math.round(100 - p.usedPct))}% left · ${p.resetsAt ? resetIn(p.resetsAt, v.now) : 'no reset'}`
    : p.balance !== null ? `balance ${p.balance}`
    : '—'
  return (
    <Box key={`pr-${model}-${p.route}`} flexDirection="row" justifyContent="space-between" width={v.width}>
      <Text>
        <Text color={isNext ? C.LIVE : C.BLOCK}>{isNext ? '  › ' : '    '}</Text>
        <Text color={C.REF}>{pad(p.route === p.account || p.account === null ? p.route : `${p.route} (${p.account})`, 21)}</Text>
        <Text color={STATE_TONE[p.state]}>{pad(p.state, 10)}</Text>
        <Text color={p.usedPct !== null ? levelHex(p.usedPct) : C.INK}>{clip(use, Math.max(10, v.width - 45))}</Text>
      </Text>
      <Text color={C.FAINT}>{`${p.requests} req`}</Text>
    </Box>
  )
}

function Providers(v: View, snap: ProvSnap | null, command: string): RenderElement {
  const { Box, Text, Button } = v.T
  if (snap === null)
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color={C.FAINT}>{clip(`reading every provider account through \`${command}\` …`, v.width)}</Text>
        <Button key="pv-r0" plain hotkey="r" label="refresh" dimColor onPress={() => v.act.refreshProviders()} />
      </Box>
    )
  const pctWins = snap.accounts.flatMap(a => a.windows.filter(w => w.pct !== null && resetIn(w.resetsAt, v.now) !== 'passed').map(w => ({ a, w })))
  const tight = pctWins.filter(x => (x.w.pct ?? 0) >= 90)
  return (
    <Box flexDirection="column">
      {Section(v, `providers · ${snap.accounts.length} accounts · ${snap.routes.length} routes`, `read ${dur(v.now - snap.takenAt)} ago`)}
      {snap.error !== null && <Text color={C.FAIL}>{clip(`✗ last read failed, showing the one before: ${snap.error}`, v.width)}</Text>}
      <Text color={C.FAINT}>{clip(snap.proxy, v.width)}</Text>
      {tight.length > 0 && (
        <Text>
          <Text color={C.ATTN}>▲ </Text>
          <Text color={C.INK}>{tight.map(x => `${x.a.label} ${x.w.name} ${Math.round(x.w.pct ?? 0)}%`).join(' · ')}</Text>
        </Text>
      )}
      {Section(v, 'routes', 'left · resets in · › serves next')}
      {snap.routes.map(r => {
        const next = r.pool.find(p => p.state === 'ready' || p.state === 'unmetered')
        return (
          <Box key={`pr-${r.model}`} flexDirection="column">
            <Text>
              <Text color={C.INK}>{r.model}</Text>
              <Text color={C.FAINT}>{r.agents.length > 0 ? `  ${clip(r.agents.join(' '), Math.max(10, v.width - r.model.length - 2))}` : ''}</Text>
            </Text>
            {r.pool.map(p => ProvPoolRow(v, r.model, p, p === next))}
          </Box>
        )
      })}
      {Section(v, 'accounts', 'used · left · reset (local time)')}
      {snap.accounts.map(a => ProvAccountRows(v, a))}
      <Box flexDirection="row" gap={2} marginTop={1}>
        <Button key="pv-r" plain hotkey="r" label="refresh" dimColor onPress={() => v.act.refreshProviders()} />
        <Text color={C.FAINT}>reads every 5 min · balances in the provider's own unit</Text>
      </Box>
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
