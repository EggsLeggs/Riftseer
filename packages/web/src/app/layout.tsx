import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ConsentManager } from "@/components/consent-manager";
import { Providers } from "@/providers";
import "./globals.css";
// Imported separately: Tailwind's CSS pipeline drops a nested `@import` of this
// file from globals.css, which left white glyphs invisible on the light page.
import "./icons.css";
import "./keywords.css";

const genInterfaceJP = localFont({
  src: [
    { path: "./fonts/GenInterfaceJP-Thin.ttf", weight: "100" },
    { path: "./fonts/GenInterfaceJP-ExtraLight.ttf", weight: "200" },
    { path: "./fonts/GenInterfaceJP-Light.ttf", weight: "300" },
    { path: "./fonts/GenInterfaceJP-Regular.ttf", weight: "400" },
    { path: "./fonts/GenInterfaceJP-Medium.ttf", weight: "500" },
    { path: "./fonts/GenInterfaceJP-SemiBold.ttf", weight: "600" },
    { path: "./fonts/GenInterfaceJP-Bold.ttf", weight: "700" },
    { path: "./fonts/GenInterfaceJP-ExtraBold.ttf", weight: "800" },
  ],
  variable: "--font-sans",
});

const genInterfaceJPDisplay = localFont({
  src: [
    { path: "./fonts/GenInterfaceJPDisplay-Thin.ttf", weight: "100" },
    { path: "./fonts/GenInterfaceJPDisplay-ExtraLight.ttf", weight: "200" },
    { path: "./fonts/GenInterfaceJPDisplay-Light.ttf", weight: "300" },
    { path: "./fonts/GenInterfaceJPDisplay-Regular.ttf", weight: "400" },
    { path: "./fonts/GenInterfaceJPDisplay-Medium.ttf", weight: "500" },
    { path: "./fonts/GenInterfaceJPDisplay-SemiBold.ttf", weight: "600" },
    { path: "./fonts/GenInterfaceJPDisplay-Bold.ttf", weight: "700" },
    { path: "./fonts/GenInterfaceJPDisplay-ExtraBold.ttf", weight: "800" },
  ],
  variable: "--font-display",
});

/** Riot's Beaufort for LoL — keyword rhombus badges on card text. */
const beaufortForLoL = localFont({
  src: [
    { path: "./fonts/BeaufortforLOL-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/BeaufortforLOL-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/BeaufortforLOL-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-beaufort",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Riftseer",
  description: "Card database and deck builder for the Riftbound TCG",
  applicationName: "Riftseer",
  appleWebApp: {
    title: "Riftseer",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${genInterfaceJP.variable} ${genInterfaceJPDisplay.variable} ${beaufortForLoL.variable} h-full antialiased`}
    >
      <head>
        {/* Adobe Fonts (Typekit) — Arpona, used for card names and energy cost digits */}
        <link rel="preconnect" href="https://use.typekit.net" />
        <link rel="preconnect" href="https://use.typekit.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://use.typekit.net/jej4cyy.css" />
      </head>
      <body className="min-h-full flex flex-col">
        <ConsentManager>
          <Providers>{children}</Providers>
        </ConsentManager>
      </body>
    </html>
  );
}
