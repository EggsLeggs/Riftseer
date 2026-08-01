import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { SupabaseCardProvider } from "../providers/supabase.ts";

const RUN_DATABASE_TESTS = process.env.RIFTSEER_DATABASE_TESTS === "1";
const integration = RUN_DATABASE_TESTS ? describe : describe.skip;
const RESEED = "/tmp/rsq/reseed.sh";
const PSQL = "/opt/homebrew/opt/postgresql@17/bin/psql";
const ACTOR = "00000000-0000-0000-0000-0000000000aa";
const VAYNE_OGN = "aaa000000000000000000001";
const VAYNE_VEN = "aaa000000000000000000002";
const VAYNE_PRM = "aaa000000000000000000003";

async function command(argv: string[]): Promise<string> {
  const process = Bun.spawn(argv, {
    env: { ...globalThis.process.env, PGPASSWORD: "postgres" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(`${argv[0]} failed (${exitCode}): ${stderr || stdout}`);
  return stdout.trim();
}

async function reseed(): Promise<void> {
  await command(["bash", RESEED]);
}

async function waitForPostgrest(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch("http://localhost:54321/rest/v1/oracles?select=id&limit=1", {
      headers: { Prefer: "count=exact" },
    }).catch(() => null);
    if (response?.ok && response.headers.get("content-range")?.endsWith("/4")) return;
    await Bun.sleep(100);
  }
  throw new Error("PostgREST did not expose the reseeded four-oracle fixture");
}

async function sql(statement: string): Promise<string> {
  return command([
    PSQL,
    "-h", "localhost",
    "-p", "55433",
    "-U", "postgres",
    "-d", "riftseer",
    "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-c", statement,
  ]);
}

async function sqlJson<T>(statement: string): Promise<T> {
  return JSON.parse(await sql(statement)) as T;
}

integration("oracle/printing database contracts", () => {
  let proxy: ReturnType<typeof Bun.serve>;
  let provider: SupabaseCardProvider;

  beforeAll(() => {
    proxy = Bun.serve({
      port: 54321,
      async fetch(request) {
        const url = new URL(request.url);
        url.protocol = "http:";
        url.host = "localhost:3001";
        url.pathname = url.pathname.replace(/^\/rest\/v1/, "");
        const headers = new Headers(request.headers);
        headers.delete("host");
        headers.delete("apikey");
        headers.delete("authorization");
        return fetch(url, {
          method: request.method,
          headers,
          body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
        });
      },
    });
    const url = `http://localhost:${proxy.port}`;
    globalThis.process.env.SUPABASE_URL = url;
    globalThis.process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    globalThis.process.env.CARD_IMAGE_BASE_URL = "https://img.riftseer.com";
    provider = new SupabaseCardProvider();
  });

  beforeEach(async () => {
    await reseed();
    await waitForPostgrest();
  });
  afterAll(() => proxy?.stop());

  test("provider reads, search, resolution, relationships, and legality precedence agree", async () => {
    await provider.refresh();
    expect(provider.getStats()).toMatchObject({ oracleCount: 4, printingCount: 6 });

    const vayne = await provider.getOracleByKey("vayne");
    const warhammer = await provider.getOracleByKey("warhammer");
    expect(vayne).toMatchObject({ name: "Vayne", keywords: ["accelerate", "deflect"] });
    expect(vayne?.preferred_printing?.id).toBe(VAYNE_OGN);
    expect(warhammer?.might_bonus).toBe(0);

    const printings = await provider.getPrintingsForOracle(vayne!.id);
    expect(printings.map(({ set, rarity, differs_from_oracle }) => [set?.set_code, rarity, differs_from_oracle])).toEqual([
      ["OGN", "Rare", true],
      ["VEN", "Showcase", false],
      ["PRM", "Rare", false],
    ]);

    const sentinel = await provider.searchPrintingsByAst({ op: "filter", field: "tag", value: "sentinel" });
    expect(sentinel.printings.map(({ id }) => id).sort()).toEqual([VAYNE_PRM, VAYNE_VEN].sort());
    const showcase = await provider.searchPrintingsByAst({ op: "filter", field: "rarity", value: "showcase" });
    expect(showcase.printings.map(({ id }) => id)).toEqual([VAYNE_VEN]);

    const scoped = await provider.resolveRequest({ raw: "Vayne|VEN-SP3", name: "Vayne", set: "VEN", collector: "SP3" });
    expect(scoped).toMatchObject({ matchType: "exact", oracle: { name: "Vayne" }, printing: { id: VAYNE_VEN } });
    const brush = await provider.getOracleByKey("brush");
    expect((await provider.getOracleRelationships(brush!.id)).makes_tokens.map(({ name }) => name)).toEqual(["Sprite"]);

    expect((await provider.getLegalities(VAYNE_OGN))[0]?.status).toBe("banned");
    expect((await provider.getLegalities(VAYNE_VEN))[0]?.status).toBe("legal");
    expect((await provider.getLegalities("ddd000000000000000000001"))[0]?.status).toBe("legal");
  });

  test("printing deltas add, remove, override, and clear only their own printing", async () => {
    await sql(`select admin_set_printing_delta('${VAYNE_OGN}', '{"tags_added":["Elite"],"tags_removed":["Sentinel"],"energy_override":9,"cleared_fields":["power"]}'::jsonb, '${ACTOR}')`);
    const rows = await sqlJson<Array<{ printing_id: string; tags: string[]; energy: number; power: number | null }>>(`
      select json_agg(json_build_object('printing_id', printing_id, 'tags', tags, 'energy', energy, 'power', power) order by printing_id)
      from resolved_printings where oracle_id = (select id from oracles where oracle_key = 'vayne')
    `);
    expect(rows[0]).toMatchObject({ printing_id: VAYNE_OGN, tags: ["Elite", "Marksman"], energy: 9, power: null });
    expect(rows.slice(1).every(({ tags, energy, power }) => tags.includes("Sentinel") && !tags.includes("Elite") && energy === 3 && power === 2)).toBe(true);

    await sql(`select admin_set_printing_delta('${VAYNE_OGN}', null, '${ACTOR}')`);
    expect(await sql(`select tags @> array['Sentinel']::text[] from resolved_printings where printing_id = '${VAYNE_OGN}'`)).toBe("t");
  });

  test("locked oracle and printing fields survive contradictory ingest values", async () => {
    await sql(`
      select admin_patch_oracle((select id from oracles where oracle_key='vayne'), '{"energy":99}'::jsonb, '${ACTOR}');
      select admin_patch_printing('${VAYNE_OGN}', '{"rarity":"Mythic"}'::jsonb, '${ACTOR}');
      select ingest_catalogue(
        p_oracles := '[{"oracle_key":"vayne","slug":"vayne","name":"Vayne","name_normalized":"vayne","energy":1}]'::jsonb,
        p_printings := '[{"id":"${VAYNE_OGN}","oracle_key":"vayne","set_code":"OGN","public_slug":"ignored","rarity":"Common"}]'::jsonb,
        p_prune := false
      )
    `);
    const state = await sqlJson<{ energy: number; oracle_locks: string[]; rarity: string; printing_locks: string[] }>(`
      select json_build_object(
        'energy', o.energy, 'oracle_locks', o.locked_fields,
        'rarity', p.rarity, 'printing_locks', p.locked_fields)
      from oracles o join printings p on p.oracle_id=o.id
      where o.oracle_key='vayne' and p.id='${VAYNE_OGN}'
    `);
    expect(state).toMatchObject({ energy: 99, rarity: "Mythic" });
    expect(state.oracle_locks).toContain("energy");
    expect(state.printing_locks).toContain("rarity");
  });

  test("preferred-printing ranking favors hosted art while an admin lock wins", async () => {
    expect(await sql("select preferred_printing_id from oracles where oracle_key='vayne'" )).toBe(VAYNE_OGN);
    await sql(`update printings set image_hosted_at=now() where id='${VAYNE_VEN}'; select refresh_preferred_printings(null)`);
    expect(await sql("select preferred_printing_id from oracles where oracle_key='vayne'" )).toBe(VAYNE_VEN);

    await sql(`update oracles set preferred_printing_id='${VAYNE_OGN}', preferred_printing_locked=true where oracle_key='vayne'; update printings set image_hosted_at=now() where id='${VAYNE_PRM}'; select refresh_preferred_printings(null)`);
    expect(await sql("select preferred_printing_id from oracles where oracle_key='vayne'" )).toBe(VAYNE_OGN);
  });

  test("the projection refreshes after oracle, printing, delta, and relationship writes", async () => {
    await sql(`update oracles set name='Vayne Prime', name_normalized='vayne prime' where oracle_key='vayne'`);
    expect(await sql("select count(*) from resolved_printings where name='Vayne Prime'" )).toBe("3");

    await sql(`update printings set rarity='Epic' where id='${VAYNE_VEN}'`);
    expect(await sql(`select rarity from resolved_printings where printing_id='${VAYNE_VEN}'`)).toBe("Epic");

    await sql(`insert into printing_deltas(printing_id,tags_added,source) values('${VAYNE_VEN}',array['Elite'],'admin')`);
    expect(await sql(`select tags @> array['Elite']::text[] from resolved_printings where printing_id='${VAYNE_VEN}'`)).toBe("t");

    await sql(`insert into oracle_relationships(from_oracle_id,to_oracle_id,kind,source) select b.id,w.id,'makes_token','admin' from oracles b cross join oracles w where b.oracle_key='brush' and w.oracle_key='warhammer'`);
    expect(await sql("select produces @> array['Warhammer']::text[] from resolved_printings where printing_id='bbb000000000000000000001'" )).toBe("t");

    expect(await sql(`select card_search_ast_to_sql('{"op":"filter","field":"tag","value":"Elite"}'::jsonb)`)).toContain("unnest(r.tags)");
    await expect(sql(`select card_search_ast_to_sql('{"op":"filter","field":"future","value":"x"}'::jsonb)`)).rejects.toThrow("Unsupported filter field");
    await expect(sql(`select card_search_ast_to_sql('{"op":"future"}'::jsonb)`)).rejects.toThrow("Unknown AST op");
  });
});
