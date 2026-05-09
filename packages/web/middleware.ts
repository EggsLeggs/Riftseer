import { type NextRequest, NextResponse } from "next/server";

const FIVE_MINUTES = 300;

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get("rs_access_token")?.value;
  const refreshToken = request.cookies.get("rs_refresh_token")?.value;
  const expiresAt = request.cookies.get("rs_expires_at")?.value;

  if (!accessToken || !refreshToken) return NextResponse.next();

  const now = Math.floor(Date.now() / 1000);
  const expires = expiresAt ? parseInt(expiresAt, 10) : 0;

  if (expires - now > FIVE_MINUTES) return NextResponse.next();

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return NextResponse.next();

  try {
    const res = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const response = NextResponse.next();

    if (!res.ok) {
      response.cookies.delete("rs_access_token");
      response.cookies.delete("rs_refresh_token");
      response.cookies.delete("rs_expires_at");
      response.cookies.delete("rs_user");
      return response;
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      user: { id: string; email?: string; created_at: string };
    };

    const newExpiresAt = String(Math.floor(Date.now() / 1000) + data.expires_in);
    const secure = request.nextUrl.protocol === "https:";
    const cookieOpts = { path: "/", sameSite: "lax" as const, secure };

    response.cookies.set("rs_access_token", data.access_token, { ...cookieOpts, httpOnly: true, maxAge: 60 * 60 });
    response.cookies.set("rs_refresh_token", data.refresh_token, { ...cookieOpts, httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
    response.cookies.set("rs_expires_at", newExpiresAt, { ...cookieOpts, httpOnly: false, maxAge: 60 * 60 * 24 * 30 });
    response.cookies.set(
      "rs_user",
      JSON.stringify({ id: data.user.id, email: data.user.email }),
      { ...cookieOpts, httpOnly: false, maxAge: 60 * 60 * 24 * 30 },
    );

    return response;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
