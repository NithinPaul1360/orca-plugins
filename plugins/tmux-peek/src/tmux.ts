// Pure helpers plus the tmux calls. Kept apart from worker.ts so tests can reach them.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { PaneShot } from './protocol'

const PIN = /tmux\s+-L\s+([A-Za-z0-9._-]+)\s+a(?:ttach)?\b/g

/** The tmux socket names a terminal's text points at, newest last, no repeats. */
export function findSockets(lines: string[]): string[] {
  const seen: string[] = []
  for (const line of lines) {
    for (const m of line.matchAll(PIN)) {
      const name = m[1]
      const at = seen.indexOf(name)
      if (at >= 0) seen.splice(at, 1)
      seen.push(name)
    }
  }
  return seen
}

// Known install places first (Orca's worker may not have the shell's PATH), then PATH.
const TMUX = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux', '/bin/tmux', '/snap/bin/tmux'].find((p) => existsSync(p)) ?? 'tmux'

/** Whether this machine can run Tmux Peek: tmux has no native Windows build. */
export async function setupState(): Promise<'ok' | 'windows' | 'no-tmux'> {
  if (process.platform === 'win32') return 'windows'
  return (await tmux(['-V'])).ok ? 'ok' : 'no-tmux'
}

export function tmux(args: string[], timeoutMs = 2000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(TMUX, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      resolve({ ok: !err, out: String(stdout ?? '') })
    )
  })
}

const SEP = '\u001f'
const FMT = ['#{pane_id}', '#{pane_title}', '#{pane_current_command}', '#{pane_width}', '#{pane_height}', '#{pane_active}'].join(SEP)

export function parsePanes(out: string): Omit<PaneShot, 'ansi'>[] {
  return out
    .split('\n')
    .filter((l) => l.includes(SEP))
    .map((l) => {
      const [id, title, command, w, h, active] = l.split(SEP)
      return { id, title, command, width: Number(w) || 80, height: Number(h) || 24, active: active === '1' }
    })
}

export async function listPanes(socket: string) {
  const r = await tmux(['-L', socket, 'list-panes', '-a', '-F', FMT])
  return r.ok ? parsePanes(r.out) : null
}

export async function capture(socket: string): Promise<{ alive: boolean; panes: PaneShot[] }> {
  const panes = await listPanes(socket)
  if (!panes) return { alive: false, panes: [] }
  const shots = await Promise.all(
    panes.map(async (p) => {
      const r = await tmux(['-L', socket, 'capture-pane', '-p', '-e', '-t', p.id])
      return { ...p, ansi: r.ok ? r.out.replace(/\n+$/, '') : '' }
    })
  )
  return { alive: true, panes: shots }
}

export const SOCKET_RE = /^[A-Za-z0-9._-]+$/
export const PANE_RE = /^%\d+$/
export const KEYS = ['Escape', 'Up', 'Down', 'Enter', 'BTab', 'Tab']

/** Named keys live typing may send: tmux key names, Ctrl/Alt letters. */
const LIVE = new Set(['Escape', 'Up', 'Down', 'Left', 'Right', 'Enter', 'BTab', 'Tab', 'BSpace', 'DC', 'Home', 'End', 'PPage', 'NPage', 'M-Enter', 'Space'])
export function liveKeyOk(k: string): boolean {
  return LIVE.has(k) || /^[CM]-[a-z]$/.test(k) || /^M-(BSpace|Left|Right)$/.test(k)
}

/** Raw bytes as tmux -H hex: no option parsing, any UTF-8 text. */
export function hexBytes(text: string): string[] {
  return [...Buffer.from(text)].map((b) => b.toString(16).padStart(2, '0'))
}

/** One tmux argv that sends the whole batch in order. */
export function keysArgs(socket: string, pane: string, seq: { text?: string; key?: string; mouse?: string }[]): string[] | null {
  const args: string[] = ['-L', socket]
  let first = true
  for (const step of seq) {
    if (step.mouse != null) {
      // SGR mouse report only: ESC [ < b ; x ; y M|m
      if (!/^(\u001b\[<\d{1,3};\d{1,4};\d{1,4}[Mm])+$/.test(step.mouse)) return null
      if (!first) args.push(';')
      args.push('send-keys', '-t', pane, '-H', ...hexBytes(step.mouse))
      first = false
      continue
    }
    const part = step.text != null ? ['send-keys', '-t', pane, '-H', ...hexBytes(step.text)] : step.key && liveKeyOk(step.key) ? ['send-keys', '-t', pane, step.key] : null
    if (!part) return null
    if (step.text === '') continue
    if (!first) args.push(';')
    args.push(...part)
    first = false
  }
  return first ? null : args
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function sendText(socket: string, pane: string, text: string, enter: boolean) {
  if (text) {
    const r = await tmux(['-L', socket, 'send-keys', '-t', pane, '-l', text])
    if (!r.ok) return false
  }
  if (enter) {
    // Enter goes in its own write, after the TUI has taken the text; one write gets swallowed.
    await wait(text ? 150 : 0)
    return (await tmux(['-L', socket, 'send-keys', '-t', pane, 'Enter'])).ok
  }
  return true
}

const ORCA =
  ['/Applications/Orca.app/Contents/Resources/bin/orca', '/opt/homebrew/bin/orca', '/usr/local/bin/orca', '/usr/bin/orca'].find((p) =>
    existsSync(p)
  ) ?? 'orca'

/** Runs the orca CLI (used to bring the lead chat to the front). */
export function orcaCli(args: string[], timeoutMs = 8000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!ORCA) return resolve({ ok: false, error: 'orca CLI not found' })
    execFile(ORCA, [...args, '--json'], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      let json: { ok?: boolean; error?: { message?: string } } | null = null
      try {
        json = JSON.parse(String(stdout))
      } catch {}
      const ok = !err && json?.ok !== false
      resolve({ ok, error: ok ? undefined : json?.error?.message ?? String(err?.message ?? 'failed') })
    })
  })
}
