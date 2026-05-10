import Link from "next/link";
import { getSession } from "@/lib/session";
import { UserNav } from "./user-nav";
import { CardSearchTrigger } from "./card-search-trigger";
import { Button } from "@/components/ui/button";

export async function Navbar() {
  const session = await getSession();

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
          {session ? (
            <UserNav email={session.user.email} />
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
