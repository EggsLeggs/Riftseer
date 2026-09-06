import type { Metadata } from "next";
import { NotificationsView } from "@/views/settings/notifications-view";

export const metadata: Metadata = { title: "Notifications — Settings — Riftseer" };

export default function NotificationsPage() {
  return <NotificationsView />;
}
