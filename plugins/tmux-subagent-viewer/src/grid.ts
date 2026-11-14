/** Grid shape: up to 3 in one column, 4-6 in two columns, more scroll 3 rows at a time. */
export function gridFor(n: number): { cols: number; visibleRows: number } {
  if (n <= 3) return { cols: 1, visibleRows: Math.max(1, n) }
  return { cols: 2, visibleRows: Math.min(3, Math.ceil(n / 2)) }
}
