import type { Metadata } from "next";
import { SecurityView } from "@/views/settings/security-view";

export const metadata: Metadata = { title: "Login & Security — Settings — Riftseer" };

export default function SecurityPage() {
  return <SecurityView />;
}
