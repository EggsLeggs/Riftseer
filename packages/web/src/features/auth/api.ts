import "server-only";
import { cache } from "react";
import { env } from "@/lib/env";

export interface CurrentUser {
  id: string;
  email?: string;
  created_at: string;
  /** Computed by the API from `ADMIN_USER_IDS` — never stored in the session cookie. */
  is_admin: boolean;
}

const FETCH_TIMEOUT_MS = 8_000;

/**
 * `GET /auth/me` for one access token.
 *
 * Wrapped in React `cache()` so the navbar, an admin layout and a page in the
 * same render share a single round-trip. Deliberately `no-store`: this backs an
 * authorization decision, so it must never be served from a cross-request cache
 * keyed on anything but the exact token.
 */
export const getCurrentUser = cache(
  async (accessToken: string): Promise<CurrentUser | null> => {
    let res: Response;
    try {
      res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return null;
    }

    if (!res.ok) return null;
    return (await res.json().catch(() => null)) as CurrentUser | null;
  },
);
