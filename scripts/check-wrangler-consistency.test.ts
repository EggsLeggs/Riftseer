import { describe, expect, test } from "bun:test";
import {
  missingGeneratedBindings,
  productionBindingProblems,
} from "./check-wrangler-consistency.mjs";

const top = {
  name: "riftseer-web",
  images: { binding: "IMAGES" },
  services: [{ binding: "WORKER_SELF_REFERENCE", service: "riftseer-web" }],
  secrets: { required: ["C15T_DATABASE_URL"] },
  compatibility_flags: ["nodejs_compat"],
  assets: { binding: "ASSETS", directory: ".open-next/assets" },
};

describe("productionBindingProblems", () => {
  test("reports a missing required non-inheritable section", () => {
    const production = {
      name: "riftseer-web",
      images: top.images,
      secrets: top.secrets,
      // services omitted on purpose
    };

    expect(productionBindingProblems(top, production)).toEqual([
      "apps/web/wrangler.jsonc: env.production is missing services, which does not inherit under --env",
    ]);
  });

  test("still compares present sections", () => {
    const production = {
      name: "riftseer-web",
      images: { binding: "OTHER" },
      services: top.services,
      secrets: top.secrets,
    };

    expect(productionBindingProblems(top, production)).toEqual([
      `apps/web/wrangler.jsonc: env.production.images is ${JSON.stringify(production.images)}, top-level images is ${JSON.stringify(top.images)}`,
    ]);
  });

  test("skips absent optional compared sections", () => {
    const production = {
      name: "riftseer-web",
      images: top.images,
      services: top.services,
      secrets: top.secrets,
    };

    expect(productionBindingProblems(top, production)).toEqual([]);
  });
});

describe("missingGeneratedBindings", () => {
  const config = {
    vars: { SITE_ORIGIN: "https://riftseer.com" },
    secrets: { required: ["SUPABASE_URL", "METAFY_WEBHOOK_SECRET"] },
  };

  test("names every declared binding the generated Env omits", () => {
    const types = [
      "interface Env {",
      "\tSITE_ORIGIN: string;",
      "\tSUPABASE_URL: string;",
      "}",
    ].join("\n");

    expect(missingGeneratedBindings("w.jsonc", config, "env.d.ts", types)).toEqual([
      "env.d.ts: METAFY_WEBHOOK_SECRET is declared in w.jsonc but missing from the generated Env — rerun `wrangler types`",
    ]);
  });

  test("an optional binding counts as present", () => {
    const types = [
      "interface Env {",
      "\tSITE_ORIGIN: string;",
      "\tSUPABASE_URL: string;",
      "\tMETAFY_WEBHOOK_SECRET?: string;",
      "}",
    ].join("\n");

    expect(missingGeneratedBindings("w.jsonc", config, "env.d.ts", types)).toEqual([]);
  });

  test("a name mentioned only inside another identifier does not count", () => {
    const types = ["interface Env {", "\tSITE_ORIGIN_LEGACY: string;", "}"].join("\n");

    expect(
      missingGeneratedBindings("w.jsonc", { vars: { SITE_ORIGIN: "x" } }, "env.d.ts", types),
    ).toEqual([
      "env.d.ts: SITE_ORIGIN is declared in w.jsonc but missing from the generated Env — rerun `wrangler types`",
    ]);
  });
});
