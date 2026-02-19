import React, { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search } from "lucide-react";

export function Home() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [query, navigate]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-2 tracking-tight">
        RiftSeer
      </h1>
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        Search every Riftbound card, across every set. Fast, free, and community-driven.
      </p>

      <form onSubmit={handleSearch} className="w-full max-w-lg">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search for cards, e.g. "Sun Disc" or "Poro"'
            autoFocus
            className="w-full h-12 pl-12 pr-4 rounded-lg border-2 border-border bg-card text-foreground text-base shadow-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to search &middot;{" "}
          <Link to="/syntax" className="hover:underline">
            Syntax guide
          </Link>
        </p>
      </form>

      <div className="flex gap-4 mt-8 text-sm">
        <Link
          to="/sets"
          className="text-primary hover:underline font-medium"
        >
          Browse sets
        </Link>
        <span className="text-border">|</span>
        <Link
          to="/syntax"
          className="text-primary hover:underline font-medium"
        >
          Search syntax
        </Link>
      </div>
    </div>
  );
}
