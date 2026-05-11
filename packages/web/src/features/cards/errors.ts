/** Thrown by {@link cardsApi} when the upstream API fails or times out. */
export class CardApiError extends Error {
  constructor(
    message: string,
    readonly code: "timeout" | "http" | "network",
    readonly status?: number,
    /** Human-readable detail from the API response body, if available. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "CardApiError";
  }
}
