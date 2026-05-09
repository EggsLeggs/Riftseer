"use server";

import { redirect } from "next/navigation";
import { createApiClient } from "@/lib/api/client";
import { getSession, setSessionCookies, clearSessionCookies } from "@/lib/session";
import { env } from "@/lib/env";

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const callbackUrl = (formData.get("callbackUrl") as string) || "/";

  const api = createApiClient();
  const { data, error } = await api.api.v1.auth.login.post({ email, password });

  if (error) {
    return { error: (error.value as { error?: string })?.error ?? "Login failed" };
  }

  await setSessionCookies({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    user: data.user,
  });

  const safeCallback = callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
  redirect(safeCallback);
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const api = createApiClient();

  const { data, error, status } = await api.api.v1.auth.register.post({
    email,
    password,
    options: { redirect_to: `${env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  if (error) {
    return { error: (error.value as { error?: string })?.error ?? "Registration failed" };
  }

  if (status === 202) {
    return { pending: true, message: (data as { message: string }).message };
  }

  const session = data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email?: string; created_at: string };
  };

  await setSessionCookies({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    user: session.user,
  });

  redirect("/");
}

export async function logoutAction() {
  const session = await getSession();
  if (session) {
    const api = createApiClient(session.accessToken);
    await api.api.v1.auth.logout.post({} as never);
  }
  await clearSessionCookies();
  redirect("/");
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = formData.get("email") as string;

  const api = createApiClient();

  const { error } = await api.api.v1.auth["forgot-password"].post({
    email,
    options: { redirect_to: `${env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  if (error) {
    return { error: (error.value as { error?: string })?.error ?? "Request failed" };
  }

  return { ok: true };
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const password = formData.get("password") as string;
  const recoveryToken = formData.get("recovery_token") as string;

  if (!recoveryToken) {
    return { error: "Invalid or expired reset link" };
  }

  const api = createApiClient(recoveryToken);
  const { error } = await api.api.v1.auth["reset-password"].post({ password });

  if (error) {
    return { error: (error.value as { error?: string })?.error ?? "Password reset failed" };
  }

  redirect("/auth/login?reset=1");
}
