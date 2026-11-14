// Reads a Claude teammate pane's screen: its @name and whether it is busy.
const strip = (s: string) => s.replace(/\u001b\[[0-9;?]*[A-Za-z]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')

export function teammateName(ansi: string): string | null {
  const names = [...strip(ansi).matchAll(/─\s?@([A-Za-z0-9._-]+)\s?─/g)]
  return names.length ? names[names.length - 1][1] : null
}

/** Busy while Claude shows its live timer line, e.g. "Moonwalking… (11m 32s · ↓ 67.4k tokens". */
export function isBusy(ansi: string): boolean {
  return /…\s*\((?:\d+h\s*)?(?:\d+m\s*)?\d+s\b/.test(strip(ansi))
}

export function modelLabel(title: string): string {
  return title.replace(/^[^\w]+\s*/, '').replace(/^claude-/, '')
}
