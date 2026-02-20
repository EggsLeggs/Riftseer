import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { getCard, searchCards, apiUrl, getTCGPlayerPrice, type TCGPlayerPrice, type Card } from "../api";
import { CardTextRenderer } from "./CardTextRenderer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Badge } from "./ui/badge";
import { Download, Flag, ExternalLink, RotateCw, Copy } from "lucide-react";

/** Build a plain-text SEO description for a card. */
function buildCardSeoDescription(card: Card): string {
  const parts: string[] = [];

  if (card.domains && card.domains.length > 0) {
    parts.push(card.domains.join(", "));
  }

  const stats: string[] = [];
  if (card.cost != null) stats.push(`${card.cost} Energy`);
  if (card.power != null) stats.push(`${card.power} Power`);
  if (stats.length > 0) parts.push(stats.join(", "));

  if (card.typeLine && card.supertype) {
    parts.push(`${card.typeLine} — ${card.supertype}`);
  } else if (card.typeLine) {
    parts.push(card.typeLine);
  } else if (card.supertype) {
    parts.push(card.supertype);
  }

  const rawEffect = (card.effect ?? card.text ?? "")
    .replace(/:[a-z_]+:/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (rawEffect) parts.push(rawEffect);

  if (card.artist) parts.push(`Illustrated by ${card.artist}`);

  parts.push("Riftbound TCG");

  return parts.join(" • ");
}

/** Build a CardMarket exact-match search URL for a Riftbound card. */
function cardMarketUrl(name: string): string {
  const params = new URLSearchParams({
    searchMode: "v2",
    idCategory: "0",
    idExpansion: "0",
    searchString: `[${name}]`,
    exactMatch: "on",
    idRarity: "0",
    perSite: "30",
  });
  return `https://www.cardmarket.com/en/Riftbound/Products/Search?${params.toString()}`;
}

const TCGPLAYER_PRODUCT_LINE = "riftbound-league-of-legends-trading-card-game";

function tcgPlayerSearchUrl(name: string): string {
  const params = new URLSearchParams({
    q: name,
    view: "grid",
    direct: "true",
    productLineName: TCGPLAYER_PRODUCT_LINE,
    setName: "product",
  });
  return `https://www.tcgplayer.com/search/riftbound/product?${params.toString()}`;
}

/** Direct TCGPlayer product page when we have the product ID. */
function tcgPlayerProductUrl(tcgplayerId: string): string {
  return `https://www.tcgplayer.com/product/${tcgplayerId}`;
}

function tcgPlayerUrlForCard(
  card: Card,
  usdPrices: Record<string, TCGPlayerPrice>,
): string {
  if (card.tcgplayerId) return tcgPlayerProductUrl(card.tcgplayerId);
  return usdPrices[card.name]?.url ?? tcgPlayerSearchUrl(card.name);
}

/** Copy URL to clipboard; show "Copied" feedback. */
function CopyLink({
  url,
  title = "Copy link",
  ariaLabel = "Copy link",
}: {
  url: string;
  title?: string;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
        title={title}
        aria-label={ariaLabel}
      >
        <Copy className="w-3 h-3" />
      </button>
      {copied && <span className="text-xs text-muted-foreground">Copied</span>}
    </span>
  );
}

/** Extract unique token names from ability/effect text (e.g. "3 Sprite unit token" → "Sprite"). */
function parseTokenMentions(text: string): string[] {
  if (!text?.trim()) return [];
  const names = new Set<string>();
  const re = /\b(\w+)\s+unit\s+token\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    names.add(m[1]);
  }
  return Array.from(names);
}

