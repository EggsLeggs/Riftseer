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

  const isUnavailable = /503|unavailable/i.test(error.message ?? "");

  return (
    <div className="container flex flex-col gap-4 py-16 max-w-lg">
      <h1 className="text-xl font-semibold">
        {isUnavailable ? "Profile unavailable" : "Couldn't load this profile"}
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {isUnavailable
          ? "The service is temporarily unavailable. Please try again in a moment."
          : "Something went wrong while loading this profile. Please try again."}
      </p>
      <Button variant="outline" className="w-fit" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
