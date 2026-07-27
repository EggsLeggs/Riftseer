import Link from "next/link";
import { Bell, ChevronRight, Heart, Lock, Settings, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface SettingsCard {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const SETTINGS_CARDS: SettingsCard[] = [
  {
    href: "/settings/preferences",
    icon: Settings,
    title: "User Preferences",
    description: "General user preferences to make the site exactly how you want it.",
  },
  {
    href: "/settings/profile",
    icon: User,
    title: "User Profile",
    description: "Update your user profile (display name, pronouns, bio, etc).",
  },
  {
    href: "/settings/security",
    icon: Lock,
    title: "Login & Security",
    description: "Update your password and other security features on your account.",
  },
  {
    href: "/settings/notifications",
    icon: Bell,
    title: "Notifications",
    description: "Manage how and when you receive notifications.",
  },
  {
    href: "/settings/donations",
    icon: Heart,
    title: "Donations",
    description: "Support Riftseer and manage your donation history.",
  },
];

export function SettingsIndexView() {
  return (
    <div className="container py-8">
      <h1 className="mb-8 text-2xl font-semibold">Settings</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_CARDS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href} className="block group">
            <Card className="h-full transition-colors hover:border-foreground/30">
              <CardContent className="pt-6 pb-5 px-5 flex flex-col gap-4">
                <Icon className="size-6 text-violet-400" strokeWidth={1.75} />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm">{title}</span>
                    <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
