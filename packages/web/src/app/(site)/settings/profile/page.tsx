import type { Metadata } from "next";
import { requireAuth } from "@/lib/session";
import { profileApi } from "@/features/profile/api";
import { ProfileSettingsView } from "@/views/settings/profile-settings-view";

export const metadata: Metadata = { title: "User Profile — Settings — Riftseer" };

export default async function ProfileSettingsPage() {
  const session = await requireAuth("/settings/profile");
  const result = session.user.handle
    ? await profileApi.getProfile(session.user.handle, session.accessToken)
    : null;
  return (
    <ProfileSettingsView
      session={session}
      profile={result?.status === "ok" ? result.profile : null}
    />
  );
}
