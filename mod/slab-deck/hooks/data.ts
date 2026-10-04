// Parsers for git and tmux output. The process calls themselves live in register.tsx
// ($ is followed only within one file), always by argv, never through a shell.
import type { GitFile, GitSnap, TmuxPane, TmuxSnap, TmuxWindow } from '../types'

export const GIT_STATUS = ['git', 'status', '--porcelain=v1', '-b', '--untracked-files=normal']
export const GIT_NUMSTAT = ['git', 'diff', '--numstat', 'HEAD']
export const GIT_LOG = ['git', 'log', '-8', '--format=%h%x09%s%x09%cr']

export function parseGit(root: string, status: string | null, numstat: string | null, log: string | null): GitSnap {
  let branch = '?'
  let ahead = 0
  let behind = 0
  const files = new Map<string, GitFile>()
  for (const line of (status ?? '').split('\n')) {
    if (line.startsWith('## ')) {
      const head = line.slice(3)
      branch = head.split('...')[0]?.replace(/^No commits yet on /, '') ?? head
      ahead = Number(/ahead (\d+)/.exec(head)?.[1] ?? 0)
      behind = Number(/behind (\d+)/.exec(head)?.[1] ?? 0)
    } else if (line.length > 3) {
      const path = line.slice(3).replace(/^.* -> /, '')
      files.set(path, { path, status: line.slice(0, 2).trim() || '?', add: 0, del: 0 })
    }
  }
  let added = 0
  let removed = 0
  for (const line of (numstat ?? '').split('\n')) {
    const [a, d, path] = line.split('\t')
    if (path === undefined) continue
    const add = a === '-' ? 0 : Number(a)
    const del = d === '-' ? 0 : Number(d)
    added += add
    removed += del
    const f = files.get(path) ?? { path, status: 'M', add: 0, del: 0 }
    files.set(path, { ...f, add, del })
  }
  const commits = (log ?? '')
    .split('\n')
    .filter(Boolean)
    .map(l => {
      const [hash = '', subject = '', age = ''] = l.split('\t')
      return { hash, subject, age: age.replace(/ ago$/, '') }
    })
  return { root, branch, ahead, behind, files: [...files.values()], added, removed, commits }
}

export const PANE_FORMAT = [
  '#{session_name}',
  '#{window_index}',
  '#{window_name}',
  '#{window_active}',
  '#{window_width}',
  '#{window_height}',
  '#{pane_id}',
  '#{pane_index}',
  '#{pane_current_command}',
  '#{?#{@pane-label},#{@pane-label},#{pane_title}}',
  '#{pane_current_path}',
  '#{pane_left}',
  '#{pane_top}',
  '#{pane_width}',
  '#{pane_height}',
  '#{pane_active}',
].join('\t')

export function parseTmux(out: string, session: string, self: string | null): TmuxSnap {
  const windows = new Map<number, TmuxWindow>()
  for (const line of out.split('\n')) {
    const f = line.split('\t')
    if (f.length < 16) continue
    const index = Number(f[1])
    const win = windows.get(index) ?? {
      index,
      name: f[2] ?? '',
      isActive: f[3] === '1',
      width: Number(f[4]),
      height: Number(f[5]),
      panes: [],
    }
    const pane: TmuxPane = {
      id: f[6] ?? '',
      index: Number(f[7]),
      command: f[8] ?? '',
      title: f[9] ?? '',
      path: f[10] ?? '',
      left: Number(f[11]),
      top: Number(f[12]),
      width: Number(f[13]),
      height: Number(f[14]),
      isActive: f[15] === '1',
    }
    win.panes.push(pane)
    windows.set(index, win)
  }
  return { session, self, windows: [...windows.values()].sort((a, b) => a.index - b.index) }
}

/** The last `lines` rows of a capture, trailing blank rows dropped. */
export function lastLines(out: string | null, lines: number): string[] {
  return (out ?? '').replace(/\s+$/, '').split('\n').map(l => l.replace(/\s+$/, '')).slice(-lines)
}
