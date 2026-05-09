import { Link } from "react-router-dom";

/** Canonical terms — served from `packages/web` at production `/terms`. */
const WEB_TERMS_URL = "https://riftseer.com/terms";

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <title>Terms of Service — Riftseer</title>
      <meta name="description" content="Terms of Service for Riftseer." />

      <h1 className="mb-2 text-2xl font-bold">Terms of Service</h1>
      <p className="mb-6 text-sm text-muted-foreground">This page has moved.</p>

      <p className="mb-6 leading-relaxed text-foreground">
        The full Terms of Service is now published on the main Riftseer site. Use the link below for
        the current version.
      </p>

      <p className="mb-8">
        <a
          href={WEB_TERMS_URL}
          className="font-medium text-primary hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Open Terms of Service →
        </a>
      </p>

      <p className="text-sm text-muted-foreground">
        <Link to="/" className="text-primary hover:underline">
          ← Back to Riftseer
        </Link>
        {" · "}
        <Link to="/docs/privacy" className="text-primary hover:underline">
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
