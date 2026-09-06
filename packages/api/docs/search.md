---
title: Search
sidebar_label: Search
sidebar_position: 3
---

`GET /api/v1/cards` is part of the [Cards](./cards.md) endpoint group. This page covers query parameters, the search language, result uniqueness, and the single database search path.

---

## Query parameters

| Param       | Description                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `name`      | Search query. Supports free text, field filters, numeric comparisons, legality, flags, and boolean operators. |
| `q`         | Alias for `name`. When both are present, `name` wins.                                                         |
| `type`      | Explicit type filter, merged into the parsed query as `AND t:value`.                                          |
| `artist`    | Explicit artist filter, merged as `AND a:value`. Artist is printing-level.                                    |
| `rarity`    | Explicit rarity filter, merged as `AND r:value`. Rarity is printing-level.                                    |
| `set`       | Printing set-code filter, for example `OGN`.                                                                  |
| `collector` | Printing collector-number filter. Prefixed values such as `T03`, `SP3`, and `R01` are supported.              |
| `fuzzy`     | Pass `false` or `0` for exact-name-only matching.                                                             |
| `browse`    | Pass `all` to browse cards without a search term.                                                             |
| `unique`    | `oracle` (default) returns one row per card; `prints` returns one row per physical printing.                  |
| `limit`     | Maximum results per page (default 10, maximum 100).                                                           |
| `offset`    | 0-based offset into the ranked results, capped at 10,000.                                                     |
| `include`   | Extra printing fields to include, currently `prices`.                                                         |

### Result modes

The response always includes both result arrays and says which one is populated:

```json
{
  "unique": "oracle",
  "count": 1,
  "total": 1,
  "offset": 0,
  "limit": 10,
  "cards": [
    { "object": "oracle", "preferred_printing": { "object": "printing" } }
  ],
  "printings": []
}
```

- `unique=oracle` returns `object: "oracle"` rows in `cards`. Each oracle embeds the printing that matched as `preferred_printing`, so a printing-level query still displays the relevant art and edition while producing one row per card.
- `unique=prints` returns `object: "printing"` rows in `printings`. Use it when every matching physical edition matters.
- A set-only browse such as `?set=OGN` is inherently printing-shaped and returns `unique: "prints"`.
- `browse=all` returns paginated oracle rows and does not require `name` or `q`.

---

## Query language

The `name` (or `q`) value is parsed into an AST and combined with any explicit URL filters. Input length and AST size are bounded before the query reaches Postgres.

| Construct          | Example                                              | Meaning                                                                   |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Free text          | `poro gear`                                          | Full-text name match; adjacent words combine with AND.                    |
| Type filter        | `t:champion`, `t:"champion unit"`                    | Match oracle `card_type`, `supertype`, or a tag.                          |
| Supertype filter   | `st:champion`                                        | Match oracle `supertype` only.                                            |
| Tag filter         | `tag:poro`                                           | Match oracle `tags`.                                                      |
| Artist filter      | `a:lee`, `a:"kim park"`                              | Match the printing artist.                                                |
| Rarity filter      | `r:rare`                                             | Match printing rarity.                                                    |
| Name filter        | `name:disc`                                          | Case-insensitive substring match on oracle name.                          |
| Set filter         | `set:OGN`, `s:ogn`                                   | Match printing set code.                                                  |
| Keyword filter     | `kw:deathknell`, `kw:deflect,shield`                 | Exact match against oracle `keywords`.                                    |
| Domain filter      | `d:fury`, `d:fury,order`                             | Exact match against oracle `domains`.                                     |
| Produces filter    | `produces:gem`                                       | Match token oracle names reached by a `makes_token` relationship.         |
| Numeric comparison | `might>=4`, `energy!=0`, `d>=2`                      | Compare oracle `energy`, `might`, or `power`; `d` counts domains.         |
| Legality           | `f:standard`, `banned:standard`, `notlegal:standard` | Resolve status through printing override → oracle row → legal by default. |
| Flags              | `is:token`, `is:signature`, `-is:alternate`          | Match oracle or printing properties.                                      |
| Exact name         | `!Sun`, `!"Sun Disc"`                                | Match one normalized oracle name.                                         |
| Negation           | `-t:gear`, `-(t:gear or t:spell)`                    | Exclude matches.                                                          |
| Boolean OR         | `t:gear or t:spell`                                  | Union matches; `or` is lowercase.                                         |
| Grouping           | `t:unit (a:lee or a:kim)`                            | Override implicit precedence with parentheses.                            |
| Implicit AND       | `poro t:unit`                                        | Adjacent clauses combine with AND.                                        |

Implicit AND binds tighter than `or`, so `t:a or t:b t:c` parses as `t:a OR (t:b AND t:c)`.

