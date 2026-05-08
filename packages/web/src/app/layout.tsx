import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Riftseer",
  description: "Card database and deck builder for the Riftbound TCG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${genInterfaceJP.variable} ${genInterfaceJPDisplay.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
