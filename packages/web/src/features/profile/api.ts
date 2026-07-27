import { env } from "@/lib/env";

export interface ProfileData {
  id: string;
  handle: string;
  username: string;
  bio: string | null;
  pronouns: string[];
  social_links: Record<string, string>;
  follower_count: number;
  following_count: number;
  created_at: string;
  is_following?: boolean;
  is_supporter: boolean;
  is_member: boolean;
}

/**
 * Profile lookups distinguish "no such handle" from "the API could not answer",
 * so callers can render the right copy without inspecting an Error message —
 * Next.js replaces those in production builds.
 */
export type ProfileResult =
  | { status: "ok"; profile: ProfileData }
  | { status: "not-found" }
  | { status: "unavailable" };

export const profileApi = {
  async getProfile(handle: string, accessToken?: string): Promise<ProfileResult> {
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    let res: Response;
    try {
      res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/users/${encodeURIComponent(handle)}`, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      return { status: "unavailable" };
    }

    if (res.status === 404) return { status: "not-found" };
    if (!res.ok) return { status: "unavailable" };

    return { status: "ok", profile: (await res.json()) as ProfileData };
  },
};
