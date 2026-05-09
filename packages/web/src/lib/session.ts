import "server-only";
import { cookies } from "next/headers";
import type { Session, SessionUser } from "@/features/auth/types";
import { env } from "@/lib/env";

const COOKIE_OPTS = {
  path: "/",
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
};

const ACCESS_MAX_AGE = 60 * 60; // 1 hour
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const accessToken = jar.get("rs_access_token")?.value;
  const refreshToken = jar.get("rs_refresh_token")?.value;
  const expiresAt = jar.get("rs_expires_at")?.value;
  const userRaw = jar.get("rs_user")?.value;

  if (!accessToken || !refreshToken || !userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as SessionUser;
    return { accessToken, refreshToken, expiresAt: Number(expiresAt ?? 0), user };
  } catch {
    return null;
  }
}

export async function setSessionCookies(session: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SessionUser;
}) {
  const jar = await cookies();
  const expiresAt = Math.floor(Date.now() / 1000) + session.expires_in;

  jar.set("rs_access_token", session.access_token, { ...COOKIE_OPTS, httpOnly: true, maxAge: ACCESS_MAX_AGE });
  jar.set("rs_refresh_token", session.refresh_token, { ...COOKIE_OPTS, httpOnly: true, maxAge: REFRESH_MAX_AGE });
  jar.set("rs_expires_at", String(expiresAt), { ...COOKIE_OPTS, httpOnly: false, maxAge: REFRESH_MAX_AGE });
  jar.set("rs_user", JSON.stringify({ id: session.user.id, email: session.user.email }), {
    ...COOKIE_OPTS,
    httpOnly: true,
    maxAge: REFRESH_MAX_AGE,
  });
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete("rs_access_token");
  jar.delete("rs_refresh_token");
  jar.delete("rs_expires_at");
  jar.delete("rs_user");
}
