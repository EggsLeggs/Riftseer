"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function UserProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[user profile]", error);
  }, [error]);

  // API failures are handled by the page itself (see ProfileUnavailable) —
  // anything reaching this boundary is unexpected.
  return (
    <div className="container flex flex-col gap-4 py-16 max-w-lg">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this profile</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Something went wrong while loading this profile. Please try again.
      </p>
      <Button variant="outline" className="w-fit" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
