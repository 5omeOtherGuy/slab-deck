import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

/** What the engine answers beneath the plugin in a session, answered here from memory. */
function engine(on: On): void {
  mock.clock(on)
  on('session.measure', ($, e) => ({ changed: [...e.changed] }))
  on('session.cwd', () => ({ value: '/home/u/brain' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 1, context: { window: 200000 }, rateLimits: [] } }))
}

const BAND = (bodyColumns: number) => ({
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns, scroll: { offset: 0, bodyRows: 6 }, view: {} },
})

const PANE = (id: string) => ({
  component: 'Pane' as const,
  requestId: id,
  props: { title: id, isFocused: true, bodyColumns: 90, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
})

const LIST_PANES = [
  ['main', '1', 'phaseone', '0', '175', '42', '%1', '1', 'claude', 'XO review', '/home/u', '0', '0', '175', '42', '1'],
  ['main', '2', 'brain lead', '1', '175', '42', '%2', '1', 'claude', 'brain lead', '/home/u/brain', '0', '0', '87', '42', '1'],
  ['main', '2', 'brain lead', '1', '175', '42', '%3', '2', 'bash', 'shell', '/home/u/brain', '88', '0', '87', '42', '0'],
]
  .map(r => r.join('\t'))
  .join('\n')

test('the band leaves the statusline to Claude Code and draws the hint row', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { tokens: 54000, window: 200000, percent: 27 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 84, resetsAt: '2030-01-01T00:00:00Z' }],
    changed: ['context', 'rateLimits'],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'slab-deck', surface, ...BAND(160) })
    expect(await band.find({ type: 'Text', text: /27%|84%/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /not in tmux/ })).toBeDefined()
    expect(await band.find({ type: 'Button', key: 'b-deck' })).toBeDefined()
    await band.unmount()
  }
  const deck = await $.ui.mount({ plugin: 'slab-deck', surface: 'desktop', ...PANE('deck') })
  expect(await deck.find({ type: 'Raster' })).toBeUndefined()
  expect(await deck.find({ type: 'Text', text: /█+░+/ })).toBeDefined()
  await deck.unmount()
})

