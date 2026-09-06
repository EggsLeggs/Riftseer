import { describe, expect, test } from "bun:test";
import { issueOAuthState, verifyOAuthState } from "../../lib/oauth-state";

const secret = "test-client-secret";
const user = "11111111-1111-4111-8111-111111111111";

describe("OAuth state", () => {
  test("accepts only the user and secret for which it was issued", async () => {
    const state = await issueOAuthState(user, secret);
    expect(await verifyOAuthState(state, user, secret)).toBe(true);
    expect(await verifyOAuthState(state, "22222222-2222-4222-8222-222222222222", secret)).toBe(false);
    expect(await verifyOAuthState(state, user, "different-secret")).toBe(false);
  });

  test("enforces expiry against the supplied clock", async () => {
    const issuedAt = Date.now() - 60 * 60 * 1000;
    const state = await issueOAuthState(user, secret, issuedAt);
    expect(await verifyOAuthState(state, user, secret)).toBe(false);
    expect(await verifyOAuthState(state, user, secret, issuedAt + 1000)).toBe(true);
  });

  test("signs the payload and uses a fresh nonce", async () => {
    const first = await issueOAuthState(user, secret);
    const second = await issueOAuthState(user, secret);
    expect(first).not.toBe(second);
    const [payload, signature] = first.split(".");
    const forged = btoa(JSON.stringify({ sub: user, exp: Date.now() + 60_000 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyOAuthState(`${forged}.${signature}`, user, secret)).toBe(false);
    expect(forged).not.toBe(payload);
  });

  test("rejects malformed encodings without throwing", async () => {
    for (const state of ["", ".", "abc", "abc.def", "a.b.c", crypto.randomUUID()]) {
      expect(await verifyOAuthState(state, user, secret)).toBe(false);
    }
  });
});
