import { SettingsSubpageLayout } from "./settings-subpage-layout";
import type { SettingsSection } from "./settings-subpage-layout";

const sections: SettingsSection[] = [];

export function NotificationsView() {
  return (
    <SettingsSubpageLayout
      title="Notifications"
      description="Manage how and when you receive notifications."
      sections={sections}
    />
  );
}