Field aliases: `a`/`artist`, `t`/`type`, `st`/`supertype`, `r`/`rarity`, `tag`/`tags`, `kw`/`keyword`/`keywords`, `d`/`domain`/`domains`, `s`/`set`, `produces`/`makes`, `e`/`energy`/`cost`, `m`/`might`, `p`/`power`, `f`/`format`/`legal`, `banned`, `notlegal`/`illegal`, and `is`.

Flag aliases: `sig` → `signature`, `alt`/`alternate_art` → `alternate`, and `special_collection`/`showcase` → `special`. Allowed flags are `token`, `signature`, `alternate`, `overnumbered`, `special`, `foil`, and `manual`.

Notes on less obvious rules:

- **Rarity belongs to a printing.** With the default oracle uniqueness, `r:showcase` returns one oracle with the matching showcase edition embedded as `preferred_printing`. Use `unique=prints` to return every matching showcase printing.
- **`d` is disambiguated by its operator.** `d:fury` filters domains; `d>=2` counts them.
- **Keyword and domain matching is exact**, not substring, because both are normalized vocabularies. This prevents `d:or` from matching `Order`.
- **Keyword values fold to a base key.** `kw:"Deflect 3"` and `kw:deflect` are equivalent.
- **Comma lists expand to OR** for unquoted `kw`, `d`, and `tag` values only.
- **A colon on a numeric field means equals.** `energy:2` is equivalent to `energy=2`.
- **Null stats satisfy no comparison**, including `!=`.
- **Legality is default-legal.** Only non-legal rows are stored. An unknown format matches nothing.

Unknown fields or flags, oversized inputs, malformed grouping or quotes, and invalid comparisons return HTTP 400 with `code: "BAD_QUERY"`.

### Reused by ruling rules

The same parser and SQL renderer back query-scoped rulings. An admin query is stored as an AST and re-evaluated after ingest, so a rule such as `t:unit kw:deathknell` automatically picks up later cards. A search leaf must be renderable by the database function before the parser may accept it.

---

## Execution path

Every parsed search uses one path. The provider calls `search_printing_ids` with the AST, optional set/collector filters, and a collapse flag derived from `unique`. The RPC renders the AST with `card_search_ast_to_sql` and scans the trigger-maintained `resolved_printings` projection, where oracle fields and printing deltas have already been combined.

The RPC always returns printing IDs and the total. The provider hydrates those IDs, optionally re-ranks free-text results in TypeScript, then either returns the printings or attaches the matching printing to one oracle row. Search never resolves printing deltas at query time.

```mermaid
sequenceDiagram
  participant Client
  participant API as GET /cards
  participant Parser as parseCardSearchQuery
  participant Provider as SupabaseCardProvider
  participant RPC as search_printing_ids
  participant Projection as resolved_printings

  Client->>API: q plus filters and unique
  API->>Parser: parse and validate
  API->>Provider: search oracle or prints
  Provider->>RPC: AST, filters, collapse
  RPC->>Projection: one flat scan
  Projection-->>RPC: matching printing IDs
  RPC-->>Provider: IDs and total
  Provider->>Provider: hydrate and optional text re-rank
  Provider-->>API: oracles or printings
  API-->>Client: cards or printings array
```

---

## Examples

```http
GET /api/v1/cards?name=poro%20t%3Aunit
GET /api/v1/cards?q=r%3Ashowcase&unique=prints
GET /api/v1/cards?name=t%3Agear%20or%20t%3Aspell
GET /api/v1/cards?name=t%3Aunit%20(a%3Alee%20or%20a%3Akim)
GET /api/v1/cards?name=%21%22Sun%20Disc%22
GET /api/v1/cards?type=Gear&rarity=Uncommon
GET /api/v1/cards?set=OGN&collector=T03&unique=prints
```

---

## Batch resolve

`POST /api/v1/cards/resolve` resolves each request to an `oracle` and a chosen `printing`: the edition named by `SET-collector`, or the oracle's preferred printing. See [Cards](./cards.md#post-apiv1cardsresolve).

---

## Key files

| File                                                              | Role                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/core/src/card-search-query.ts`                          | Tokenizer, parser, AST, and validation.                                        |
| `packages/core/src/providers/supabase.ts`                         | Single RPC path, hydration, oracle collapse, and free-text re-ranking.         |
| `packages/api/src/routes/cards.ts`                                | HTTP parameters, URL-filter merging, uniqueness selection, and response shape. |
| `supabase/migrations/20260810000000_oracle_printing_baseline.sql` | `resolved_printings`, `card_search_ast_to_sql`, and `search_printing_ids`.     |
