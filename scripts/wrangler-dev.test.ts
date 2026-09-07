import { describe, expect, test } from "bun:test";
import { dotenvKeys, withoutKeys } from "./wrangler-dev.mjs";

describe("dotenvKeys", () => {
  test("reads names, skips comments and blanks, tolerates export", () => {
    const text = [
      "# ─── Section ───",
      "",
      "SUPABASE_URL=https://example.supabase.co",
      "export METAFY_CLIENT_ID = abc",
      "  NEXT_PUBLIC_APP_URL=http://localhost:3000",
      "not a key",
    ].join("\n");

    expect(dotenvKeys(text)).toEqual(["SUPABASE_URL", "METAFY_CLIENT_ID", "NEXT_PUBLIC_APP_URL"]);
  });
});

describe("withoutKeys", () => {
  test("drops only the named keys and leaves the input alone", () => {
    const env = { PATH: "/usr/bin", SUPABASE_URL: "prod", HOME: "/home" };

    expect(withoutKeys(env, ["SUPABASE_URL", "MISSING"])).toEqual({
      PATH: "/usr/bin",
      HOME: "/home",
    });
    expect(env.SUPABASE_URL).toBe("prod");
  });
});
