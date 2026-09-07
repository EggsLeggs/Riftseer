import type { CardPurchaseUris, Printing } from "@riftseer/types";
import { ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEur, formatUsd, tcgplayerUsdPrice } from "./format";

/**
 * Where to buy this printing, with the price we last saw.
 *
 * The links come from `OracleDetail.purchase`, which the API has already
 * resolved through stored URI → product page → name search and rewritten for
 * affiliate attribution. Nothing here builds a marketplace URL: that resolution
 * lives once, in `packages/core`, and a browser-side copy of it would be a
 * second answer to the same question.
 */
export interface CardMarketLink {
  name: string;
  logoSrc: string;
  url: string;
  price: string;
}

/**
 * The marketplaces this printing can actually be bought at, with the price we
 * last saw. The panel below and the deck card menu both render exactly this
 * list, so a marketplace added here reaches both.
 */
export function cardMarketLinks(
  purchase: CardPurchaseUris,
  printing: Pick<Printing, "prices">,
): CardMarketLink[] {
  return [
    {
      name: "TCGPlayer",
      logoSrc: "/icons/markets/tcgplayer.png",
      url: purchase.tcgplayer,
      price: formatUsd(tcgplayerUsdPrice(printing.prices?.tcgplayer)),
    },
    {
      name: "Cardmarket",
      logoSrc: "/icons/markets/cardmarket.png",
      url: purchase.cardmarket,
      price: formatEur(printing.prices?.cardmarket?.normal),
    },
  ].filter((market): market is CardMarketLink => Boolean(market.url));
}

export function CardBuyLinks({
  purchase,
  printing,
  className,
}: {
  purchase: CardPurchaseUris;
  printing: Pick<Printing, "prices">;
  className?: string;
}) {
  const markets = cardMarketLinks(purchase, printing);

  if (markets.length === 0) return null;

  return (
    <section className={cn(className)}>
      <h2 className="text-muted-foreground mb-2 text-sm font-semibold tracking-wide uppercase">
        Buy
      </h2>
      <div className="flex flex-col gap-2">
        {markets.map((market) => (
          <Button
            key={market.name}
            variant="outline"
            size="sm"
            className="h-9 w-full justify-between gap-3 px-3"
            asChild
          >
            <a href={market.url} target="_blank" rel="noreferrer nofollow">
              <span className="inline-flex min-w-0 items-center gap-2">
                <img
                  src={market.logoSrc}
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 shrink-0"
                />
                {market.name}
              </span>
              <span className="inline-flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground tabular-nums">{market.price}</span>
                <ExternalLinkIcon className="size-3.5" />
              </span>
            </a>
          </Button>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Prices are provided for reference and may be out of date. Purchases through these links may
        earn Riftseer a commission.
      </p>
    </section>
  );
}
