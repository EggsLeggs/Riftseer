import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getCard, searchCards, type Card } from "../api";
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
import { Download, Flag, ExternalLink } from "lucide-react";

export function CardPage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [printings, setPrintings] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

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

  const strengthDisplay = [
    card.power != null ? `${card.power} Power` : null,
    card.might != null ? `${card.might} Might` : null,
  ]
    .filter(Boolean)
    .join(" / ");

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
        {/* Card image */}
        <div className="lg:col-span-3">
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name}
              className="w-full max-w-[300px] rounded-xl shadow-lg mx-auto lg:mx-0"
            />
          ) : (
            <div className="w-full max-w-[300px] aspect-2/3 bg-muted rounded-xl flex items-center justify-center mx-auto lg:mx-0">
              <span className="text-muted-foreground">{card.name}</span>
            </div>
          )}
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
                    {card.cost != null && (
                      <span className="inline-flex items-center gap-1">
                        <span className="icon-energy" />
                        <span className="font-semibold">{card.cost}</span>
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>

              {/* Type */}
              <TableRow>
                <TableCell className="font-semibold text-muted-foreground">
                  Type
                </TableCell>
                <TableCell>
                  {card.supertype && (
                    <span className="text-primary font-medium">{card.supertype} </span>
                  )}
                  {card.typeLine ?? "—"}
                  {card.domains && card.domains.length > 0 && (
                    <span className="text-muted-foreground">
                      {" — "}
                      {card.domains.join(", ")}
                    </span>
                  )}
                </TableCell>
              </TableRow>

              {/* Ability / Rules text */}
              <TableRow>
                <TableCell className="font-semibold text-muted-foreground align-top">
                  Ability
                </TableCell>
                <TableCell>
                  {card.text ? (
                    <CardTextRenderer text={card.text} />
                  ) : (
                    <span className="text-muted-foreground italic">No ability text</span>
                  )}
                </TableCell>
              </TableRow>

              {/* Strength */}
              <TableRow>
                <TableCell className="font-semibold text-muted-foreground">
                  Strength
                </TableCell>
                <TableCell>
                  {strengthDisplay ? (
                    <span className="flex items-center gap-2">
                      {card.power != null && (
                        <span className="flex items-center gap-1">
                          <span className="icon-power" />
                          {card.power}
                        </span>
                      )}
                      {card.might != null && (
                        <span className="flex items-center gap-1">
                          <span className="icon-might" />
                          {card.might}
                        </span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>

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

              {/* Bans */}
              <TableRow>
                <TableCell className="font-semibold text-muted-foreground">
                  Bans
                </TableCell>
                <TableCell className="text-muted-foreground italic">
                  None
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Printings table */}
        <div className="lg:col-span-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Prints
          </h3>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Set</TableHead>
                  <TableHead>#</TableHead>
                  <TableHead className="text-right">USD</TableHead>
                  <TableHead className="text-right">EUR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {printings.length > 0 ? (
                  printings.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          to={`/card/${p.id}`}
                          className="text-primary hover:underline text-xs"
                        >
                          {p.setName ?? p.setCode ?? "Unknown"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.collectorNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        —
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        —
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-4">
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
              {["TCGplayer", "CardMarket", "CoolStuffInc"].map((shop) => (
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
