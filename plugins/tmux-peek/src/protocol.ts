// The panel <-> worker contract.
export {}

export type PinnedTmux = {
  socket: string // tmux -L name, e.g. claude-swarm-16449
  terminalId: string
  terminalTitle: string
  alive: boolean
  paneCount: number
}

export type PaneShot = {
  id: string
  title: string
  command: string
  width: number
  height: number
  active: boolean
  ansi: string // capture-pane -e output
}

declare module 'orca' {
  interface PluginRequests {
    /** Every tmux command pinned in a chat of the focused workspace. */
    'tmux.list': { output: { workspace: string | null; items: PinnedTmux[]; setup: 'ok' | 'windows' | 'no-tmux' } }
    /** The current screen of every pane on one tmux socket. */
    'tmux.capture': { input: { socket: string }; output: { alive: boolean; panes: PaneShot[] } }
    /** Types text into one pane, then presses Enter when asked. */
    'tmux.send': { input: { socket: string; pane: string; text: string; enter: boolean }; output: { ok: boolean } }
    /** Presses one named key in a pane (Escape, Up, Down, Enter, BTab). */
    'tmux.key': { input: { socket: string; pane: string; key: string }; output: { ok: boolean } }
    /** Live typing: a batch of literal text and named keys, sent in order in one tmux call. */
    'tmux.keys': { input: { socket: string; pane: string; seq: { text?: string; key?: string; mouse?: string }[] }; output: { ok: boolean } }
    /** Makes a pane the active one inside its tmux window. */
    'tmux.select': { input: { socket: string; pane: string }; output: { ok: boolean } }
    /** Brings the Orca chat that pinned this tmux to the front. */
    'orca.focusLead': { input: { terminalId: string }; output: { ok: boolean; error?: string } }
    /** Start (or keep alive, every few seconds) the worker's watch on one tmux; frames arrive as tmux.frame. */
    'tmux.watch': { input: { socket: string; fresh?: boolean }; output: { ok: boolean } }
    /** Sizes the tmux window so each pane is cols x rows in our grid (or one zoomed pane fills it). */
    'tmux.fit': { input: { socket: string; gridCols: number; cols: number; rows: number; zoomed: string | null }; output: { ok: boolean } }
    /** Scroll wheel over a pane, passed to the app as mouse input. */
    'tmux.wheel': { input: { socket: string; pane: string; up: boolean; col: number; row: number; count: number }; output: { ok: boolean } }
    /** Zooms one pane to the whole tmux window (on) or puts the layout back (off). */
    'tmux.zoom': { input: { socket: string; pane: string; on: boolean }; output: { ok: boolean } }
  }
  interface PluginPanelEvents {
    /** The watched tmux's screen changed. */
    'tmux.frame': { socket: string; alive: boolean; panes: PaneShot[] }
  }
}
