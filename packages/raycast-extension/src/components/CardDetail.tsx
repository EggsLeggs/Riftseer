import {
  Action,
  ActionPanel,
  Clipboard,
  Color,
  Detail,
  Image,
  environment,
  showToast,
  Toast,
} from "@raycast/api";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { useEffect } from "react";
import type { Card } from "@riftseer/types";

function tinted(source: string): Image.ImageLike {
  return { source, tintColor: Color.PrimaryText };
}

// ─── Card text token rendering ────────────────────────────────────────────────

const CIRCLED_DIGITS = ["⓪", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

/**
 * SVG token icons have hardcoded fill="white". We swap the fill to black on
 * light mode and re-encode as a data URI so the colour tracks the theme.
 * PNG domain rune icons have baked-in colours and work as-is with file:// URLs.
 */
const TOKEN_SVG_ASSETS: Record<string, string> = {
  exhaust: "icons/stats/exhaust.svg",
  might: "icons/stats/might.svg",
  power: "icons/stats/card_type_rune.svg",
  rune_rainbow: "icons/domains/rune_rainbow.svg",
};

const TOKEN_PNG_ASSETS: Record<string, string> = {
  rune_fury: "icons/domains/rune_fury.png",
  rune_calm: "icons/domains/rune_calm.png",
  rune_mind: "icons/domains/rune_mind.png",
  rune_body: "icons/domains/rune_body.png",
  rune_chaos: "icons/domains/rune_chaos.png",
  rune_order: "icons/domains/rune_order.png",
};

const TOKEN_TEXT_FALLBACKS: Record<string, string> = {
  energy: "⚡",
};

const svgDataUriCache = new Map<string, string>();

const INLINE_ICON_SIZE = 16;

function themedSvgDataUri(assetRelPath: string): string {
  const cacheKey = `${assetRelPath}:${environment.appearance}`;
  const cached = svgDataUriCache.get(cacheKey);
  if (cached) return cached;
  try {
    let svg = readFileSync(join(environment.assetsPath, assetRelPath), "utf8");

    // Pin display size so the icon sits inline with text
    svg = svg
      .replace(/(<svg[^>]*)\swidth="[^"]*"/, `$1 width="${INLINE_ICON_SIZE}"`)
      .replace(
        /(<svg[^>]*)\sheight="[^"]*"/,
        `$1 height="${INLINE_ICON_SIZE}"`,
      );

    if (environment.appearance === "light") {
      // Protect fill="white" inside structural elements (mask/defs/clipPath) — those
      // define geometry for masking, not visual colour, and must stay white.
      const SENTINEL = "\x00FILL_WHITE\x00";
      svg = svg
        .replace(/<mask[\s\S]*?<\/mask>/g, (m) =>
          m.replace(/fill="white"/g, SENTINEL),
        )
        .replace(/<defs[\s\S]*?<\/defs>/g, (m) =>
          m.replace(/fill="white"/g, SENTINEL),
        )
        .replace(/fill="white"/g, 'fill="black"')
        .replace(new RegExp(SENTINEL, "g"), 'fill="white"');
    }

    const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    svgDataUriCache.set(cacheKey, uri);
    return uri;
  } catch {
    return "";
  }
}

function renderTextForRaycast(text: string): string {
  // Insert a newline at sentence boundaries that have no space, common in plain
  // card text: ".)Choose", "—Deal", "base.Kill" all need a break before the
  // next word.
  text = text.replace(/([.)—])\s+([A-Z[])/g, "$1\n\n$2");
  // Fix italic reminder text: "_ (text)_word" → "_(text)_ word"
  // CommonMark: "_ (" doesn't open emphasis (underscore followed by space),
  // and ")_Word" doesn't close it (underscore followed by alphanumeric).
  text = text.replace(/_ \(/g, "_(");
  text = text.replace(/\)_([^\s_\n])/g, ")_\n\n$1");
  return text.replace(/:rb_(\w+):/g, (_match, key: string) => {
    const energyMatch = /^energy_(\d+)$/.exec(key);
    if (energyMatch) {
      const n = parseInt(energyMatch[1], 10);
      return CIRCLED_DIGITS[n] ?? `(${n})`;
    }
    const svgAsset = TOKEN_SVG_ASSETS[key];
    if (svgAsset) {
      const uri = themedSvgDataUri(svgAsset);
      if (uri) return `![${key}](${uri})`;
    }
    const pngAsset = TOKEN_PNG_ASSETS[key];
    if (pngAsset) {
      const filePath = join(environment.assetsPath, pngAsset);
      const fileUrl = pathToFileURL(filePath);
      fileUrl.searchParams.set("raycast-width", String(INLINE_ICON_SIZE));
      fileUrl.searchParams.set("raycast-height", String(INLINE_ICON_SIZE));
      return `![${key}](${fileUrl.href})`;
    }
    return TOKEN_TEXT_FALLBACKS[key] ?? `[${key}]`;
  });
}

