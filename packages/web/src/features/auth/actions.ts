"use server";

import { redirect } from "next/navigation";
import { createApiClient } from "@/lib/api/client";
import { getSession, setSessionCookies, clearSessionCookies } from "@/lib/session";
import { env } from "@/lib/env";

function str(fd: FormData, key: string): string | null {
  const val = fd.get(key);
  return typeof val === "string" && val.length > 0 ? val : null;
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = str(formData, "email");
  const password = str(formData, "password");
  if (!email || !password) return { error: "Email and password are required" };

  const rawCallback = formData.get("callbackUrl");
  const callbackUrl = typeof rawCallback === "string" ? rawCallback : "/";

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
  const email = str(formData, "email");
  const password = str(formData, "password");
  const username = str(formData, "username");
  const handle = str(formData, "handle")?.toLowerCase() ?? null;
  if (!email || !password) return { error: "Email and password are required" };
  if (!username) return { error: "Display name is required" };
  if (!handle) return { error: "Handle is required" };

  const acceptedRaw = formData.get("accepted_terms");
  const acceptedTerms = acceptedRaw === "on" || acceptedRaw === "true";
  if (!acceptedTerms) {
    return {
      error: "You must accept the Terms of Service and Privacy Policy to create an account.",
    };
  }

  const api = createApiClient();

  const { data, error, status } = await api.api.v1.auth.register.post({
    email,
    password,
    username,
    handle,
    accepted_terms: true,
    options: { redirect_to: `${env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  if (error) {
    if (status === 409) {
      return { error: "That handle is already taken. Please choose another." };
    }
    return { error: (error.value as { error?: string })?.error ?? "Registration failed" };
  }

  if (status === 202) {
    return { pending: true, message: (data as { message: string }).message };
  }

  const session = data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email?: string; created_at: string; handle?: string; username?: string };
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
    try {
      await api.api.v1.auth.logout.post({} as never);
    } catch {
      // ignore remote error — local cleanup always runs
    }
  }
  await clearSessionCookies();
  redirect("/");
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = str(formData, "email");
  if (!email) return { error: "Email is required" };

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

export async function changeEmailAction(_prev: unknown, formData: FormData) {
  const email = str(formData, "email");
  if (!email) return { error: "Email is required" };

  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/email`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Email update failed" };
  }

  return { ok: true };
}

export async function changePasswordAction(_prev: unknown, formData: FormData) {
  const currentPassword = str(formData, "current_password");
  const newPassword = str(formData, "new_password");
  const confirmPassword = str(formData, "confirm_password");

  if (!currentPassword) return { error: "Current password is required" };
  if (!newPassword) return { error: "New password is required" };
  if (newPassword.length < 8) return { error: "New password must be at least 8 characters" };
  if (newPassword !== confirmPassword) return { error: "Passwords do not match" };

  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/auth/change-password`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Password change failed" };
  }

  return { ok: true };
}

export async function deleteAccountAction(_prev: unknown, formData: FormData) {
  const confirmation = str(formData, "confirmation");
  if (!confirmation) return { error: "Confirmation is required" };

  const session = await getSession();
  if (!session) return { error: "Not signed in" };

  const expectedHandle = session.user.handle ?? "";
  if (confirmation.toLowerCase() !== expectedHandle.toLowerCase()) {
    return { error: `Type your @handle (${expectedHandle}) exactly to confirm deletion` };
  }

  const res = await fetch(`${env.NEXT_PUBLIC_API_URL}/api/v1/users/me`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? "Account deletion failed" };
  }

  await clearSessionCookies();
  redirect("/");
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const password = str(formData, "password");
  const recoveryToken = str(formData, "recovery_token");

  if (!recoveryToken) {
    return { error: "Invalid or expired reset link" };
  }
  if (!password) {
    return { error: "Password is required" };
  }

  const api = createApiClient(recoveryToken);
  const { error } = await api.api.v1.auth["reset-password"].post({ password });

  if (error) {
    return { error: (error.value as { error?: string })?.error ?? "Password reset failed" };
  }

  redirect("/auth/login?reset=1");
}
