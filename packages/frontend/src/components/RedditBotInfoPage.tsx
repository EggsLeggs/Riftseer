import React from "react";
import { Link } from "react-router-dom";
import { Bot } from "lucide-react";

export function RedditBotInfoPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <title>Reddit Bot Info — Riftseer</title>
      <meta
        name="description"
        content="How the Riftseer Reddit bot parses card references and formats replies."
      />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Reddit Bot Info — Riftseer" />
      <meta
        property="og:description"
        content="How the Riftseer Reddit bot parses card references and formats replies."
      />
      <meta property="og:url" content={window.location.href} />

      <div className="flex items-center gap-2 mb-6">
        <Bot className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Reddit Bot Info</h1>
      </div>

      <div className="prose prose-sm max-w-none space-y-8">
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Overview</h2>
          <p className="text-foreground leading-relaxed">
            The Riftseer Reddit bot listens for card calls in the form{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">[[Card Name]]</code> and replies
            with links to the card page and a plain-text card view.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Accepted Syntax</h2>
          <div className="space-y-3">
            <ExampleItem syntax="[[Card Name]]" description="Look up the best match by name." />
            <ExampleItem
              syntax="[[Card Name|SET]]"
              description="Look up a specific set printing by set code."
            />
            <ExampleItem
              syntax="[[Card Name|SET-123]]"
              description="Look up a specific collector number in a set."
            />
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            More syntax details are available on the{" "}
            <Link to="/syntax" className="text-primary hover:underline">
              Syntax page
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Reply Format</h2>
          <p className="text-foreground leading-relaxed mb-3">
            Each resolved card uses this compact format:
          </p>
          <pre className="bg-card border border-border rounded-lg p-3 text-sm overflow-x-auto">
            Card Name — [site](https://riftseer.com/card/&lt;id&gt;) (R), [txt](https://riftseer.com/card/&lt;id&gt;/text) (txt)
          </pre>
          <p className="text-foreground leading-relaxed">
            The footer includes an italic <code className="bg-muted px-1 py-0.5 rounded text-xs">info</code>{" "}
            link to this page.
          </p>
        </section>
      </div>
    </div>
  );
}

function ExampleItem({
  syntax,
  description,
}: {
  syntax: string;
  description: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <code className="text-sm font-mono text-primary">{syntax}</code>
      <p className="text-sm text-foreground mt-1">{description}</p>
    </div>
  );
}
