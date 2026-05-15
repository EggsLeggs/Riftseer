"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Star, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";

interface UserNavProps {
  handle?: string;
  isSupporter?: boolean;
  isMember?: boolean;
}

export function UserNav({ handle, isSupporter, isMember }: UserNavProps) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          {isSupporter && <Star className="size-3 fill-violet-500 text-violet-500" />}
          {!isSupporter && isMember && <Users className="size-3 text-blue-500" />}
          {handle ? `@${handle}` : "Account"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {handle && (
          <DropdownMenuItem asChild>
            <Link href={`/u/${handle}`}>Profile</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => startTransition(() => logoutAction())}
          disabled={pending}
        >
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
