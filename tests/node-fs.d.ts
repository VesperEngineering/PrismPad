declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function mkdtempSync(prefix: string): string;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function rmSync(path: string, options?: { force?: boolean; recursive?: boolean }): void;
  export function statSync(path: string): { size: number };
  export function writeFileSync(path: string, data: string): void;
}

declare module 'node:child_process' {
  export interface SpawnSyncReturns<T> {
    status: number | null;
    stdout: T;
    stderr: T;
  }

  export function spawnSync(
    command: string,
    args: readonly string[],
    options: { cwd?: string; encoding: 'utf8'; input?: string }
  ): SpawnSyncReturns<string>;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module 'node:url' {
  export function pathToFileURL(path: string): URL;
}

declare const process: {
  argv: string[];
  cwd(): string;
  execPath: string;
  exitCode?: number;
  platform: string;
};
