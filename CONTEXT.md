# Riftseer

The domain language for a Riftbound TCG card catalogue, the decks built from it and the accounts that own them. One context: every package speaks this vocabulary, and a package's `AGENTS.md` refines a term here rather than redefining it.

Each entry is the term, what it is, the words to avoid for it, and the terms it touches. Definitions describe the concept, never the implementation; the column and file names live in the package guidance. Open questions are listed under [Ambiguities](#ambiguities) rather than quietly resolved.

## The card model

**Oracle**:
The rules object: name, type, tags, domains, rules text, keywords, stats. One oracle exists per distinct rules object, however many times it is printed.
_Avoid_: card (when the rules are meant), card definition, base card
_Related_: Printing, Oracle key, Relationship, Keyword, Preferred printing

**Printing**:
One physical edition of an oracle: its art, artist, flavour text, rarity, set, collector number and marketplace data. A printing's id is stable across every rebuild of the catalogue because decks and image URLs are keyed on it.
_Avoid_: card (when the cardboard is meant), edition, variant, version
_Related_: Oracle, Rarity, Set, Collector number, Slug, Delta

**Card**:
The aggregate a reader sees: an oracle together with the printing being looked at. Reserve this word for that pair; a field belongs to exactly one half, so a surface that shows rules reads the oracle and a surface that shows cardboard reads the printing.
_Avoid_: using "card" alone where the oracle/printing distinction matters
_Related_: Oracle, Printing, Card detail

**Card detail**:
The aggregate a card page renders: one oracle, all of its printings, its relationships, rulings and legalities, with one printing marked current.
_Avoid_: full card, card payload, hydrated card
_Related_: Card, Ruling, Legality, Preferred printing

**Oracle key**:
A name-derived lookup slug used at exactly one moment: when ingest guesses which oracle a new printing joins. It is a matching hint, never an identity; the oracle's id is.
_Avoid_: oracle id, group key, card key
_Related_: Oracle, Ingest, Reconciliation entry

**Preferred printing**:
The printing an oracle shows by default: on the oracle's own page, in search results and in a bot embed when no edition was asked for.
_Avoid_: default art, primary printing, canonical printing
_Related_: Oracle, Printing, Slug

**Rarity**:
A printing-level property. Two printings of one oracle may carry different rarities, and two sources disagreeing about a rarity is real data rather than noise.
_Avoid_: oracle rarity, card rarity
_Related_: Printing, Reconciliation entry

**Set**:
A named release of printings identified by a short code such as `OGN`. A set belongs to the catalogue and a printing belongs to exactly one set.
_Avoid_: expansion, edition, release (as a noun for the set)
_Related_: Printing, Collector number

**Collector number**:
The printing's number within its set as printed on the card, prefix included (`T03`, `SP3`, `R01`, `042a`). It identifies a printing inside a set together with the set code.
_Avoid_: card number, index, sequence
_Related_: Set, Printing, Card mention

**Slug**:
The public URL path of an oracle or a printing. It is pinned the first time the record is created so a rename never changes a published link.
_Avoid_: permalink, URL key, path
_Related_: Oracle, Printing, Preferred printing

**Keyword**:
A rules word the oracle's text carries, such as `Deflect` or `Deathknell`, derived from the rules text and searchable as a normalised vocabulary.
_Avoid_: ability word, mechanic, tag (a keyword is not a tag)
_Related_: Oracle, Search query, Tag

**Tag**:
A descriptive label on an oracle that is not a rules word: a character name, a species, a region. Tags drive relationship linking and search.
_Avoid_: keyword, category, label
_Related_: Oracle, Relationship, Keyword

**Domain**:
One of the six colours of Riftbound (`body`, `calm`, `chaos`, `fury`, `mind`, `order`). An oracle has zero or more; a legend's domains decide what a deck may play.
_Avoid_: colour, faction, element
_Related_: Oracle, Legend, Violation

**Token**:
An oracle that is itself a game token, created by another card rather than played from a deck. A token still has a card type; being a token is a separate fact.
_Avoid_: token card (redundant), spawn, summon; and never use "token" for an icon glyph, a card mention or a session credential
_Related_: Oracle, Relationship, Deck token

**Legend**:
The oracle a deck is built around. Its domains are the deck's domains, and its character links it to its champions.
_Avoid_: commander, leader, hero
_Related_: Champion, Domain, Zone, Relationship

**Champion**:
An oracle whose supertype is Champion: a unit that shares a character with a legend. Distinct from a deck's _chosen champion_, which is a role one main-deck copy takes.
_Avoid_: hero, leader; and "champion" alone when the chosen champion is meant
_Related_: Legend, Relationship, Chosen champion

**Signature**:
An oracle whose supertype is Signature: a card tied to one champion. Distinct from a signature _printing_, which is a variant edition of an ordinary oracle.
_Avoid_: signature card (ambiguous between the two)
_Related_: Champion, Relationship, Printing

**Equipment**:
A gear oracle with an `[Equip]` text box. Presence of a might bonus decides equipment, never its value: a bonus of zero is a real printed value.
_Avoid_: attachment, aura
_Related_: Oracle, Ingest source

**Relationship**:
A directed edge from one oracle to another: `makes_token`, `character` (champion to legend) or `signature`. An edge is stored once; the reverse direction is a query, never a second edge.
_Avoid_: link, related card, reverse relationship, `used_by` (that is a query)
_Related_: Oracle, Token, Champion, Signature, Deck token

**Delta**:
A genuine rules difference one printing has from its oracle, such as a tag it lacks or an extra line of text. A delta says the cardboard differs; it never records that an admin corrected something.
_Avoid_: override, printing override, lock, patch
_Related_: Printing, Locked field, Resolved printing

**Locked field**:
A field an admin has decided, recorded so that ingest keeps its hands off that one field on that one record. A lock says who decides; it says nothing about whether the printing differs from its oracle.
_Avoid_: override, pinned field, frozen field, delta
_Related_: Delta, Admin, Ingest

**Manual record**:
An oracle, printing or set an admin created by hand rather than ingest. It is an ordinary record that ingest never prunes, not a separate kind of thing.
_Avoid_: custom card, override card, manual override
_Related_: Admin, Ingest, Soft delete

**Soft delete**:
Hiding a record by marking it deleted rather than removing it, so the id, its deck rows and its hosted images survive and an admin can restore it.
_Avoid_: archive, hide, remove (for the mechanism)
_Related_: Manual record, Printing, Resolved printing

**Resolved printing**:
The flat, read-only view of a printing with its oracle's fields and its deltas already applied. Search scans exactly this and never resolves a delta at query time.
_Avoid_: search index, materialised card, denormalised card
_Related_: Printing, Delta, Search query

**Meta flag**:
A searchable `is:` property an admin asserts about an oracle that is not printed on the card. Ingest never writes one.
_Avoid_: tag, attribute, flag (unqualified)
_Related_: Oracle, Admin, Search query

**Source**:
Where a record came from. Records carry a provenance (from RiftCodex or made by hand); deltas and relationships carry an author (written by ingest or by an admin). See [Ambiguities](#ambiguities).
_Avoid_: origin, provenance and author used interchangeably
_Related_: Ingest, Manual record, Delta, Relationship

## The catalogue

**Catalogue**:
Every set, oracle and printing Riftseer knows about, rebuilt by ingest and read by everything else.
_Avoid_: database, card index, card list
_Related_: Ingest, Set, Oracle, Printing

**Ingest**:
The scheduled run that fetches every ingest source, groups printings into oracles, enriches them, writes the catalogue and files what it could not reconcile. It owns what it wrote and never touches an admin's decision.
_Avoid_: sync, import, crawl, scrape
_Related_: Ingest source, Catalogue, Locked field, Reconciliation entry, Oracle key

**Ingest source**:
An upstream Riftseer reads during ingest. RiftCodex is the only source that may introduce printings; ingest normalises them and derives oracles by grouping. TCGPlayer and Riot's gallery enrich or observe, and either failing is non-fatal.
_Avoid_: provider (that word is the API's storage abstraction), feed, upstream (unqualified)
_Related_: Ingest, Enrichment, Reconciliation entry

**Enrichment**:
Adding to a printing what its creating source lacks: a marketplace product and its prices, the equipment text box, a hosted image. Enrichment never creates a set, printing or oracle.
_Avoid_: hydration, augmentation, decoration
_Related_: Ingest source, Printing, Equipment, Image variant

**File override**:
A committed, source-specific fix ingest applies while normalising upstream data: a corrected set name, a product mapping, a per-card flag. It is for source bugs; admin decisions go through admin edits instead.
_Avoid_: override (unqualified), patch, admin override
_Related_: Ingest, Admin, Locked field

**Reconciliation entry**:
A disagreement or gap ingest found and could not settle: two sources naming different rarities, a printing with no oracle, a card a source has and we do not. Entries wait for an admin and are never applied automatically.
_Avoid_: review item, conflict, issue, ticket
_Related_: Ingest, Admin, Rarity, Oracle key

**Image variant**:
One hosted size of a printing's image, derived from the source image and keyed on the printing id so a corrected image replaces the old one at the same address.
_Avoid_: thumbnail, asset, media (unqualified)
_Related_: Printing, Enrichment

## Search and rules

**Search query**:
Text in Riftseer's search grammar, parsed once into a tree and rendered to one database scan over resolved printings. The same grammar is the language a ruling rule is written in.
_Avoid_: filter (for the whole query), search string, query string
_Related_: Resolved printing, Ruling rule, Keyword, Meta flag

**Ruling**:
An official ruling or an editorial note attached to one or more targets: an oracle, a printing, or every card a ruling rule matches.
_Avoid_: errata, FAQ entry, note (as a synonym; a note is one kind of ruling)
_Related_: Ruling rule, Oracle, Printing, Card detail

**Ruling rule**:
A search query stored as a ruling's target, re-evaluated after every ingest so cards printed later pick the ruling up. An empty rule would match the whole catalogue and is rejected.
_Avoid_: query target, dynamic ruling, rule (unqualified)
_Related_: Ruling, Search query, Ingest

**Format**:
A way to play, with its own legality column and its own zone rules. Formats are admin-managed data; retiring one hides it without deleting anything.
_Avoid_: mode, ruleset, game type
_Related_: Legality, Format zone rule, Deck, Severity

**Legality**:
A card's status in one format: legal, restricted, not legal or banned. Legal is the default and is never stored; a stored status is read from the printing first, then the oracle.
_Avoid_: ban list, eligibility, allowed
_Related_: Format, Legality scope, Severity, Violation

**Legality scope**:
Which layer decided a legality: the printing, the oracle, or the default. It tells a builder whether swapping the art fixes the problem or only cutting the card does.
_Avoid_: legality level, layer, origin
_Related_: Legality, Printing, Oracle

**Severity**:
How hard a deck violation bites: none, warning or error. Each legality status has a default severity a format may override; `restricted` also lowers the copy limit to one, which belongs to the status, not to its severity.
_Avoid_: level, weight, priority
_Related_: Legality, Violation, Format

**Format zone rule**:
A format's minimum, maximum and copy limit for one zone. Zone rules are data, never database constraints, so changing a format can never make a saved deck unloadable.
_Avoid_: constraint, deck rule, format constraint
_Related_: Format, Zone, Copy limit, Violation

## Decks

**Deck**:
A stored, account-owned list of cards with a format, a visibility, a roster of collaborators, a revision history and an optional primer.
_Avoid_: decklist (that is the text form), build, list
_Related_: Deck entry, Zone, Visibility, Collaborator, Revision, Primer, Deck text

**Deck entry**:
One row of a deck: a quantity of one printing in one zone. Counting is by oracle and display is by printing, so three copies across two arts are three toward the copy limit and two rows.
_Avoid_: deck card, slot, line
_Related_: Deck, Printing, Oracle, Zone, Copy limit

**Zone**:
Where a deck entry sits: legend, main, sideboard, runes, battlefields, or considering. Eligibility comes from the oracle's card type.
_Avoid_: section, pile, board
_Related_: Deck entry, Considering, Format zone rule, Counting group

**Considering**:
A Riftseer-only scratch zone for cards a builder is thinking about. It counts toward no limit and no zone size, and is the only zone a token may sit in.
_Avoid_: maybeboard, scratchpad, wishlist
_Related_: Zone, Token

**Chosen champion**:
The one main-deck copy nominated as the deck's champion. It is a role a row takes, not a zone: three copies may be in the deck and one of them is the champion.
_Avoid_: champion zone, champion slot, champion (when the card type is meant)
_Related_: Champion, Deck entry, Zone

**Counting group**:
Zones whose copies are counted together against one copy limit: legend, main and sideboard form one group; runes and battlefields each stand alone.
_Avoid_: copy pool, shared zones
_Related_: Zone, Copy limit

**Copy limit**:
The most copies of one oracle a counting group may hold. It is the minimum of the group's zone limits, lowered to one by a restricted legality.
_Avoid_: max copies, card limit, cap
_Related_: Counting group, Format zone rule, Legality

**Violation**:
A structured, non-throwing finding from validating a deck against its format: a missing legend, an over-full zone, a card outside the legend's domains, an illegal card. Violations are shown, never silently fixed; nothing is relocated or removed on the builder's behalf.
_Avoid_: error (unqualified), warning (unqualified), validation failure
_Related_: Deck, Format zone rule, Legality, Severity

**Deck token**:
A token a deck makes, derived from the `makes_token` relationships of the oracles in it. A builder chooses which printing of the token to show and cannot add or remove one.
_Avoid_: token entry, stored token, token zone
_Related_: Token, Relationship, Deck

**Card tag**:
A builder's note on one oracle within one deck ("finisher", "cut?"). It rides the deck payload and never enters the text form.
_Avoid_: label, annotation, tag (unqualified; an oracle tag is a different thing)
_Related_: Deck, Oracle, Deck text

**Revision**:
A recorded state of a deck's cards. Edits arriving within a short window fold into the open revision rather than each writing their own.
_Avoid_: version, snapshot, history entry
_Related_: Deck, Deck entry

**Visibility**:
Who can find a deck: private (owner and collaborators), unlisted (anyone holding the link, never listed) or public. Visibility is orthogonal to role.
_Avoid_: privacy, access level, sharing (unqualified)
_Related_: Deck, Role, Collaborator

**Collaborator**:
An account granted a role on a deck it does not own, directly or by joining through an invite link.
_Avoid_: member, editor (that is a role), shared user
_Related_: Deck, Role, Invite

**Role**:
What an account may do to a deck: owner, editor or viewer. Owner is computed from ownership and never stored; editor and viewer are granted.
_Avoid_: permission, access, rank
_Related_: Collaborator, Visibility, Deck

**Invite**:
A revocable link that grants a role to whoever joins through it. Regenerating or disabling the link never removes anyone already in.
_Avoid_: share link, invite code (that is its representation)
_Related_: Collaborator, Role

**Folder**:
A private, flat grouping of decks belonging to one account. Deleting a folder never touches its decks.
_Avoid_: collection, binder, tag
_Related_: Deck, User

**Primer**:
The deck's write-up: markdown that may mention cards, show a card image, or name a profile inline.
_Avoid_: guide (the page is named Guide; the content is the primer), description (that is the short summary), notes
_Related_: Deck, Card mention

**Deck text**:
The line-based, human-pasteable form of a deck: zone headers, `<qty> <name>` lines, a champion marker and an optional `(SET) COLLECTOR` suffix pinning a printing. It is the interchange format and stays diffable.
_Avoid_: decklist string, short form, export code, encoded deck
_Related_: Deck, Deck entry, Chosen champion, Collector number

## Accounts and access

**User**:
A person using a Riftseer client with or without an account. The people building Riftseer are _maintainers_; the agent changing the code is _you_.
_Avoid_: customer, member, account (the account is what a user has)
_Related_: Profile, Client, Maintainer

**Profile**:
The public face of an account: handle, username, bio, pronouns, social links.
_Avoid_: account, user record, page
_Related_: User, Follow, Handle

**Handle**:
An account's unique, lowercase, URL-safe name. The username is the free-form display name beside it.
_Avoid_: username (for the unique name), slug, nickname
_Related_: Profile

**Follow**:
A public, one-directional edge from one account to another.
_Avoid_: friend, subscribe, connection
_Related_: Profile

**Linked account**:
A third-party identity attached to an account. Today that is Metafy, whose membership drives supporter perks.
_Avoid_: connection, integration, OAuth account
_Related_: Supporter, User

**Supporter**:
An account whose linked Metafy membership grants perks. Supporter status is read from the link, never set by hand.
_Avoid_: patron, subscriber, premium user
_Related_: Linked account

**Admin**:
A maintainer account allowed to edit the catalogue, settle reconciliation entries and manage formats. Admin is a fixed allowlist, not a role stored on the account.
_Avoid_: moderator, superuser, staff
_Related_: Locked field, Reconciliation entry, Format, Role

**Maintainer**:
A person building Riftseer. They are who the guidance files address as "we".
_Avoid_: developer (ambiguous with third-party developers), owner, team
_Related_: User, Admin

## Surfaces

**Client**:
Any program that reads the API on a user's behalf: the website, the Discord bot, the Reddit bot, the Raycast extension, the Table Top Simulator mod, a third party's tool. No client reads the database.
_Avoid_: frontend, app (unqualified), consumer
_Related_: Surface, User, Card mention

**Surface**:
A first-party client maintained by Riftseer. A change to shared behaviour is done when every surface shows it.
_Avoid_: platform, integration, channel
_Related_: Client

**Card mention**:
`[[Card Name]]` in free text, optionally pinning a set and collector number, that a bot or a primer turns into a card. The grammar has one parser every surface imports.
_Avoid_: token, card tag, card link, bracket syntax
_Related_: Client, Primer, Collector number, Resolve

**Resolve**:
Turning a card mention into one oracle plus one printing: the printing the mention pinned, or the oracle's preferred printing when it pinned none.
_Avoid_: lookup, search (resolve is not a search), fetch
_Related_: Card mention, Preferred printing, Oracle, Printing

## Ambiguities

Questions the vocabulary has not settled. Do not resolve one in passing; raise it with a maintainer.

- **`source` means two things.** Oracles, printings and sets carry a provenance (`riftcodex` or `manual`), while deltas and relationships carry an author (`ingest` or `admin`). The invariant "ingest owns `source='ingest'` rows" is true only of the second family, and nothing names the distinction.
- **"Champion" and "signature" each name a card kind and something else.** Champion is an oracle supertype and a role one deck row takes; Signature is an oracle supertype and a printing variant flag. Prose that says "signature card" or "the champion" is ambiguous until qualified.
- **Oracle key is declared a hint but enforced as an identity.** It is unique per oracle, so two oracles that normalise to the same key cannot coexist even though the guidance says the key is "never identity".
- **"Card" flips halves by surface.** The public card endpoints return oracles, deck rows and image URLs are keyed on printings, and the card page shows one printing. Every use of the bare word needs a reader to know which half it means.
- **"Token" is used for four things.** A game token, an icon glyph in rules text (`:rb_…:`), a card mention (`[[…]]`) and a session credential. This glossary reserves it for the first; the code does not yet.
- **`restricted` exists in the deck model but not in every legality vocabulary.** The format and deck tables accept four statuses; older card-level prose and some clients still speak of three.
