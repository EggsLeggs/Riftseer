import { SettingsSubpageLayout } from "./settings-subpage-layout";
import type { SettingsSection } from "./settings-subpage-layout";

const sections: SettingsSection[] = [];

export function PreferencesView() {
  return (
    <SettingsSubpageLayout
      title="User Preferences"
      description="General user preferences to make the site exactly how you want it."
      sections={sections}
    />
  );
}
