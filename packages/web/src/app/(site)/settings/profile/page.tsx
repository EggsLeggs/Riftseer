import type { Metadata } from "next";
import { ProfileSettingsView } from "@/views/settings/profile-settings-view";

export const metadata: Metadata = { title: "User Profile — Settings — Riftseer" };

export default function ProfileSettingsPage() {
  return <ProfileSettingsView />;
}