const TYPE_ICONS: Record<string, string> = {
  unit: "icons/types/unit.png",
  champion: "icons/types/champion.png",
  legend: "icons/types/legend.png",
  spell: "icons/types/spell.png",
  gear: "icons/types/gear.png",
  battlefield: "icons/types/battlefield.png",
  rune: "icons/types/rune.png",
};

const RARITY_ICONS: Record<string, string> = {
  common: "icons/rarity/rarity_common.png",
  uncommon: "icons/rarity/rarity_uncommon.png",
  rare: "icons/rarity/rarity_rare.png",
  showcase: "icons/rarity/rarity_showcase.png",
};

const DOMAIN_ICONS: Record<string, string> = {
  fury: "icons/domains/rune_fury.png",
  calm: "icons/domains/rune_calm.png",
  mind: "icons/domains/rune_mind.png",
  body: "icons/domains/rune_body.png",
  chaos: "icons/domains/rune_chaos.png",
  order: "icons/domains/rune_order.png",
};

/** Pick the icon key that best represents the type line, mirroring frontend prefix logic. */
function typeIconKey(
  type?: string,
  supertype?: string | null,
): string | undefined {
  const tl = type?.toLowerCase();
  const st = supertype?.toLowerCase();
  if (st === "token" || st === "basic") return tl === "token" ? "unit" : tl;
  if (tl) return tl;
  return st;
}

function getTypeIcon(
  type?: string,
  supertype?: string | null,
): Image.ImageLike | undefined {
  const key = typeIconKey(type, supertype);
  const src = key ? TYPE_ICONS[key] : undefined;
  return src ? tinted(src) : undefined;
}

function getRarityIcon(rarity?: string): Image.ImageLike | undefined {
  const src = rarity ? RARITY_ICONS[rarity.toLowerCase()] : undefined;
  return src ? { source: src } : undefined;
}

function getDomainIcon(domain: string): Image.ImageLike | undefined {
  const src = DOMAIN_ICONS[domain.toLowerCase()];
  return src ? { source: src } : undefined;
}

/**
 * Plain-text type line aligned with `CardPage.tsx` (no icons): supertype
 * `token` / `basic` uses a space prefix (`Token Unit`); type `unit` / `basic`
 * with a supertype uses an em dash (`Unit — Champion`); otherwise
 * `supertype type`.
 */
export function formatTypeLine(
  type?: string,
  supertype?: string | null,
): string | null {
  if (!type && !supertype) return null;
  if (!type) return supertype!;
  if (!supertype) return type;
  const tl = type.toLowerCase();
  const st = supertype.toLowerCase();
  // Supertype is a prefix modifier (e.g. "Token Unit", "Basic Land")
  if (st === "token" || st === "basic") return `${supertype} ${type}`;
  // Type carries the subtype after an em dash (e.g. "Unit — Champion")
  if (tl === "unit" || tl === "basic") return `${type} — ${supertype}`;
  // Fallback: supertype then type
  return `${supertype} ${type}`;
}

interface CardDetailProps {
  card: Card;
  siteBaseUrl: string;
  /** Called when this detail view is shown (full-screen detail, random card, or push from search). */
  onView?: (card: Card) => void;
}

function buildMarkdown(card: Card): string {
  const lines: string[] = [];

  // Card image — height=300 for portrait cards; landscape cards use height=200
  // (200 ≈ the pixel-width of a portrait card rendered at height=300 with a 2:3 ratio)
  // Portrait cards: 300 tall (matches lotus-mtg-companion); width=200 preserves 2:3 ratio.
  // Landscape cards: height=200 (= width of a portrait card at height=300 with 2:3 ratio); width=300.
  const isLandscape = card.media?.orientation === "landscape";
  const imageUrl =
    card.media?.media_urls?.normal ?? card.media?.media_urls?.large;
  if (imageUrl) {
    const altText = (card.media?.accessibility_text ?? card.name).replace(
      /\n/g,
      " ",
    );
    try {
      const url = new URL(imageUrl);
      if (isLandscape) {
        url.searchParams.set("raycast-width", "300");
        url.searchParams.set("raycast-height", "200");
      } else {
        url.searchParams.set("raycast-width", "200");
        url.searchParams.set("raycast-height", "300");
      }
      lines.push(`![${altText}](${url.toString()})`);
      lines.push("");
    } catch {
      // Skip image if URL is malformed or relative
    }
  }

  // Rules text
  if (card.text?.plain?.trim()) {
    lines.push(renderTextForRaycast(card.text.plain.trim()));
    lines.push("");
  }

  // Flavour text
  if (card.text?.flavour?.trim()) {
    lines.push(`*${renderTextForRaycast(card.text.flavour.trim())}*`);
  }

  return lines.join("\n");
}

