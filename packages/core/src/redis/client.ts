import Redis from "ioredis";

import { logger } from "../logger.ts";

let _client: Redis | null = null;
let redisConnRefusedLogged = false;

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
      maxRetriesPerRequest: 0,
    });
    _client.on("error", (err) => {
      const errno = err as NodeJS.ErrnoException;
      if (errno.code === "ECONNREFUSED") {
        if (!redisConnRefusedLogged) {
          redisConnRefusedLogged = true;
          logger.warn("[redis] connection refused", {
            code: errno.code,
            err:
              err instanceof Error
                ? { name: err.name, message: err.message, stack: err.stack }
                : String(err),
          });
        }
      } else {
        logger.error("[redis] client error", {
          code: errno.code,
          err:
            err instanceof Error
              ? { name: err.name, message: err.message, stack: err.stack }
              : String(err),
        });
      }
    });
  }
  return _client;
}
