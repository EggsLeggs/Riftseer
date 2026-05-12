import Link from "next/link";

import { FooterCookiePreferencesLink } from "./footer-cookie-preferences";
import { SitePreferencesFooterTrigger } from "./site-preferences-dialog";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col gap-3 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>&copy; {new Date().getFullYear()} Riftseer</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/privacy" className="transition-colors hover:text-foreground hover:underline underline-offset-4">
            Privacy Policy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground hover:underline underline-offset-4">
            Terms of Service
          </Link>
          <Link href="/syntax" className="transition-colors hover:text-foreground hover:underline underline-offset-4">
            Search syntax
          </Link>
          <FooterCookiePreferencesLink />
          <SitePreferencesFooterTrigger />
        </div>
      </div>
    </footer>
  );
}
