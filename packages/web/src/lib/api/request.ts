import { CardApiError } from "./errors";

/**
 * Shared request behaviour for public (token-less) reads through the Eden
 * client: a bounded timeout and no fetch caching, so a hung API reaches the
 * error boundary instead of hanging a render.
 *
 * One copy, in `lib/`, because every feature that reads the API wants exactly
 * this and a second copy would drift the moment one of them changed its
 * timeout.
 */
export const API_TIMEOUT_MS = 12_000;

export function requestFetchInit(): RequestInit {
  return {
    cache: "no-store",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  };
}

/** Turn a thrown fetch failure into a {@link CardApiError} callers can branch on. */
export function handleRequestFailure(err: unknown): never {
  if (err instanceof CardApiError) throw err;
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    throw new CardApiError(
      `Request timed out after ${API_TIMEOUT_MS}ms`,
      "timeout",
    );
  }
  throw new CardApiError(
    err instanceof Error ? err.message : String(err),
    "network",
  );
}

/**
 * Run an Eden treaty call and return its payload. `null` means 404 — a missing
 * resource is an answer, not a failure — and every other error throws.
 */
export async function getJsonFromTreaty<T>(
  run: () => Promise<{ data: unknown; error: unknown; status: number }>,
): Promise<T | null> {
  try {
    const { data, error, status } = await run();
    if (error != null) {
      if (status === 404) return null;
      throw new CardApiError(`Riftseer API ${status}`, "http", status);
    }
    return data as T;
  } catch (err) {
    handleRequestFailure(err);
  }
}
