"use server";

import { revalidatePath } from "next/cache";
import { getSession, updateSessionUser } from "@/lib/session";
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

export async function updateProfileAction(data: {
  username?: string;
  bio?: string;
  pronouns?: string[];
  social_links?: Record<string, string>;
}) {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/users/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Failed to update profile" };
  }

  const result = (await res.json()) as { message: string; username?: string };

  if (result.username) {
    await updateSessionUser({ username: result.username });
  }

  if (session.user.handle) {
    revalidatePath(`/u/${session.user.handle}`);
  }

  return { ok: true };
}

export async function updateHandleAction(handle: string) {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/users/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ handle }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Failed to update handle" };
  }

  const result = (await res.json()) as { message: string; handle?: string };
  const newHandle = result.handle ?? handle;

  if (session.user.handle) {
    revalidatePath(`/u/${session.user.handle}`);
  }
  revalidatePath(`/u/${newHandle}`);
  revalidatePath("/settings/profile");

  await updateSessionUser({ handle: newHandle });

  return { ok: true, handle: newHandle };
}