function buildCopyableText(card: Card): string {
  const lines: string[] = [card.name];
  const typeLine = formatTypeLine(
    card.classification?.type,
    card.classification?.supertype,
  );
  if (typeLine) lines.push(typeLine);
  if (card.text?.plain?.trim()) {
    if (lines.length > 1) lines.push("");
    lines.push(card.text.plain.trim());
  }
  return lines.join("\n");
}

export function CardDetail({ card, siteBaseUrl, onView }: CardDetailProps) {
  const site = siteBaseUrl.replace(/\/$/, "");
  const siteUrl = `${site}/card/${card.id}`;
  const markdown = buildMarkdown(card);
  const typeLine = formatTypeLine(
    card.classification?.type,
    card.classification?.supertype,
  );

  useEffect(() => {
    onView?.(card);
  }, [card, onView]);

  const metadata = (
    <Detail.Metadata>
      {/* ── Section 1: identity & stats ── */}
      <Detail.Metadata.Label title="Name" text={card.name} />
      {typeLine && (
        <Detail.Metadata.Label
          title="Type"
          text={typeLine}
          icon={getTypeIcon(
            card.classification?.type,
            card.classification?.supertype,
          )}
        />
      )}
      {card.attributes?.energy != null && (
        <Detail.Metadata.Label
          title="Energy"
          text={String(card.attributes.energy)}
        />
      )}
      {card.attributes?.power != null && (
        <Detail.Metadata.Label
          title="Power"
          text={String(card.attributes.power)}
        />
      )}
      {card.attributes?.might != null && (
        <Detail.Metadata.Label
          title="Might"
          text={String(card.attributes.might)}
          icon={tinted("icons/stats/might.svg")}
        />
      )}
      {card.classification?.domains?.length ? (
        <Detail.Metadata.TagList title="Domains">
          {card.classification.domains.map((d) => (
            <Detail.Metadata.TagList.Item
              key={d}
              text={d}
              icon={getDomainIcon(d)}
            />
          ))}
        </Detail.Metadata.TagList>
      ) : null}
      {card.classification?.tags?.length ? (
        <Detail.Metadata.TagList title="Tags">
          {card.classification.tags.map((t) => (
            <Detail.Metadata.TagList.Item key={t} text={t} />
          ))}
        </Detail.Metadata.TagList>
      ) : null}

      {/* ── Section 2: printing ── */}
      <Detail.Metadata.Separator />
      {card.classification?.rarity && (
        <Detail.Metadata.Label
          title="Rarity"
          text={card.classification.rarity}
          icon={getRarityIcon(card.classification.rarity)}
        />
      )}
      {card.set && (
        <Detail.Metadata.Label title="Set" text={card.set.set_name} />
      )}
      {card.collector_number && (
        <Detail.Metadata.Label
          title="Collector #"
          text={card.collector_number}
        />
      )}

      {/* ── Section 3: credits ── */}
      {card.artist && (
        <>
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Artist"
            text={card.artist}
            icon={tinted("icons/misc/artist.svg")}
          />
        </>
      )}
    </Detail.Metadata>
  );

  return (
    <Detail
      markdown={markdown}
      metadata={metadata}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="Open on Riftseer" url={siteUrl} />
            <Action.CopyToClipboard
              title="Copy Card Name"
              content={card.name}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
            {card.text?.plain?.trim() && (
              <Action.CopyToClipboard
                title="Copy Rules Text"
                content={buildCopyableText(card)}
                shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
              />
            )}
            {(card.media?.media_urls?.normal ??
              card.media?.media_urls?.large) && (
              <Action
                title="Copy Card Image"
                shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
                onAction={async () => {
                  const imageUrl =
                    card.media!.media_urls!.normal ??
                    card.media!.media_urls!.large!;
                  const toast = await showToast({
                    style: Toast.Style.Animated,
                    title: "Copying image…",
                  });
                  let tempPath: string | undefined;
                  try {
                    const res = await fetch(imageUrl);
                    if (!res.ok) {
                      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    }
                    const buf = Buffer.from(await res.arrayBuffer());
                    // Determine extension from URL pathname
                    const url = new URL(imageUrl);
                    const lastDot = url.pathname.lastIndexOf(".");
                    const ext =
                      lastDot >= 0 && lastDot < url.pathname.length - 1
                        ? url.pathname.substring(lastDot + 1)
                        : "png";
                    tempPath = join(tmpdir(), `riftseer-${card.id}.${ext}`);
                    await writeFile(tempPath, buf);
                    await Clipboard.copy({ file: tempPath });
                    toast.style = Toast.Style.Success;
                    toast.title = "Image copied";
                  } catch {
                    toast.style = Toast.Style.Failure;
                    toast.title = "Failed to copy image";
                  } finally {
                    if (tempPath) {
                      try {
                        await unlink(tempPath);
                      } catch {
                        // Best-effort cleanup (ENOENT if already gone, etc.)
                      }
                    }
                  }
                }}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
