/**
 * Signed, self-contained OAuth `state` values.
 *
 * The Worker has no session storage, so state is a MAC'd token carrying the
 * user it was issued to and an expiry. `/auth/metafy/callback` can then reject
 * a `state` it never issued — or one issued to a different user — without the
 * API having to trust its caller to have checked.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Long enough to complete an authorize round-trip, short enough to limit replay. */
const STATE_TTL_MS = 10 * 60 * 1000;

interface StateClaims {
  sub: string;
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Derives a purpose-bound MAC key so the OAuth client secret is never itself the signing key. */
async function stateKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign(
    "HMAC",
    material,
    encoder.encode("metafy-oauth-state-v1"),
  );
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function issueOAuthState(
  userId: string,
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const claims: StateClaims = { sub: userId, exp: now + STATE_TTL_MS };
  // The nonce keeps concurrent flows for one user distinguishable.
  const payload = base64UrlEncode(
    encoder.encode(JSON.stringify({ ...claims, nonce: crypto.randomUUID() })),
  );
  const signature = await crypto.subtle.sign("HMAC", await stateKey(secret), encoder.encode(payload));
  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * True only for a state this API signed, for this user, that has not expired.
 * Replay within the TTL is still possible — the single-use authorization code
 * and the caller's own state check cover that.
 */
export async function verifyOAuthState(
  state: string,
  userId: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  const [payload, signature, ...rest] = state.split(".");
  if (!payload || !signature || rest.length > 0) return false;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await stateKey(secret),
      base64UrlDecode(signature),
      encoder.encode(payload),
    );
    if (!valid) return false;

    const claims = JSON.parse(decoder.decode(base64UrlDecode(payload))) as Partial<StateClaims>;
    return claims.sub === userId && typeof claims.exp === "number" && claims.exp > now;
  } catch {
    return false;
  }
}
