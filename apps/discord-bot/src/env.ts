/**
 * Cloudflare Worker bindings for the Discord bot.
 */
export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_APPLICATION_ID: string;
  /** Used to build request URLs (path + host); must match the riftseer-api routes. */
  API_BASE_URL: string;
  /** Public site for card links in embeds. */
  SITE_BASE_URL: string;
  /**
   * Service binding to the `riftseer-api` Worker. Prefer this over global `fetch` to the
   * API’s *.workers.dev URL (same-account Worker→Worker fetch otherwise returns 404 / 1042).
   * Omitted in tests or when unset in wrangler dev — falls back to global fetch.
   */
  RIFTSEER_API?: Fetcher;
}
