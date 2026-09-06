"use client";

import { useEffect } from "react";

import { CardApiError } from "@/features/cards/errors";

function friendlyMessage(error: Error & { digest?: string }): string {
  if (error instanceof CardApiError) {
    switch (error.code) {
      case "timeout":
        return "This is taking longer than usual. Try again in a moment.";
      case "network":
        return "We couldn't connect. Check your internet connection and try again.";
      case "http":
        return "We couldn't load this card right now. Please try again.";
      default:
        break;
    }
  }
  return "Something went wrong while loading this card. Please try again.";
}

export default function CardRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[card route]", error);
  }, [error]);

  const isTimeout =
    (error instanceof CardApiError && error.code === "timeout") ||
    /timed out/i.test(error.message ?? "");

  const title = isTimeout ? "Taking too long" : "Couldn't load this card";

  return (
    <div className="container flex max-w-lg flex-col gap-4 py-16">
      <h1 className="text-xl font-semibold text-foreground">
        {title}
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {friendlyMessage(error)}
      </p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Try refreshing the page or waiting a moment, then open the card again.
      </p>
      <button
        type="button"
        className="w-fit rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
