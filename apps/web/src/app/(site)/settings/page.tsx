import type { Metadata } from "next";
import { SettingsIndexView } from "@/views/settings/settings-index-view";

export const metadata: Metadata = {
  title: "Settings — Riftseer",
};

export default function SettingsPage() {
  return <SettingsIndexView />;
}
