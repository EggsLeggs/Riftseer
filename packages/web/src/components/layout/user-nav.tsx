"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ShieldCheck, Star, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppDropdownMenuContent } from "@/components/layout/clear-body-pointer-events";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";

interface UserNavProps {
  handle?: string;
  isSupporter?: boolean;
  isMember?: boolean;
  isAdmin?: boolean;
}

export function UserNav({ handle, isSupporter, isMember, isAdmin }: UserNavProps) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          {isSupporter && <Star className="size-3 fill-violet-500 text-violet-500" />}
          {!isSupporter && isMember && <Users className="size-3 text-blue-500" />}
          {handle ? `@${handle}` : "Account"}
        </Button>
      </DropdownMenuTrigger>
      <AppDropdownMenuContent align="end">
        {handle && (
          <DropdownMenuItem asChild>
            <Link href={`/u/${handle}`}>Profile</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                Admin
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => startTransition(() => logoutAction())}
          disabled={pending}
        >
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </AppDropdownMenuContent>
    </DropdownMenu>
  );
}
