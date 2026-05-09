import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getValidatedPublicApiUrl } from "@/lib/env";

const FIVE_MINUTES = 300;
const REFRESH_TIMEOUT_MS = 15_000;

const refreshBodySchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  user: z.object({
    id: z.string(),
    email: z.string().optional(),
    created_at: z.string(),
  }),
});

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get("rs_access_token")?.value;
  const refreshToken = request.cookies.get("rs_refresh_token")?.value;
  const expiresAt = request.cookies.get("rs_expires_at")?.value;

  if (!accessToken || !refreshToken) return NextResponse.next();

  const now = Math.floor(Date.now() / 1000);
  const expires = expiresAt ? parseInt(expiresAt, 10) : 0;

  if (expires - now > FIVE_MINUTES) return NextResponse.next();

  const apiUrl = getValidatedPublicApiUrl();
  if (!apiUrl) return NextResponse.next();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);

  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const response = NextResponse.next();

    if (!res.ok) {
      response.cookies.delete("rs_access_token");
      response.cookies.delete("rs_refresh_token");
      response.cookies.delete("rs_expires_at");
      response.cookies.delete("rs_user");
      return response;
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      console.warn("[proxy] token refresh failed: invalid JSON from auth/refresh", err);
      response.cookies.delete("rs_access_token");
      response.cookies.delete("rs_refresh_token");
      response.cookies.delete("rs_expires_at");
      response.cookies.delete("rs_user");
      return response;
    }

    const parsed = refreshBodySchema.safeParse(json);
    if (!parsed.success) {
      console.warn("[proxy] token refresh failed: unexpected auth/refresh response shape", parsed.error.flatten());
      response.cookies.delete("rs_access_token");
      response.cookies.delete("rs_refresh_token");
      response.cookies.delete("rs_expires_at");
      response.cookies.delete("rs_user");
      return response;
    }

    const data = parsed.data;
    const expiresInSec =
      Number.isFinite(data.expires_in) && data.expires_in > 0 ? Math.floor(data.expires_in) : 3600;

    const newExpiresAt = String(Math.floor(Date.now() / 1000) + expiresInSec);
    const secure = request.nextUrl.protocol === "https:";
    const cookieOpts = { path: "/", sameSite: "lax" as const, secure };

    response.cookies.set("rs_access_token", data.access_token, {
      ...cookieOpts,
      httpOnly: true,
      maxAge: expiresInSec,
    });
    response.cookies.set("rs_refresh_token", data.refresh_token, {
      ...cookieOpts,
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set("rs_expires_at", newExpiresAt, {
      ...cookieOpts,
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set(
      "rs_user",
      JSON.stringify({ id: data.user.id, email: data.user.email }),
      { ...cookieOpts, httpOnly: true, maxAge: 60 * 60 * 24 * 30 },
    );

    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "[proxy] token refresh timed out"
        : "[proxy] token refresh failed";
    console.warn(message, err);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
