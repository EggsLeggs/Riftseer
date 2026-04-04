import { Redis } from "@upstash/redis";
import { logger } from "../logger.ts";

let _client: Redis | null = null;
let warnedPartialUpstash = false;

/**
 * Returns a lazy singleton Upstash Redis client, or null if credentials are not set.
 * Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the environment.
 * Returns null when either variable is absent so callers can skip Redis gracefully.
 */
export function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const hasUrl = Boolean(url);
  const hasToken = Boolean(token);
  if (hasUrl !== hasToken) {
    if (!warnedPartialUpstash) {
      warnedPartialUpstash = true;
      const missing = !hasUrl ? "UPSTASH_REDIS_REST_URL" : "UPSTASH_REDIS_REST_TOKEN";
      logger.warn("Upstash Redis disabled: partial config — set both URL and token", {
        missing,
      });
    }
    return null;
  }
  if (!url || !token) return null;
  if (!_client) {
    _client = new Redis({ url, token });
  }
  return _client;
}
