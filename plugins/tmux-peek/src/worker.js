import { gridLayout } from './layout';
import { capture, setupState, findSockets, keysArgs, KEYS, listPanes, orcaCli, PANE_RE, sendText, SOCKET_RE, tmux } from './tmux';
export default function activate(orca) {
    // The worker watches the chosen tmux itself (tmux calls cost Orca nothing) and posts a frame
    // to the panel only when the screen changed. The panel never polls, so it never hits Orca's
    // request budget.
    let watched = null;
    let lastBeat = 0;
    let lastSent = '';
    let busy = false;
    async function pushNow(force = false) {
        if (!watched || busy)
            return;
        if (Date.now() - lastBeat > 15000) {
            watched = null;
            return;
        }
        busy = true;
        try {
            const socket = watched;
            const shot = await capture(socket);
            const key = socket + JSON.stringify(shot);
            if (force || key !== lastSent) {
                lastSent = key;
                orca.panels.post('tmux.frame', { socket, ...shot });
            }
        }
        catch (e) {
            orca.log(`frame: ${String(e?.message ?? e)}`);
        }
        finally {
            busy = false;
        }
    }
    const timer = setInterval(() => void pushNow(), 400);
    timer.unref?.();
    orca.panels.handle('tmux.watch', async ({ socket, fresh }) => {
        if (!SOCKET_RE.test(socket))
            return { ok: false };
        // fresh: a panel with nothing on screen (just opened, reloaded, or switched) gets a frame now.
        const changed = watched !== socket || !!fresh;
        watched = socket;
        lastBeat = Date.now();
        if (changed)
            lastSent = '';
        void pushNow(changed);
        return { ok: true };
    });
    let setup = null;
    orca.panels.handle('tmux.list', async () => {
        if (setup !== 'ok')
            setup = await setupState();
        if (setup !== 'ok')
            return { workspace: null, items: [], setup };
        const ctx = await orca.host.call('workspace.readContext');
        if (!ctx)
            return { workspace: null, items: [], setup };
        const items = [];
        for (const t of ctx.terminals) {
            let lines = [];
            try {
                lines = (await orca.host.call('terminal.read', { terminalId: t.id, maxLines: 400 })).lines;
            }
            catch {
                continue;
            }
            for (const socket of findSockets(lines)) {
                if (items.some((i) => i.socket === socket))
                    continue;
                const panes = await listPanes(socket);
                items.push({
                    socket,
                    terminalId: t.id,
                    terminalTitle: t.title ?? 'Terminal',
                    alive: panes !== null,
                    paneCount: panes?.length ?? 0
                });
            }
        }
        items.sort((a, b) => Number(b.alive) - Number(a.alive));
        return { workspace: ctx.displayName, items, setup };
    });
    orca.panels.handle('tmux.capture', async ({ socket }) => {
        if (!SOCKET_RE.test(socket))
            return { alive: false, panes: [] };
        return capture(socket);
    });
    const valid = (socket, pane) => SOCKET_RE.test(socket) && PANE_RE.test(pane);
    orca.panels.handle('tmux.send', async ({ socket, pane, text, enter }) => {
        if (!valid(socket, pane) || text.length > 8000)
            return { ok: false };
        const ok = await sendText(socket, pane, text, enter);
        setTimeout(() => void pushNow(), 200);
        return { ok };
    });
    orca.panels.handle('tmux.key', async ({ socket, pane, key }) => {
        if (!valid(socket, pane) || !KEYS.includes(key))
            return { ok: false };
        const ok = (await tmux(['-L', socket, 'send-keys', '-t', pane, key])).ok;
        setTimeout(() => void pushNow(), 80);
        return { ok };
    });
    orca.panels.handle('tmux.keys', async ({ socket, pane, seq }) => {
        if (!valid(socket, pane) || seq.length > 200)
            return { ok: false };
        const args = keysArgs(socket, pane, seq);
        if (!args)
            return { ok: false };
        const ok = (await tmux(args)).ok;
        setTimeout(() => void pushNow(), 40);
        return { ok };
    });
    orca.panels.handle('tmux.select', async ({ socket, pane }) => {
        if (!valid(socket, pane))
            return { ok: false };
        return { ok: (await tmux(['-L', socket, 'select-pane', '-t', pane])).ok };
    });
    orca.panels.handle('orca.focusLead', async ({ terminalId }) => {
        const r = await orcaCli(['terminal', 'switch', '--terminal', terminalId]);
        return { ok: r.ok, error: r.error };
    });
    orca.panels.handle('tmux.zoom', async ({ socket, pane, on }) => {
        if (!valid(socket, pane))
            return { ok: false };
        const flag = await tmux(['-L', socket, 'display-message', '-p', '-t', pane, '#{window_zoomed_flag}']);
        if (!flag.ok)
            return { ok: false };
        const zoomed = flag.out.trim() === '1';
        if (on)
            await tmux(['-L', socket, 'select-pane', '-t', pane]);
        if (zoomed !== on)
            return { ok: (await tmux(['-L', socket, 'resize-pane', '-Z', '-t', pane])).ok };
        return { ok: true };
    });
    orca.panels.handle('tmux.fit', async ({ socket, gridCols, cols, rows, zoomed }) => {
        if (!SOCKET_RE.test(socket) || (zoomed && !PANE_RE.test(zoomed)))
            return { ok: false };
        const c = Math.max(20, Math.min(400, Math.floor(cols)));
        const r = Math.max(5, Math.min(200, Math.floor(rows)));
        const panes = await listPanes(socket);
        if (!panes?.length)
            return { ok: false };
        const win = await tmux(['-L', socket, 'display-message', '-p', '-t', panes[0].id, '#{window_id}']);
        const target = win.out.trim();
        if (!target)
            return { ok: false };
        if (zoomed) {
            // One pane fills the window: size the window to the cell; zoom keeps the others out of the way.
            await tmux(['-L', socket, 'resize-window', '-t', target, '-x', String(c), '-y', String(r)]);
            setTimeout(() => void pushNow(), 150);
            return { ok: true };
        }
        const g = Math.max(1, Math.min(2, gridCols));
        const { layout, width, height } = gridLayout(panes.map((p) => Number(p.id.slice(1))), g, c, r);
        await tmux(['-L', socket, 'resize-window', '-t', target, '-x', String(width), '-y', String(height)]);
        const done = await tmux(['-L', socket, 'select-layout', '-t', target, layout]);
        setTimeout(() => void pushNow(), 150);
        return { ok: done.ok };
    });
    orca.panels.handle('tmux.wheel', async ({ socket, pane, up, col, row, count }) => {
        if (!valid(socket, pane))
            return { ok: false };
        const flags = await tmux(['-L', socket, 'display-message', '-p', '-t', pane, '#{mouse_any_flag}#{mouse_sgr_flag}#{alternate_on}']);
        const [anyMouse, sgr] = flags.out.trim().split('');
        const n = Math.max(1, Math.min(10, Math.floor(count)));
        if (anyMouse === '1' && sgr === '1') {
            const seq = `\u001b[<${up ? 64 : 65};${Math.max(1, Math.floor(col))};${Math.max(1, Math.floor(row))}M`;
            const hex = [...Buffer.from(seq.repeat(n))].map((b) => b.toString(16).padStart(2, '0'));
            const ok = (await tmux(['-L', socket, 'send-keys', '-t', pane, '-H', ...hex])).ok;
            setTimeout(() => void pushNow(), 60);
            return { ok };
        }
        // The app does not take the mouse (a plain shell): nothing to scroll inside it.
        return { ok: false };
    });
}
