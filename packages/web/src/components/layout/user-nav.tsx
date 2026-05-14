"use client";

import { useTransition } from "react";
import Link from "next/link";
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
}

export function UserNav({ handle }: UserNavProps) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          {handle ? `@${handle}` : "Account"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {handle && (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/u/${handle}`}>Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
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
