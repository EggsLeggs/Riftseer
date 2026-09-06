import type { Metadata } from "next";
import { env } from "@/lib/env";
import { SearchSyntaxView } from "@/views/search-syntax-view";

const canonical = new URL("/syntax", env.NEXT_PUBLIC_APP_URL).toString();

export const metadata: Metadata = {
  title: "Card search syntax · Riftseer",
  description: "How to search Riftbound cards on Riftseer using keywords, filters, and boolean operators.",
  openGraph: {
    title: "Card search syntax · Riftseer",
    description: "How to search Riftbound cards on Riftseer using keywords, filters, and boolean operators.",
    type: "website",
    url: canonical,
  },
  twitter: {
    card: "summary_large_image",
    title: "Card search syntax · Riftseer",
    description: "How to search Riftbound cards on Riftseer using keywords, filters, and boolean operators.",
  },
};

export default function SyntaxPage() {
  return <SearchSyntaxView />;
}
