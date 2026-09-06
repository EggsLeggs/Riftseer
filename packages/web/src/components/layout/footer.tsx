import Link from "next/link";

import { FooterCookiePreferencesLink } from "./footer-cookie-preferences";
import { SitePreferencesFooterTrigger } from "./site-preferences-dialog";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-wrap items-start justify-between gap-x-8 gap-y-3 py-4 text-sm text-muted-foreground">
        <p className="min-w-[min(100%,28rem)] flex-1 basis-80 text-xs leading-relaxed">
          Riftseer was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy using
          assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
        </p>
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
