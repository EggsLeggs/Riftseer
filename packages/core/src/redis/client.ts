import Redis from "ioredis";

let _client: Redis | null = null;

/**
 * Returns a lazy singleton ioredis client.
 * Reads REDIS_URL from the environment (default: redis://localhost:6379).
 * Uses lazyConnect so the TCP connection is only opened on the first command,
 * meaning this module can be imported without a Redis server running.
 */
export function getRedisClient(): Redis {
  if (!_client) {
    const url = process.env.REDIS_URL ?? "redis://localhost:6379";
    _client = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3,
    });
  }
  return _client;
}
