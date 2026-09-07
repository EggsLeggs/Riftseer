---
title: Render Kernel
sidebar_label: Render kernel
sidebar_position: 5
---

`src/render/` is the set of pure functions every Riftseer surface renders a card from: the web site, the Discord bot, the Reddit bot and the Raycast extension. It returns plain data — strings, token objects, colour values — and never touches React, the DOM or a Discord asset, so it is safe to import anywhere `@riftseer/types` is.

Import it through its one public entry point:

```typescript
import { tokenizeCardTextLine, cardTypeLine } from "@riftseer/types/render";
```

Everything is also on the package root (`@riftseer/types`). The files behind `render/index.ts` are private; the repository's boundary lint rejects a direct import of them.

---

## Rules text

Card text arrives compressed, with `:rb_<key>:` icon tokens, `[Keyword]` badges and `_reminder text_` inline. Two functions turn it into something a surface can draw.

### `normalizeCardTextLayout(text, paragraphBreak = "\n")`

Splits one compressed string into lines: one per ability or sentence, never inside a parenthetical, with HTML entities decoded. Run it first, then split on the break.

### `tokenizeCardTextLine(line)`

Turns one line into a `CardTextToken[]`:

| `kind`    | Fields                                 | Meaning                                                                                                                            |
| --------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `text`    | `text`                                 | Prose                                                                                                                              |
| `icon`    | `keys`                                 | A run of adjacent `:rb_…:` tokens, so `3 Energy and Power` can be one phrase                                                       |
| `keyword` | `label`, `arrow`, `stackLeft`, `costs` | A `[Keyword]` badge; `[>]` sets `arrow`, a preceding `[>>]` sets `stackLeft`, trailing energy/rune costs are absorbed into `costs` |
| `bracket` | `label`                                | A bracketed span that is not a keyword (`[NO TEXT]`)                                                                               |
| `italic`  | `tokens`                               | Reminder text, with its own inline tokens                                                                                          |

A surface maps each token to what it draws with. The web site maps them to elements and CSS classes; the clipboard formatter in this package maps them to `{3}` / `[Deflect]` text.

### `replaceIconTokens(text, replace)`

For text-only surfaces that leave keywords and italics as written and only substitute icons — Discord emoji references, Markdown images.

### Labels

`tokenDisplayName("energy_3")` is `3 Energy`; `tokenPlainLabel("rune_fury")` is `{Fury}`; `formatTokenDisplayList(["energy_3", "rune_rainbow"])` is `3 Energy and Power`.

---

## Domains

The six domains are `body`, `calm`, `chaos`, `fury`, `mind` and `order` (`DOMAIN_KEYS`). Upstream spells them capitalised and the rune token spells them as keys; `domainKey(name)` accepts either and returns the key or `null`.

- `domainDisplayName(key)` — the printed spelling.
- `domainRuneHex(name)` — the fill sampled from the rune art, for badges and embed stripes.
- `domainWashRgb(name)` / `DOMAIN_WASH_RGB` / `NEUTRAL_DOMAIN_RGB` — softer space-separated RGB triples for decorative washes and bars; `rainbow` has one too.
- `hasRuneGlyph(name)` — whether a printed rune exists for it (the six, plus `rainbow`).
- `meaningfulCardDomains(oracle)` — the card's domains without the upstream `Colorless` placeholder.

---

## Type line

`cardTypeLine(oracle)` renders the printed type line the same way everywhere: `Champion Unit`, `Signature Spell`, `Token Unit`, a bare `Legend`. It returns `null` for a card with no type. `cardTypeIconKey(oracle)` names the glyph that goes with it.

---

## Site URLs

- `cardHref(printing)` / `oracleHref(oracle)` — relative paths for the site itself, preferring the pinned `public_slug` and falling back to the permanent `/card/<id>` route.
- `absoluteRiftseerUri(siteOrigin, slug)` — what the API stamps onto payloads as `riftseer_uri`.
- `cardSiteUrl(oracle, printing, siteOrigin)` — for clients: the API's `riftseer_uri` when present, the compatibility route otherwise.
