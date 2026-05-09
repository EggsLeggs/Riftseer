/** Same comma-split logic as root `c15t-backend.config.ts` for c15t `trustedOrigins`. */
export function parseC15tTrustedOrigins(
  trustedOriginsEnv: string | undefined,
  fallbackOrigin: string,
): string[] {
  return (trustedOriginsEnv ?? fallbackOrigin)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
