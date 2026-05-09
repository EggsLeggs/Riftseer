import { c15tInstance } from "@c15t/backend";
import { kyselyAdapter } from "@c15t/backend/db/adapters/kysely";
import { getDb } from "./db-consent";
import { env } from "./env";

type C15tInstance = ReturnType<typeof c15tInstance>;
let _c15t: C15tInstance | null = null;

export function getC15t(): C15tInstance {
  if (!_c15t) {
    _c15t = c15tInstance({
      appName: "riftseer",
      basePath: "/api/c15t",
      trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
      adapter: kyselyAdapter({ db: getDb(), provider: "postgresql" }),
    });
  }
  return _c15t;
}
