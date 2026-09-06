---
title: Deck Model
sidebar_label: Deck Model
sidebar_position: 3
---

Zero-dependency deck vocabulary, validator and text interchange format, shared by the web builder, the API and the database's own rule tables.

Three modules:

| File | Owns |
| --- | --- |
| `src/deck.ts` | Zone vocabulary, counting groups, `zoneForCard()`, legality resolution, the shapes below |
| `src/deck-validate.ts` | `validateDeck()` |
| `src/deck-text.ts` | `formatDeckText()` / `parseDeckText()` |

---

## Counting is by oracle, display is by printing

A deck entry is a *physical card*, so it stores a printing id — that is what art, price and the printing rung of legality read from. But every construction rule (type, domain matching, copy limits) reads *oracle* fields, because those are properties of the card rather than the cardboard.

Three copies of Vayne split across two arts are **three** copies against the copy limit and **two** rows in the list.

`DeckEntry` therefore carries both ids plus the handful of oracle fields the rules need, so deck code reads `entry.card_type` rather than optional-chaining through a payload that may or may not have been hydrated. The database enforces the pairing with a composite foreign key onto `printings (id, oracle_id)`, so "this printing belongs to this oracle" is a schema fact rather than a documented rule.

---

## Zones

```typescript
type DeckZone = "legend" | "main" | "sideboard" | "runes" | "battlefields" | "considering";
```

The first five are official Riftbound zones. `considering` is ours: a scratch list that counts toward no copy limit and no zone size.

`COUNTING_GROUPS` is `[legend, main, sideboard] | [runes] | [battlefields]` — copies are counted together within a group. A group's effective copy limit is the **minimum** of its member zones' non-null limits.

**The chosen champion is not a zone.** It is one copy of one main-deck card, special only by game rule — you may run three copies and one of them is your champion. So it is an `is_champion` flag on a `main` row, guarded by a partial unique index.

### `zoneForCard(cardType, supertype?, isToken?)`

Returns the zones a card is eligible for. It keys off **`card_type`** (`Legend`, `Rune`, `Battlefield`), never `supertype`.

This matters: the pre-oracle-rewrite deck model routed on `supertype === "Rune"` / `"Battleground"`, values the current catalogue does not contain, so every rune and battlefield silently landed in the main deck. Its tests passed only because the fixtures used the same wrong vocabulary.

Tokens are never deck members — token membership is derived from `makes_token` relationship edges — so a token is eligible for `considering` only.

---

## Legality

```typescript
type LegalityStatus = "legal" | "restricted" | "not_legal" | "banned";
type ViolationSeverity = "none" | "warning" | "error";
```

`resolveLegality(map, oracleId, printingId)` resolves **printing row → oracle row → default legal** and reports which rung fired. That scope matters: a banned printing under a legal oracle is fixed by swapping the art, not by cutting the card, and the builder surfaces that at the moment of the swap.

`DEFAULT_LEGALITY_SEVERITY` is the single definition of status → severity (`legal` → none, `restricted` → warning, `not_legal` → error, `banned` → error). A `format_legality_severities` row overrides it per format; absent rows fall through. `restricted` additionally lowers that oracle's effective copy limit to 1 — that consequence belongs to the status itself, not to its severity.

---

## `validateDeck(deck, rules, legalities)`

Structured and **non-throwing**, returning `DeckViolation[]`. The predecessor threw `Error` with an English string for every rule, which no builder could render.

```typescript
DeckState  = { entries: DeckEntry[], legend_domains? }
FormatRules = { zones: FormatZoneRule[], severity_overrides? }
FormatZoneRule = { zone, min_count?, max_count?, copy_limit? }  // absent = unconstrained
LegalityMap = { printings?: Record<id, LegalityEntry>, oracles?: Record<id, LegalityEntry> }
```

Codes: `no_legend`, `no_champion`, `wrong_zone`, `zone_under_min`, `zone_over_max`, `copy_limit_exceeded`, `domain_not_covered`, `legality`.

Two rules hold regardless of format:

- **Format rules are never database constraints.** Validation is advisory and computed on read, so a deck saved under one set of rules stays loadable after those rules change.
- **Nothing is silently relocated or destroyed.** The old model spilled main-deck overflow into the sideboard and wiped four zones when you removed the legend. Swapping legends is a normal thing to do; a domain mismatch is now a `domain_not_covered` violation to display, and overflow is `zone_over_max`.

`no_legend` and `no_champion` are game rules rather than format rules, so they fire even for a format with no zone rules at all.

---

## Text interchange

`formatDeckText()` / `parseDeckText()` replace the old XOR-obfuscated binary short form. Zone headers plus `<qty> <name>` lines, `*CH*` marking the champion, an optional `(SET) COLLECTOR` suffix pinning a printing, `//` for comments. A headerless list is the main deck.

`parseDeckText()` returns names as written along with per-line errors; resolving a name to an `oracle_id` / `printing_id` is the API's job.
