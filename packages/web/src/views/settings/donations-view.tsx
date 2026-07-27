import { Suspense } from "react";
import { SettingsSubpageLayout } from "./settings-subpage-layout";
import { MetafyAccountPanel } from "@/features/metafy/metafy-account-panel";
import type { MetafyStatusResult } from "@/features/metafy/types";

interface DonationsViewProps {
  metafyStatus: MetafyStatusResult | null;
}

export function DonationsView({ metafyStatus }: DonationsViewProps) {
  return (
    <SettingsSubpageLayout
      title="Donations"
      description="Support Riftseer and manage your supporter status."
      sections={[
        {
          heading: "Metafy",
          rows: [
            {
              title: "Metafy Account",
              description: metafyStatus?.linked
                ? "Your Metafy account is linked. Supporters get an ad-free experience and a badge on their profile."
                : "Link your Metafy account to unlock supporter perks if you have an active membership.",
              control: (
                <Suspense>
                  <MetafyAccountPanel initialStatus={metafyStatus} />
                </Suspense>
              ),
            },
          ],
        },
      ]}
    />
  );
}