export function CardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [card, setCard] = useState<Card | null>(null);
  const [printings, setPrintings] = useState<Card[]>([]);
  const [tokens, setTokens] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotated, setRotated] = useState(false);
  const [usdPrices, setUsdPrices] = useState<Record<string, TCGPlayerPrice>>({});

  useEffect(() => {
    setRotated(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getCard(id)
      .then((c) => {
        setCard(c);
        if (c) {
          searchCards(c.name, { limit: 50 }).then((res) => {
            setPrintings(res.cards);
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!card) {
      setTokens([]);
      return;
    }
    const combined = [card.text, card.effect].filter(Boolean).join("\n");
    const names = parseTokenMentions(combined);
    if (names.length === 0) {
      setTokens([]);
      return;
    }
    Promise.all(
      names.map((name) =>
        searchCards(name, { limit: 5, fuzzy: true }).then((res) => {
          const tokenCard =
            res.cards.find((c) => c.supertype?.toLowerCase() === "token") ??
            res.cards[0];
          return tokenCard ?? null;
        })
      )
    ).then((cards) => {
      const list = cards.filter((c): c is Card => c != null);
      const byId = new Map(list.map((c) => [c.id, c]));
      setTokens(Array.from(byId.values()));
    });
  }, [card?.id, card?.text, card?.effect]);

  // Fetch USD prices from TCGPlayer (via tcgcsv.com) for all unique card names in the tables
  useEffect(() => {
    if (!card) return;
    const names = new Set<string>([card.name, ...printings.map((p) => p.name), ...tokens.map((t) => t.name)]);
    for (const name of names) {
      getTCGPlayerPrice(name).then((price) => {
        setUsdPrices((prev) => ({ ...prev, [name]: price }));
      });
    }
  }, [card?.name, printings, tokens]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center text-muted-foreground">
        Loading card...
      </div>
    );
  }

  if (!card) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
        <h2 className="text-xl font-semibold mb-2">Card not found</h2>
        <p className="text-muted-foreground">
          The card you're looking for doesn't exist.{" "}
          <Link to="/" className="text-primary hover:underline">
            Go home
          </Link>
        </p>
      </div>
    );
  }

  const seoDescription = buildCardSeoDescription(card);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <title>{card.name} — RiftSeer</title>
      <meta name="description" content={seoDescription} />
      <meta property="og:title" content={card.name} />
      <meta property="og:description" content={seoDescription} />
      <meta property="og:type" content="product" />
      {card.imageUrl && <meta property="og:image" content={card.imageUrl} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={card.name} />
      <meta name="twitter:description" content={seoDescription} />
      {card.imageUrl && <meta name="twitter:image" content={card.imageUrl} />}
      <meta property="og:url" content={`${window.location.origin}${location.pathname}${location.search}`} />

      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground mb-4">
        <Link to="/" className="hover:underline">Home</Link>
        {card.setName && (
          <>
            {" › "}
            <Link to={`/search?q=&set=${card.setCode}`} className="hover:underline">
              {card.setName}
            </Link>
          </>
        )}
        {" › "}
        <span className="text-foreground">{card.name}</span>
      </div>

      {/* Main layout: image + info + printings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Card image: natural orientation by default, with rotate button */}
        <div className="lg:col-span-3">
          {(() => {
            const isLandscape =
              card.orientation === "landscape" || card.orientation === "horizontal";
            const showAsLandscape = isLandscape !== rotated;
            const containerAspect = showAsLandscape ? "aspect-3/2" : "aspect-2/3";
            const needsRotate =
              (showAsLandscape && !isLandscape) || (!showAsLandscape && isLandscape);
            const rotateClass = needsRotate
              ? showAsLandscape
                ? "rotate-90"
                : "-rotate-90"
              : "";
            const wrapperSizeClass = showAsLandscape ? "w-2/3 h-[150%]" : "w-[150%] h-2/3";
            const transitionClass = "transition-transform duration-300 ease-in-out";
            return card.imageUrl ? (
              <div className="space-y-2">
                <div
                  className={`w-full max-w-[300px] ${containerAspect} overflow-hidden relative rounded-xl shadow-lg mx-auto lg:mx-0 transition-[aspect-ratio] duration-300 ease-in-out`}
                >
                  {isLandscape ? (
                    showAsLandscape ? (
                      /* Landscape card in landscape view: show image directly so full art fits, no crop */
                      <img
                        src={card.imageUrl}
                        alt={card.name}
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    ) : (
                      /* Landscape card in portrait view: rotated wrapper to stand card upright */
                      <div
                        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-center flex items-center justify-center ${wrapperSizeClass} ${rotateClass} ${transitionClass}`}
                      >
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )
                  ) : (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                {isLandscape && (
                  <button
                    type="button"
                    onClick={() => setRotated((r) => !r)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    title="Rotate card"
                  >
                    <RotateCw className="w-4 h-4" />
                    Rotate
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full max-w-[300px] aspect-2/3 bg-muted rounded-xl flex items-center justify-center mx-auto lg:mx-0">
                <span className="text-muted-foreground">{card.name}</span>
              </div>
            );
          })()}
        </div>

        {/* Card details table */}
        <div className="lg:col-span-5">
          <Table>
            <TableBody>
              {/* Name & Cost */}
              <TableRow>
                <TableCell className="font-semibold w-1/3 text-muted-foreground">
                  Name
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-lg">{card.name}</span>
                    <span className="inline-flex items-center gap-1">
                      {card.cost != null && (
                        <span
                          className={`icon-energy-value${card.typeLine?.toLowerCase() === "gear" ? " icon-energy-gear" : ""}`}
                          data-value={card.cost}
                          aria-label={`${card.cost} energy`}
                        />
                      )}
                      {card.power != null && (
                        <span className="flex items-center gap-0.5">
                          <span className="icon-power" />
                          <span className="font-semibold">{card.power}</span>
                        </span>
                      )}
                    </span>
                  </div>
                </TableCell>
              </TableRow>

              {/* Type */}
              <TableRow>
                <TableCell className="font-semibold text-muted-foreground">
                  Type
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 flex-wrap">
                    {(() => {
                      const tl = card.typeLine?.toLowerCase();
                      const st = card.supertype?.toLowerCase();
                      const typePrefixesSubtype = (tl === "unit" || tl === "basic") && card.supertype;
                      const supertypePrefixesSubtype = (st === "token" || st === "basic") && card.typeLine;
                      if (supertypePrefixesSubtype && card.typeLine) {
                        const subtypeIcon = card.typeLine.toLowerCase() === "token" ? "unit" : card.typeLine.toLowerCase();
                        return (
                          <>
                            <span className={`icon-${subtypeIcon}`} aria-hidden style={{ width: "1.1em", height: "1.1em" }} />
                            <span>{card.supertype} {card.typeLine}</span>
                          </>
                        );
                      }
                      if (typePrefixesSubtype && card.typeLine) {
                        return (
                          <>
                            <span className={`icon-${tl}`} aria-hidden style={{ width: "1.1em", height: "1.1em" }} />
                            <span>{card.typeLine} — {card.supertype}</span>
                          </>
                        );
                      }
                      return (
                        <>
                          {card.supertype && (
                            <>
                              <span className={`icon-${card.supertype.toLowerCase()}`} aria-hidden style={{ width: "1.1em", height: "1.1em" }} />
                              <span className="text-primary font-medium">{card.supertype}</span>
                            </>
                          )}
                          {card.typeLine && (
                            <>
                              <span
                                className={`icon-${card.typeLine.toLowerCase() === "token" ? "unit" : card.typeLine.toLowerCase()}`}
                                aria-hidden
                                style={{ width: "1.1em", height: "1.1em" }}
                              />
                              <span>{card.typeLine.toLowerCase() === "token" ? "Token Unit" : card.typeLine}</span>
                            </>
                          )}
                        </>
                      );
                    })()}
                    {!card.supertype && !card.typeLine && "—"}
                    {card.domains && card.domains.length > 0 && (
                      <span className="inline-flex items-center gap-1 ml-0.5" title={card.domains.join(", ")}>
                        {card.domains.map((d) => {
                          const key = d.toLowerCase();
                          const cls = `icon-rune-${key}-glyph`;
                          return <span key={d} className={cls} aria-label={d} style={{ width: "1.25em", height: "1.25em" }} />;
                        })}
                      </span>
                    )}
                  </span>
                </TableCell>
              </TableRow>

              {/* Tags — only show when card has tags */}
              {card.tags && card.tags.length > 0 && (
                <TableRow>
                  <TableCell className="font-semibold text-muted-foreground">
                    Tags
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap gap-1">
                      {card.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                </TableRow>
              )}

              {/* Ability / Rules text — only show when there is ability text */}
              {card.text?.trim() && (
                <TableRow>
                  <TableCell className="font-semibold text-muted-foreground align-top">
                    Ability
                  </TableCell>
                  <TableCell>
                    <CardTextRenderer text={card.text} />
                  </TableCell>
                </TableRow>
              )}

              {/* Effect (e.g. Equipment bonus while equipped) */}
              {"effect" in card && card.effect != null && card.effect !== "" && (
                <TableRow>
                  <TableCell className="font-semibold text-muted-foreground align-top">
                    Effect
                  </TableCell>
                  <TableCell>
                    <CardTextRenderer text={card.effect} />
                  </TableCell>
                </TableRow>
              )}

              {/* Might — only show when card has might */}
              {card.might != null && (
                <TableRow>
                  <TableCell className="font-semibold text-muted-foreground">
                    Might
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <span className="icon-might" />
                      {card.might}
                    </span>
                  </TableCell>
                </TableRow>
              )}

              {/* Artist */}
              <TableRow>
                <TableCell className="font-semibold text-muted-foreground">
                  Artist
                </TableCell>
                <TableCell>
                  {card.artist ? (
                    <span className="flex items-center gap-1">
                      <span className="icon-artist" />
                      {card.artist}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>

              {/* Rarity */}
              <TableRow>
                <TableCell className="font-semibold text-muted-foreground">
                  Rarity
                </TableCell>
                <TableCell>
                  {card.rarity ? (
                    <Badge variant="secondary" className="gap-1">
                      <span className={`icon-rarity icon-rarity-${card.rarity?.toLowerCase()}`} />
                      {card.rarity}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>

            </TableBody>
          </Table>
        </div>

        {/* Tokens + Prints in same column */}
        <div className="lg:col-span-4 space-y-4">
          {/* Tokens table — tokens mentioned in this card’s ability/effect */}
          {tokens.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tokens
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Set</TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Rarity</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead className="text-right">EUR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((t) => {
                      let displayNumber = t.collectorNumber ?? "—";
                      if (t.collectorNumber && (t.signature || t.alternateArt)) {
                        displayNumber = t.signature
                          ? `${t.collectorNumber}★`
                          : `${t.collectorNumber}a`;
                      }
                      const fullSetName = t.setName ?? t.setCode ?? "Unknown";
                      const setLabel = t.setCode && fullSetName !== t.setCode ? `${fullSetName} (${t.setCode})` : fullSetName;
                      return (
                        <TableRow
                          key={t.id}
                          className="cursor-pointer hover:bg-muted/50"
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/card/${t.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate(`/card/${t.id}`);
                            }
                          }}
                        >
                          <TableCell className="text-xs font-semibold text-foreground">
                            {setLabel}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {displayNumber}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.rarity ? (
                              <span className="inline-flex items-center gap-1">
                                <span className={`icon-rarity icon-rarity-${t.rarity.toLowerCase()}`} />
                                {t.rarity}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {!(t.name in usdPrices) ? (
                              <span className="text-muted-foreground">…</span>
                            ) : usdPrices[t.name].usdMarket != null ? (
                              <a
                                href={tcgPlayerUrlForCard(t, usdPrices)}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-primary hover:underline"
                              >
                                ${usdPrices[t.name].usdMarket!.toFixed(2)}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <a
                              href={cardMarketUrl(t.name)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="View on CardMarket"
                            >
                              <ExternalLink className="w-3 h-3" />
                              CM
                            </a>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {/* Printings table */}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Prints
          </h3>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Set</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead>Rarity</TableHead>
                  <TableHead className="text-right">USD</TableHead>
                  <TableHead className="text-right">EUR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printings.length > 0 ? (
                  printings.map((p) => {
                    const isCurrent = p.id === id;
                    let displayNumber = p.collectorNumber ?? "—";
                    if (p.collectorNumber && (p.signature || p.alternateArt)) {
                      displayNumber = p.signature
                        ? `${p.collectorNumber}★`
                        : `${p.collectorNumber}a`;
                    }
                    const fullSetName = p.setName ?? p.setCode ?? "Unknown";
                    const setLabel = p.setCode && fullSetName !== p.setCode ? `${fullSetName} (${p.setCode})` : fullSetName;
                    return (
                      <TableRow
                        key={p.id}
                        className={isCurrent ? "bg-primary/10 font-medium" : "cursor-pointer hover:bg-muted/50"}
                        role={isCurrent ? undefined : "button"}
                        tabIndex={isCurrent ? undefined : 0}
                        onClick={isCurrent ? undefined : () => navigate(`/card/${p.id}`)}
                        onKeyDown={
                          isCurrent
                            ? undefined
                            : (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  navigate(`/card/${p.id}`);
                                }
                              }
                        }
                      >
                        <TableCell className="text-xs font-semibold text-foreground">
                          {setLabel}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {displayNumber}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.rarity ? (
                            <span className="inline-flex items-center gap-1">
                              <span className={`icon-rarity icon-rarity-${p.rarity.toLowerCase()}`} />
                              {p.rarity}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {!(p.name in usdPrices) ? (
                            <span className="text-muted-foreground">…</span>
                          ) : usdPrices[p.name].usdMarket != null ? (
                            <a
                              href={tcgPlayerUrlForCard(p, usdPrices)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                            >
                              ${usdPrices[p.name].usdMarket!.toFixed(2)}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            href={cardMarketUrl(p.name)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="View on CardMarket"
                          >
                            <ExternalLink className="w-3 h-3" />
                            CM
                          </a>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-4">
                      No other printings found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Extra tools */}
      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Extra Tools
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Buy this card */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Buy This Card</h4>
            <ul className="space-y-1">
              <li className="flex items-center gap-1">
                <a
                  href={tcgPlayerUrlForCard(card, usdPrices)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Buy on TCGplayer
                </a>
                <CopyLink
                  url={tcgPlayerUrlForCard(card, usdPrices)}
                  title="Copy TCGplayer link"
                  ariaLabel="Copy TCGplayer link"
                />
              </li>
              <li className="flex items-center gap-1">
                <a
                  href={cardMarketUrl(card.name)}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Buy on CardMarket
                </a>
                <CopyLink
                  url={cardMarketUrl(card.name)}
                  title="Copy link (paste in address bar if Card Market rate-limits)"
                  ariaLabel="Copy Card Market link"
                />
              </li>
            </ul>
          </div>

          {/* Images and data */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Images & Data</h4>
            <ul className="space-y-1">
              <li>
                <a
                  href={card.imageUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Download className="w-3 h-3" />
                  Download image
                </a>
              </li>
              <li>
                <a
                  href={apiUrl(`/api/cards/${card.id}/text`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Copy-pasteable text
                </a>
              </li>
              <li>
                <a
                  href={apiUrl(`/api/cards/${card.id}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Copy-pasteable JSON
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Flag className="w-3 h-3" />
                  Report card issue
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
