"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { env } from "@/lib/env";

const STATE_COOKIE = "rs_metafy_oauth_state";
const REQUEST_TIMEOUT_MS = 10_000;
const UNEXPECTED_RESPONSE = "Unexpected response from Riftseer. Please try again.";

type MetafyRequestResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/**
 * Calls an /auth/metafy/* endpoint with a bounded timeout, collapsing transport
 * failures and unparseable bodies into the same friendly `{ error }` shape the
 * actions return to the client.
 */
async function metafyRequest(
  path: string,
  accessToken: string,
  fallbackError: string,
  init?: RequestInit,
): Promise<MetafyRequestResult> {
  let res: Response;
  try {
    res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/metafy/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...init?.headers },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, error: fallbackError };
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof body?.error === "string" ? body.error : fallbackError,
    };
  }
  if (!body) {
    return { ok: false, status: res.status, error: UNEXPECTED_RESPONSE };
  }
  return { ok: true, data: body };
}

export async function connectMetafyAction(): Promise<{ error: string }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const result = await metafyRequest(
    "connect",
    session.accessToken,
    "Failed to initiate Metafy connection",
  );
  if (!result.ok) return { error: result.error };

  const { url, state } = result.data as { url?: string; state?: string };
  if (!url || !state) return { error: UNEXPECTED_RESPONSE };

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

  const result = await metafyRequest(
    "callback",
    session.accessToken,
    "Failed to link Metafy account",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    },
  );

  if (!result.ok) return { error: result.error };

  return { ok: true };
}

export async function disconnectMetafyAction(): Promise<{ error: string } | { ok: true }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const result = await metafyRequest(
    "disconnect",
    session.accessToken,
    "Failed to disconnect Metafy account",
    { method: "DELETE" },
  );

  if (!result.ok) return { error: result.error };

  return { ok: true };
}

export async function refreshMetafyStatusAction(): Promise<
  { error: string } | { ok: true; is_supporter: boolean }
> {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const result = await metafyRequest(
    "refresh-status",
    session.accessToken,
    "Failed to refresh supporter status",
    { method: "POST" },
  );

  if (!result.ok) {
    if (result.status === 404) return { error: "No linked Metafy account" };
    return { error: result.error };
  }

  const { is_supporter: isSupporter } = result.data as { is_supporter?: boolean };
  if (typeof isSupporter !== "boolean") return { error: UNEXPECTED_RESPONSE };

  return { ok: true, is_supporter: isSupporter };
}
