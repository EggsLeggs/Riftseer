import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { metafyApi } from "@/features/metafy/api";
import { DonationsView } from "@/views/settings/donations-view";

export const metadata: Metadata = { title: "Donations — Settings — Riftseer" };

export default async function DonationsPage() {
  const session = await getSession();
  const metafyStatus = session ? await metafyApi.getStatus(session.accessToken) : null;

  return <DonationsView metafyStatus={metafyStatus} />;
}
