/**
 * Minimal shims so TypeScript doesn't error when resolving type-only imports
 * that transitively reference Bun-specific modules (bun:sqlite in @riftseer/core).
 * None of these modules are ever bundled into the CF Worker.
 */

// Bun extends ImportMeta with `dir` (directory of the current file).
// setup-emojis.ts is a Bun CLI script (not a CF Worker) so this is valid at runtime.
interface ImportMeta {
  readonly dir: string;
}

// @cloudflare/workers-types declares the nodejs_compat globals, `Buffer` among
// them, as `declare const Buffer: any`. That collides with the one @types/node
// declares, and the program keeps only one side of the merge: `Buffer` is still
// typed, because buffer.buffer.d.ts contributes the interface, but the members
// declared next to the losing `const` in buffer.d.ts go with it. `toString`
// then falls through to Uint8Array's, which takes no arguments, and
// setup-emojis.ts cannot base64 an icon. Merge the overload back.
interface Buffer {
  toString(encoding?: BufferEncoding, start?: number, end?: number): string;
}
declare module "bun:sqlite" {
  export interface Changes {
    changes: number;
    lastInsertRowid: number | undefined;
  }
  export interface Statement<T = unknown, P = unknown[]> {
    get(...params: P extends unknown[] ? P : [P]): T | null;
    all(...params: P extends unknown[] ? P : [P]): T[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run(...params: any[]): Changes;
  }

  export class Database {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(path?: string, options?: any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    run(sql: string, ...params: any[]): void;
    query<T = unknown, P = unknown[]>(sql: string): Statement<T, P>;
    prepare(sql: string): Statement;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    close(): void;
  }
}
