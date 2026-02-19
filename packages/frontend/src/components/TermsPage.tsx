import React from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <FileText className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Terms of Service</h1>
      </div>

      <p className="text-foreground leading-relaxed mb-8">
        These are the Terms of Service for using RiftSeer. By using RiftSeer, you agree to these terms.
        If you do not agree, you may not use the service.
      </p>

      <div className="prose prose-sm max-w-none space-y-8">
        {/* Shorthand */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Definitions</h2>
          <p className="text-foreground leading-relaxed mb-2">
            We use the following shorthand: When we say <strong>RiftSeer</strong> we mean the
            RiftSeer website, the RiftSeer API, the Reddit bot, and any related services. When we
            say <strong>we</strong>, <strong>us</strong>, or <strong>the operators</strong> we
            mean the people or entity operating RiftSeer. When we say <strong>content</strong> or{" "}
            <strong>your content</strong> we mean any information you submit or store through
            RiftSeer (e.g. if you create an account or post data in the future).
          </p>
        </section>

        {/* Modifications */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">
            Changes to These Terms
          </h2>
          <p className="text-foreground leading-relaxed">
            We may modify these terms at any time. If changes are material, we will post a notice
            before they take effect. If you do not agree to the new terms, you may stop using
            RiftSeer. Continued use after the notice period means you accept the updated terms.
          </p>
        </section>

        {/* Acceptable Use */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Acceptable Use</h2>
          <p className="text-foreground leading-relaxed mb-4">
            You must follow these rules. They protect you and others from disruptive or harmful
            behavior.
          </p>

          <ul className="space-y-4 text-foreground">
            <li>
              <strong>Age.</strong> RiftSeer is for people ages 13 and up. You may not use RiftSeer
              if you are under 13.
            </li>
            <li>
              <strong>No advertising, trades, or sales.</strong> RiftSeer is about playing and
              discussing the Riftbound TCG. You may not use it to sell, advertise, or trade
              products or services (including cards), or to recruit, advertise for businesses, or
              run political campaigns.
            </li>
            <li>
              <strong>No harassment or bigotry.</strong> You may not harass, abuse, threaten, or
              incite violence. You may not disparage people based on age, disability, ethnicity,
              gender, nationality, race, religion, sexual orientation, or similar. You may not
              distribute others’ personal information or photos without consent.
            </li>
            <li>
              <strong>PG-13.</strong> RiftSeer is not for mature content. You may not post
              excessively violent content, sexual content, or content focused on real-world weapons
              or drugs. An exception applies for in-game or card artwork that is part of the game.
            </li>
            <li>
              <strong>No crime or deception.</strong> You may not host pirated or stolen content,
              offer counterfeit materials, impersonate others, or distribute malware. You may only
              post content you created, own, or have permission to use.
            </li>
            <li>
              <strong>No interference.</strong> You may not attempt to disrupt RiftSeer’s servers or
              services, gain access to another user’s account, or place undue burden on RiftSeer
              through automated means (e.g. excessive scraping or abuse of the API).
            </li>
          </ul>

          <p className="text-foreground leading-relaxed mt-4">
            If you fail to follow these guidelines, we may warn you, suspend or delete your
            account (if applicable), restrict your access, or report illegal activity to
            authorities. We are the final arbiter of acceptable behavior and may take action
            outside these guidelines when needed to protect the service or users.
          </p>
        </section>

        {/* Content License */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Content License</h2>
          <p className="text-foreground leading-relaxed">
            You retain ownership of any content you post on RiftSeer. By posting content, you grant
            us a non-exclusive, royalty-free, worldwide license to use, display, and store that
            content as needed to operate RiftSeer. This license ends when you delete the content or
            your account.
          </p>
        </section>

        {/* Limitation of Liability */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">
            Limitation of Liability
          </h2>
          <ul className="space-y-3 text-foreground">
            <li>
              <strong>AS-IS.</strong> RiftSeer is provided “as is.” We may change, terminate, or
              restrict any part of the service at any time, without notice.
            </li>
            <li>
              <strong>AS-AVAILABLE.</strong> We strive for reliability but cannot guarantee
              uptime. There may be downtime, outages, or slow periods.
            </li>
            <li>
              <strong>Your risk.</strong> You use RiftSeer at your own risk. We do not owe you
              compensation for outages, bugs, or our failure to meet any statement in these terms.
              We are not liable for any losses (personal, financial, data, or competitive) arising
              from your use of RiftSeer.
            </li>
            <li>
              <strong>Card and set data.</strong> Card data, set information, and API responses are
              provided for informational purposes only. They are sourced from third parties (e.g.
              RiftCodex) and we do not guarantee accuracy or completeness. For official rules and
              card text, refer to Riot Games or the game’s publisher.
            </li>
          </ul>
        </section>

        {/* Third-party and trademarks */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">
            Third-Party Services and Trademarks
          </h2>
          <p className="text-foreground leading-relaxed">
            RiftSeer is not affiliated with or endorsed by Riot Games. Riftbound and all related
            marks are trademarks of Riot Games. Card data may be supplied by community or
            third-party sources; we are not responsible for their content or licensing. Use of
            Reddit and other platforms is subject to their respective terms.
          </p>
        </section>

        {/* Questions */}
        <section>
          <h2 className="text-lg font-semibold border-b border-border pb-2 mb-3">Questions</h2>
          <p className="text-foreground leading-relaxed">
            If you have questions or concerns about these terms, please contact us through the
            project’s repository or the contact method listed on the site.
          </p>
        </section>
      </div>

      <p className="text-sm text-muted-foreground mt-8">
        <Link to="/" className="text-primary hover:underline">← Back to RiftSeer</Link>
        {" · "}
        <Link to="/docs/privacy" className="text-primary hover:underline">Privacy Policy</Link>
      </p>
    </div>
  );
}
