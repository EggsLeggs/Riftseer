import { env } from "@/lib/env";

export interface ProfileData {
  id: string;
  handle: string;
  username: string;
  follower_count: number;
  following_count: number;
  created_at: string;
  is_following?: boolean;
}

export async function getProfile(handle: string, accessToken?: string): Promise<ProfileData | null> {
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/users/${encodeURIComponent(handle)}`, {
    headers,
    cache: "no-store",
  });

  if (res.status === 404) return null;
  if (!res.ok) return null;

  return res.json() as Promise<ProfileData>;
}
