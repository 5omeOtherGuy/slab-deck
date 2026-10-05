// SLAB Harness ink: tokens, formatting and Raster painting.
// Surfaces GROUND / BLOCK / BLOCK+; ink FG / DIM / FAINT; hue on glyphs and outcome markers only;
// no box-drawing characters; one motion, the ▪▪▪ working indicator.

export const C = {
  GROUND: '#0a0a0a',
  BLOCK: '#121212',
  PLUS: '#1c1c1c',
  CONTROL: '#202020',
  RULE: '#2a2a2a',
  RULE2: '#3d3d3d',
  FAINT: '#6a6a6a',
  DIM: '#9a9a9a',
  INK: '#e8e8e8',
  ATTN: '#e2a03f',
  FAIL: '#e0705f',
  OK: '#8fb573',
  LIVE: '#72b8b0',
  REF: '#7fa7d6',
  SYNTAX: '#c08fc8',
} as const

// The SLAB/SIGNAL ANSI set, for charts that must tell categories apart.
export const SERIES = ['#7fa7d6', '#8fb573', '#e2a03f', '#c08fc8', '#72b8b0', '#e0705f', '#a3c3e8', '#aed19a', '#f2c078', '#d5b0dc', '#98d2ca', '#bfbfbf']

const DEFAULT = 0x01000000

export function rgb(hex: string): number {
  const h = hex.replace('#', '')
  return /^[0-9a-fA-F]{6}$/.test(h) ? parseInt(h, 16) : DEFAULT
}

export function mix(a: string, b: string, t: number): number {
  const x = rgb(a)
  const y = rgb(b)
  const k = Math.max(0, Math.min(1, t))
  const ch = (v: number, s: number) => (v >> s) & 0xff
  const m = (s: number) => Math.round(ch(x, s) + (ch(y, s) - ch(x, s)) * k)
  return (m(16) << 16) | (m(8) << 8) | m(0)
}

export function hex(n: number): string {
  return '#' + (n & 0xffffff).toString(16).padStart(6, '0')
}

/** A value's tone: INK, ATTN (warning) from 70 %, FAIL from 90 %. */
export function levelHex(pct: number): string {
  if (pct >= 90) return C.FAIL
  if (pct >= 70) return C.ATTN
  return C.INK
}

