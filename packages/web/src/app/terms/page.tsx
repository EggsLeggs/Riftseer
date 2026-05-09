import type { Metadata } from "next";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { env } from "@/lib/env";
import { TermsView } from "@/views/terms-view";

const canonical = new URL("/terms", env.NEXT_PUBLIC_APP_URL).toString();

export const metadata: Metadata = {
  title: "Terms of Service — Riftseer",
  description: "Terms of Service for Riftseer.",
  openGraph: {
    title: "Terms of Service — Riftseer",
    description: "Terms of Service for Riftseer.",
    type: "website",
    url: canonical,
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service — Riftseer",
    description: "Terms of Service for Riftseer.",
  },
};

export default function TermsPage() {
  return (
    <div className="flex flex-1 flex-col font-sans">
      <Navbar />
      <TermsView />
      <Footer />
    </div>
  );
}
