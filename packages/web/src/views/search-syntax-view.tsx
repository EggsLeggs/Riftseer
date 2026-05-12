import Link from "next/link";
import { ListItem, SubHeading, Text, UnorderedList } from "@/views/legal-document";

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

        <p className="mb-6 text-sm text-muted-foreground">Last updated: 12 May 2026</p>

        <div className="mb-6">
          <SubHeading>Overview</SubHeading>
          <Text>
            Riftseer search supports a compact keyword language in the site search bar (including the quick-search
            palette). It targets Riftbound card fields: printed type and supertype (for example Unit, Gear, Spell,
            Champion, Rune, Legend), classification tags, rarity, and artist. Only the constructs listed on this page
            are available today.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Combining terms</SubHeading>
          <Text>
            Terms next to each other are combined with <strong className="font-semibold">AND</strong>. All of them must
            match unless you use <Code>or</Code> or group with parentheses.
          </Text>
          <Text>
            Example: <Code>poro t:unit</Code> finds cards whose names match &quot;poro&quot; and whose type line,
            supertype, or tags match &quot;unit&quot; as a substring (case insensitive).
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
            Matching is substring based and case insensitive. Example: <Code>t:&quot;champion unit&quot;</Code>.
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
            <Code>or</Code>. Example: <Code>t:gear or t:spell</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Parentheses</SubHeading>
          <Text>
            Group conditions when mixing AND and OR. Example:{" "}
            <Code>t:unit (a:lee or a:kim)</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Set filter</SubHeading>
          <Text>
            Use <Code>set:value</Code> to restrict results to a specific set by its code. The value is matched
            case-insensitively. Example: <Code>set:OGN t:unit</Code> finds units from the Origins set.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>All printings</SubHeading>
          <Text>
            By default, results are deduplicated to show one printing per card. To include all art variants and
            reprints, add <Code>unique:prints</Code> or the shorthand <Code>++</Code> anywhere in the query.
          </Text>
          <Text>
            Examples: <Code>poro unique:prints</Code>, <Code>poro ++</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Ordering</SubHeading>
          <Text>
            Add <Code>order:field</Code> to sort results client-side. Combine with{" "}
            <Code>direction:asc</Code> (default) or <Code>direction:desc</Code> to control the direction. Null
            values always sort last regardless of direction.
          </Text>
          <Text>Valid order fields:</Text>
          <UnorderedList>
            <ListItem><Code>collector</Code>: collector number within the set (default when browsing a set)</ListItem>
            <ListItem><Code>energy</Code>: card energy cost</ListItem>
            <ListItem><Code>power</Code>: card power value</ListItem>
            <ListItem><Code>might</Code>: card might value</ListItem>
            <ListItem><Code>rarity</Code>: print rarity</ListItem>
            <ListItem><Code>artist</Code>: illustrator name</ListItem>
            <ListItem><Code>usd</Code>: TCGPlayer USD price</ListItem>
            <ListItem><Code>eur</Code>: Cardmarket EUR price</ListItem>
            <ListItem><Code>domain</Code>: primary domain</ListItem>
            <ListItem><Code>set</Code>: set code</ListItem>
          </UnorderedList>
          <Text>
            Example: <Code>poro order:energy direction:desc</Code> shows poro cards sorted by energy, highest
            first.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Limits</SubHeading>
          <Text>
            Queries are capped for safety (total length, nesting depth, number of parts, and length of individual
            values). If a query goes past those bounds, search shows an error instead of trimming it quietly.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Try it</SubHeading>
          <Text>
            Open{" "}
            <Link href="/search" className="text-primary underline-offset-4 hover:underline">
              Search
            </Link>{" "}
            or use the keyboard shortcut from the header to try these queries.
          </Text>
        </div>
      </div>
    </div>
  );
}
