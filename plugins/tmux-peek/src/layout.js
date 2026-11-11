// Builds a tmux layout string that puts panes in our grid, each exactly cols x rows.
export function layoutChecksum(layout) {
    let csum = 0;
    for (let i = 0; i < layout.length; i++) {
        csum = (csum >> 1) + ((csum & 1) << 15);
        csum = (csum + layout.charCodeAt(i)) & 0xffff;
    }
    return csum.toString(16).padStart(4, '0');
}
/** ids are tmux pane numbers (without %), in display order. */
export function gridLayout(ids, gridCols, cw, ch) {
    const n = ids.length;
    const rows = [];
    for (let i = 0; i < n; i += gridCols)
        rows.push(ids.slice(i, i + gridCols));
    const W = gridCols * cw + (gridCols - 1);
    const H = rows.length * ch + (rows.length - 1);
    const row = (r, y, h) => {
        if (r.length === 1)
            return `${W}x${h},0,${y},${r[0]}`;
        const cells = r.map((id, i) => `${cw}x${h},${i * (cw + 1)},${y},${id}`);
        return `${W}x${h},0,${y}{${cells.join(',')}}`;
    };
    let body;
    if (rows.length === 1) {
        body = row(rows[0], 0, H).replace(/^\d+x\d+,0,0/, `${W}x${H},0,0`);
    }
    else {
        body = `${W}x${H},0,0[${rows.map((r, i) => row(r, i * (ch + 1), ch)).join(',')}]`;
    }
    return { layout: `${layoutChecksum(body)},${body}`, width: W, height: H };
}
