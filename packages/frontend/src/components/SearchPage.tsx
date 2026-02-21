import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { searchCards, type Card } from "../api";
import { Search } from "lucide-react";

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const q = searchParams.get("q") ?? "";
  const setParam = searchParams.get("set") ?? "";

  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [localQuery, setLocalQuery] = useState(q);

  useEffect(() => {
    setLocalQuery(q);
  }, [q]);

  // Name search: GET /search?q=...
  useEffect(() => {
    if (q) {
      setLoading(true);
      searchCards(q, { limit: 60, fuzzy: true })
        .then((res) => {
          setCards(res.cards);
          setTotal(res.count);
        })
        .finally(() => setLoading(false));
      return;
    }
    // Browse set: GET /search?set=OGN — list all cards in set, number-ordered
    if (setParam) {
      setLoading(true);
      searchCards("", { set: setParam, limit: 2000 })
        .then((res) => {
          setCards(res.cards);
          setTotal(res.count);
        })
        .finally(() => setLoading(false));
      return;
    }
    setCards([]);
    setTotal(0);
  }, [q, setParam]);

  // If exactly one result, go straight to that card's page
  useEffect(() => {
    if (!loading && cards.length === 1 && (q || setParam)) {
      navigate(`/card/${cards[0].id}`, { replace: true });
    }
  }, [loading, cards, q, setParam, navigate]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = localQuery.trim();
      if (trimmed) {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [localQuery, navigate]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <title>Search — RiftSeer</title>
      <meta name="description" content="Filter Riftbound cards on RiftSeer using options you specify." />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Search — RiftSeer" />
      <meta property="og:description" content="Filter Riftbound cards on RiftSeer using options you specify." />
      <meta property="og:url" content={window.location.href} />

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search cards..."
            className="w-full h-10 pl-9 pr-4 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </form>

      {q && (
        <p className="text-sm text-muted-foreground mb-4">
          {loading
            ? "Searching..."
            : `${total} result${total !== 1 ? "s" : ""} for "${q}"`}
        </p>
      )}

      {setParam && !q && (
        <p className="text-sm text-muted-foreground mb-4">
          {loading
            ? "Loading set..."
            : `Set ${setParam} — ${total} card${total !== 1 ? "s" : ""}`}
        </p>
      )}

      {!loading && cards.length === 0 && q && (
        <div className="text-center py-16">
          <p className="text-lg text-muted-foreground">No cards found for "{q}"</p>
          <p className="text-sm text-muted-foreground mt-2">
            Try a different search term or check the{" "}
            <Link to="/syntax" className="text-primary hover:underline">
              syntax guide
            </Link>
          </p>
        </div>
      )}

      {!loading && cards.length === 0 && setParam && !q && (
        <div className="text-center py-16">
          <p className="text-lg text-muted-foreground">No cards found in set {setParam}</p>
        </div>
      )}

      {/* Card grid: all cards shown vertical (landscape cards rotated into vertical slot) */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {cards.map((card) => {
            const isLandscape =
              card.media?.orientation === "landscape" || card.media?.orientation === "horizontal";
            return (
              <Link
                key={card.id}
                to={`/card/${card.id}`}
                className="card-grid-item block overflow-hidden hover:no-underline"
              >
                {card.media?.media_urls?.normal ? (
                  <div className="w-full aspect-2/3 overflow-hidden relative rounded-lg">
                    {isLandscape ? (
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-2/3 -rotate-90 origin-center">
                        <img
                          src={card.media.media_urls.normal}
                          alt={card.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <img
                        src={card.media.media_urls.normal}
                        alt={card.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>
                ) : (
                  <div className="w-full aspect-2/3 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-xs text-muted-foreground text-center px-2">
                      {card.name}
                    </span>
                  </div>
                )}
                <p className="text-xs text-center mt-1 text-foreground truncate">
                  {card.name}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
