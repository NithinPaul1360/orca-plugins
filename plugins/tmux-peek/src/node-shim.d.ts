// Minimal Node typings for the worker (no node_modules in a plugin).
declare module 'node:child_process' {
  export function execFile(
    file: string,
    args: string[],
    options: { timeout?: number; maxBuffer?: number },
    cb: (err: Error | null, stdout: string, stderr: string) => void
  ): unknown
}
declare module 'node:fs' {
  export function existsSync(path: string): boolean
}
declare const Buffer: { from(s: string): Uint8Array }
declare const process: { platform: string; env: Record<string, string | undefined> }
