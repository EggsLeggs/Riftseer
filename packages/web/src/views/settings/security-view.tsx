import { SettingsSubpageLayout } from "./settings-subpage-layout";
import type { SettingsSection } from "./settings-subpage-layout";

const sections: SettingsSection[] = [];

export function SecurityView() {
  return (
    <SettingsSubpageLayout
      title="Login & Security"
      description="Update your password and other security features on your account."
      sections={sections}
    />
  );
}
