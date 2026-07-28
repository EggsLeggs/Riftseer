import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { ThemeProvider } from "./hooks/useTheme";
import { Nav } from "./components/Nav";
import { Home } from "./components/Home";
import { SearchPage } from "./components/SearchPage";
import { CardPage } from "./components/CardPage";
import { SetsPage } from "./components/SetsPage";
import { SyntaxPage } from "./components/SyntaxPage";
import { TermsPage } from "./components/TermsPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { RedditBotInfoPage } from "./components/RedditBotInfoPage";

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col">
          <Nav />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/card/:id" element={<CardPage />} />
              <Route path="/sets" element={<SetsPage />} />
              <Route path="/syntax" element={<SyntaxPage />} />
              <Route path="/docs/reddit-bot" element={<RedditBotInfoPage />} />
              <Route path="/docs/terms" element={<TermsPage />} />
              <Route path="/docs/privacy" element={<PrivacyPage />} />
            </Routes>
          </main>
          <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
            <div className="max-w-6xl mx-auto px-4 space-y-1">
              <div>
                <Link to="/docs/terms" className="text-primary hover:underline">Terms of Service</Link>
                {" · "}
                <Link to="/docs/privacy" className="text-primary hover:underline">Privacy Policy</Link>
              </div>
              <div>
                Riftseer was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy using
                assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
              </div>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </ThemeProvider>
  );
}
