import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deckHref, type DeckLike } from "../paths";

/** Shared by the guide and the revision history — same control, same words. */
export function DeckReturnButton({ deck }: { deck: DeckLike }) {
  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" asChild>
      <Link href={deckHref(deck)}>
        <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
        Return to deck
      </Link>
    </Button>
  );
}
