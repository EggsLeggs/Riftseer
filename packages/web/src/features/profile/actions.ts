"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";

async function fetchFollow(handle: string, method: "POST" | "DELETE") {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const res = await fetch(
    `${env.NEXT_PUBLIC_API_URL}/api/v1/users/${encodeURIComponent(handle)}/follow`,
    {
      method,
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Request failed" };
  }

  revalidatePath(`/u/${handle}`);
  return { ok: true };
}

export async function followAction(handle: string) {
  return fetchFollow(handle, "POST");
}

export async function unfollowAction(handle: string) {
  return fetchFollow(handle, "DELETE");
}
