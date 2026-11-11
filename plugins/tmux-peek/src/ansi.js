// ANSI (SGR) text from `tmux capture-pane -e` to HTML spans.
const BASE = [
    '#1e1e1e', '#e5534b', '#57ab5a', '#c69026', '#539bf5', '#b083f0', '#39c5cf', '#d1d5da',
    '#636e7b', '#ff938a', '#6bc46d', '#daaa3f', '#6cb6ff', '#dcbdfb', '#56d4dd', '#f0f3f6'
];
function color256(n) {
    if (n < 16)
        return BASE[n];
    if (n < 232) {
        const i = n - 16;
        const v = (x) => (x === 0 ? 0 : 55 + x * 40);
        return `rgb(${v(Math.floor(i / 36))},${v(Math.floor(i / 6) % 6)},${v(i % 6)})`;
    }
    const g = 8 + (n - 232) * 10;
    return `rgb(${g},${g},${g})`;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function apply(st, codes) {
    const s = { ...st };
    for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        if (c === 0)
            Object.keys(s).forEach((k) => delete s[k]);
        else if (c === 1)
            s.bold = true;
        else if (c === 2)
            s.dim = true;
        else if (c === 3)
            s.italic = true;
        else if (c === 4)
            s.underline = true;
        else if (c === 7)
            s.inverse = true;
        else if (c === 22) {
            s.bold = false;
            s.dim = false;
        }
        else if (c === 23)
            s.italic = false;
        else if (c === 24)
            s.underline = false;
        else if (c === 27)
            s.inverse = false;
        else if (c >= 30 && c <= 37)
            s.fg = BASE[c - 30];
        else if (c >= 90 && c <= 97)
            s.fg = BASE[c - 90 + 8];
        else if (c === 39)
            delete s.fg;
        else if (c >= 40 && c <= 47)
            s.bg = BASE[c - 40];
        else if (c >= 100 && c <= 107)
            s.bg = BASE[c - 100 + 8];
        else if (c === 49)
            delete s.bg;
        else if (c === 38 || c === 48) {
            let col;
            if (codes[i + 1] === 5) {
                col = color256(codes[i + 2] ?? 0);
                i += 2;
            }
            else if (codes[i + 1] === 2) {
                col = `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})`;
                i += 4;
            }
            if (col) {
                if (c === 38)
                    s.fg = col;
                else
                    s.bg = col;
            }
        }
    }
    return s;
}
function css(s) {
    let fg = s.fg, bg = s.bg;
    if (s.inverse) {
        fg = s.bg ?? 'var(--term-bg)';
        bg = s.fg ?? 'var(--term-fg)';
    }
    const out = [];
    if (fg)
        out.push(`color:${fg}`);
    if (bg)
        out.push(`background:${bg}`);
    if (s.bold)
        out.push('font-weight:600');
    if (s.dim)
        out.push('opacity:.6');
    if (s.italic)
        out.push('font-style:italic');
    if (s.underline)
        out.push('text-decoration:underline');
    return out.join(';');
}
export function ansiToHtml(text) {
    let st = {};
    let html = '';
    const re = /\u001b\[([0-9;]*)m|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-9;?]*[A-Za-z]/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
        const chunk = text.slice(last, m.index);
        if (chunk) {
            const c = css(st);
            html += c ? `<span style="${c}">${esc(chunk)}</span>` : esc(chunk);
        }
        last = (m.index ?? 0) + m[0].length;
        if (m[1] !== undefined)
            st = apply(st, m[1] === '' ? [0] : m[1].split(';').map((n) => Number(n) || 0));
    }
    const tail = text.slice(last);
    if (tail) {
        const c = css(st);
        html += c ? `<span style="${c}">${esc(tail)}</span>` : esc(tail);
    }
    return html;
}
