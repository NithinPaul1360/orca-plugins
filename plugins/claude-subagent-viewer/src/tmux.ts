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

/** Whether this machine can run Claude Subagent Viewer: tmux has no native Windows build. */
export async function setupState(): Promise<'ok' | 'windows' | 'no-tmux'> {
  if (process.platform === 'win32') return 'windows'
  return (await tmux(['-V'])).ok ? 'ok' : 'no-tmux'
}

const LOCALE = utf8(process.env.LC_ALL) ?? utf8(process.env.LC_CTYPE) ?? utf8(process.env.LANG) ?? (process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8')
const UTF8_ENV = { ...process.env, LC_ALL: LOCALE, LC_CTYPE: LOCALE }
export function utf8(v?: string) {
  return v && /utf-?8/i.test(v) ? v : undefined
}

/** The last tmux failure, for the worker log. */
export let lastError = ''

export function tmux(args: string[], timeoutMs = 2000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    // -u and a UTF-8 locale: Orca starts workers without LANG, and tmux then turns every
    // non-ASCII byte (our field separator, ✳, box lines) into '_'.
    execFile(TMUX, ['-u', ...args], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, env: UTF8_ENV }, (err, stdout, stderr) => {
      if (err) lastError = `${args.slice(0, 3).join(' ')}: ${String(stderr || (err as Error).message).trim().slice(0, 300)}`
      resolve({ ok: !err, out: String(stdout ?? '') })
    })
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
/** A Claude Code teammate name, safe to put in a sentence to the lead. */
export const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/

/** What the lead's screen shows: whether its input box holds your text, its teammate rows
 *  (main first, as Claude Code lists them) and which row is selected. */
export function readLead(lines: string[]): { draft: boolean; rows: string[]; selected: number; hint: string } {
  let draft = true
  let input = -1
  for (let i = lines.length - 1; i > 0; i--) {
    if (/^\s*─{3,}/.test(lines[i - 1]) && /^❯/.test(lines[i])) {
      input = i
      draft = lines[i].slice(1).trim().length > 0
      break
    }
  }
  const rows: string[] = []
  let selected = -1
  let hint = ''
  for (let i = Math.max(0, input + 1); i < lines.length; i++) {
    const m = /^(❯)?\s+\S\s+(\S+)(?:\s{2,}|\s*$)/.exec(lines[i])
    if (/to (stop|clear|view|select)/.test(lines[i])) hint = lines[i].trim()
    if (rows.length === 0 && !(m && m[2] === 'main')) continue
    if (!m) break
    if (m[1]) selected = rows.length
    rows.push(m[2])
  }
  return { draft, rows, selected, hint }
}
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
