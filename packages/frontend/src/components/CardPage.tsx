import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
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
import { Download, Flag, ExternalLink, RotateCw } from "lucide-react";

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
  const [card, setCard] = useState<Card | null>(null);
  const [printings, setPrintings] = useState<Card[]>([]);
  const [tokens, setTokens] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotated, setRotated] = useState(false);

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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
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
        {/* Card image: natural orientation by default, with rotate button (Scryfall-style) */}
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
                        card.cost >= 1 && card.cost <= 5 ? (
                          <span
                            className={`icon-energy-${card.cost}${card.typeLine?.toLowerCase() === "gear" ? " icon-energy-gear" : ""}`}
                            aria-label={`${card.cost} energy`}
                          />
                        ) : (
                          <>
                            <span className="icon-energy" aria-hidden />
                            <span className="font-semibold">{card.cost}</span>
                          </>
                        )
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
                        <TableRow key={t.id}>
                          <TableCell colSpan={5} className="p-0">
                            <Link
                              to={`/card/${t.id}`}
                              className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] cursor-pointer items-center hover:bg-muted/50 [&>span]:px-2 [&>span]:py-2 [&>span]:text-xs [&>span:nth-child(4)]:text-right [&>span:nth-child(5)]:text-right"
                            >
                              <span className="font-semibold text-foreground">{setLabel}</span>
                              <span className="text-muted-foreground">{displayNumber}</span>
                              <span className="text-muted-foreground">
                                {t.rarity ? (
                                  <span className="inline-flex items-center gap-1">
                                    <span className={`icon-rarity icon-rarity-${t.rarity.toLowerCase()}`} />
                                    {t.rarity}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </span>
                              <span className="text-muted-foreground">—</span>
                              <span className="text-muted-foreground">—</span>
                            </Link>
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
                        <TableCell className="text-right text-xs text-muted-foreground">
                          —
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          —
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
              {["TCGplayer", "CardMarket"].map((shop) => (
                <li key={shop}>
                  <a
                    href="#"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Buy on {shop}
                  </a>
                </li>
              ))}
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
