import { describe, expect, it } from "bun:test";
import { issueOAuthState, verifyOAuthState } from "../../lib/oauth-state";

const SECRET = "test-client-secret";
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";

describe("OAuth state", () => {
  it("accepts a state it issued for the same user", async () => {
    const state = await issueOAuthState(USER, SECRET);
    expect(await verifyOAuthState(state, USER, SECRET)).toBe(true);
  });

  it("rejects a state issued to a different user", async () => {
    const state = await issueOAuthState(OTHER_USER, SECRET);
    expect(await verifyOAuthState(state, USER, SECRET)).toBe(false);
  });

  it("rejects a state signed with a different secret", async () => {
    const state = await issueOAuthState(USER, "other-secret");
    expect(await verifyOAuthState(state, USER, SECRET)).toBe(false);
  });

  it("rejects an expired state", async () => {
    const issuedAt = Date.now() - 60 * 60 * 1000;
    const state = await issueOAuthState(USER, SECRET, issuedAt);
    expect(await verifyOAuthState(state, USER, SECRET)).toBe(false);
    expect(await verifyOAuthState(state, USER, SECRET, issuedAt + 1000)).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const state = await issueOAuthState(USER, SECRET);
    const [payload, signature] = state.split(".");
    const forged = btoa(JSON.stringify({ sub: USER, exp: Date.now() + 60_000 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(forged).not.toBe(payload);
    expect(await verifyOAuthState(`${forged}.${signature}`, USER, SECRET)).toBe(false);
  });

  it("rejects malformed states", async () => {
    for (const state of ["", ".", "abc", "abc.def", "a.b.c", crypto.randomUUID()]) {
      expect(await verifyOAuthState(state, USER, SECRET)).toBe(false);
    }
  });

  it("issues a distinct state per call", async () => {
    const first = await issueOAuthState(USER, SECRET);
    const second = await issueOAuthState(USER, SECRET);
    expect(first).not.toBe(second);
  });
});
