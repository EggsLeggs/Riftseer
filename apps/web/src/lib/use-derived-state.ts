"use client";

import * as React from "react";

/**
 * State that follows something else, without an effect.
 *
 * Both hooks replace the `useEffect(() => setX(...), [dep])` shape the React
 * Compiler rules reject: an effect that only sets state costs a second render
 * and paints the stale value first.
 */

/**
 * Run `reset` during render when any of `deps` changes, and never on mount.
 *
 * This is React's own "storing information from previous renders" pattern: a
 * setState during render of the same component re-renders it before anything
 * is committed, so a dialog reopens clean and a list drops back to page one
 * without a frame of the old state. `reset` may call several setters.
 */
export function useResetWhen(deps: readonly unknown[], reset: () => void): void {
  const [seen, setSeen] = React.useState(deps);
  if (deps.length !== seen.length || deps.some((value, i) => !Object.is(value, seen[i]))) {
    setSeen(deps);
    reset();
  }
}

const subscribeToNothing = () => () => {};

/**
 * A value only the browser knows (an origin, a platform, "has hydrated"),
 * rendered as `serverValue` on the server and during hydration so both
 * markups agree, then as `read()` from the first client render on.
 *
 * `read` runs on every render and must return a stable primitive; a fresh
 * object each time would re-render forever.
 */
export function useBrowserValue<T>(read: () => T, serverValue: T): T {
  return React.useSyncExternalStore(subscribeToNothing, read, () => serverValue);
}