test('tmux windows become band links, and a link selects that window', async ($, on) => {
  engine(on)
  mock.env(on, { TMUX: '/tmp/tmux-1000/default,1,0', TMUX_PANE: '%2' })
  const calls: string[] = []
  on('process.run', ($, e) => {
    calls.push(e.argv.join(' '))
    const stdout = e.argv[1] === 'display-message' ? 'main\n' : e.argv[1] === 'list-panes' ? LIST_PANES : ''
    return { value: { exitCode: e.argv[0] === 'tmux' ? 0 : 1, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const deck = await $.ui.mount({ plugin: 'slab-deck', surface, ...PANE('deck') })
    await deck.press({ key: 'ov-refresh' })
    await deck.unmount()

    const band = await $.ui.mount({ plugin: 'slab-deck', surface, ...BAND(160) })
    expect(await band.find({ type: 'Button', key: 'w1' })).toBeDefined()
    expect(await band.find({ type: 'Button', key: 'w2' })).toBeDefined()
    await band.press({ key: 'w1' })
    expect(calls).toContain('tmux select-window -t main:1')
    await band.unmount()
  }
})

test('the tmux section peeks a pane and never offers to close one', async ($, on) => {
  engine(on)
  mock.env(on, { TMUX: '/tmp/tmux-1000/default,1,0', TMUX_PANE: '%2' })
  const calls: string[] = []
  on('process.run', ($, e) => {
    calls.push(e.argv.join(' '))
    const stdout = e.argv[1] === 'display-message' ? 'main\n' : e.argv[1] === 'list-panes' ? LIST_PANES : e.argv[1] === 'capture-pane' ? '$ make\nok\n' : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const deck = await $.ui.mount({ plugin: 'slab-deck', surface: 'terminal', ...PANE('deck') })
  await deck.press({ key: 'ov-refresh' })
  await deck.press({ key: 't-tmux' })
  await deck.press({ key: 'tp-b-%3' })
  expect(calls.some(c => c.startsWith('tmux capture-pane -p -J -t %3'))).toBe(true)
  expect(await deck.find({ type: 'Code', text: /make/ })).toBeDefined()
  expect(await deck.find({ type: 'Raster', key: 'tm-map' })).toBeDefined()
  await deck.press({ key: 'tm-go' })
  expect(calls).toContain('tmux select-pane -t %3')
  expect(calls.some(c => /kill-(pane|window|session)/.test(c))).toBe(false)
  await deck.unmount()
})

test('tool calls are tracked and open their popup', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '' } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'git status --short' } as never)
  const deck = await $.ui.mount({ plugin: 'slab-deck', surface: 'terminal', ...PANE('deck') })
  await deck.press({ key: 't-tools' })
  expect(await deck.find({ type: 'Button', text: /^bash +git status --short/ })).toBeDefined()
  const row = (await deck.findAll({ type: 'Button' })).find(b => (b.key ?? '').startsWith('tool-'))
  expect(row).toBeDefined()
  await deck.press({ key: row!.key! })
  await deck.unmount()

  const pop = await $.ui.mount({ plugin: 'slab-deck', surface: 'terminal', ...PANE('deck-pop') })
  expect(await pop.find({ type: 'Code', text: /git status --short/ })).toBeDefined()
  await pop.unmount()
})

test('no drawing holds a box-drawing character (SLAB Harness: none, ever)', async ($, on) => {
  engine(on)
  mock.env(on, { TMUX: '/tmp/tmux-1000/default,1,0', TMUX_PANE: '%2' })
  on('process.run', ($, e) => {
    const stdout = e.argv[1] === 'display-message' ? 'main\n' : e.argv[1] === 'list-panes' ? LIST_PANES : 'x\n'
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const box = /[─-╿]/
  const band = await $.ui.mount({ plugin: 'slab-deck', surface: 'terminal', ...BAND(160) })
  expect(box.test(JSON.stringify(await band.drawn()))).toBe(false)
  await band.unmount()
  const deck = await $.ui.mount({ plugin: 'slab-deck', surface: 'terminal', ...PANE('deck') })
  await deck.press({ key: 'ov-refresh' })
  for (const s of ['tools', 'agents', 'git', 'tmux', 'usage', 'overview']) {
    await deck.press({ key: `t-${s}` })
    expect(box.test(JSON.stringify(await deck.drawn()))).toBe(false)
  }
  await deck.unmount()
})

test('a turn streams into the hint row and lands in usage', async ($, on) => {
  engine(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'x'.repeat(400) } as never
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: { model: e.model, input_tokens: 1200, output_tokens: 3400, cache_read_input_tokens: 9000, cache_creation_input_tokens: 300 } } as never
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  mock.env(on, { HOME: '/home/u' })
  on('session.id', () => ({ value: 's1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', () => ({ value: undefined }) as never)
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  const writes: [string, string][] = []
  on('fs.write', ($, e) => {
    writes.push([e.path, e.text])
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ source: 'startup', cwd: '/home/u' } as never)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 } as never)
  for await (const _ of stream) {
    const band = await $.ui.mount({ plugin: 'slab-deck', surface: 'terminal', ...BAND(160) })
    expect(await band.find({ type: 'Raster', key: 'work' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '100' })).toBeDefined()
    await band.unmount()
  }
  await stream.result
  await $.turn.complete({ answer: 'ok', durationMs: 65000, isAborted: false, turnId: 't1', reason: 'answer' } as never)

  expect(writes).toContainEqual(['/home/u/.cache/slab-deck/s1.json', JSON.stringify({ outs: [3400] })])
  const band = await $.ui.mount({ plugin: 'slab-deck', surface: 'terminal', ...BAND(160) })
  expect(await band.find({ type: 'Raster', key: 'work' })).toBeUndefined()
  await band.unmount()
  const deck = await $.ui.mount({ plugin: 'slab-deck', surface: 'terminal', ...PANE('deck') })
  await deck.press({ key: 't-usage' })
  expect(await deck.find({ type: 'Text', text: '3.4k' })).toBeDefined()
  expect(await deck.find({ type: 'Button', text: /1 steps/ })).toBeDefined()
  await deck.unmount()
})
