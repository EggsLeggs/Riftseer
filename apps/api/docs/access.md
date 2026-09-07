# CORS and hosted images

What a third-party client needs to know that the OpenAPI spec at `/docs` does not say per endpoint.

## CORS

The API is public. CORS headers are set for any request that carries an `Origin` header, so client-side JavaScript on any domain can call it without a proxy. Allowed methods: `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.

A site with a Content Security Policy needs:

```text
connect-src https://api.riftseer.com;
img-src https://img.riftseer.com https://*.riftcodex.com https://tcgplayer-cdn.tcgplayer.com;
```

The card index changes every six hours at most. Results from `/api/v1/cards` and `/api/v1/sets` are safe to cache for a user session or longer.

## Images

Card images are re-hosted in the `riftseer-cards` R2 bucket and served from `https://img.riftseer.com`. RiftCodex and TCGPlayer remain the image sources; the stable URLs point at the Riftseer domain, keyed on the printing id and versioned by `?v=<source hash>` so a corrected image bypasses immutable caches.

`media.media_urls` on a printing may contain:

| Key        | Notes                                                     |
| ---------- | --------------------------------------------------------- |
| `small`    | WebP, approximately 200 px wide                           |
| `normal`   | WebP, approximately 400 px wide                           |
| `large`    | WebP, up to approximately 1000 px wide                    |
| `original` | Original source bytes                                     |
| `png`      | Legacy upstream fallback when hosted media is unavailable |

Check for `null` before using any of them: a printing may have no source, or may still be waiting for asynchronous variant generation.

`media.orientation` is `"portrait"` or `"landscape"`; size the container from it rather than assuming an aspect ratio. `media.accessibility_text` is a plain-text description of the art where available; use it as the `alt` attribute, falling back to the card name.

Card images and data are Riot Games' under their fan-content policy. Do not crop, distort or overlay the art in ways that obscure the artist credit, and keep the Legal Jibber Jabber attribution on anything that shows it.
