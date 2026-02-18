import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Nav } from "./components/Nav";
import { Home } from "./components/Home";
import { SearchPage } from "./components/SearchPage";
import { CardPage } from "./components/CardPage";
import { SetsPage } from "./components/SetsPage";
import { SyntaxPage } from "./components/SyntaxPage";

// In dev, Bun serves static files at /public/; in production, at /
const basename = window.location.pathname.startsWith("/public") ? "/public" : "/";

function App() {
  return (
    <BrowserRouter basename={basename}>
      <div className="min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/card/:id" element={<CardPage />} />
            <Route path="/sets" element={<SetsPage />} />
            <Route path="/syntax" element={<SyntaxPage />} />
          </Routes>
        </main>
        <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
          <div className="max-w-6xl mx-auto px-4">
            RiftSeer is not affiliated with Riot Games. Riftbound and all related properties are trademarks of Riot Games.
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
