import { describe, expect, test } from "bun:test";
import { productionBindingProblems } from "./check-wrangler-consistency.mjs";

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
