import { SettingsSubpageLayout } from "./settings-subpage-layout";
import type { SettingsSection } from "./settings-subpage-layout";

const sections: SettingsSection[] = [];

export function DonationsView() {
  return (
    <SettingsSubpageLayout
      title="Donations"
      description="Support Riftseer and manage your donation history."
      sections={sections}
    />
  );
}
