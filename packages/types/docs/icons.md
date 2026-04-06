---
title: Icon Tokens
sidebar_label: Icons
sidebar_position: 4
---

`src/icons.ts` exports the regex and token-to-CSS-class map for inline card text symbols. These are consumed by the frontend's `CardTextRenderer` component and by any client that wants to render card text with icon substitution.

Import from the sub-path export to keep it tree-shakeable:

```typescript
import { TOKEN_REGEX, TOKEN_ICON_MAP } from "@riftseer/types/icons";
```

Both are also available on the default export:

```typescript
import { TOKEN_REGEX, TOKEN_ICON_MAP } from "@riftseer/types";
```

---

## Token format

Icon tokens appear inline in card `text.rich` strings:

```
:rb_<key>:
```

Examples: `:rb_exhaust:`, `:rb_energy_3:`, `:rb_rune_fury:`

---

## `TOKEN_REGEX`

```typescript
const TOKEN_REGEX: RegExp = /:rb_(\w+):/g;
```

Matches any `:rb_<key>:` token. The first capture group is the key (e.g. `exhaust`, `rune_fury`).

Reset `lastIndex` between calls if reusing the regex across multiple strings, or clone it with `new RegExp(TOKEN_REGEX.source, TOKEN_REGEX.flags)`.

---

## `TOKEN_ICON_MAP`

```typescript
const TOKEN_ICON_MAP: Record<string, string>
```

Maps token key → CSS class name. The frontend uses these class names to render SVG icons via CSS.

| Key | CSS class |
| --- | --- |
| `exhaust` | `icon-exhaust` |
| `energy` | `icon-energy` |
| `might` | `icon-might` |
| `power` | `icon-power` |
| `rune_fury` | `icon-rune-fury` |
| `rune_calm` | `icon-rune-calm` |
| `rune_mind` | `icon-rune-mind` |
| `rune_body` | `icon-rune-body` |
| `rune_chaos` | `icon-rune-chaos` |
| `rune_order` | `icon-rune-order` |
| `rune_rainbow` | `icon-rune-rainbow` |

Keys not present in the map should be rendered as plain text or ignored.

---

## Usage example

```typescript
import { TOKEN_REGEX, TOKEN_ICON_MAP } from "@riftseer/types/icons";

function renderRichText(rich: string): string {
  return rich.replace(TOKEN_REGEX, (_, key) => {
    const cls = TOKEN_ICON_MAP[key];
    return cls ? `<span class="${cls}" aria-hidden="true"></span>` : `:rb_${key}:`;
  });
}
```
