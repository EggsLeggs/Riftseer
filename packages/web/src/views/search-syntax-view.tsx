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

        <p className="mb-6 text-sm text-muted-foreground">Last updated: 30 July 2026</p>

        <div className="mb-6">
          <SubHeading>Overview</SubHeading>
          <Text>
            Riftseer search supports a compact keyword language in the site search bar (including the quick-search
            palette). It targets Riftbound card fields: printed type and supertype (for example Unit, Gear, Spell,
            Champion, Rune, Legend), classification tags, rarity, artist, keywords, domains, stats, format legality,
            and the tokens a card creates. Only the constructs listed on this page are available today.
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
              <Code>st:value</Code> or <Code>supertype:value</Code>: matches the supertype only (for example Champion, Signature).
            </ListItem>
            <ListItem>
              <Code>tag:value</Code>: matches classification tags only, without also matching the type line.
            </ListItem>
            <ListItem>
              <Code>a:value</Code> or <Code>artist:value</Code>: matches the illustrator name.
            </ListItem>
            <ListItem>
              <Code>r:value</Code> or <Code>rarity:value</Code>: matches rarity on the physical printing, not the shared oracle.
            </ListItem>
            <ListItem>
              <Code>name:value</Code>: matches the card name as a substring, unlike plain words which use full text matching.
            </ListItem>
          </UnorderedList>
          <Text>
            These are substring based and case insensitive. Example: <Code>t:&quot;champion unit&quot;</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Keywords</SubHeading>
          <Text>
            <Code>kw:value</Code> (or <Code>keyword:value</Code>) matches the <Code>[Keyword]</Code> badges printed in a
            card&apos;s rules text. Examples: <Code>kw:deathknell</Code>, <Code>kw:deflect</Code>,{" "}
            <Code>kw:accelerate</Code>.
          </Text>
          <Text>
            Unlike the fields above, keyword matching is <strong className="font-semibold">exact</strong> rather than
            substring, so <Code>kw:de</Code> finds nothing. Numbers printed on a badge are not part of the keyword&apos;s
            identity: <Code>kw:deflect</Code> matches <Code>[Deflect 1]</Code> and <Code>[Deflect 3]</Code> alike, and{" "}
            <Code>kw:&quot;Deflect 3&quot;</Code> means the same thing.
          </Text>
          <Text>
            Comma separated values are an <Code>or</Code>: <Code>kw:deflect,shield</Code> is the same as{" "}
            <Code>(kw:deflect or kw:shield)</Code>. Quote the value to search for a literal comma instead.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Domains</SubHeading>
          <Text>
            <Code>d:value</Code> (or <Code>domain:value</Code>) matches a card&apos;s domain. Cards may carry several
            domains, and <Code>d:</Code> matches if <em>any</em> of them is the one you named — so{" "}
            <Code>d:fury</Code> finds a Fury/Order card as well as a mono-Fury one.
          </Text>
          <Text>
            Matching is exact and case insensitive, because domains are a small fixed set. Combine terms to require
            several at once, or use a comma list for alternatives:
          </Text>
          <UnorderedList>
            <ListItem>
              <Code>d:fury</Code>: has Fury among its domains.
            </ListItem>
            <ListItem>
              <Code>d:fury d:order</Code>: has <strong className="font-semibold">both</strong> Fury and Order.
            </ListItem>
            <ListItem>
              <Code>d:fury,order</Code>: has <strong className="font-semibold">either</strong> one.
            </ListItem>
            <ListItem>
              <Code>-d:fury</Code>: has no Fury domain at all.
            </ListItem>
          </UnorderedList>
          <Text>
            To search on how <em>many</em> domains a card has, use a comparison instead of a colon:{" "}
            <Code>d&gt;=2</Code> finds multi-domain cards and <Code>d=1</Code> finds mono-domain ones. The colon form
            always filters which domains; the comparison form always counts them.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Stats and numbers</SubHeading>
          <Text>
            <Code>energy</Code>, <Code>might</Code> and <Code>power</Code> accept the comparisons{" "}
            <Code>&gt;</Code>, <Code>&gt;=</Code>, <Code>&lt;</Code>, <Code>&lt;=</Code>, <Code>=</Code> and{" "}
            <Code>!=</Code>. Short forms <Code>e</Code>, <Code>m</Code>, <Code>p</Code> and the alias{" "}
            <Code>cost</Code> also work.
          </Text>
          <Text>
            A colon means equals, so <Code>energy:2</Code> and <Code>energy=2</Code> are the same. Examples:{" "}
            <Code>might&gt;=4</Code>, <Code>power&lt;3</Code>, <Code>energy!=0</Code>,{" "}
            <Code>t:unit might&gt;=4 tag:poro</Code>.
          </Text>
          <Text>
            Cards with no value for a stat never match a comparison — not even <Code>!=</Code>. A Spell with no might
            is excluded by both <Code>might&gt;=1</Code> and <Code>might!=1</Code>.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Format legality</SubHeading>
          <Text>
            Search by a card&apos;s status in a play format, using the format&apos;s code:
          </Text>
          <UnorderedList>
            <ListItem>
              <Code>f:standard</Code> or <Code>legal:standard</Code>: legal in that format.
            </ListItem>
            <ListItem>
              <Code>banned:standard</Code>: banned there.
            </ListItem>
            <ListItem>
              <Code>notlegal:standard</Code>: not legal there (for example, not in the card pool).
            </ListItem>
          </UnorderedList>
          <Text>
            Cards are <strong className="font-semibold">legal by default</strong>: only non-legal statuses are recorded,
            so <Code>f:standard</Code> matches every card with nothing stored against it. A printing-specific status
            wins over the card-wide one. An unrecognised format code matches nothing rather than everything.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Tokens created</SubHeading>
          <Text>
            <Code>produces:value</Code> (or <Code>makes:value</Code>) matches cards that create or reference a token by
            name. Matching is substring based, so <Code>produces:gem</Code> finds anything making a Gem token.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>Card flags</SubHeading>
          <Text>
            <Code>is:value</Code> filters on printing properties. Negate any of them with <Code>-</Code>.
          </Text>
          <UnorderedList>
            <ListItem><Code>is:token</Code>: the card is itself a token</ListItem>
            <ListItem><Code>is:signature</Code> (or <Code>is:sig</Code>): a signature printing</ListItem>
            <ListItem><Code>is:alternate</Code> (or <Code>is:alt</Code>): alternate art</ListItem>
            <ListItem><Code>is:overnumbered</Code>: collector number beyond the set&apos;s base count</ListItem>
            <ListItem><Code>is:special</Code> (or <Code>is:showcase</Code>): a special-collection printing, numbered on its own track such as <Code>SP3</Code></ListItem>
            <ListItem><Code>is:foil</Code>: available in a foil finish</ListItem>
            <ListItem><Code>is:manual</Code>: added by an editor rather than ingested</ListItem>
          </UnorderedList>
          <Text>
            Example: <Code>t:unit -is:token</Code> excludes unit tokens from a unit search.
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
            Use <Code>set:value</Code> (or <Code>s:value</Code>) to restrict results to a specific set by its code. The
            value is matched case-insensitively. Example: <Code>set:OGN t:unit</Code> finds units from the Origins set.
          </Text>
        </div>

        <div className="mb-6">
          <SubHeading>All printings</SubHeading>
          <Text>
            By default, results contain one oracle per card, displayed through the printing that matched. To return
            one result per physical printing — including art variants and reprints — add <Code>unique:prints</Code> or
            the shorthand <Code>++</Code> anywhere in the query.
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
            <ListItem><Code>rarity</Code>: print rarity, in printed order — common, uncommon, rare, epic, showcase</ListItem>
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
          <SubHeading>Where else this syntax is used</SubHeading>
          <Text>
            Editors can attach a ruling to a saved query rather than to individual cards, using exactly the language on
            this page. A ruling scoped to <Code>t:unit kw:deathknell</Code> covers every unit with that keyword, and is
            re-evaluated whenever new cards are added — so cards printed later pick it up without anyone editing the
            ruling. Anything you can search for, a ruling can target.
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
