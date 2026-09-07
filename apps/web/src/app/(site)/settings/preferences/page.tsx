import type { Metadata } from "next";
import { PreferencesView } from "@/views/settings/preferences-view";

export const metadata: Metadata = { title: "User Preferences — Settings — Riftseer" };

export default function PreferencesPage() {
  return <PreferencesView />;
}
