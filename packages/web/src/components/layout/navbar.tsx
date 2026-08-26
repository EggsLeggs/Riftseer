import Link from "next/link";
import { Backpack } from "lucide-react";
import { myDecksHref } from "@/features/decks/paths";
import { getSession, isAdminSession } from "@/lib/session";
import { UserNav } from "./user-nav";
import { CardSearchTrigger } from "./card-search-trigger";
import { Button } from "@/components/ui/button";
import { CardsNavMenu } from "./cards-nav-menu";

interface NavbarProps {
  isSupporter?: boolean;
  isMember?: boolean;
}

export async function Navbar({ isSupporter, isMember }: NavbarProps) {
  const session = await getSession();
  const isAdmin = await isAdminSession();

  return (
    <header className="border-b border-border">
      <div className="container flex items-center gap-4 py-3">
        <div className="flex flex-1 items-center gap-3">
          <Link href="/" className="font-semibold text-sm whitespace-nowrap">
            Riftseer
          </Link>
          <CardSearchTrigger className="w-full max-w-xs" />
        </div>
        <div className="flex items-center gap-2">
          <CardsNavMenu />
          <Button variant="ghost" size="lg" asChild>
            <Link href={myDecksHref()}>Decks</Link>
          </Button>
          <Button variant="ghost" size="lg" asChild>
            <a
              href="https://steamcommunity.com/sharedfiles/filedetails/?id=3732199052"
              target="_blank"
              rel="noopener noreferrer"
            >
              Play
            </a>
          </Button>
          <div className="h-4 w-px bg-border" />
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <Link href="/collection" aria-label="Collection">
              <Backpack className="size-4" />
            </Link>
          </Button>
          {session ? (
            <UserNav
              handle={session.user.handle}
              isSupporter={isSupporter}
              isMember={isMember}
              isAdmin={isAdmin}
            />
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/auth/register">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
