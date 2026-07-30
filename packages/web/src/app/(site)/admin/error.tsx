"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin]", error);
  }, [error]);

  return (
    <div className="flex max-w-lg flex-col gap-4 py-16">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this admin page</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Something went wrong. No changes were saved, so please try again.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="w-fit" onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="ghost" className="w-fit" asChild>
          <Link href="/admin">Back to admin</Link>
        </Button>
      </div>
    </div>
  );
}
