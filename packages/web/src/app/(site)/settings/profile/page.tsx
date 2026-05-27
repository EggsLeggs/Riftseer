import type { Metadata } from "next";
import { requireAuth } from "@/lib/session";
import { getProfile } from "@/features/profile/api";
import { ProfileSettingsView } from "@/views/settings/profile-settings-view";

export const metadata: Metadata = { title: "User Profile — Settings — Riftseer" };

export default async function ProfileSettingsPage() {
  const session = await requireAuth("/settings/profile");
  const profile = session.user.handle
    ? await getProfile(session.user.handle, session.accessToken)
    : null;
  return <ProfileSettingsView session={session} profile={profile} />;
}
