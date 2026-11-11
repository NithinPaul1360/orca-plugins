// Right-sidebar panel: pick a tmux pinned in this workspace's chats and watch every teammate
// live in a grid that fits the panel. Click a pane to aim the message bar at it; ⤢ maximizes it.
import { ansiToHtml } from './ansi';
import { gridFor } from './grid';
import { isBusy, modelLabel, teammateName } from './teammate';
const style = document.createElement('style');
style.textContent = `
:root{--term-bg:#0d0d0f;--term-fg:#d1d5da}
html,body{margin:0;height:100%;overflow:hidden;background:var(--orca-background);color:var(--orca-foreground);font:12px -apple-system,BlinkMacSystemFont,sans-serif}
body{display:flex;flex-direction:column}
#top{flex:none;padding:10px 10px 8px;border-bottom:1px solid var(--orca-border);display:flex;gap:6px;align-items:center}
select{flex:1;min-width:0;background:var(--orca-card);color:var(--orca-foreground);border:1px solid var(--orca-input);border-radius:6px;padding:5px 6px;font:inherit}
button{background:none;border:1px solid var(--orca-border);color:var(--orca-muted-foreground);border-radius:6px;padding:3px 7px;cursor:pointer;font:inherit;white-space:nowrap}
button:hover{background:var(--orca-accent);color:var(--orca-accent-foreground)}
button.ghost{border-color:transparent}
button:disabled{opacity:.4;cursor:default}
#panes{flex:1;min-height:0;padding:8px 10px;display:grid;gap:8px;overflow-y:auto;align-content:start;box-sizing:border-box}
.pane{border:1px solid var(--orca-border);border-radius:8px;overflow:hidden;background:var(--term-bg);display:flex;flex-direction:column;min-width:0;min-height:0;transition:border-color .12s}
.pane:hover{border-color:var(--orca-muted-foreground)}
.pane.sel{border-color:var(--orca-primary);box-shadow:0 0 0 1px var(--orca-primary)}
.pane.live{border-color:#3fb950;box-shadow:0 0 0 1px #3fb950}
.live-tag{display:none;flex:none;font-size:10px;color:#3fb950;border:1px solid #3fb950;border-radius:4px;padding:0 4px;line-height:14px}
.pane.live .live-tag{display:inline}
.head{flex:none;display:flex;align-items:center;gap:5px;padding:3px 3px 3px 7px;background:var(--orca-card);color:var(--orca-muted-foreground);font-size:11px;cursor:pointer;user-select:none;min-width:0}
.dot{width:7px;height:7px;border-radius:50%;background:var(--orca-muted-foreground);flex:none}
.dot.busy{background:#e0a33a;box-shadow:0 0 6px #e0a33a}
.name{color:var(--orca-foreground);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.model{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.head button{padding:0 5px;font-size:11px;line-height:16px}
.head button.on{background:var(--orca-primary);color:var(--orca-primary-foreground);border-color:var(--orca-primary)}
pre{user-select:none;outline:none;flex:1;min-height:0;margin:0;padding:4px 6px;color:var(--term-fg);font-family:ui-monospace,Menlo,monospace;line-height:1.25;white-space:pre;overflow:hidden;cursor:default}
body.max .pane:not(.max){display:none}
#bar{flex:none;border-top:1px solid var(--orca-border);background:var(--orca-card);padding:7px 10px 8px;display:flex;flex-direction:column;gap:5px}
#bar.off{opacity:.5;pointer-events:none}
#bar .to{font-size:11px;color:var(--orca-muted-foreground)}
#bar .to b{color:var(--orca-foreground)}
textarea{width:100%;box-sizing:border-box;resize:none;background:var(--orca-background);color:var(--orca-foreground);border:1px solid var(--orca-input);border-radius:6px;padding:6px 7px;font:12px/1.4 -apple-system,sans-serif;min-height:30px;max-height:120px;outline:none}
textarea:focus{border-color:var(--orca-primary)}
.keys{display:flex;gap:4px;align-items:center;padding-right:44px}
.keys .hint{flex:1;color:var(--orca-muted-foreground);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.keys button{padding:1px 6px;font-size:11px}
.toast{position:fixed;left:10px;right:10px;bottom:96px;background:var(--orca-popover);color:var(--orca-popover-foreground);border:1px solid var(--orca-border);border-radius:8px;padding:7px 10px;font-size:11.5px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.on{opacity:1}
.empty{grid-column:1/-1;padding:28px 14px;color:var(--orca-muted-foreground);text-align:center;line-height:1.5}
.empty b{display:block;color:var(--orca-foreground);margin-bottom:4px}
`;
document.head.appendChild(style);
document.body.innerHTML = `
<div id="top"><select id="pick" aria-label="Pinned tmux"></select><button id="lead" title="Bring the lead chat to the front">Lead</button><button id="refresh" class="ghost" title="Look again">↻</button></div>
<div id="panes"></div>
<div id="bar" class="off">
  <div class="to">To <b id="to">click a teammate</b></div>
  <textarea id="box" rows="1" placeholder="Click a teammate above to message it"></textarea>
  <div class="keys"><span class="hint">Enter sends · or click a pane and type in it</span>
    <button data-key="Escape" title="Esc: interrupt or close a menu">Esc</button>
    <button data-key="Up" title="Up arrow">↑</button>
    <button data-key="Down" title="Down arrow">↓</button>
    <button data-key="Enter" title="Press Enter (pick the highlighted option)">⏎</button>
    <button data-key="BTab" title="Shift+Tab: cycle Claude's mode">⇧⇥</button>
  </div>
</div>
<div class="toast" id="toast"></div>`;
const $ = (id) => document.getElementById(id);
const pick = $('pick');
const panesEl = $('panes');
const toastEl = $('toast');
const bar = $('bar');
const box = $('box');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let items = [];
let selected = null; // socket
let selPane = null;
let maxPane = null;
let paneCount = 0;
let lastKey = '';
let toastTimer;
function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1800);
}
function empty(title, text) {
    panesEl.style.gridTemplateColumns = '1fr';
    panesEl.style.gridAutoRows = 'auto';
    panesEl.innerHTML = `<div class="empty"><b>${title}</b>${text}</div>`;
    lastKey = '';
    paneCount = 0;
    setTarget(null);
}
const current = () => items.find((i) => i.socket === selected);
const paneEl = (id) => panesEl.querySelector(`.pane[data-id="${id}"]`);
const nameOf = (id) => paneEl(id)?.querySelector('.name')?.textContent ?? 'teammate';
async function loadList() {
    let res;
    try {
        res = await orca.plugin.request('tmux.list');
    }
    catch (e) {
        // Rate limits and hiccups keep what is on screen; only a first load with nothing shows the error.
        if (!items.length && !paneCount)
            empty('Could not read terminals', esc(String(e.message ?? e)));
        return;
    }
    items = res.items;
    if (!items.some((i) => i.socket === selected)) {
        selected = items.find((i) => i.alive)?.socket ?? items[0]?.socket ?? null;
        selPane = null;
    }
    const label = (i) => `${i.terminalTitle} · ${i.alive ? `${i.paneCount} teammate${i.paneCount === 1 ? '' : 's'}` : 'ended'}`;
    pick.innerHTML = items.length
        ? items.map((i) => `<option value="${i.socket}" ${i.socket === selected ? 'selected' : ''}>${esc(label(i))}</option>`).join('')
        : `<option>No pinned tmux in ${esc(res.workspace ?? 'this workspace')}</option>`;
    pick.title = selected ?? '';
    pick.disabled = items.length === 0;
    $('lead').disabled = !current();
    if (res.setup === 'windows') {
        pick.innerHTML = '<option>Not available on Windows</option>';
        return empty('Tmux Peek needs tmux', 'Claude Code shows agent teammates in tmux, which does not run on Windows. Use Orca on macOS or Linux.');
    }
    if (res.setup === 'no-tmux') {
        pick.innerHTML = '<option>tmux not found</option>';
        return empty('Install tmux first', 'Tmux Peek could not find <code>tmux</code>. Install it (macOS: <code>brew install tmux</code>), then press ↻.');
    }
    if (!items.length)
        empty('No teammates here', 'Start an agent team in a Claude Code chat in this workspace. Teams show here when Claude Code runs them in tmux: set <code>"teammateMode": "tmux"</code> in <code>~/.claude/settings.json</code>. The chat then pins <code>tmux -L … a</code> and it appears in the list above.');
}
/** Sizes the grid to the panel: fit height, at most 3 rows on screen, 2 columns past 3 panes. */
function layout() {
    if (!paneCount)
        return;
    const n = maxPane ? 1 : paneCount;
    const { cols, visibleRows } = gridFor(n);
    const gap = 8;
    const avail = panesEl.clientHeight - 16;
    const rowH = Math.max(80, Math.floor((avail - gap * (visibleRows - 1)) / visibleRows));
    panesEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    panesEl.style.gridAutoRows = `${rowH}px`;
    panesEl.querySelectorAll('pre').forEach((pre) => fit(pre));
    fitTmux();
}
/** Text size the panes are drawn at; tmux is resized so each pane fills its cell at this size. */
const FONT = 11;
const CHAR_W = FONT * 0.602;
const LINE_H = FONT * 1.25;
let fitKey = '';
let fitTimer;
/** Tells tmux how many columns and rows fit in each cell, so agents draw to the pane's real size. */
function fitTmux() {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
        if (!selected || !paneCount)
            return;
        const pre = (maxPane ? paneEl(maxPane) : panesEl.querySelector('.pane'))?.querySelector('pre');
        if (!pre || pre.clientWidth <= 0)
            return;
        const cols = Math.floor((pre.clientWidth - 12) / CHAR_W);
        const rows = Math.floor((pre.clientHeight - 8) / LINE_H);
        const { cols: gridCols } = gridFor(paneCount);
        const k = `${selected}|${paneCount}|${gridCols}|${cols}|${rows}|${maxPane ?? ''}`;
        if (k === fitKey)
            return;
        fitKey = k;
        void orca.plugin.request('tmux.fit', { socket: selected, gridCols, cols, rows, zoomed: maxPane }).catch(() => { });
    }, 250);
}
function fit(pre) {
    const cols = Number(pre.dataset.cols) || 80;
    const rows = Number(pre.dataset.rows) || 24;
    const w = pre.clientWidth - 12;
    const h = pre.clientHeight - 8;
    if (w <= 0 || h <= 0)
        return;
    const size = Math.max(4, Math.min(FONT, w / (cols * 0.602), h / (rows * 1.25)));
    pre.style.fontSize = `${size.toFixed(2)}px`;
}
function setTarget(id) {
    selPane = id;
    panesEl.querySelectorAll('.pane').forEach((el) => el.classList.toggle('sel', el.dataset.id === id));
    bar.classList.toggle('off', !id);
    $('to').textContent = id ? nameOf(id) : 'click a teammate';
    box.placeholder = id ? `Message ${nameOf(id)}…` : 'Click a teammate above to message it';
}
function selectPane(id, focusBox = false) {
    setTarget(id);
    if (selected)
        void orca.plugin.request('tmux.select', { socket: selected, pane: id }).catch(() => { });
    if (focusBox)
        box.focus();
    else
        paneEl(id)?.querySelector('pre')?.focus();
}
const queue = [];
let queuePane = null;
let sending = false;
function push(pane, step) {
    if (queuePane !== pane)
        queue.length = 0;
    queuePane = pane;
    const lastStep = queue[queue.length - 1];
    if (step.text != null && lastStep?.text != null)
        lastStep.text += step.text;
    else if (step.mouse != null && lastStep?.mouse != null)
        lastStep.mouse += step.mouse;
    else
        queue.push(step);
    void drain();
}
async function drain() {
    if (sending || !queue.length || !selected || !queuePane)
        return;
    sending = true;
    // Enter right after typed text goes in its own call: Claude reads text+Enter in one write as a paste.
    let cut = queue.length;
    for (let i = 1; i < queue.length; i++)
        if (queue[i].key === 'Enter' && queue[i - 1].text != null) {
            cut = i;
            break;
        }
    const seq = queue.splice(0, cut);
    try {
        await orca.plugin.request('tmux.keys', { socket: selected, pane: queuePane, seq });
    }
    catch (e) {
        const wait = e?.retryAfterMs;
        if (wait) {
            queue.unshift(...seq);
            await new Promise((r) => setTimeout(r, wait));
        }
    }
    finally {
        sending = false;
        if (queue.length)
            setTimeout(drain, 60);
    }
}
const NAMED = {
    Enter: 'Enter', Backspace: 'BSpace', Delete: 'DC', Tab: 'Tab', Escape: 'Escape',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Home: 'Home', End: 'End', PageUp: 'PPage', PageDown: 'NPage'
};
/** Maps a browser key press to a tmux step, or null to let Orca have it (Cmd shortcuts). */
function stepFor(e) {
    if (e.metaKey)
        return null;
    if (e.key === 'Tab' && e.shiftKey)
        return { key: 'BTab' };
    if (e.key === 'Enter' && (e.shiftKey || e.altKey))
        return { key: 'M-Enter' };
    if (e.altKey && e.key === 'Backspace')
        return { key: 'M-BSpace' };
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
        return { key: `M-${e.key.slice(5)}` };
    if (e.ctrlKey && /^[a-z]$/i.test(e.key))
        return { key: `C-${e.key.toLowerCase()}` };
    if (NAMED[e.key])
        return { key: NAMED[e.key] };
    if (e.key.length === 1 && !e.ctrlKey)
        return e.altKey ? { key: `M-${e.key.toLowerCase()}` } : { text: e.key };
    return null;
}
/** Character cell size of a pane as drawn (measured, so clicks land on the right letter). */
function cellOf(pre) {
    const probe = document.createElement('span');
    probe.textContent = 'MMMMMMMMMM';
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
    pre.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 10;
    probe.remove();
    const size = parseFloat(pre.style.fontSize) || 11;
    return { w: w || size * 0.602, h: size * 1.25 };
}
/** Mouse position in a pane as 1-based terminal column and row. */
function cellAt(pre, x, y) {
    const r = pre.getBoundingClientRect();
    const { w, h } = cellOf(pre);
    const cs = getComputedStyle(pre);
    const col = Math.floor((x - r.left - parseFloat(cs.paddingLeft)) / w) + 1;
    const row = Math.floor((y - r.top - parseFloat(cs.paddingTop)) / h) + 1;
    return { col: Math.max(1, col), row: Math.max(1, row) };
}
function hasImage(e) {
    return [...(e.clipboardData?.items ?? [])].some((i) => i.type.startsWith('image/'));
}
function wireLive(pre, id) {
    pre.addEventListener('focus', () => {
        paneEl(id)?.classList.add('live');
        if (selPane !== id)
            setTarget(id);
    });
    pre.addEventListener('blur', () => paneEl(id)?.classList.remove('live'));
    // Clicks go to the agent as mouse presses (Claude expands "Ran 2 shell commands", picks options, ...).
    pre.addEventListener('mousedown', (e) => {
        if (e.button !== 0)
            return;
        const { col, row } = cellAt(pre, e.clientX, e.clientY);
        push(id, { mouse: `\u001b[<0;${col};${row}M` });
    });
    pre.addEventListener('mouseup', (e) => {
        if (e.button !== 0)
            return;
        const { col, row } = cellAt(pre, e.clientX, e.clientY);
        push(id, { mouse: `\u001b[<0;${col};${row}m` });
    });
    pre.addEventListener('keydown', (e) => {
        if (e.isComposing)
            return;
        const step = stepFor(e);
        if (!step)
            return;
        e.preventDefault();
        e.stopPropagation();
        push(id, step);
    });
    pre.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain');
        // An image (or anything without text): Claude reads the Mac clipboard itself on Ctrl+V.
        if (!text || hasImage(e))
            push(id, { key: 'C-v' });
        else
            push(id, { text: text.replace(/\r\n?/g, '\n') });
    });
}
async function send() {
    const text = box.value.trim();
    if (!text || !selected || !selPane)
        return;
    const who = nameOf(selPane);
    const r = await orca.plugin.request('tmux.send', { socket: selected, pane: selPane, text, enter: true }).catch(() => ({ ok: false }));
    if (r.ok) {
        box.value = '';
        box.style.height = 'auto';
        toast(`Sent to ${who}`);
    }
    else
        toast('Could not send. Is the tmux still running?');
}
async function key(k) {
    if (!selected || !selPane)
        return;
    await orca.plugin.request('tmux.key', { socket: selected, pane: selPane, key: k }).catch(() => { });
}
box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (box.value.trim())
            void send();
        else
            void key('Enter');
    }
    else if (!box.value && ['ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) {
        e.preventDefault();
        void key(e.key === 'Escape' ? 'Escape' : e.key.replace('Arrow', ''));
    }
    else if (e.key === 'Tab' && e.shiftKey && !box.value) {
        e.preventDefault();
        void key('BTab');
    }
});
box.addEventListener('paste', (e) => {
    if (!selPane || !selected || !hasImage(e))
        return;
    // Images go to the agent as Ctrl+V; Claude attaches what is on the clipboard.
    e.preventDefault();
    push(selPane, { key: 'C-v' });
    toast(`Image pasted to ${nameOf(selPane)}`);
});
box.addEventListener('input', () => {
    box.style.height = 'auto';
    box.style.height = `${Math.min(120, box.scrollHeight)}px`;
    layout();
});
bar.querySelectorAll('[data-key]').forEach((b) => b.addEventListener('click', () => {
    void key(b.dataset.key);
    box.focus();
}));
function build(panes) {
    panesEl.innerHTML = panes
        .map((p) => `<div class="pane" data-id="${p.id}">
  <div class="head" title="Click to message this teammate">
    <span class="dot"></span><span class="name"></span><span class="model"></span><span class="live-tag" title="Your keys go to this agent. Click outside the pane to stop.">typing</span>
    <button data-act="max" title="Maximize in this panel">⤢</button>
  </div>
  <pre tabindex="0"></pre>
</div>`)
        .join('');
    panesEl.querySelectorAll('.pane').forEach((el) => {
        const id = el.dataset.id;
        el.querySelector('.head').addEventListener('click', (e) => {
            if (e.target.closest('button')?.dataset.act === 'max')
                return void toggleMax(id);
            selectPane(id);
        });
        const pre = el.querySelector('pre');
        pre.addEventListener('click', () => selectPane(id));
        wireLive(pre, id);
        let acc = 0;
        let inFlight = false;
        let last = null;
        const flush = () => {
            if (inFlight || !last || Math.abs(acc) < 20 || !selected)
                return;
            const e = last;
            const count = Math.min(10, Math.max(1, Math.round(Math.abs(acc) / 40)));
            const up = acc < 0;
            acc = 0;
            const { col, row } = cellAt(pre, e.clientX, e.clientY);
            inFlight = true;
            void orca.plugin
                .request('tmux.wheel', { socket: selected, pane: id, up, col, row, count })
                .then(() => undefined, (err) => new Promise((res) => setTimeout(res, err?.retryAfterMs ?? 300)))
                .finally(() => {
                inFlight = false;
                setTimeout(flush, 60);
            });
        };
        pre.addEventListener('wheel', (e) => {
            e.preventDefault();
            acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
            last = e;
            flush();
        }, { passive: false });
    });
}
function markMax() {
    document.body.classList.toggle('max', !!maxPane);
    panesEl.querySelectorAll('.pane').forEach((el) => {
        const on = el.dataset.id === maxPane;
        el.classList.toggle('max', on);
        const b = el.querySelector('[data-act="max"]');
        b.classList.toggle('on', on);
        b.textContent = on ? '⤡' : '⤢';
        b.title = on ? 'Back to all teammates' : 'Maximize in this panel';
    });
}
function draw(panes) {
    const k = `${selected}|${panes.map((p) => p.id).join(',')}`;
    if (k !== lastKey) {
        build(panes);
        lastKey = k;
        if (maxPane && !panes.some((p) => p.id === maxPane))
            maxPane = null;
        setTarget(panes.some((p) => p.id === selPane) ? selPane : null);
        markMax();
    }
    if (paneCount !== panes.length) {
        paneCount = panes.length;
        layout();
    }
    for (const p of panes) {
        const el = paneEl(p.id);
        if (!el)
            continue;
        const name = teammateName(p.ansi);
        const model = /claude|✳/i.test(p.title) ? modelLabel(p.title) : p.command;
        el.querySelector('.name').textContent = name ? `@${name}` : model;
        el.querySelector('.model').textContent = name ? model : '';
        const dot = el.querySelector('.dot');
        dot.classList.toggle('busy', isBusy(p.ansi));
        dot.title = isBusy(p.ansi) ? 'Working' : 'Idle';
        const pre = el.querySelector('pre');
        if (pre.dataset.cols !== String(p.width) || pre.dataset.rows !== String(p.height)) {
            pre.dataset.cols = String(p.width);
            pre.dataset.rows = String(p.height);
            fit(pre);
        }
        const html = ansiToHtml(p.ansi);
        if (pre.dataset.h !== html) {
            pre.innerHTML = html;
            pre.dataset.h = html;
        }
    }
    if (selPane)
        $('to').textContent = nameOf(selPane);
}
async function toggleMax(id) {
    const prev = maxPane;
    maxPane = prev === id ? null : id;
    markMax();
    layout();
    if (maxPane)
        selectPane(maxPane);
    if (selected) {
        if (prev && prev !== maxPane)
            await orca.plugin.request('tmux.zoom', { socket: selected, pane: prev, on: false }).catch(() => { });
        if (maxPane)
            await orca.plugin.request('tmux.zoom', { socket: selected, pane: maxPane, on: true }).catch(() => { });
    }
    layout();
}
function ended(item) {
    item.alive = false;
    empty('This tmux has ended', `${esc(item.socket)} is no longer running.`);
}
/** Asks the worker to watch the chosen tmux; it pushes frames. Repeated as a keep-alive. */
function watch() {
    if (document.hidden || !selected)
        return;
    const item = current();
    if (item && !item.alive)
        return ended(item);
    void orca.plugin.request('tmux.watch', { socket: selected, fresh: !paneCount }).catch(() => { });
}
orca.plugin.on('tmux.frame', (f) => {
    if (f.socket !== selected)
        return;
    const item = current();
    if (f.alive && f.panes.length)
        draw(f.panes);
    else if (item)
        ended(item);
});
function unzoom() {
    if (maxPane && selected)
        void orca.plugin.request('tmux.zoom', { socket: selected, pane: maxPane, on: false }).catch(() => { });
}
pick.addEventListener('change', () => {
    unzoom();
    maxPane = null;
    markMax();
    selected = pick.value;
    pick.title = selected;
    lastKey = '';
    paneCount = 0;
    fitKey = '';
    setTarget(null);
    watch();
});
$('lead').addEventListener('click', async () => {
    const item = current();
    if (!item)
        return;
    const r = await orca.plugin.request('orca.focusLead', { terminalId: item.terminalId }).catch(() => ({ ok: false }));
    toast(r.ok ? `Showing ${item.terminalTitle}` : 'Could not bring the lead chat forward');
});
$('refresh').addEventListener('click', () => void loadList().then(watch));
orca.on('workspace.changed', () => void loadList().then(watch));
document.addEventListener('visibilitychange', watch);
new ResizeObserver(() => layout()).observe(panesEl);
// Closing or reloading the panel while maximized puts the tmux layout back.
window.addEventListener('pagehide', unzoom);
void loadList().then(watch);
setInterval(watch, 5000); // keep-alive for the worker's watch
setInterval(() => void loadList(), 20000);
