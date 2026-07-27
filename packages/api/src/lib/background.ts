import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Structural subset of the Workers `ExecutionContext` — declared locally so
 * this module type-checks in packages that consume the API types without
 * @cloudflare/workers-types.
 */
export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

const contextStore = new AsyncLocalStorage<WaitUntilContext>();

/** Makes the request's ExecutionContext available to `runInBackground`. */
export function withExecutionContext<T>(ctx: WaitUntilContext | undefined, fn: () => T): T {
  return ctx ? contextStore.run(ctx, fn) : fn();
}

/**
 * Registers best-effort work that must outlive the response. Without an
 * ExecutionContext (tests, direct `app.handle` calls) the promise is still
 * awaited for its rejection so failures are logged rather than unhandled.
 */
export function runInBackground(task: Promise<unknown>, label: string): void {
  const guarded = task.catch((err) => {
    console.error(`[${label}] background task failed:`, err);
  });
  contextStore.getStore()?.waitUntil(guarded);
}
