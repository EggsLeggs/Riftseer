import React from "react";
import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { apiUrl } from "../api";

export function SyntaxPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <title>Search Reference — RiftSeer</title>
      <meta name="description" content="RiftSeer includes a large set of keywords and expressions used to find Riftbound cards." />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Search Reference — RiftSeer" />
      <meta property="og:description" content="RiftSeer includes a large set of keywords and expressions used to find Riftbound cards." />
      <meta property="og:url" content={window.location.href} />

      <div className="flex items-center gap-2 mb-6">
        <BookOpen className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Search Syntax</h1>
      </div>

      <div className="prose prose-sm max-w-none space-y-8">
        {/* Overview */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Overview</h2>
          <p className="text-foreground leading-relaxed">
            RiftSeer supports searching for Riftbound cards by name. Type a card name (or part
            of one) into the search bar to find matching cards. The search engine uses fuzzy
            matching, so minor typos and partial names will still return results.
          </p>
        </section>

        {/* Card references */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">
            Card Reference Syntax
          </h2>
          <p className="text-foreground leading-relaxed mb-3">
            RiftSeer's bot and API use a bracket syntax to look up specific cards.
            Wrap a card name in double square brackets:
          </p>
          <div className="space-y-3">
            <SyntaxExample
              syntax="[[Card Name]]"
              description="Look up a card by name. Returns the best match."
              example="[[Sun Disc]]"
            />
            <SyntaxExample
              syntax="[[Card Name|SET]]"
              description="Look up a specific printing from a set. SET is the set code (e.g. OGN)."
              example="[[Sun Disc|OGN]]"
            />
            <SyntaxExample
              syntax="[[Card Name|SET-123]]"
              description="Look up a specific collector number within a set."
              example="[[Sun Disc|OGN-42]]"
            />
            <SyntaxExample
              syntax="[[Card Name|SET 123]]"
              description="Same as above, but with a space instead of a hyphen."
              example="[[Sun Disc|OGN 42]]"
            />
            <SyntaxExample
              syntax="[[Card Name\\SET]]"
              description="A backslash also works as a separator, identical to the pipe."
              example="[[Sun Disc\\OGN]]"
            />
          </div>
        </section>

        {/* Search tips */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Search Tips</h2>
          <ul className="space-y-2 text-foreground">
            <li className="flex gap-2">
              <span className="text-primary font-bold shrink-0">•</span>
              <span>
                <strong>Fuzzy matching</strong> — searches are fuzzy by default, so "poro" will
                match "Stalwart Poro," "Fluffy Poro," etc.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold shrink-0">•</span>
              <span>
                <strong>Partial names</strong> — you don't need the full card name. "Sun" will
                match "Sun Disc," "Sunfire," etc.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold shrink-0">•</span>
              <span>
                <strong>Case insensitive</strong> — "sun disc," "Sun Disc," and "SUN DISC" all
                return the same results.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary font-bold shrink-0">•</span>
              <span>
                <strong>Punctuation ignored</strong> — apostrophes, hyphens, and special characters
                are stripped during matching. "cant" will match "Can't Stop."
              </span>
            </li>
          </ul>
        </section>

        {/* Set codes */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Set Codes</h2>
          <p className="text-foreground leading-relaxed">
            Each Riftbound set has a short code (e.g. <code className="bg-muted px-1 py-0.5 rounded text-xs">OGN</code> for
            Origins). You can view all available sets and their codes on the{" "}
            <Link to="/sets" className="text-primary hover:underline">Sets page</Link>.
          </p>
        </section>

        {/* API */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">API</h2>
          <p className="text-foreground leading-relaxed mb-3">
            RiftSeer provides a free JSON API. Some useful endpoints:
          </p>
          <div className="space-y-2">
            <ApiEndpoint
              method="GET"
              path="/api/v1/cards?name=Sun Disc"
              description="Search cards by name"
            />
            <ApiEndpoint
              method="GET"
              path="/api/v1/cards/:id"
              description="Get a specific card by UUID"
            />
            <ApiEndpoint
              method="GET"
              path="/api/v1/cards/random"
              description="Get a random card"
            />
            <ApiEndpoint
              method="GET"
              path="/api/v1/sets"
              description="List all card sets"
            />
            <ApiEndpoint
              method="POST"
              path="/api/v1/resolve"
              description="Batch resolve card names to cards"
            />
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Full API documentation is available at{" "}
            <a href={apiUrl("/api/swagger")} className="text-primary hover:underline" target="_blank" rel="noreferrer">
              /api/swagger
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}

function SyntaxExample({
  syntax,
  description,
  example,
}: {
  syntax: string;
  description: string;
  example: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <code className="text-sm font-mono text-primary">{syntax}</code>
      <p className="text-sm text-foreground mt-1">{description}</p>
      <p className="text-xs text-muted-foreground mt-1">
        Example: <code className="bg-muted px-1 py-0.5 rounded">{example}</code>
      </p>
    </div>
  );
}

function ApiEndpoint({
  method,
  path,
  description,
}: {
  method: string;
  path: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-3 py-2">
      <code className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded shrink-0">
        {method}
      </code>
      <code className="text-sm font-mono text-foreground">{path}</code>
      <span className="text-xs text-muted-foreground ml-auto hidden sm:block">{description}</span>
    </div>
  );
}
