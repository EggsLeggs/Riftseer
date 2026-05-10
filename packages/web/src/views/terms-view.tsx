import Link from "next/link";
import { ListItem, SubHeading, Text, UnorderedList } from "@/views/legal-document";

export function TermsView() {
  return (
    <div className="flex flex-1 flex-col items-center px-4">
      <div className="flex h-full w-full max-w-[800px] flex-col pb-20 lg:pt-20">
        <div className="flex items-center justify-center py-24 text-center sm:py-36">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Terms of Service</h1>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">Last updated: 9 May 2026</p>

        <div className="mb-6">
          <SubHeading>Introduction</SubHeading>
          <Text>
            These are the Terms of Service for using Riftseer. By using Riftseer, you agree to these
            terms. If you do not agree, you may not use the service.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Definitions</SubHeading>
          <Text>
            We use the following shorthand: When we say <strong className="font-semibold">Riftseer</strong>
            {" "}
            we mean the Riftseer website, the Riftseer API, the Reddit bot, and any related services.
            When we say <strong className="font-semibold">we</strong>,{" "}
            <strong className="font-semibold">us</strong>, or{" "}
            <strong className="font-semibold">the operators</strong>
            {" "}
            we mean the people or entity operating Riftseer. When we say{" "}
            <strong className="font-semibold">content</strong> or{" "}
            <strong className="font-semibold">your content</strong>
            {" "}
            we mean any information you submit or store through Riftseer (for example if you create an
            account or post data in the future).
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Changes to These Terms</SubHeading>
          <Text>
            We may modify these terms at any time. If changes are material, we will post a notice
            before they take effect. If you do not agree to the new terms, you may stop using
            Riftseer. Continued use after the notice period means you accept the updated terms.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Acceptable Use</SubHeading>
          <Text>
            You must follow these rules. They protect you and others from disruptive or harmful
            behavior.
          </Text>
          <UnorderedList>
            <ListItem>
              <strong className="font-semibold">Age.</strong>
              {" "}
              Riftseer is for people ages 13 and up. You may not use Riftseer if you are under 13.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">No advertising, trades, or sales.</strong>
              {" "}
              Riftseer is about playing and discussing the Riftbound TCG. You may not use it to sell,
              advertise, or trade products or services (including cards), or to recruit, advertise for
              businesses, or run political campaigns.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">No harassment or bigotry.</strong>
              {" "}
              You may not harass, abuse, threaten, or incite violence. You may not disparage people
              based on age, disability, ethnicity, gender, nationality, race, religion, sexual
              orientation, or similar. You may not distribute others&apos; personal information or photos
              without consent.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">PG-13.</strong>
              {" "}
              Riftseer is not for mature content. You may not post excessively violent content, sexual
              content, or content focused on real-world weapons or drugs. An exception applies for
              in-game or card artwork that is part of the game.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">No crime or deception.</strong>
              {" "}
              You may not host pirated or stolen content, offer counterfeit materials, impersonate others,
              or distribute malware. You may only post content you created, own, or have permission to
              use.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">No interference.</strong>
              {" "}
              You may not attempt to disrupt Riftseer&apos;s servers or services, gain access to another
              user&apos;s account, or place undue burden on Riftseer through automated means (for example
              excessive scraping or abuse of the API).
            </ListItem>
          </UnorderedList>
          <Text>
            If you fail to follow these guidelines, we may warn you, suspend or delete your account (if
            applicable), restrict your access, or report illegal activity to authorities. We are the
            final arbiter of acceptable behavior and may take action outside these guidelines when
            needed to protect the service or users.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Content License</SubHeading>
          <Text>
            You retain ownership of any content you post on Riftseer. By posting content, you grant us a
            non-exclusive, royalty-free, worldwide license to use, display, and store that content as
            needed to operate Riftseer. This license ends when you delete the content or your account.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Limitation of Liability</SubHeading>
          <UnorderedList>
            <ListItem>
              <strong className="font-semibold">AS-IS.</strong>
              {" "}
              Riftseer is provided &quot;as is.&quot; We may change, terminate, or restrict any part of
              the service at any time, without notice.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">AS-AVAILABLE.</strong>
              {" "}
              We strive for reliability but cannot guarantee uptime. There may be downtime, outages, or
              slow periods.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Your risk.</strong>
              {" "}
              You use Riftseer at your own risk. We do not owe you compensation for outages, bugs, or our
              failure to meet any statement in these terms. We are not liable for any losses (personal,
              financial, data, or competitive) arising from your use of Riftseer.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Card and set data.</strong>
              {" "}
              Card data, set information, and API responses are provided for informational purposes only.
              They are sourced from third parties (for example RiftCodex) and we do not guarantee accuracy
              or completeness. For official rules and card text, refer to Riot Games or the game&apos;s
              publisher.
            </ListItem>
          </UnorderedList>
        </div>

        <div className="mb-6">
          <SubHeading>Third-Party Services and Trademarks</SubHeading>
          <Text>
            Riftseer is not affiliated with or endorsed by Riot Games. Riftbound and all related marks
            are trademarks of Riot Games. Card data may be supplied by community or third-party sources;
            we are not responsible for their content or licensing. Use of Reddit and other platforms is
            subject to their respective terms.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Questions</SubHeading>
          <Text>
            If you have questions or concerns about these terms, please contact us through the
            project&apos;s repository or the contact method listed on the site.
          </Text>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            ← Back to Riftseer
          </Link>
          {" · "}
          <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
