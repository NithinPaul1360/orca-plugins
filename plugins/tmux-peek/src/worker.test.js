import { assert, mockHost, mountWorker, test } from 'orca/testing';
import * as main from './worker';
import { findSockets, parsePanes } from './tmux';
import { ansiToHtml } from './ansi';
test('finds the pinned tmux command in chat text', () => {
    assert.deepEqual(findSockets(['  View teammates: `tmux -L claude-swarm-16449 a`  ', 'tmux -L other attach']), [
        'claude-swarm-16449',
        'other'
    ]);
    assert.deepEqual(findSockets(['tmux -L s1 a', 'tmux -L s2 a', 'tmux -L s1 a']), ['s2', 's1']);
    assert.deepEqual(findSockets(['tmux ls', 'nothing here']), []);
});
test('parses pane rows', () => {
    const row = ['%1', '✳ claude-opus', 'claude', '80', '10', '1'].join('\u001f');
    assert.deepEqual(parsePanes(row + '\n'), [
        { id: '%1', title: '✳ claude-opus', command: 'claude', width: 80, height: 10, active: true }
    ]);
});
test('turns ANSI colour into spans and escapes html', () => {
    assert.equal(ansiToHtml('\u001b[31mred\u001b[0m <b>'), '<span style="color:#e5534b">red</span> &lt;b&gt;');
});
test('lists pinned tmux per terminal, ended ones marked', async () => {
    const host = mockHost({
        capabilities: ['workspace:read', 'terminal:read'],
        results: {
            'workspace.readContext': { branch: 'main', displayName: 'orca-hq', terminals: [{ id: 't1', title: 'hq' }] },
            'terminal.read': { lines: ['View teammates: `tmux -L claude-swarm-0-test a`'], truncated: false }
        }
    });
    const worker = await mountWorker(main, { host });
    const res = await worker.request('tmux.list');
    assert.equal(res.workspace, 'orca-hq');
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].socket, 'claude-swarm-0-test');
    assert.equal(res.items[0].alive, false);
    assert.deepEqual(worker.refusals, []);
    await worker.deactivate();
});
import { isBusy, modelLabel, teammateName } from './teammate';
test('reads teammate name and busy state from a Claude pane', () => {
    const busy = '+ Moonwalking… (11m 32s · ↓ 67.4k tokens)\n────────── @style-round-02 ─\n❯';
    const idle = '* Cooked for 3m 11s · done 9:10 AM\n──────────@lab-packager─\n❯';
    assert.equal(teammateName(busy), 'style-round-02');
    assert.equal(teammateName(idle), 'lab-packager');
    assert.equal(isBusy(busy), true);
    assert.equal(isBusy(idle), false);
    assert.equal(modelLabel('✳ claude-opus-5-5'), 'opus-5-5');
});
test('refuses bad pane ids and unknown keys', async () => {
    const worker = await mountWorker(main, { host: mockHost({ capabilities: ['workspace:read', 'terminal:read'] }) });
    assert.deepEqual(await worker.request('tmux.send', { socket: 's; rm', pane: '%1', text: 'x', enter: true }), { ok: false });
    assert.deepEqual(await worker.request('tmux.key', { socket: 's', pane: '%1', key: 'C-c' }), { ok: false });
    assert.deepEqual(await worker.request('tmux.select', { socket: 's', pane: 'bad' }), { ok: false });
    await worker.deactivate();
});
import { gridFor } from './grid';
test('grid: one column up to 3, two columns after, 3 rows on screen at most', () => {
    assert.deepEqual(gridFor(1), { cols: 1, visibleRows: 1 });
    assert.deepEqual(gridFor(2), { cols: 1, visibleRows: 2 });
    assert.deepEqual(gridFor(3), { cols: 1, visibleRows: 3 });
    assert.deepEqual(gridFor(4), { cols: 2, visibleRows: 2 });
    assert.deepEqual(gridFor(6), { cols: 2, visibleRows: 3 });
    assert.deepEqual(gridFor(9), { cols: 2, visibleRows: 3 });
});
import { gridLayout, layoutChecksum } from './layout';
test('layout checksum matches tmux', () => {
    // tmux printed "b262,80x24,0,0,5" for a single 80x24 pane %5
    assert.equal(layoutChecksum('80x24,0,0,5'), 'b262');
});
test('grid layout: two columns, odd pane spans the last row', () => {
    const g = gridLayout([1, 2, 3], 2, 40, 10);
    assert.equal(g.width, 81);
    assert.equal(g.height, 21);
    assert.ok(g.layout.endsWith('81x21,0,0[81x10,0,0{40x10,0,0,1,40x10,41,0,2},81x10,0,11,3]'));
    assert.ok(gridLayout([4], 1, 60, 30).layout.endsWith('60x30,0,0,4'));
});
import { keysArgs } from './tmux';
test('live keys: one tmux call, in order, unsafe names refused', () => {
    assert.deepEqual(keysArgs('s', '%1', [{ text: 'hi' }, { key: 'Enter' }, { key: 'C-c' }]), [
        '-L', 's', 'send-keys', '-t', '%1', '-H', '68', '69', ';', 'send-keys', '-t', '%1', 'Enter', ';', 'send-keys', '-t', '%1', 'C-c'
    ]);
    assert.equal(keysArgs('s', '%1', [{ key: 'run-shell' }]), null);
    assert.equal(keysArgs('s', '%1', [{ key: 'C-;' }]), null);
});
test('mouse steps: only SGR reports pass', () => {
    assert.ok(keysArgs('s', '%1', [{ mouse: '\u001b[<0;5;7M\u001b[<0;5;7m' }]));
    assert.equal(keysArgs('s', '%1', [{ mouse: '\u001b]52;c;evil\u0007' }]), null);
});
