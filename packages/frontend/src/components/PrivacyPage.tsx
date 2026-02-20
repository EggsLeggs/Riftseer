import React from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

export function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <title>Privacy Policy — RiftSeer</title>
      <meta name="description" content="Privacy Policy for RiftSeer." />
      <meta property="og:type" content="website" />
      <meta property="og:title" content="Privacy Policy — RiftSeer" />
      <meta property="og:description" content="Privacy Policy for RiftSeer." />
      <meta property="og:url" content={window.location.href} />

      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Last Updated: 20 February 2026</p>

      <p className="text-foreground leading-relaxed mb-8">
        This Privacy Policy describes how RiftSeer collects, uses, and protects information when
        you use our website, API, and Reddit bot. We do not sell your personal information.
      </p>

      <div className="prose prose-sm max-w-none space-y-8">
        {/* Definitions */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Definitions</h2>
          <p className="text-foreground leading-relaxed mb-2">
            <strong>RiftSeer</strong> means the RiftSeer website, the RiftSeer API, the Reddit bot
            (when installed in a subreddit), and related services. <strong>We</strong> /{" "}
            <strong>us</strong> means the operators of RiftSeer. <strong>Personal data</strong>{" "}
            means information that could identify you, such as your IP address or username.
          </p>
        </section>

        {/* Site */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">
            RiftSeer Website and API
          </h2>
          <ul className="space-y-3 text-foreground">
            <li>
              <strong>No account required.</strong> You can use the site and API without signing in.
              We do not collect names, emails, or passwords.
            </li>
            <li>
              <strong>Local storage (site only).</strong> The website stores one preference in your
              browser’s local storage: your <strong>theme choice</strong> (light or dark mode). This
              is not personally identifiable and is not sent to our servers. You can clear it by
              clearing your browser’s local storage for this site.
            </li>
            <li>
              <strong>API and server requests.</strong> When you visit the site or call the API,
              our servers receive your requests (e.g. the URL, search terms, and card lookups). Our
              hosting provider (and we) may log request metadata such as IP address, timestamp, and
              path for operation, security, and abuse prevention. We do not use this data to build
              profiles of you or to advertise.
            </li>
            <li>
              <strong>PostHog (site analytics).</strong> We use{" "}
              <a
                href="https://posthog.com"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                PostHog
              </a>{" "}
              to record site activity—for example, page views, search usage, and how people
              navigate the site—so we can understand usage and improve the product. PostHog may
              collect information such as your IP address, device and browser type, and
              interaction data. PostHog’s own privacy policy and practices apply to the data they
              process:{" "}
              <a
                href="https://posthog.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                posthog.com/privacy
              </a>
              . We do not use this data for advertising.
            </li>
          </ul>
        </section>

        {/* Bot */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">
            RiftSeer Reddit Bot
          </h2>
          <p className="text-foreground leading-relaxed mb-3">
            The RiftSeer bot runs on Reddit via Devvit. When it is installed in a subreddit, it
            reacts to new comments and self-posts that contain card references (e.g.{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">[[Sun Disc]]</code>) and may
            post a reply with card information and links.
          </p>
          <ul className="space-y-3 text-foreground">
            <li>
              <strong>Data we receive from Reddit.</strong> For each comment or post it processes,
              the bot receives from Reddit: the comment or post ID, the author’s Reddit username,
              and the text (title and body). This is the same data Reddit provides to any app
              that runs in the subreddit.
            </li>
            <li>
              <strong>How we use that data.</strong> We use the text to find card references and
              to call the RiftSeer API to resolve them. We use the author username to skip
              replying to accounts whose username ends with <code className="bg-muted px-1 py-0.5 rounded text-xs">"bot"</code>.
              We also use it (together with subreddit and card requests) for analytics as
              described below.
            </li>
            <li>
              <strong>What we store.</strong> We store <strong>Reddit comment and post IDs</strong>{" "}
              (in a key-value store) to remember that we already replied, so we do not reply twice.
              We also <strong>log card requests by subreddit and by Reddit user</strong>: when
              someone triggers the bot with card references, we record which cards were requested,
              the subreddit where it happened, and the Reddit username of the person who posted.
              We use this to understand how the bot is used across communities and to improve the
              service. We do not sell this data or use it for advertising.
            </li>
            <li>
              <strong>Replies.</strong> When the bot replies, it does so through Reddit’s API.
              Reddit’s own privacy policy and terms apply to how Reddit handles that content and
              your activity on Reddit.
            </li>
            <li>
              <strong>Reddit and Devvit.</strong> The bot is built on Devvit and runs in Reddit’s
              environment. Reddit and Devvit may process data according to their own policies. We
              do not control Reddit’s or Devvit’s data practices.
            </li>
          </ul>
        </section>

        {/* Data sharing */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">
            Data Sharing and Third Parties
          </h2>
          <p className="text-foreground leading-relaxed mb-2">
            We do not sell or rent your personal data. We may share or expose data only as follows:
          </p>
          <ul className="space-y-2 text-foreground">
            <li>
              <strong>Hosting.</strong> The site and API may be hosted by third-party providers
              (e.g. cloud or platform services). Those providers may process or store request data
              (e.g. IP, logs) as part of running the service.
            </li>
            <li>
              <strong>PostHog.</strong> As described above, we use PostHog for site analytics.
              PostHog processes the analytics data according to their privacy policy.
            </li>
            <li>
              <strong>Card data.</strong> Card and set data are fetched from third-party sources
              (e.g. RiftCodex). When you search or resolve cards, we do not send your identity to
              those sources; we only request card data for the lookups you trigger.
            </li>
            <li>
              <strong>Reddit / Devvit.</strong> As described above, the bot operates within
              Reddit and Devvit; their policies apply to data they collect or process.
            </li>
            <li>
              <strong>Legal.</strong> We may disclose data if required by law or to protect our
              rights, safety, or the safety of others.
            </li>
          </ul>
        </section>

        {/* Retention */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Retention</h2>
          <p className="text-foreground leading-relaxed">
            Theme preference in your browser stays until you clear it. Server logs (if any) are
            kept only as long as needed for operation and security. PostHog retains analytics
            data according to their policy and your settings. Stored Reddit comment/post IDs
            (used to prevent double-replies) are kept indefinitely so the bot continues to avoid
            duplicate replies. Logs of card requests by subreddit and Reddit username are retained
            for as long as we use them for analytics and product improvement.
          </p>
        </section>

        {/* Your rights */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Your Rights</h2>
          <p className="text-foreground leading-relaxed mb-2">
            Depending on where you live, you may have rights to access, correct, or delete personal
            data. Because we do not maintain user accounts, we have no login-based profile to
            provide or delete. You can clear the theme preference by clearing local storage for
            this site. PostHog may offer opt-out or privacy controls—see their privacy policy. For
            Reddit-related data (including our logs of card requests by subreddit and username),
            you can contact us to ask what we hold or to request deletion. Reddit’s own tools and
            privacy policy also apply to your activity on Reddit.
          </p>
        </section>

        {/* Changes */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">
            Changes to This Policy
          </h2>
          <p className="text-foreground leading-relaxed">
            We may update this Privacy Policy from time to time. We will post the updated policy
            on this page and, for material changes, we will note the change here. Continued use of
            RiftSeer after changes means you accept the updated policy.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Questions</h2>
          <p className="text-foreground leading-relaxed">
            If you have questions about this Privacy Policy or our data practices, please contact
            us through the project’s repository or the contact method listed on the site.
          </p>
        </section>
      </div>

      <p className="text-sm text-muted-foreground mt-8">
        <Link to="/" className="text-primary hover:underline">← Back to RiftSeer</Link>
        {" · "}
        <Link to="/docs/terms" className="text-primary hover:underline">Terms of Service</Link>
      </p>
    </div>
  );
}