/** Category colour: the engine's hex when it gives one, else a stable series colour. */
export function category(color: string, name: string): number {
  if (/^#?[0-9a-fA-F]{6}$/.test(color)) return rgb(color)
  let h = 0
  for (const ch of name + color) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return rgb(SERIES[h % SERIES.length] ?? C.DIM)
}

// ---- formatting: facts, not narration; unknown is —, never 0

export function tokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`
  return String(Math.round(n))
}

/** `12s` under a minute, `7m` under an hour, else `1h34` (the statusline clock). */
export function dur(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

/** A call's duration as an outcome fact: `0.4s`, `11.4s`, `2m`. */
export function took(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  return ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : dur(ms)
}

/** Time left until `iso`: `42m`, `3h12`, `3d17h` (as the statusline writes resets). */
export function until(iso: string | null, now: number): string {
  if (iso === null) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const h = Math.floor(Math.max(0, t - now) / 3600000)
  return h >= 24 ? `${Math.floor(h / 24)}d${h % 24}h` : dur(Math.max(0, t - now))
}

/** Time to a reset: `3d19h` from two days, else as `dur`; `passed` once it is behind. */
export function resetIn(iso: string | null, now: number): string {
  if (iso === null) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const ms = t - now
  if (ms < 0) return 'passed'
  const h = Math.floor(ms / 3600000)
  return h >= 48 ? `${Math.floor(h / 24)}d${String(h % 24).padStart(2, '0')}h` : dur(ms)
}

export function clip(text: string, width: number): string {
  if (width <= 0) return ''
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'
}

export function pad(text: string, width: number): string {
  const t = clip(text, width)
  return t + ' '.repeat(Math.max(0, width - t.length))
}

export function limitLabel(kind: string): string {
  if (kind === 'five_hour') return '5h'
  if (kind === 'seven_day') return '7d'
  if (kind.startsWith('seven_day_')) return '7d ' + kind.slice(10)
  return kind.replace(/_/g, ' ')
}

/** Tool names lowercase and verbatim, as the harness writes them. */
export function toolName(tool: string): string {
  return tool.startsWith('mcp__') ? tool.split('__').slice(1).join(':').toLowerCase() : tool.toLowerCase()
}

// ---- Raster painting

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = bytes[i]! << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

/** A grid of cells, painted then packed as RasterProps.cells. */
export class Canvas {
  readonly columns: number
  readonly rows: number
  private readonly words: Uint32Array

  constructor(columns: number, rows: number, bg: number = DEFAULT) {
    this.columns = Math.max(1, Math.min(512, Math.floor(columns)))
    this.rows = Math.max(1, Math.min(256, Math.floor(rows)))
    this.words = new Uint32Array(this.columns * this.rows * 3)
    for (let i = 0; i < this.columns * this.rows; i++) {
      this.words[i * 3] = 0x20
      this.words[i * 3 + 1] = DEFAULT
      this.words[i * 3 + 2] = bg
    }
  }

  set(x: number, y: number, ch: string | number, fg: number = DEFAULT, bg?: number): void {
    if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) return
    const i = (Math.floor(y) * this.columns + Math.floor(x)) * 3
    this.words[i] = typeof ch === 'number' ? ch : ch.charCodeAt(0)
    this.words[i + 1] = fg
    if (bg !== undefined) this.words[i + 2] = bg
  }

  text(x: number, y: number, s: string, fg: number, bg?: number): void {
    for (let k = 0; k < s.length; k++) this.set(x + k, y, s[k]!, fg, bg)
  }

  cells(): string {
    return base64(new Uint8Array(this.words.buffer))
  }
}

const EIGHTHS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']
const TICKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

/**
 * A bar to an eighth of a cell, unfilled segments in RULE. Filled in the value's tone (INK, ATTN,
 * FAIL) for a level that can run out; `neutral` fills DIM, for a share or a count that cannot.
 */
export function gauge(width: number, pct: number, mark?: number, neutral: boolean = false): Canvas {
  const c = new Canvas(width, 1)
  const fill = rgb(neutral ? C.DIM : levelHex(pct))
  const track = rgb(C.RULE)
  const eighths = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width * 8)
  for (let x = 0; x < width; x++) {
    const n = Math.max(0, Math.min(8, eighths - x * 8))
    if (n === 8) c.set(x, 0, '█', fill)
    else if (n === 0) c.set(x, 0, '█', track)
    else c.set(x, 0, EIGHTHS[n]!, fill, track)
  }
  if (mark !== undefined && mark > 0 && mark < 100) {
    const x = Math.min(width - 1, Math.floor((mark / 100) * width))
    c.set(x, 0, '▏', rgb(C.ATTN), eighths >= (x + 1) * 8 ? fill : track)
  }
  return c
}

/** A tall bar: `rows` rows of the same gauge, the label written into the middle row. */
export function slab(width: number, rows: number, pct: number, label: string): Canvas {
  const c = new Canvas(width, rows)
  const fillHex = levelHex(pct)
  const fill = rgb(fillHex)
  const track = rgb(C.RULE)
  const eighths = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width * 8)
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < width; x++) {
      const n = Math.max(0, Math.min(8, eighths - x * 8))
      if (n === 8) c.set(x, y, '█', fill)
      else if (n === 0) c.set(x, y, '█', track)
      else c.set(x, y, EIGHTHS[n]!, fill, track)
    }
  const y = Math.floor(rows / 2)
  const x0 = Math.max(0, Math.floor((width - label.length) / 2))
  for (let k = 0; k < label.length && x0 + k < width; k++) {
    const x = x0 + k
    const isOn = eighths >= (x + 1) * 8
    c.set(x, y, label[k]!, isOn ? rgb(C.GROUND) : rgb(C.INK), isOn ? fill : track)
  }
  return c
}

/** ▁▂▃ sparkline of the last `width` values: DIM, the newest in INK; FAINT dots where none. */
export function spark(values: number[], width: number): Canvas {
  const c = new Canvas(width, 1)
  const vs = values.slice(-width)
  const max = Math.max(1, ...vs)
  const x0 = width - vs.length
  vs.forEach((v, k) => {
    const i = Math.max(0, Math.min(7, Math.round((v / max) * 7)))
    c.set(x0 + k, 0, TICKS[i]!, k === vs.length - 1 ? rgb(C.INK) : rgb(C.DIM))
  })
  for (let x = 0; x < x0; x++) c.set(x, 0, '·', rgb(C.RULE2))
  return c
}

/** A column chart to an eighth of a cell: one column per value, newest right, the latest in INK. */
export function columns(values: number[], width: number, rows: number, tone: string = C.DIM): Canvas {
  const c = new Canvas(width, rows)
  const vs = values.slice(-width)
  const max = Math.max(1, ...vs)
  const x0 = width - vs.length
  vs.forEach((v, k) => {
    const fg = k === vs.length - 1 ? rgb(C.INK) : rgb(tone)
    let eighths = Math.round((v / max) * rows * 8)
    if (v > 0 && eighths === 0) eighths = 1
    for (let y = rows - 1; y >= 0 && eighths > 0; y--) {
      const n = Math.min(8, eighths)
      c.set(x0 + k, y, n === 8 ? '█' : TICKS[n - 1]!, fg)
      eighths -= n
    }
  })
  for (let x = 0; x < width; x++) if (x < x0) c.set(x, rows - 1, '·', rgb(C.RULE2))
  return c
}

/**
 * The working indicator: three ▪ in LIVE, each breathing 0.18 → 1 over 1.1 s, staggered 0.18 s.
 * `still` freezes it at full strength (reduced motion).
 */
export function working(ms: number, bg: string, still: boolean = false): Canvas {
  const c = new Canvas(3, 1)
  for (let i = 0; i < 3; i++) {
    const phase = (((ms / 1000 - i * 0.18) % 1.1) + 1.1) % 1.1 / 1.1
    const opacity = still ? 1 : 0.18 + 0.82 * (0.5 - 0.5 * Math.cos(phase * 2 * Math.PI))
    c.set(i, 0, '▪', mix(bg, C.LIVE, opacity), rgb(bg))
  }
  return c
}

/** A lane chart: one row per lane, a cell lit where calls ran in its slice of the window. */
export function lanes(
  rows: { name: string; events: { at: number; ms: number; isError: boolean }[] }[],
  from: number,
  to: number,
  width: number,
): Canvas {
  const c = new Canvas(width, Math.max(1, rows.length))
  const span = Math.max(1, to - from)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) c.set(x, y, '·', rgb(C.RULE))
    const heat = new Float32Array(width)
    const err = new Uint8Array(width)
    for (const ev of row.events) {
      const a = Math.floor(((ev.at - from) / span) * width)
      const b = Math.floor(((ev.at + Math.max(ev.ms, 1) - from) / span) * width)
      for (let x = Math.max(0, a); x <= Math.min(width - 1, b); x++) {
        heat[x]! += 1
        if (ev.isError) err[x] = 1
      }
    }
    const max = Math.max(1, ...heat)
    for (let x = 0; x < width; x++) {
      if (heat[x]! === 0) continue
      const t = heat[x]! / max
      c.set(x, y, TICKS[Math.max(2, Math.min(7, Math.round(t * 7)))]!, err[x] ? rgb(C.FAIL) : mix(C.DIM, C.INK, t))
    }
  })
  return c
}

/** The /context grid: each square two cells wide, coloured by category, dimmed by fullness. */
export function grid(squares: { color: string; fill: number; name: string }[][]): Canvas {
  const cols = Math.max(1, ...squares.map(r => r.length)) * 2
  const c = new Canvas(cols, Math.max(1, squares.length))
  squares.forEach((row, y) =>
    row.forEach((sq, x) => {
      if (sq.fill <= 0) {
        c.set(x * 2, y, '·', rgb(C.RULE2))
        return
      }
      const base = category(sq.color, sq.name)
      const fg = sq.fill >= 1 ? base : mix(C.BLOCK, hex(base), 0.35 + 0.65 * sq.fill)
      c.set(x * 2, y, '█', fg)
    }),
  )
  return c
}

/**
 * A tmux window to scale, in filled blocks (no box drawing): panes BLOCK+ with their index FAINT,
 * this session's pane CONTROL with `you`, the picked pane ATTN-inverted (the focused picker row).
 */
export function minimap(
  win: { width: number; height: number; panes: { id: string; left: number; top: number; width: number; height: number; index: number }[] },
  self: string | null,
  pick: string | null,
  width: number,
  rows: number,
): Canvas {
  const c = new Canvas(width, rows)
  const sx = width / Math.max(1, win.width + 1)
  const sy = rows / Math.max(1, win.height + 1)
  for (const p of win.panes) {
    const x0 = Math.floor(p.left * sx)
    const y0 = Math.floor(p.top * sy)
    const x1 = Math.max(x0 + 1, Math.floor((p.left + p.width + 1) * sx) - 2)
    const y1 = Math.max(y0, Math.floor((p.top + p.height + 1) * sy) - 1)
    const isPick = p.id === pick && p.id !== self
    const isSelf = p.id === self
    const bg = rgb(isPick ? C.ATTN : isSelf ? C.RULE2 : C.PLUS)
    const fg = rgb(isPick ? C.GROUND : isSelf ? C.INK : C.FAINT)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.set(x, y, ' ', fg, bg)
    const label = isSelf ? `${p.index} you` : String(p.index)
    c.text(x0 + 1, y0 + Math.floor((y1 - y0) / 2), label.slice(0, Math.max(0, x1 - x0)), fg, bg)
  }
  return c
}
