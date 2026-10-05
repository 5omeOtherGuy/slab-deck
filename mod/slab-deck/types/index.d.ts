export type Limit = { kind: string; pct: number; resetsAt: string | null }

export type Metrics = {
  model: string
  effort: string | null
  ctxPct: number | null
  ctxTokens: number | null
  ctxWindow: number
  limits: Limit[]
  startedAt: number
}

export type TurnRec = {
  id: string
  startedAt: number
  durationMs: number | null
  steps: number
  tools: number
  inTokens: number
  outTokens: number
  cacheRead: number
  cacheWrite: number
  isAborted: boolean
}

export type Live = {
  turnId: string | null
  startedAt: number
  step: number
  chars: number
  tokens: number
  rate: number
  running: string[]
}

export type ToolRec = {
  id: string
  tool: string
  summary: string
  startedAt: number
  durationMs: number | null
  isError: boolean
  agentId: string | null
  detail: string
}

export type AgentRec = {
  id: string
  description: string
  type: string
  model: string | null
  isBackground: boolean
  startedAt: number
  durationMs: number | null
  status: 'running' | 'done' | 'failed'
}

export type GitFile = { path: string; status: string; add: number; del: number }

export type GitSnap = {
  root: string
  branch: string
  ahead: number
  behind: number
  files: GitFile[]
  added: number
  removed: number
  commits: { hash: string; subject: string; age: string }[]
}

export type TmuxPane = {
  id: string
  index: number
  command: string
  title: string
  path: string
  left: number
  top: number
  width: number
  height: number
  isActive: boolean
}

export type TmuxWindow = {
  index: number
  name: string
  isActive: boolean
  width: number
  height: number
  panes: TmuxPane[]
}

export type TmuxSnap = { session: string; self: string | null; windows: TmuxWindow[] }

export type CtxCategory = { name: string; tokens: number; color: string }

export type CtxSnap = {
  categories: CtxCategory[]
  grid: { color: string; fill: number; name: string }[][]
  total: number
  max: number
  threshold: number | null
  memory: { path: string; tokens: number }[]
  takenAt: number
}

/** One usage window: a percent with its reset, or a balance value in the provider's unit. */
export type ProvWindow = {
  name: string
  pct: number | null
  resetsAt: string | null
  resetsLocal: string | null
  value: number | null
  unit: string | null
  status: string | null
}

export type ProvAccount = {
  label: string
  provider: string
  source: string
  windows: ProvWindow[]
  facts: [string, string][]
  state: 'ok' | 'stale' | 'error' | 'none'
  note: string | null
  ageS: number | null
}

export type ProvPoolEntry = {
  route: string
  account: string | null
  state: 'ready' | 'cold' | 'skipped' | 'unmetered' | 'unread'
  usedPct: number | null
  resetsAt: string | null
  resetsLocal: string | null
  balance: string | null
  requests: number
}

export type ProvRoute = { model: string; agents: string[]; pool: ProvPoolEntry[] }

/** bin/provider_usage.py's document, plus when the deck read it and why it could not. */
export type ProvSnap = {
  ts: string
  accounts: ProvAccount[]
  routes: ProvRoute[]
  proxy: string
  takenAt: number
  error: string | null
}

export type Popup =
  | { kind: 'tool'; id: string }
  | { kind: 'pane'; id: string; lines: string[] }
  | { kind: 'turn'; id: string }
  | { kind: 'help' }

export type BandMode = 'full' | 'compact' | 'off'

declare module 'claude-code' {
  interface PluginState {
    'slab-deck': {
      metrics: Metrics
      turns: TurnRec[]
      live: Live
      tools: ToolRec[]
      agents: AgentRec[]
      git: GitSnap | null
      tmux: TmuxSnap | null
      ctx: CtxSnap | null
      providers: ProvSnap | null
      section: string
      band: BandMode
      popup: Popup | null
      peek: string | null
      peekLines: string[]
    }
  }
}
