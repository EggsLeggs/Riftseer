import type { Metadata } from "next";
import { DonationsView } from "@/views/settings/donations-view";

export const metadata: Metadata = { title: "Donations — Settings — Riftseer" };

export default function DonationsPage() {
  return <DonationsView />;
}
