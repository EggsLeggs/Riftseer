"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settings]", error);
  }, [error]);

  return (
    <div className="container flex flex-col gap-4 py-16 max-w-lg">
      <h1 className="text-xl font-semibold">Couldn&apos;t load your settings</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Something went wrong while loading this page. Please try again.
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" className="w-fit" onClick={() => reset()}>
          Try again
        </Button>
        <Button variant="ghost" className="w-fit" asChild>
          <Link href="/settings">Back to settings</Link>
        </Button>
      </div>
    </div>
  );
}
