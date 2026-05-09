import { Link } from "react-router-dom";

/** Canonical privacy policy — served from `packages/web` at production `/privacy`. */
const WEB_PRIVACY_URL = "https://riftseer.com/privacy";

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <title>Privacy Policy — Riftseer</title>
      <meta name="description" content="Privacy Policy for Riftseer." />

      <h1 className="mb-2 text-2xl font-bold">Privacy Policy</h1>
      <p className="mb-6 text-sm text-muted-foreground">This page has moved.</p>

      <p className="text-foreground mb-6 leading-relaxed">
        The full Privacy Policy is now published on the main Riftseer site. Use the link below for
        the current version.
      </p>

      <p className="mb-8">
        <a
          href={WEB_PRIVACY_URL}
          className="text-primary font-medium hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          Open Privacy Policy →
        </a>
      </p>

      <p className="text-muted-foreground text-sm">
        <Link to="/" className="text-primary hover:underline">
          ← Back to Riftseer
        </Link>
        {" · "}
        <Link to="/docs/terms" className="text-primary hover:underline">
          Terms of Service
        </Link>
      </p>
    </div>
  );
}
