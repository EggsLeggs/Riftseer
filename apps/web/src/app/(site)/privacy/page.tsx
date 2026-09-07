import type { Metadata } from "next";
import { env } from "@/lib/env";
import { PrivacyView } from "@/views/privacy-view";

const canonical = new URL("/privacy", env.NEXT_PUBLIC_APP_URL).toString();

export const metadata: Metadata = {
  title: "Privacy Policy — Riftseer",
  description: "Privacy Policy for Riftseer.",
  openGraph: {
    title: "Privacy Policy — Riftseer",
    description: "Privacy Policy for Riftseer.",
    type: "website",
    url: canonical,
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy — Riftseer",
    description: "Privacy Policy for Riftseer.",
  },
};

export default function PrivacyPage() {
  return <PrivacyView />;
}
