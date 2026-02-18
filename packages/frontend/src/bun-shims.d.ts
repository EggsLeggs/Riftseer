// Shim for bun:sqlite — the frontend's tsc follows the import chain through
// @riftseer/api → @riftseer/core → bun:sqlite. This minimal declaration
// satisfies the type checker without pulling in all of bun-types.
declare module "bun:sqlite" {
  export class Database {
    constructor(filename?: string, options?: Record<string, unknown>);
    run(sql: string, ...params: any[]): void;
    query<T = any, P extends any[] = any[]>(sql: string): Statement<T, P>;
    prepare<T = any, P extends any[] = any[]>(sql: string): Statement<T, P>;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    exec(sql: string): void;
    close(): void;
  }
  export class Statement<T = any, P extends any[] = any[]> {
    all(...params: P): T[];
    get(...params: P): T | undefined;
    run(...params: P): void;
  }
}
