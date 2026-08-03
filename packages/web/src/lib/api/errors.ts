/**
 * Thrown by every feature API module that reads the public Riftseer API.
 *
 * Named for cards because that is where it started; it is the site's one API
 * error type, so an error boundary can branch on `code` without knowing which
 * feature made the call.
 */
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
