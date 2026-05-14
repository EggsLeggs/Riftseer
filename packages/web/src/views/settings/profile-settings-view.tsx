import { SettingsSubpageLayout } from "./settings-subpage-layout";
import type { SettingsSection } from "./settings-subpage-layout";

const sections: SettingsSection[] = [];

export function ProfileSettingsView() {
  return (
    <SettingsSubpageLayout
      title="User Profile"
      description="Update your user profile (display name, pronouns, bio, etc)."
      sections={sections}
    />
  );
}
