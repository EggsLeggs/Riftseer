---
title: CORS, Rate Limits & Images
sidebar_label: CORS, Rate Limits & Images
sidebar_position: 7
---

## CORS

The production API allows requests from `https://riftseer.pages.dev` and `https://riftseer.com` by default. Override by setting the `CORS_ORIGIN` worker var (comma-separated) in `wrangler.jsonc` or with the `--var` flag during deploy — it is not a secret and should not be set with `wrangler secret put`:

```jsonc
// wrangler.jsonc
{
  "vars": {
    "CORS_ORIGIN": "https://riftseer.com,https://staging.riftseer.pages.dev"
  }
}
```

Or pass it at deploy time:

```bash
wrangler deploy --var CORS_ORIGIN="https://riftseer.com,https://staging.riftseer.pages.dev"
```

Allowed methods are `GET`, `POST`, and `OPTIONS`.

---

## Rate limits

There are currently no enforced rate limits on the API. Requests are not throttled or queued.

Please be a good citizen: avoid hammering the endpoint in tight loops and cache responses where possible. The card index changes infrequently — results from `/api/v1/cards` and `/api/v1/sets` are safe to cache for the duration of a user session or longer.

---

## Images

Card images are served directly from the source CDN (RiftCodex). The Riftseer API does not proxy or re-host images.

### Available sizes

The `media.media_urls` object on a card may contain the following keys:

| Key | Notes |
| --- | --- |
| `normal` | Standard display size — the only size currently populated from the data source |
| `small` | Coming soon |
| `large` | Coming soon |
| `png` | Coming soon |

Currently only `normal` is populated. We plan to host card imagery directly in multiple sizes in the future — when that ships, `small`, `large`, and `png` will be filled in without any API changes. Check for `null` / `undefined` before using any image URL — not all cards have images.

```typescript
const imageUrl = card.media?.media_urls?.normal ?? null;
```

### Orientation

`media.orientation` is either `"portrait"` (vertical, the common case) or `"landscape"` (horizontal). Use this to size your image container correctly rather than assuming aspect ratio.

### Accessibility

`media.accessibility_text` contains a plain-text description of the card art where available. Use it as the `alt` attribute on image elements:

```html
<img
  src={card.media.media_urls.normal}
  alt={card.media.accessibility_text ?? card.name}
/>
```

### Attribution

Card images and data originate from Riot Games / Riftbound. When displaying card images, do not crop, distort, or overlay the card art in ways that obscure the artist credit.
