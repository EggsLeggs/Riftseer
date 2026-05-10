import type { Card } from "@riftseer/types";

/**
 * Shared placeholder for card detail — swap for the real layout later.
 */
export function CardJsonView({ card }: { card: Card }) {
  return (
    <main className="container py-12">
      <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        Card data
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Placeholder JSON dump — the real card view replaces this.
      </p>
      <pre className="mt-6 overflow-auto rounded-md border border-border bg-muted p-4 text-xs leading-relaxed text-zinc-900 dark:text-zinc-100">
        {JSON.stringify(card, null, 2)}
      </pre>
    </main>
  );
}
