import { treaty } from "@elysiajs/eden";
import type { App } from "@riftseer/api";
import { env } from "@/lib/env";

export function createApiClient(accessToken?: string) {
  return treaty<App>(env.NEXT_PUBLIC_API_URL, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
}
