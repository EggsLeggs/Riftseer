import React, { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getRandomCard } from "../api";
import { useTheme } from "../hooks/useTheme";
import { Search, Shuffle, BookOpen, Layers, SlidersHorizontal, Sun, Moon } from "lucide-react";

export function Nav() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [loadingRandom, setLoadingRandom] = useState(false);

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

  const handleRandom = useCallback(async () => {
    setLoadingRandom(true);
    try {
      const card = await getRandomCard();
      if (card) {
        navigate(`/card/${card.id}`);
      }
    } finally {
      setLoadingRandom(false);
    }
  }, [navigate]);

  return (
    <nav className="bg-nav-bg text-nav-fg sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
        {/* Logo */}
        <Link
          to="/"
          className="text-lg font-bold tracking-tight text-white hover:no-underline shrink-0"
        >
          RiftSeer
        </Link>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards..."
            className="w-full h-8 pl-8 pr-3 rounded-md bg-nav-input-bg border border-nav-input-border text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>

        {/* Nav links */}
        <div className="flex items-center gap-1 shrink-0">
          <Link
            to="/search"
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-nav-fg hover:bg-white/10 hover:no-underline transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Advanced</span>
          </Link>
          <Link
            to="/syntax"
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-nav-fg hover:bg-white/10 hover:no-underline transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Syntax</span>
          </Link>
          <Link
            to="/sets"
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-nav-fg hover:bg-white/10 hover:no-underline transition-colors"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sets</span>
          </Link>
          <button
            onClick={handleRandom}
            disabled={loadingRandom}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-nav-fg hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Random</span>
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-md text-nav-fg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </nav>
  );
}
