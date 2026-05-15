"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";

const STATE_COOKIE = "rs_metafy_oauth_state";

export async function connectMetafyAction(): Promise<{ error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/metafy/connect`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Failed to initiate Metafy connection" };
  }

  const { url, state } = (await res.json()) as { url: string; state: string };

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 10,
  });

  redirect(url);
}

export async function completeMetafyCallbackAction(
  code: string,
  state: string,
): Promise<{ error: string } | { ok: true }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const jar = await cookies();
  const savedState = jar.get(STATE_COOKIE)?.value;

  if (!savedState || savedState !== state) {
    return { error: "Invalid or expired OAuth state. Please try linking again." };
  }

  jar.delete(STATE_COOKIE);

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/metafy/callback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code, state }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Failed to link Metafy account" };
  }

  return { ok: true };
}

export async function disconnectMetafyAction(): Promise<{ error: string } | { ok: true }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/metafy/disconnect`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Failed to disconnect Metafy account" };
  }

  return { ok: true };
}

export async function refreshMetafyStatusAction(): Promise<
  { error: string } | { ok: true; is_supporter: boolean }
> {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/metafy/refresh-status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 404) return { error: "No linked Metafy account" };
    return { error: body.error ?? "Failed to refresh supporter status" };
  }

  const data = (await res.json()) as { is_supporter: boolean };
  return { ok: true, is_supporter: data.is_supporter };
}
