import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { getCard, searchCards, apiUrl, type Card } from "../api";
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
import { Download, Flag, ExternalLink, RotateCw, Copy, ImageOff } from "lucide-react";

/** Build a plain-text SEO description for a card. */
function buildCardSeoDescription(card: Card): string {
  const parts: string[] = [];

  if (card.classification?.domains && card.classification.domains.length > 0) {
    parts.push(card.classification.domains.join(", "));
  }

  const stats: string[] = [];
  if (card.attributes?.energy != null) stats.push(`${card.attributes.energy} Energy`);
  if (card.attributes?.power != null) stats.push(`${card.attributes.power} Power`);
  if (stats.length > 0) parts.push(stats.join(", "));

  const typeLine = card.classification?.type;
  const supertype = card.classification?.supertype;
  if (typeLine && supertype) {
    parts.push(`${typeLine} — ${supertype}`);
  } else if (typeLine) {
    parts.push(typeLine);
  } else if (supertype) {
    parts.push(supertype);
  }

  const rawEffect = (card.text?.plain ?? "")
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
const TCGPLAYER_HOSTS = new Set(["www.tcgplayer.com", "tcgplayer.com"]);
const CARDMARKET_HOSTS = new Set(["www.cardmarket.com", "cardmarket.com"]);

const RARITIES_WITH_ICONS = new Set(["common", "showcase", "uncommon", "rare", "epic", "legendary"]);

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

function validateMarketplaceUrl(url: string | undefined, allowedHosts: Set<string>): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    return allowedHosts.has(host) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function tcgPlayerUrlForCard(card: Card): string {
  const validatedPurchaseUrl = validateMarketplaceUrl(card.purchase_uris?.tcgplayer, TCGPLAYER_HOSTS);
  if (validatedPurchaseUrl) return validatedPurchaseUrl;
  const tcgplayerId = card.external_ids?.tcgplayer_id;
  if (tcgplayerId) return tcgPlayerProductUrl(tcgplayerId);
  return tcgPlayerSearchUrl(card.name);
}

function cardMarketUrlForCard(card: Card): string {
  return validateMarketplaceUrl(card.purchase_uris?.cardmarket, CARDMARKET_HOSTS) ?? cardMarketUrl(card.name);
}

/** True when keydown came from an interactive control inside the row (not the row itself). */
function isFromInteractiveTableRowDescendant(e: React.KeyboardEvent<HTMLTableRowElement>): boolean {
  const row = e.currentTarget;
  const target = (e.nativeEvent.target ?? e.target) as Node | null;
  if (!(target instanceof Element)) return false;
  if (target === row) return false;
  const interactive = target.closest(
    'a, button, input, textarea, select, [role="button"], [role="link"]',
  );
  return interactive != null && row.contains(interactive);
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
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.debug("Copy to clipboard failed", err);
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

/** Extract unique token names from ability text (e.g. "3 Sprite unit token" → "Sprite"). */
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
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setRotated(false);
    setImageFailed(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getCard(id)
      .then(async (c) => {
        if (cancelled) return;
        setCard(c);
        if (!c) return;
        const relatedIds = c.related_printings.map((rp) => rp.id);
        if (relatedIds.length > 0) {
          const settled: PromiseSettledResult<Card | null>[] = [];
          for (let i = 0; i < relatedIds.length; i += 4) {
            const chunk = relatedIds.slice(i, i + 4);
            settled.push(...(await Promise.allSettled(chunk.map((rpId) => getCard(rpId)))));
          }
          if (cancelled) return;
          const others = settled
            .filter((s): s is PromiseFulfilledResult<Card | null> => s.status === "fulfilled")
            .map((s) => s.value)
            .filter((r): r is Card => r != null);
          const all = [c, ...others];
          const getPrintingTime = (card: Card): number => {
            const s = card.set?.published_on ?? card.released_at;
            if (!s) return Infinity;
            const t = new Date(s).getTime();
            return isNaN(t) ? Infinity : t;
          };
          all.sort((a, b) => {
            const ta = getPrintingTime(a), tb = getPrintingTime(b);
            if (ta !== tb) return ta - tb;
            return (a.collector_number ?? "").localeCompare(b.collector_number ?? "", undefined, { numeric: true })
              || a.id.localeCompare(b.id);
          });
          setPrintings(all);
        } else {
          if (cancelled) return;
          setPrintings([c]);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load card", err);
        setCard(null);
        setPrintings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!card) {
      setTokens([]);
      return;
    }
    const combined = [card.text?.plain].filter(Boolean).join("\n");
    const names = parseTokenMentions(combined);
    if (names.length === 0) {
      setTokens([]);
      return;
    }
    Promise.all(
      names.map((name) =>
        searchCards(name, { limit: 5, fuzzy: true }).then((res) => {
          const tokenCard =
            res.cards.find((c) => c.is_token) ??
            res.cards[0];
          return tokenCard ?? null;
        })
      )
    ).then((cards) => {
      const list = cards.filter((c): c is Card => c != null);
      const byId = new Map(list.map((c) => [c.id, c]));
      setTokens(Array.from(byId.values()));
    });
  }, [card?.id, card?.text?.plain]);


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

  const imageUrl = card.media?.media_urls?.normal;
  const orientation = card.media?.orientation;
  const typeLine = card.classification?.type;
  const supertype = card.classification?.supertype;
  const rarity = card.classification?.rarity;
  const domains = card.classification?.domains;
  const tags = card.classification?.tags;
  const energy = card.attributes?.energy;
  const might = card.attributes?.might;
  const power = card.attributes?.power;
  const setCode = card.set?.set_code;
  const setName = card.set?.set_name;
  const collectorNumber = card.collector_number;
  const alternateArt = card.metadata?.alternate_art;
  const signature = card.metadata?.signature;

  const seoDescription = buildCardSeoDescription(card);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <title>{card.name} — Riftseer</title>
      <meta name="description" content={seoDescription} />
      <meta property="og:title" content={card.name} />
      <meta property="og:description" content={seoDescription} />
      <meta property="og:type" content="product" />
      {imageUrl && <meta property="og:image" content={imageUrl} />}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={card.name} />
      <meta name="twitter:description" content={seoDescription} />
      {imageUrl && <meta name="twitter:image" content={imageUrl} />}
      <meta property="og:url" content={`${window.location.origin}${location.pathname}${location.search}`} />

      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground mb-4">
        <Link to="/" className="hover:underline">Home</Link>
        {setName && (
          <>
            {" › "}
            <Link to={`/search?q=&set=${setCode}`} className="hover:underline">
              {setName}
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
              orientation === "landscape" || orientation === "horizontal";
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
            const onImgError = () => setImageFailed(true);
            return imageUrl && !imageFailed ? (
              <div className="space-y-2">
                <div
                  className={`w-full max-w-[300px] ${containerAspect} overflow-hidden relative rounded-xl shadow-lg mx-auto lg:mx-0 transition-[aspect-ratio] duration-300 ease-in-out`}
                >
                  {isLandscape ? (
                    showAsLandscape ? (
                      <img
                        src={imageUrl}
                        alt={card.name}
                        fetchPriority="high"
                        decoding="async"
                        onError={onImgError}
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    ) : (
                      <div
                        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 origin-center flex items-center justify-center ${wrapperSizeClass} ${rotateClass} ${transitionClass}`}
                      >
                        <img
                          src={imageUrl}
                          alt={card.name}
                          fetchPriority="high"
                          decoding="async"
                          onError={onImgError}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )
                  ) : (
                    <img
                      src={imageUrl}
                      alt={card.name}
                      fetchPriority="high"
                      decoding="async"
                      onError={onImgError}
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
              <div className="w-full max-w-[300px] aspect-2/3 bg-muted rounded-xl flex flex-col items-center justify-center gap-2 mx-auto lg:mx-0">
                <ImageOff className="w-8 h-8 text-muted-foreground/60" />
                <span className="text-sm text-muted-foreground">Image coming soon</span>
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
                      {energy != null && (
                        <span
                          className={`icon-energy-value${typeLine?.toLowerCase() === "gear" ? " icon-energy-gear" : ""}`}
                          data-value={energy}
                          aria-label={`${energy} energy`}
                        />
                      )}
                      {power != null && (
                        <span className="flex items-center gap-0.5">
                          <span className="icon-power" />
                          <span className="font-semibold">{power}</span>
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
                      const tl = typeLine?.toLowerCase();
                      const st = supertype?.toLowerCase();
                      const typePrefixesSubtype = (tl === "unit" || tl === "basic") && supertype;
                      const supertypePrefixesSubtype = (st === "token" || st === "basic") && typeLine;
                      if (supertypePrefixesSubtype && typeLine) {
                        const subtypeIcon = typeLine.toLowerCase() === "token" ? "unit" : typeLine.toLowerCase();
                        return (
                          <>
                            <span className={`icon-${subtypeIcon}`} aria-hidden style={{ width: "1.1em", height: "1.1em" }} />
                            <span>{supertype} {typeLine}</span>
                          </>
                        );
                      }
                      if (typePrefixesSubtype && typeLine) {
                        return (
                          <>
                            <span className={`icon-${tl}`} aria-hidden style={{ width: "1.1em", height: "1.1em" }} />
                            <span>{typeLine} — {supertype}</span>
                          </>
                        );
                      }
                      return (
                        <>
                          {supertype && (
                            <>
                              <span className={`icon-${supertype.toLowerCase()}`} aria-hidden style={{ width: "1.1em", height: "1.1em" }} />
                              <span className="text-primary font-medium">{supertype}</span>
                            </>
                          )}
                          {typeLine && (
                            <>
                              <span
                                className={`icon-${typeLine.toLowerCase() === "token" ? "unit" : typeLine.toLowerCase()}`}
                                aria-hidden
                                style={{ width: "1.1em", height: "1.1em" }}
                              />
                              <span>{typeLine.toLowerCase() === "token" ? "Token Unit" : typeLine}</span>
                            </>
                          )}
                        </>
                      );
                    })()}
                    {!supertype && !typeLine && "—"}
                    {domains && domains.length > 0 && (
                      <span className="inline-flex items-center gap-1 ml-0.5" title={domains.join(", ")}>
                        {domains.map((d) => {
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
              {tags && tags.length > 0 && (
                <TableRow>
                  <TableCell className="font-semibold text-muted-foreground">
                    Tags
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                </TableRow>
              )}

              {/* Ability / Rules text — only show when there is ability text */}
              {card.text?.plain?.trim() && (
                <TableRow>
                  <TableCell className="font-semibold text-muted-foreground align-top">
                    Ability
                  </TableCell>
                  <TableCell>
                    <CardTextRenderer text={card.text.plain} />
                  </TableCell>
                </TableRow>
              )}

              {/* Might — only show when card has might */}
              {might != null && (
                <TableRow>
                  <TableCell className="font-semibold text-muted-foreground">
                    Might
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <span className="icon-might" />
                      {might}
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
                  {rarity ? (
                    <Badge variant="secondary" className={RARITIES_WITH_ICONS.has(rarity.toLowerCase()) ? "gap-1" : ""}>
                      {RARITIES_WITH_ICONS.has(rarity.toLowerCase()) && (
                        <span className={`icon-rarity icon-rarity-${rarity.toLowerCase()}`} />
                      )}
                      {rarity}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>

              {/* Data sources */}
              {(() => {
                const sources: { name: string; url?: string }[] = [];
                if (card.external_ids?.riftcodex_id) {
                  sources.push({ name: "RiftCodex" });
                }
                if (card.external_ids?.tcgplayer_id || card.purchase_uris?.tcgplayer) {
                  sources.push({
                    name: "TCGPlayer",
                    url: tcgPlayerUrlForCard(card),
                  });
                }
                if (sources.length === 0) return null;
                return (
                  <TableRow>
                    <TableCell className="font-semibold text-muted-foreground">
                      Sources
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex flex-wrap gap-1.5">
                        {sources.map((s) =>
                          s.url ? (
                            <a
                              key={s.name}
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1"
                            >
                              <Badge variant="outline" className="font-normal hover:bg-muted">
                                {s.name}
                                <ExternalLink className="w-3 h-3 ml-0.5" />
                              </Badge>
                            </a>
                          ) : (
                            <Badge key={s.name} variant="outline" className="font-normal">
                              {s.name}
                            </Badge>
                          )
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })()}

            </TableBody>
          </Table>
        </div>

        {/* Prints + Tokens in same column */}
        <div className="lg:col-span-4 space-y-4">
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
                  <TableHead className="text-right">CM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printings.length > 0 ? (
                  printings.map((p) => {
                    const isCurrent = p.id === id;
                    const pCollector = p.collector_number;
                    const pSig = p.metadata?.signature;
                    const pAlt = p.metadata?.alternate_art;
                    let displayNumber = pCollector ?? "—";
                    if (pCollector && (pSig || pAlt)) {
                      displayNumber = pSig
                        ? `${pCollector}★`
                        : `${pCollector}a`;
                    }
                    const fullSetName = p.set?.set_name ?? p.set?.set_code ?? "Unknown";
                    const pSetCode = p.set?.set_code;
                    const setLabel = pSetCode && fullSetName !== pSetCode ? `${fullSetName} (${pSetCode})` : fullSetName;
                    const pRarity = p.classification?.rarity;
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
                                if (e.key !== "Enter" && e.key !== " ") return;
                                if (isFromInteractiveTableRowDescendant(e)) return;
                                e.preventDefault();
                                navigate(`/card/${p.id}`);
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
                          {pRarity ? (
                            <span className={RARITIES_WITH_ICONS.has(pRarity.toLowerCase()) ? "inline-flex items-center gap-1" : ""}>
                              {RARITIES_WITH_ICONS.has(pRarity.toLowerCase()) && (
                                <span className={`icon-rarity icon-rarity-${pRarity.toLowerCase()}`} />
                              )}
                              {pRarity}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {p.prices?.tcgplayer?.normal != null ? `$${p.prices.tcgplayer.normal.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            href={cardMarketUrlForCard(p)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            title="View on CardMarket"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {p.prices?.cardmarket?.normal != null ? `€${p.prices.cardmarket.normal.toFixed(2)}` : "CM"}
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

          {/* Champion / Legend links */}
          {(() => {
            const type = card.classification?.type?.toLowerCase();
            const supertype = card.classification?.supertype?.toLowerCase();
            const relatedCards =
              type === "legend"
                ? card.related_champions
                : supertype === "champion"
                  ? card.related_legends
                  : [];
            const header =
              type === "legend"
                ? "Champions"
                : supertype === "champion"
                  ? "Legends"
                  : null;
            const dedupedCards = Array.from(
              new Map(relatedCards.map((rc) => [rc.name, rc])).values()
            );
            if (!dedupedCards.length || !header) return null;
            return (
              <>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {header}
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dedupedCards.map((rc) => (
                        <TableRow
                          key={rc.id}
                          className="cursor-pointer hover:bg-muted/50"
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/card/${rc.id}`)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            if (isFromInteractiveTableRowDescendant(e)) return;
                            e.preventDefault();
                            navigate(`/card/${rc.id}`);
                          }}
                        >
                          <TableCell className="text-xs font-semibold text-foreground">
                            {rc.name}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            );
          })()}

          {/* Tokens table */}
          {tokens.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tokens
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Rarity</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead className="text-right">CM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((t) => {
                      const tCollector = t.collector_number;
                      const tSig = t.metadata?.signature;
                      const tAlt = t.metadata?.alternate_art;
                      let displayNumber = tCollector ?? "—";
                      if (tCollector && (tSig || tAlt)) {
                        displayNumber = tSig
                          ? `${tCollector}★`
                          : `${tCollector}a`;
                      }
                      const tRarity = t.classification?.rarity;
                      return (
                        <TableRow
                          key={t.id}
                          className="cursor-pointer hover:bg-muted/50"
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(`/card/${t.id}`)}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            if (isFromInteractiveTableRowDescendant(e)) return;
                            e.preventDefault();
                            navigate(`/card/${t.id}`);
                          }}
                        >
                          <TableCell className="text-xs font-semibold text-foreground">
                            {t.name}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {displayNumber}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {tRarity ? (
                              <span className={RARITIES_WITH_ICONS.has(tRarity.toLowerCase()) ? "inline-flex items-center gap-1" : ""}>
                                {RARITIES_WITH_ICONS.has(tRarity.toLowerCase()) && (
                                  <span className={`icon-rarity icon-rarity-${tRarity.toLowerCase()}`} />
                                )}
                                {tRarity}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {t.prices?.tcgplayer?.normal != null ? `$${t.prices.tcgplayer.normal.toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <a
                              href={cardMarketUrlForCard(t)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              title="View on CardMarket"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {t.prices?.cardmarket?.normal != null ? `€${t.prices.cardmarket.normal.toFixed(2)}` : "CM"}
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
            {card.prices && (
              <p className="text-xs text-muted-foreground mb-2">
                {[
                  card.prices.tcgplayer?.normal != null && `$${card.prices.tcgplayer.normal.toFixed(2)}`,
                  card.prices.tcgplayer?.foil != null && `$${card.prices.tcgplayer.foil.toFixed(2)} foil`,
                  card.prices.cardmarket?.normal != null && `€${card.prices.cardmarket.normal.toFixed(2)}`,
                  card.prices.cardmarket?.foil != null && `€${card.prices.cardmarket.foil.toFixed(2)} foil`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <ul className="space-y-1">
              <li className="flex items-center gap-1">
                <a
                  href={tcgPlayerUrlForCard(card)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Buy on TCGplayer
                </a>
                <CopyLink
                  url={tcgPlayerUrlForCard(card)}
                  title="Copy TCGplayer link"
                  ariaLabel="Copy TCGplayer link"
                />
              </li>
              <li className="flex items-center gap-1">
                <a
                  href={cardMarketUrlForCard(card)}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  Buy on CardMarket
                </a>
                <CopyLink
                  url={cardMarketUrlForCard(card)}
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
                  href={imageUrl ?? "#"}
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
                  href={apiUrl(`/api/v1/cards/${card.id}/text`)}
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
                  href={apiUrl(`/api/v1/cards/${card.id}`)}
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
