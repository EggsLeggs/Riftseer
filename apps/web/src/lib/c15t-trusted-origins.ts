/** Splits `C15T_TRUSTED_ORIGINS` for c15t, falling back to the app URL when it is unset or blank. */
export function parseC15tTrustedOrigins(
  trustedOriginsEnv: string | undefined,
  fallbackOrigin: string,
): string[] {
  const effective =
    trustedOriginsEnv != null && trustedOriginsEnv.trim() !== ""
      ? trustedOriginsEnv
      : fallbackOrigin;
  return effective
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
