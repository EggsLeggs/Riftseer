import { describe, expect, test } from "bun:test";
import path from "node:path";
import { extractCardKeywords } from "../keywords.ts";
import { KEYWORD_CONFORMANCE_CASES } from "./keyword-conformance-cases.ts";

const RUN_DATABASE_TESTS = process.env.RIFTSEER_DATABASE_TESTS === "1";
const integration = RUN_DATABASE_TESTS ? describe : describe.skip;
const DATABASE_SCRIPT = path.resolve(
  import.meta.dirname,
  "../../../../scripts/database-tests/database.mjs",
);

async function sqlJson<T>(statement: string): Promise<T> {
  const subprocess = Bun.spawn(
    [process.execPath, DATABASE_SCRIPT, "query", statement],
    {
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
    subprocess.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`database query failed (${exitCode}): ${stderr || stdout}`);
  }
  return JSON.parse(stdout) as T;
}

integration("card keyword TypeScript/Postgres conformance", () => {
  test("both derivations return the same sorted, distinct base keys", async () => {
    const inputs = JSON.stringify(
      KEYWORD_CONFORMANCE_CASES.map(({ input }) => input),
    ).replaceAll("'", "''");
    const fromPostgres = await sqlJson<string[][]>(`
      SELECT json_agg(card_keywords_from_text(value #>> '{}') ORDER BY ordinal)
      FROM jsonb_array_elements('${inputs}'::jsonb) WITH ORDINALITY AS cases(value, ordinal)
    `);

    expect(KEYWORD_CONFORMANCE_CASES.length).toBeGreaterThan(5);
    const fromTypeScript = KEYWORD_CONFORMANCE_CASES.map(({ input }) =>
      extractCardKeywords(input),
    );
    expect(fromTypeScript).toEqual(
      KEYWORD_CONFORMANCE_CASES.map(({ expected }) => expected),
    );
    expect(fromPostgres).toEqual(fromTypeScript);
  });
});
