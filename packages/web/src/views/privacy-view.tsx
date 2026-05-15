import Link from "next/link";
import { InlineLink, ListItem, SubHeading, Text, UnorderedList } from "@/views/legal-document";

export function PrivacyView() {
  return (
    <div className="flex flex-1 flex-col items-center px-4">
      <div className="flex h-full w-full max-w-[800px] flex-col pb-20 lg:pt-20">
        <div className="flex items-center justify-center py-24 text-center sm:py-36">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">Last updated: 15 May 2026</p>

        <div className="mb-6">
          <SubHeading>Introduction</SubHeading>
          <Text>
            This policy describes how Riftseer collects, uses, and protects information when you use
            our website, API, Reddit bot, and optional Raycast extension. We do not sell your personal
            information.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Definitions</SubHeading>
          <Text>
            <strong className="font-semibold">Riftseer</strong> means the Riftseer website, the
            Riftseer API, the Reddit bot (when installed in a subreddit), the Raycast extension (if
            you install it from the Raycast Store), and related services.{" "}
            <strong className="font-semibold">We</strong> /{" "}
            <strong className="font-semibold">us</strong> means the operators of Riftseer.{" "}
            <strong className="font-semibold">Personal data</strong> means information that could
            identify you, such as your IP address or username.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Riftseer website and API</SubHeading>
          <UnorderedList>
            <ListItem>
              <strong className="font-semibold">No account required.</strong> You can use the site
              and API without signing in.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Optional accounts.</strong> If you choose to
              register, we collect your{" "}
              <strong className="font-semibold">email address and password</strong> to create and
              authenticate your account. Passwords are hashed and stored securely by{" "}
              <InlineLink href="https://supabase.com/privacy">Supabase</InlineLink>{" "}
              (our authentication provider); we never store plaintext passwords. Upon login, Supabase
              issues a short-lived <strong className="font-semibold">access token</strong> and a
              long-lived <strong className="font-semibold">refresh token</strong>; these are stored
              client-side and sent with authenticated requests. You can revoke your session at any
              time via the logout endpoint (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                POST /api/v1/auth/logout
              </code>
              ). To delete your account, contact us through the project repository.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Local storage (site only).</strong> The website
              stores preferences in your browser&apos;s local storage, including your{" "}
              <strong className="font-semibold">theme choice</strong> (light or dark mode) and, if
              you accept functional cookies, your{" "}
              <strong className="font-semibold">cards-per-page search preference</strong> and{" "}
              <strong className="font-semibold">
                optional site accessibility preferences
              </strong>{" "}
              (for example how card names appear on search). These are
              not personally identifiable and are not sent to our servers. You can clear them by
              clearing your browser&apos;s local storage for this site.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Cookie preferences.</strong> Where applicable, we
              show a consent banner so you can choose whether optional measurement cookies are used
              before analytics load. Necessary cookies support basic site operation.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">API and server requests.</strong> When you visit the
              site or call the API, our servers receive your requests (for example the URL, search
              terms, and card lookups). Our hosting provider (and we) may log request metadata such
              as IP address, timestamp, and path for operation, security, and abuse prevention. We do
              not use this data to build profiles of you or to advertise.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">PostHog (site analytics).</strong> We use{" "}
              <InlineLink href="https://posthog.com">PostHog</InlineLink>{" "}
              to record site activity, for example page views, search usage, and how people navigate
              the site, so we can understand usage and improve the product. PostHog may collect
              information such as your
              IP address, device and browser type, and interaction data. PostHog&apos;s own privacy
              policy applies:{" "}
              <InlineLink href="https://posthog.com/privacy">posthog.com/privacy</InlineLink>
              .{" "}
              We do not use this data for advertising.
            </ListItem>
          </UnorderedList>
        </div>

        <div className="mb-6">
          <SubHeading>Metafy account linking</SubHeading>
          <Text>
            If you choose to link your Metafy account, we store the following in our database
            server-side: your Metafy username, your Metafy user identifier, your OAuth access
            token (and refresh token, if issued), and your supporter status. This data is used
            exclusively to verify your Metafy membership and to enable supporter perks (ad-free
            experience and supporter badge). Your Metafy OAuth tokens are never exposed to the
            browser; they remain server-side and are used only to re-check your membership status
            on login and when you visit your donations settings. You can disconnect your Metafy
            account at any time from the Donations settings page, which deletes all stored Metafy
            data. Metafy&apos;s own{" "}
            <InlineLink href="https://metafy.gg/privacy">privacy policy</InlineLink> applies to
            information held by Metafy.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Riftseer Reddit bot</SubHeading>
          <Text>
            The Riftseer bot runs on Reddit via Devvit. When it is installed in a subreddit, it
            reacts to new comments and self-posts that contain card references (for example{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">[[Sun Disc]]</code>) and
            may post a reply with card information and links.
          </Text>
          <UnorderedList>
            <ListItem>
              <strong className="font-semibold">Data we receive from Reddit.</strong>
              {" "}
              For each comment or post it processes, the bot receives from Reddit: the comment or post ID,
              the author&apos;s Reddit username, and the text (title and body). This is the same
              data Reddit provides to any app that runs in the subreddit.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">How we use that data.</strong> We use the text to
              find card references and to call the Riftseer API to resolve them. We use the author
              username only to skip replying to accounts whose username ends with{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">&quot;bot&quot;</code>
              ; we do not persist Reddit usernames in the bot. Card-name and subreddit analytics on
              our servers are described under{" "}
              <strong className="font-semibold">What we store</strong>.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">What we store.</strong> The bot stores only{" "}
              <strong className="font-semibold">Reddit comment and post IDs</strong> (in a key-value
              store) so we do not reply twice to the same item; it does not persist Reddit usernames,
              subreddit names, or requested card names. Separately, our{" "}
              <strong className="font-semibold">server-side API</strong> may log{" "}
              <strong className="font-semibold">requested card names and subreddit</strong> when the
              bot calls it to resolve references—for analytics (understanding how the bot is used
              across communities and improving the service). Those API logs are retained only as long
              as needed for analytics and product
              improvement, consistent with how we retain other API and server logs for operation and
              security. We do not sell this data or use it for advertising.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Replies.</strong> When the bot replies, it does so
              through Reddit&apos;s API. Reddit&apos;s own privacy policy and terms apply to how
              Reddit handles that content and your activity on Reddit.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Reddit and Devvit.</strong> The bot is built on
              Devvit and runs in Reddit&apos;s environment. Reddit and Devvit may process data
              according to their own policies. We do not control Reddit&apos;s or Devvit&apos;s data
              practices.
            </ListItem>
          </UnorderedList>
        </div>

        <div className="mb-6">
          <SubHeading>Riftseer Raycast extension</SubHeading>
          <Text>
            The optional Raycast extension calls the public Riftseer API to search and display cards.
            It does not send us your Raycast account or identity.
          </Text>
          <UnorderedList>
            <ListItem>
              <strong className="font-semibold">Local storage on your Mac.</strong> The extension
              may keep a bounded list of recently viewed cards in Raycast&apos;s local storage on
              your device (you can set the limit to zero to turn this off). That history is not
              uploaded to Riftseer; it stays in Raycast until you clear it or remove the extension.
            </ListItem>
          </UnorderedList>
        </div>

        <div className="mb-6">
          <SubHeading>Data sharing and third parties</SubHeading>
          <Text>We do not sell or rent your personal data. We may share or expose data only as follows:</Text>
          <UnorderedList>
            <ListItem>
              <strong className="font-semibold">Hosting.</strong> The site and API may be hosted by
              third-party providers (for example cloud or platform services). Those providers may
              process or store request data (such as IP addresses and logs) as part of running the
              service.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Supabase (authentication).</strong> If you create an
              account, your email and hashed password are stored and managed by Supabase. Supabase&apos;s
              own{" "}
              <InlineLink href="https://supabase.com/privacy">privacy policy</InlineLink>{" "}
              applies to that data.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">PostHog.</strong> As described above, we use PostHog
              for site analytics. PostHog processes the analytics data according to their privacy
              policy.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Card data.</strong> Card and set data are fetched
              from third-party sources (for example RiftCodex). When you search or resolve cards,
              we do not send your identity to those sources; we only request card data for the
              lookups you trigger.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Metafy.</strong> If you link your Metafy account,
              we call the Metafy API using your OAuth access token to verify supporter status.
              Metafy&apos;s privacy policy applies to data Metafy collects or processes.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Reddit / Devvit.</strong> As described above, the bot
              operates within Reddit and Devvit; their policies apply to data they collect or
              process.
            </ListItem>
            <ListItem>
              <strong className="font-semibold">Legal.</strong> We may disclose data if required by
              law or to protect our rights, safety, or the safety of others.
            </ListItem>
          </UnorderedList>
        </div>

        <div className="mb-6">
          <SubHeading>Retention</SubHeading>
          <Text>
            Site preferences in your browser stay until you clear them or withdraw the related cookie
            consent. Server logs (if any) are kept only as long as needed for operation and security.
            PostHog retains analytics data according to their policy and your settings. Stored Reddit
            comment and post IDs (used to
            prevent double replies) are kept indefinitely so the bot continues to avoid duplicate
            replies. API-side logs of requested card names and subreddit from bot traffic are retained
            on the same basis as other API analytics and server logs described above. Account data
            (email and hashed password) is retained by Supabase for as long as your account exists;
            contact us to request account deletion.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Your rights</SubHeading>
          <Text>
            Depending on where you live, you may have rights to access, correct, or delete personal
            data. If you have an account, you can contact us through the project repository to
            request access to or deletion of your account data. You can clear site preferences by
            clearing local storage for this site or changing your cookie preferences. PostHog may
            offer opt-out or privacy controls; see their privacy policy. For Reddit-related data
            (including API analytics derived from bot traffic, such as card names and subreddit), you
            can contact us to ask what we hold or to request deletion where applicable.
            Reddit&apos;s own tools and privacy policy also apply to your activity on Reddit.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Changes to this policy</SubHeading>
          <Text>
            We may update this Privacy Policy from time to time. We will post the updated policy on
            this page and, for material changes, we will note the change here. Continued use of
            Riftseer after changes means you accept the updated policy.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Questions</SubHeading>
          <Text>
            If you have questions about this Privacy Policy or our data practices, please contact us
            through the project&apos;s repository or the contact method listed on the site.
          </Text>
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            ← Back to Riftseer
          </Link>
          {" · "}
          <Link href="/terms" className="text-primary underline-offset-4 hover:underline">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  );
}
