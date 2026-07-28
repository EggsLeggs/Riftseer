"use client";

import * as React from "react";
import { Share2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Shares the card via the native share sheet where available, falling back to
 * copying the URL. The URL is resolved on the client so previews and localhost
 * share their own origin rather than production.
 */
export function ShareButton({ title, path }: { title: string; path: string }) {
  const [pending, setPending] = React.useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    setPending(true);
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch (err) {
      // The user dismissing the native share sheet is not a failure.
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Couldn't share this card");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={share}
    >
      <Share2Icon aria-hidden="true" />
      Share
    </Button>
  );
}
