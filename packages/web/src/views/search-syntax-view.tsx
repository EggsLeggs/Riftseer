import Link from "next/link";
import { InlineLink, ListItem, SubHeading, Text, UnorderedList } from "@/views/legal-document";

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm text-foreground">
      {children}
    </code>
  );
}

export function SearchSyntaxView() {
  return (
    <div className="flex flex-1 flex-col items-center px-4">
      <div className="flex h-full w-full max-w-[800px] flex-col pb-20 lg:pt-20">
        <div className="flex items-center justify-center py-24 text-center sm:py-36">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Card search syntax</h1>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">Last updated: 10 May 2026</p>

        <div className="mb-6">
          <SubHeading>Overview</SubHeading>
          <Text>
            Riftseer search supports a compact keyword language in the site search bar and in the{" "}
            <Code>GET /api/v1/cards</Code> <Code>name</Code> (or <Code>q</Code>) parameter. The style is similar to{" "}
            <InlineLink href="https://scryfall.com/docs/syntax">Scryfall&apos;s syntax guide</InlineLink>, but only the
            pieces listed on this page are implemented today.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Combining terms</SubHeading>
          <Text>
            Terms next to each other are combined with <strong className="font-semibold">AND</strong>. All of them must
            match unless you use <Code>or</Code> or group with parentheses.
          </Text>
          <Text>
            Example: <Code>bard t:legend</Code> finds cards whose names match the word &quot;bard&quot; and whose type line,
            supertype, or tags match &quot;legend&quot; as a substring (case insensitive).
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Card name words</SubHeading>
          <Text>
            Plain words (not tied to a keyword) search card names using full text matching. Multiple words become one name query,
            not separate unrelated filters.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Type, artist, and rarity</SubHeading>
          <Text>Use a keyword, a colon, then a value. You may quote values that contain spaces.</Text>
          <UnorderedList>
            <ListItem>
              <Code>t:value</Code> or <Code>type:value</Code>: matches printed type, supertype, or any classification tag.
            </ListItem>
            <ListItem>
              <Code>a:value</Code> or <Code>artist:value</Code>: matches the illustrator name.
            </ListItem>
            <ListItem>
              <Code>r:value</Code> or <Code>rarity:value</Code>: matches print rarity text.
            </ListItem>
          </UnorderedList>
          <Text>
            Matching is substring based and case insensitive. Example: <Code>t:&quot;legend unit&quot;</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Exact names</SubHeading>
          <Text>
            Prefix with <Code>!</Code> to require one exact normalized card name. Use quotes for multi-word names. Examples:{" "}
            <Code>!poro</Code>, <Code>!&quot;Sun Disc&quot;</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Negation</SubHeading>
          <Text>
            Put <Code>-</Code> before a term to negate it. Spacing before the keyword is optional. Examples:{" "}
            <Code>-t:token</Code>, <Code>- r:rare</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Using &quot;or&quot;</SubHeading>
          <Text>
            The lowercase word <Code>or</Code> combines alternatives. Implicit AND still binds tighter than{" "}
            <Code>or</Code>. Example: <Code>t:fish or t:bird</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Parentheses</SubHeading>
          <Text>
            Group conditions when mixing AND and OR. Example:{" "}
            <Code>t:land (a:titus or a:avon)</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Extra filters in the URL</SubHeading>
          <Text>
            For the HTTP API you can also pass optional query parameters{" "}
            <Code>type</Code>, <Code>artist</Code>, and <Code>rarity</Code>. They are merged into your query as extra{" "}
            <Code>t:</Code>, <Code>a:</Code>, and <Code>r:</Code> filters with AND. Use this when building UI chips or tools on top of the API.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Limits</SubHeading>
          <Text>
            Queries are capped for safety (total length, nesting depth, number of nodes, and length of individual values). If you hit a limit you will get an error from the API rather than a silent truncation.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Try it</SubHeading>
          <Text>
            Open{" "}
            <Link href="/search" className="text-primary underline-offset-4 hover:underline">
              Search
            </Link>{" "}
            or use the keyboard shortcut from the header to run queries against live data.
          </Text>
        </div>
      </div>
    </div>
  );
}
